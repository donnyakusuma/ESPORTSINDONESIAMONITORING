import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GarminConnect } from "garmin-connect";
import type { Plugin } from "vite";

/**
 * Jembatan lokal ke Garmin Connect (tidak resmi) dengan database server.
 *
 * Login memakai username dan password SEKALI. Yang disimpan hanya token OAuth (terenkripsi AES-256-GCM)
 * bersama data terakhir tiap atlet, di folder data/garmin/ (di-ignore Git). Password TIDAK pernah disimpan.
 * Saat server menyala, sesi dimuat dari token, sehingga tidak perlu login lagi; data disinkronkan otomatis
 * tiap jam dan hasilnya disimpan di database ini.
 */
type Sesi = { gc: GarminConnect; nama: string; displayName: string };
const sesi = new Map<string, Sesi>();

// Selalu <root proyek>/data/garmin, apa pun folder tempat server dijalankan.
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/garmin");
const DB_FILE = path.join(DIR, "db.json");
const KUNCI_FILE = path.join(DIR, ".kunci");

interface Tersimpan {
  nama: string;
  displayName: string;
  tokensEnc: string;
  terhubungAt: string;
  terakhir?: { tanggal: string; diambilAt: string; data: Record<string, string> };
  /** Riwayat harian (tanggal -> data), diisi mundur sampai 365 hari. */
  riwayat?: Record<string, Record<string, string>>;
}
type Db = { atlet: Record<string, Tersimpan> };

function kunci(): Buffer {
  fs.mkdirSync(DIR, { recursive: true });
  const env = process.env.GARMIN_ENC_KEY;
  if (env && /^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex");
  if (!fs.existsSync(KUNCI_FILE)) fs.writeFileSync(KUNCI_FILE, randomBytes(32).toString("hex"), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(KUNCI_FILE, "utf8").trim(), "hex");
}
function enkripsi(obj: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kunci(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}
function dekripsi<T>(teks: string): T {
  const [iv, tag, data] = teks.split(".").map((x) => Buffer.from(x, "base64"));
  const d = createDecipheriv("aes-256-gcm", kunci(), iv!);
  d.setAuthTag(tag!);
  return JSON.parse(Buffer.concat([d.update(data!), d.final()]).toString("utf8")) as T;
}
function muatDb(): Db {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Db;
  } catch {
    return { atlet: {} };
  }
}
function simpanDb(db: Db) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
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

const hm = (detik: unknown) => {
  if (typeof detik !== "number") return "";
  const m = Math.round(detik / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
const n = (v: unknown) => (typeof v === "number" ? String(Math.round(v)) : "");

type Peta = Record<string, any>;
async function ambil<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch {
    return null;
  }
}

async function tarikMentah(id: string, tanggal: string): Promise<Record<string, string>> {
  const s = sesi.get(id)!;
  const d = new Date(`${tanggal}T12:00:00`);
  const [ringkas, hrv, tidur] = await Promise.all([
    ambil(() => s.gc.get<Peta>(`https://connectapi.garmin.com/usersummary-service/usersummary/daily/${s.displayName}?calendarDate=${tanggal}`)),
    ambil(() => s.gc.get<Peta>(`https://connectapi.garmin.com/hrv-service/hrv/${tanggal}`)),
    ambil(() => s.gc.getSleepData(d) as Promise<Peta>),
  ]);
  const t = tidur?.dailySleepDTO ?? {};
  const h = hrv?.hrvSummary ?? {};
  const r = ringkas ?? {};
  return {
    Name: s.nama,
    "HRV Last Night Avg. (ms)": n(h.lastNightAvg),
    "Resting HR (bpm)": n(r.restingHeartRate),
    "Avg Sleep (h:min)": hm(t.sleepTimeSeconds),
    "Sleep Score": n(t.sleepScores?.overall?.value),
    "Total Calories (kcal)": n(r.totalKilocalories),
    "Body Battery (Max)": n(r.bodyBatteryHighestValue),
    "Body Battery (Min)": n(r.bodyBatteryLowestValue),
    "High Stress Dur. (h:min)": hm(r.highStressDuration),
    "Body Battery (Charge)": n(r.bodyBatteryChargedValue),
    "Body Battery (Drain)": n(r.bodyBatteryDrainedValue),
    "HRV Last Night High (ms)": n(h.lastNight5MinHigh),
    "Avg. Deep Sleep (h:min)": hm(t.deepSleepSeconds),
    "Avg. Light Sleep (h:min)": hm(t.lightSleepSeconds),
    "Avg. REM Sleep (h:min)": hm(t.remSleepSeconds),
    "Avg. Sleep Awake Dur. (h:min)": hm(t.awakeSleepSeconds),
    "Nap Duration (h:min)": hm(t.napTimeSeconds),
    "Activity Stress Dur. (h:min)": hm(r.activityStressDuration),
    "Avg. Daily Stress Level": n(r.averageStressLevel),
    "Rest Stress Dur. (h:min)": hm(r.restStressDuration),
    "Stress Duration (h:min)": hm(r.stressDuration),
    "Medium Stress Dur. (h:min)": hm(r.mediumStressDuration),
    "Max. Stress Level": n(r.maxStressLevel),
    "Low Stress Dur. (h:min)": hm(r.lowStressDuration),
  };
}


const hariIni = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** Tarik data lalu simpan ke database (beserta token yang mungkin diperbarui Garmin). */
async function tarik(id: string, tanggal: string): Promise<Record<string, string>> {
  const data = await tarikMentah(id, tanggal);
  // Garmin gagal menjawab (token kedaluwarsa, jaringan): jangan timpa data tersimpan dengan data kosong.
  if (!Object.entries(data).some(([k, v]) => k !== "Name" && v !== "")) throw new Error("Garmin tidak mengembalikan data (sesi mungkin kedaluwarsa; login ulang bila berulang).");
  const db = muatDb();
  const rec = db.atlet[id];
  const s = sesi.get(id);
  if (rec && s) {
    rec.tokensEnc = enkripsi(s.gc.exportToken());
    if (!rec.terakhir || tanggal >= rec.terakhir.tanggal) rec.terakhir = { tanggal, diambilAt: new Date().toISOString(), data };
    (rec.riwayat ??= {})[tanggal] = data;
    simpanDb(db);
  }
  return data;
}

/** Muat sesi dari token tersimpan; token yang sudah tidak berlaku ditandai dan dilewati. */
function pulihkanSesi() {
  const db = muatDb();
  for (const [id, rec] of Object.entries(db.atlet)) {
    try {
      const tok = dekripsi<ReturnType<GarminConnect["exportToken"]>>(rec.tokensEnc);
      const gc = new GarminConnect({ username: "", password: "" });
      gc.loadToken(tok.oauth1, tok.oauth2);
      sesi.set(id, { gc, nama: rec.nama, displayName: rec.displayName });
    } catch (e) {
      console.error(`[garmin] sesi ${id} tidak bisa dipulihkan:`, e instanceof Error ? e.message : e);
    }
  }
}

// ───────── Isi mundur 1 tahun: satu hari per ~1,5 detik agar tidak membebani Garmin ─────────
const HARI_RIWAYAT = 365;
const sedangIsi = new Set<string>();
const sudahDicoba = new Map<string, Set<string>>(); // hari tanpa data tidak dicoba ulang sampai server restart

async function isiMundur(id: string) {
  if (sedangIsi.has(id)) return;
  sedangIsi.add(id);
  try {
    const dicoba = sudahDicoba.get(id) ?? new Set<string>();
    sudahDicoba.set(id, dicoba);
    for (let k = 1; k <= HARI_RIWAYAT; k++) {
      if (!sesi.has(id)) return; // diputus di tengah jalan
      const t = new Date(Date.now() + 7 * 3600_000 - k * 86400_000).toISOString().slice(0, 10);
      if (muatDb().atlet[id]?.riwayat?.[t] || dicoba.has(t)) continue;
      dicoba.add(t);
      try {
        await tarik(id, t);
      } catch {
        // hari tanpa data (jam tidak dipakai) dibiarkan bolong
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    sedangIsi.delete(id);
  }
}

async function sinkronSemua() {
  for (const id of [...sesi.keys()]) {
    try {
      await tarik(id, hariIni());
    } catch (e) {
      console.error(`[garmin] sinkron ${id} gagal:`, e instanceof Error ? e.message : e);
    }
    void isiMundur(id);
  }
}

export function garminServer(): Plugin {
  return {
    name: "garmin-server",
    configureServer(server) {
      pulihkanSesi();
      // Sinkron otomatis: sekali saat menyala lalu tiap jam (data tersimpan di database).
      setTimeout(() => void sinkronSemua(), 8000).unref();
      setInterval(() => void sinkronSemua(), 3600_000).unref();

      server.middlewares.use("/api/garmin", async (req, res) => {
        const kirim = (kode: number, badan: unknown) => {
          res.statusCode = kode;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(badan));
        };
        try {
          const url = new URL(req.url ?? "/", "http://x");
          if (req.method === "POST" && url.pathname === "/login") {
            const { username, password, atletId } = await baca(req);
            if (!username || !password || !atletId) return kirim(400, { ok: false, pesan: "Username, password, dan atlet wajib diisi." });
            const gc = new GarminConnect({ username, password });
            await gc.login();
            const profil = (await gc.getUserProfile()) as Peta;
            const nama = profil.fullName ?? profil.displayName ?? username;
            sesi.set(atletId, { gc, nama, displayName: profil.displayName });
            // Simpan token (BUKAN password) ke database server agar tidak perlu login lagi.
            const db = muatDb();
            db.atlet[atletId] = { nama, displayName: profil.displayName, tokensEnc: enkripsi(gc.exportToken()), terhubungAt: new Date().toISOString() };
            simpanDb(db);
            void isiMundur(atletId); // riwayat 1 tahun ditarik di latar belakang
            return kirim(200, { ok: true, nama });
          }
          if (req.method === "GET" && url.pathname === "/stats") {
            const atletId = url.searchParams.get("atlet") ?? "";
            const tanggal = url.searchParams.get("tanggal") ?? "";
            if (!sesi.has(atletId)) return kirim(401, { ok: false, pesan: "Akun Garmin atlet ini belum terhubung." });
            if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return kirim(400, { ok: false, pesan: "Tanggal tidak valid." });
            return kirim(200, { ok: true, data: await tarik(atletId, tanggal) });
          }
          if (req.method === "GET" && url.pathname === "/saved") {
            // Data terakhir yang tersimpan per atlet (tanpa token).
            const db = muatDb();
            return kirim(200, {
              ok: true,
              atlet: Object.entries(db.atlet).map(([atletId, r]) => ({ atletId, nama: r.nama, terhubungAt: r.terhubungAt, terakhir: r.terakhir ?? null, riwayat: r.riwayat ?? {}, mengisi: sedangIsi.has(atletId), aktif: sesi.has(atletId) })),
            });
          }
          if (req.method === "POST" && url.pathname === "/logout") {
            const { atletId } = await baca(req);
            sesi.delete(atletId ?? "");
            const db = muatDb();
            delete db.atlet[atletId ?? ""];
            simpanDb(db);
            return kirim(200, { ok: true });
          }
          kirim(404, { ok: false, pesan: "Tidak ditemukan." });
        } catch (e) {
          // Pesan galat dari Garmin tidak berisi kredensial; password tidak pernah dicatat.
          kirim(502, { ok: false, pesan: `Gagal menghubungi Garmin Connect: ${e instanceof Error ? e.message : "galat tak dikenal"}` });
        }
      });
    },
  };
}
