import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import garminConnect from "garmin-connect";
import type { Plugin } from "vite";
import { AksesDitolak, geserHari, type KlienGarmin, tarikAktivitas, tarikDetailAktivitas, tarikEkstra, tarikHarian } from "./garmin-tarik.js";

// garmin-connect adalah paket CommonJS; Node 22+ tidak mengizinkan named import darinya.
const { GarminConnect } = garminConnect;
type GC = InstanceType<typeof GarminConnect>;
type Token = ReturnType<GC["exportToken"]>;

/**
 * Jembatan lokal ke Garmin Connect lewat login akun (jalur TIDAK RESMI).
 *
 * Admin atau atlet memasukkan email dan password Garmin Connect sekali.
 * Server menyimpan token sesi Garmin dan password terenkripsi (AES-256-GCM)
 * di file lokal yang tidak ikut git. Token diperbarui otomatis saat menarik
 * data; bila Garmin mengakhiri sesi, server login ulang otomatis dengan
 * password tersimpan. Password tidak pernah dikirim balik ke browser.
 *
 * Garmin tidak menyediakan login seperti ini untuk umum: bisa gagal bila akun
 * memakai verifikasi dua langkah, dan bisa berhenti bekerja bila Garmin
 * mengubah sistem masuknya.
 */

const API = "https://connectapi.garmin.com";
const FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../.data-lokal/garmin-akun.json");

interface Koneksi {
  email: string;
  namaGarmin: string;
  displayName: string;
  token: Token;
  /** Password Garmin terenkripsi AES-256-GCM, untuk login ulang otomatis. Tidak pernah dikirim ke browser. */
  password?: string;
  terhubungAt: string;
  sinkronTerakhirAt?: string;
  /** Diisi saat Garmin menolak sesi dan login ulang otomatis gagal. */
  perluLoginUlang?: boolean;
}
type Penyimpanan = Record<string, Koneksi>;

/**
 * Kunci enkripsi password: dari env GARMIN_SECRET_KEY (64 karakter hex) bila
 * ada, selain itu dibuat sekali di .data-lokal/kunci-rahasia. Kunci yang
 * disimpan di folder yang sama hanya melindungi bila file data tersebar
 * sendirian; di server sungguhan, simpan kunci di secret manager.
 */
const FILE_KUNCI = resolve(dirname(fileURLToPath(import.meta.url)), "../.data-lokal/kunci-rahasia");
function kunci(): Buffer {
  const env = process.env.GARMIN_SECRET_KEY;
  if (env && /^[0-9a-f]{64}$/i.test(env)) return Buffer.from(env, "hex");
  try {
    return Buffer.from(readFileSync(FILE_KUNCI, "utf8").trim(), "hex");
  } catch {
    const baru = randomBytes(32);
    mkdirSync(dirname(FILE_KUNCI), { recursive: true });
    writeFileSync(FILE_KUNCI, baru.toString("hex"), { mode: 0o600 });
    return baru;
  }
}
function enkripsi(teks: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kunci(), iv);
  const isi = Buffer.concat([c.update(teks, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), isi].map((b) => b.toString("base64")).join(".");
}
function dekripsi(sandi: string): string | null {
  try {
    const [iv, tag, isi] = sandi.split(".").map((b) => Buffer.from(b, "base64"));
    const d = createDecipheriv("aes-256-gcm", kunci(), iv!);
    d.setAuthTag(tag!);
    return Buffer.concat([d.update(isi!), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function muat(): Penyimpanan {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Penyimpanan;
  } catch {
    return {};
  }
}
function simpan(s: Penyimpanan) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2));
}

/** Instance per atlet di memori, dibangun ulang dari token tersimpan. */
const instance = new Map<string, GC>();

function gcAtlet(id: string, k: Koneksi): GC {
  let gc = instance.get(id);
  if (!gc) {
    gc = new GarminConnect({ username: "", password: "" });
    gc.loadToken(k.token.oauth1, k.token.oauth2);
    instance.set(id, gc);
  }
  return gc;
}

/** Status HTTP dari galat library ("ERROR: (401), ...") atau dari axios. */
function statusGalat(e: unknown): number | null {
  const s = (e as { response?: { status?: number } })?.response?.status;
  if (typeof s === "number") return s;
  const m = e instanceof Error ? e.message.match(/ERROR: \((\d{3})\)/) : null;
  return m ? Number(m[1]) : null;
}

function klien(gc: GC, displayName: string): KlienGarmin {
  return {
    displayName,
    async get(path) {
      try {
        return await gc.get(`${API}${path}`);
      } catch (e) {
        const s = statusGalat(e);
        if (s === 401 || s === 403) throw new AksesDitolak("Sesi Garmin ditolak.");
        if (e instanceof Error && /Oauth|token/i.test(e.message) && !s) throw new AksesDitolak("Sesi Garmin berakhir.");
        throw e;
      }
    },
  };
}

/** Pesan login yang bisa dipahami atlet. Password tidak pernah ikut dicatat. */
function pesanLogin(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (/MFA|Ticket not found/i.test(m)) return "Login gagal. Periksa email dan password; akun dengan verifikasi dua langkah (MFA) belum didukung.";
  if (/AccountLocked/i.test(m)) return "Akun Garmin terkunci. Buka connect.garmin.com untuk membukanya, lalu coba lagi.";
  if (/phone number/i.test(m)) return "Garmin meminta pembaruan nomor telepon. Login sekali di connect.garmin.com, lalu coba lagi.";
  if (statusGalat(e) === 429) return "Terlalu banyak percobaan login. Tunggu beberapa menit, lalu coba lagi.";
  return `Login Garmin gagal: ${m || "galat tak dikenal"}`;
}

function baca(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((ok, gagal) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try {
        ok(s ? JSON.parse(s) : {});
      } catch (e) {
        gagal(e);
      }
    });
  });
}

const PERLU_LOGIN = "Sesi Garmin atlet ini sudah berakhir. Masukkan email dan password Garmin lagi.";

export function garminServer(): Plugin {
  return {
    name: "garmin-server",
    configureServer(server) {
      server.middlewares.use("/api/garmin", async (req, res) => {
        const kirim = (kode: number, badan: unknown) => {
          res.statusCode = kode;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(badan));
        };
        const url = new URL(req.url ?? "/", "http://x");
        const s = muat();

        /** Jalankan f dengan klien atlet; token yang diperbarui disimpan, sesi yang ditolak ditandai "perlu login ulang". */
        /** Login ulang memakai password tersimpan; null bila tidak ada password atau login gagal. */
        async function loginUlang(atletId: string, k: Koneksi): Promise<GC | null> {
          const pw = k.password ? dekripsi(k.password) : null;
          if (!pw) return null;
          const gc = new GarminConnect({ username: k.email, password: pw });
          try {
            await gc.login();
          } catch {
            return null;
          }
          instance.set(atletId, gc);
          s[atletId] = { ...k, token: gc.exportToken(), perluLoginUlang: false };
          simpan(s);
          return gc;
        }

        /**
         * Jalankan f dengan klien atlet. Token yang diperbarui disimpan. Bila
         * Garmin menolak sesi, login ulang otomatis dengan password tersimpan
         * lalu coba sekali lagi; bila gagal, ditandai "perlu login ulang".
         */
        async function denganKlien(atletId: string, f: (k: KlienGarmin, gc: GC) => Promise<void>) {
          const k = s[atletId];
          if (!k) return kirim(401, { ok: false, pesan: "Akun Garmin atlet ini belum terhubung." });
          let gc: GC | null = k.perluLoginUlang ? await loginUlang(atletId, k) : gcAtlet(atletId, k);
          for (let coba = 0; gc && coba < 2; coba++) {
            try {
              await f(klien(gc, k.displayName), gc);
              s[atletId] = { ...s[atletId]!, token: gc.exportToken() };
              simpan(s);
              return;
            } catch (e) {
              if (!(e instanceof AksesDitolak)) throw e;
              instance.delete(atletId);
              gc = coba === 0 ? await loginUlang(atletId, s[atletId]!) : null;
            }
          }
          s[atletId] = { ...s[atletId]!, perluLoginUlang: true };
          simpan(s);
          kirim(401, { ok: false, pesan: PERLU_LOGIN });
        }

        try {
          // Status semua atlet, tanpa token.
          if (req.method === "GET" && url.pathname === "/status") {
            const data = Object.fromEntries(
              Object.entries(s).map(([id, k]) => [
                id,
                {
                  status: k.perluLoginUlang ? "perlu_login_ulang" : "terhubung",
                  email: k.email,
                  namaGarmin: k.namaGarmin,
                  terhubungAt: k.terhubungAt,
                  sinkronTerakhirAt: k.sinkronTerakhirAt ?? null,
                },
              ])
            );
            return kirim(200, { ok: true, data });
          }

          // Login sekali dengan email dan password; hanya token yang disimpan.
          if (req.method === "POST" && url.pathname === "/login") {
            const { atletId, email, password } = await baca(req);
            if (!atletId || !email?.trim() || !password) return kirim(400, { ok: false, pesan: "Email dan password Garmin wajib diisi." });
            const gc = new GarminConnect({ username: email.trim(), password });
            try {
              await gc.login();
            } catch (e) {
              return kirim(401, { ok: false, pesan: pesanLogin(e) });
            }
            const profil = (await gc.getUserProfile()) as { displayName?: string; fullName?: string };
            instance.set(atletId, gc);
            s[atletId] = {
              email: email.trim(),
              namaGarmin: profil.fullName ?? profil.displayName ?? email.trim(),
              displayName: profil.displayName ?? "",
              token: gc.exportToken(),
              password: enkripsi(password),
              terhubungAt: new Date().toISOString(),
            };
            simpan(s);
            return kirim(200, { ok: true, pesan: `Terhubung sebagai ${s[atletId]!.namaGarmin}.` });
          }

          // Satu hari: ringkasan harian, data tambahan, dan 10 aktivitas terbaru.
          if (req.method === "GET" && url.pathname === "/stats") {
            const atletId = url.searchParams.get("atlet") ?? "";
            const tanggal = url.searchParams.get("tanggal") ?? "";
            const nama = url.searchParams.get("nama") || atletId;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return kirim(400, { ok: false, pesan: "Tanggal tidak valid." });
            return await denganKlien(atletId, async (k) => {
              // 7 hari ringkasan untuk panel gabungan; hari ini sekaligus jadi `data`.
              const tanggalTujuh = Array.from({ length: 7 }, (_, i) => geserHari(tanggal, i - 6));
              const [harian, ekstra, aktivitas] = await Promise.all([
                Promise.all(tanggalTujuh.map((t) => tarikHarian(k, nama, t))),
                tarikEkstra(k, tanggal),
                tarikAktivitas(k, 20),
              ]);
              const riwayat = Object.fromEntries(tanggalTujuh.map((t, i) => [t, harian[i]!]));
              s[atletId] = { ...s[atletId]!, sinkronTerakhirAt: new Date().toISOString() };
              kirim(200, { ok: true, data: riwayat[tanggal], riwayat, ekstra, aktivitas });
            });
          }

          if (req.method === "GET" && url.pathname === "/aktivitas/detail") {
            const id = url.searchParams.get("id") ?? "";
            if (!/^\d+$/.test(id)) return kirim(400, { ok: false, pesan: "ID aktivitas tidak valid." });
            return await denganKlien(url.searchParams.get("atlet") ?? "", async (k) => {
              const d = await tarikDetailAktivitas(k, id).catch((e) => {
                if (e instanceof AksesDitolak) throw e;
                return null;
              });
              kirim(d ? 200 : 404, d ? { ok: true, data: d } : { ok: false, pesan: "Detail aktivitas tidak bisa ditarik." });
            });
          }

          // File asli aktivitas (.FIT di dalam ZIP), diteruskan apa adanya.
          if (req.method === "GET" && url.pathname === "/aktivitas/fit") {
            const id = url.searchParams.get("id") ?? "";
            if (!/^\d+$/.test(id)) return kirim(400, { ok: false, pesan: "ID aktivitas tidak valid." });
            return await denganKlien(url.searchParams.get("atlet") ?? "", async (_k, gc) => {
              let isi: ArrayBuffer;
              try {
                isi = await gc.client.get<ArrayBuffer>(`${API}/download-service/files/activity/${id}`, { responseType: "arraybuffer" });
              } catch (e) {
                const st = statusGalat(e);
                if (st === 401 || st === 403) throw new AksesDitolak("Sesi Garmin ditolak.");
                return kirim(st === 404 ? 404 : 502, { ok: false, pesan: `File aktivitas tidak bisa diunduh${st ? ` (HTTP ${st})` : ""}.` });
              }
              res.statusCode = 200;
              res.setHeader("content-type", "application/zip");
              res.setHeader("content-disposition", `attachment; filename="garmin-${id}.zip"`);
              res.end(Buffer.from(isi));
            });
          }

          if (req.method === "POST" && url.pathname === "/putus") {
            const { atletId } = await baca(req);
            delete s[atletId ?? ""];
            instance.delete(atletId ?? "");
            simpan(s);
            return kirim(200, { ok: true });
          }

          kirim(404, { ok: false, pesan: "Tidak ditemukan." });
        } catch (e) {
          // Pesan galat tidak pernah memuat password atau token.
          if (!res.headersSent) kirim(502, { ok: false, pesan: `Gagal menghubungi Garmin: ${e instanceof Error ? e.message.slice(0, 200) : "galat tak dikenal"}` });
        }
      });
    },
  };
}
