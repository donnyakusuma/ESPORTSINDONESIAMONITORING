import type { IncomingMessage } from "node:http";
import { GarminConnect } from "garmin-connect";
import type { Plugin } from "vite";

/**
 * Jembatan lokal ke Garmin Connect (tidak resmi): login memakai username dan
 * password akun Garmin, lalu menarik statistik harian. Berjalan di server dev
 * Vite saja; kredensial hanya hidup di memori proses ini dan tidak pernah
 * ditulis ke disk atau dikirim ke tempat lain selain Garmin.
 */
const sesi = new Map<string, { gc: GarminConnect; nama: string; displayName: string }>();

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

async function tarik(id: string, tanggal: string): Promise<Record<string, string>> {
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
        try {
          const url = new URL(req.url ?? "/", "http://x");
          if (req.method === "POST" && url.pathname === "/login") {
            const { username, password, atletId } = await baca(req);
            if (!username || !password || !atletId) return kirim(400, { ok: false, pesan: "Username, password, dan atlet wajib diisi." });
            const gc = new GarminConnect({ username, password });
            await gc.login();
            const profil = (await gc.getUserProfile()) as Peta;
            sesi.set(atletId, { gc, nama: profil.fullName ?? profil.displayName ?? username, displayName: profil.displayName });
            return kirim(200, { ok: true, nama: profil.fullName ?? profil.displayName });
          }
          if (req.method === "GET" && url.pathname === "/stats") {
            const atletId = url.searchParams.get("atlet") ?? "";
            const tanggal = url.searchParams.get("tanggal") ?? "";
            if (!sesi.has(atletId)) return kirim(401, { ok: false, pesan: "Akun Garmin atlet ini belum terhubung." });
            if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return kirim(400, { ok: false, pesan: "Tanggal tidak valid." });
            return kirim(200, { ok: true, data: await tarik(atletId, tanggal) });
          }
          if (req.method === "POST" && url.pathname === "/logout") {
            const { atletId } = await baca(req);
            sesi.delete(atletId ?? "");
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
