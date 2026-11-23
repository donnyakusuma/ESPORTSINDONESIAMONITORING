import { useEffect, useState } from "react";

/** Klien kecil untuk server whoop-esport (lewat proxy Vite). */
export type StatusWhoop = { connected: boolean; needsReconnect?: boolean; whoopUserId?: string; connectedAt?: string };
export type RingkasanWhoop = {
  recovery: { n: number; avgScore: number | null; avgHrvRmssdMs: number | null; avgRestingHr: number | null };
  sleep: { n: number; avgPerformancePct: number | null };
  cycle: { n: number; avgDayStrain: number | null };
  workouts: { n: number };
};
export type ConfigWhoop = { configured: boolean; redirectUri: string; clientId: string };

const id = (athleteId: string) => encodeURIComponent(athleteId);

export async function ambilJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Gagal (${r.status})`);
  return j as T;
}

export const whoop = {
  config: () => ambilJson<ConfigWhoop>("/api/whoop/config"),
  simpanConfig: (clientId: string, clientSecret: string) =>
    ambilJson<{ configured: boolean }>("/api/whoop/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    }),
  status: (a: string) => ambilJson<StatusWhoop>(`/api/athletes/${id(a)}/status`),
  ringkasan: (a: string, hari = 7) => ambilJson<RingkasanWhoop>(`/api/athletes/${id(a)}/summary?days=${hari}`),
  sinkron: (a: string, hari = 7) => ambilJson<unknown>(`/api/athletes/${id(a)}/sync?days=${hari}`, { method: "POST" }),
  putus: (a: string) => ambilJson<unknown>(`/whoop/disconnect/${id(a)}`, { method: "DELETE" }),
  urlHubungkan: (a: string) => `/whoop/connect?athleteId=${id(a)}`,
};

/** Status + ringkasan Whoop satu atlet; diperbarui tiap 5 menit agar hasil sinkron otomatis server ikut tampil. */
export function useWhoopAtlet(athleteId: string | null, versi = 0) {
  const [hasil, setHasil] = useState<{ status: StatusWhoop | null; ringkasan: RingkasanWhoop | null; mati: boolean }>({
    status: null,
    ringkasan: null,
    mati: false,
  });
  useEffect(() => {
    if (!athleteId) return;
    let batal = false;
    const muat = async () => {
      try {
        const status = await whoop.status(athleteId);
        const ringkasan = status.connected ? await whoop.ringkasan(athleteId) : null;
        if (!batal) setHasil({ status, ringkasan, mati: false });
      } catch {
        if (!batal) setHasil({ status: null, ringkasan: null, mati: true });
      }
    };
    void muat();
    const t = setInterval(muat, 5 * 60 * 1000);
    return () => {
      batal = true;
      clearInterval(t);
    };
  }, [athleteId, versi]);
  return hasil;
}

// ───────────────────────── Data harian (untuk tampilan ala aplikasi WHOOP) ─────────────────────────

import type { HariAtlet } from "./dataAtlet.js";
export type HariWhoop = HariAtlet;

type Rekaman = Record<string, any> & { type: string };
const menit = (ms: unknown) => (typeof ms === "number" ? Math.round(ms / 60000) : 0);
const angka = (v: unknown) => (typeof v === "number" ? v : null);
const kkal = (kj: unknown) => (typeof kj === "number" ? Math.round(kj / 4.184) : null);
/** Tanggal kalender WIB dari stempel waktu ISO. */
export const tanggalWib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
/**
 * Hari sebuah siklus WHOOP. Siklus mulai saat atlet tidur (mis. 23.00 tgl 22), tetapi aplikasi WHOOP
 * menampilkannya sebagai hari bangun (tgl 23); +12 jam dari awal siklus jatuh di hari bangun itu.
 */
const hariSiklus = (iso: string) => tanggalWib(new Date(new Date(iso).getTime() + 12 * 3600_000).toISOString());

import { hariKosong } from "./dataAtlet.js";

export function susunHarian(rekaman: Rekaman[]): HariWhoop[] {
  const siklus = rekaman.filter((r) => r.type === "cycle");
  const perSiklus = new Map<number, HariWhoop>();
  const hari = new Map<string, HariWhoop>();
  const ambilHari = (tgl: string) => {
    let h = hari.get(tgl);
    if (!h) hari.set(tgl, (h = hariKosong(tgl, "Whoop")));
    return h;
  };
  for (const c of siklus) {
    const h = ambilHari(hariSiklus(c.start));
    if (typeof c.step_count === "number") h.langkah = c.step_count;
    perSiklus.set(c.id, h);
    if (c.score_state === "SCORED" && c.score)
      h.strain = { skor: c.score.strain, kkal: kkal(c.score.kilojoule), hrRata: angka(c.score.average_heart_rate), hrMaks: angka(c.score.max_heart_rate) };
  }
  for (const r of rekaman.filter((x) => x.type === "recovery" && x.score_state === "SCORED" && x.score)) {
    const h = perSiklus.get(r.cycle_id) ?? ambilHari(hariSiklus(r.created_at));
    h.recovery = {
      skor: r.score.recovery_score,
      hrv: angka(r.score.hrv_rmssd_milli),
      rhr: angka(r.score.resting_heart_rate),
      spo2: angka(r.score.spo2_percentage),
      suhuKulit: angka(r.score.skin_temp_celsius),
    };
  }
  for (const s of rekaman.filter((x) => x.type === "sleep" && !x.nap && x.score_state === "SCORED" && x.score)) {
    const h = perSiklus.get(s.cycle_id) ?? ambilHari(hariSiklus(s.start));
    const st = s.score.stage_summary ?? {};
    const n = s.score.sleep_needed;
    h.tidur = {
      mulai: s.start,
      selesai: s.end,
      performa: angka(s.score.sleep_performance_percentage),
      skor: null,
      konsistensi: angka(s.score.sleep_consistency_percentage),
      efisiensi: angka(s.score.sleep_efficiency_percentage),
      respirasi: angka(s.score.respiratory_rate),
      gangguan: angka(st.disturbance_count),
      bangun: menit(st.total_awake_time_milli),
      ringan: menit(st.total_light_sleep_time_milli),
      dalam: menit(st.total_slow_wave_sleep_time_milli),
      rem: menit(st.total_rem_sleep_time_milli),
      butuh: n
        ? menit((n.baseline_milli ?? 0) + (n.need_from_sleep_debt_milli ?? 0) + (n.need_from_recent_strain_milli ?? 0) + (n.need_from_recent_nap_milli ?? 0))
        : null,
    };
  }
  for (const w of rekaman.filter((x) => x.type === "workout")) {
    const z = w.score?.zone_durations ?? {};
    ambilHari(tanggalWib(w.start)).latihan.push({
      olahraga: String(w.sport_name ?? "Aktivitas").replace(/[-_]/g, " "),
      mulai: w.start,
      selesai: w.end,
      strain: angka(w.score?.strain),
      hrRata: angka(w.score?.average_heart_rate),
      hrMaks: angka(w.score?.max_heart_rate),
      kkal: kkal(w.score?.kilojoule),
      zona: ["zero", "one", "two", "three", "four", "five"].map((k) => menit(z[`zone_${k}_milli`])),
    });
  }
  return [...hari.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal)).slice(-7);
}

/** Rekaman 8 hari terakhir dari server lalu disusun per hari; diperbarui tiap 5 menit. */
export function useWhoopHarian(athleteId: string | null, versi = 0) {
  const [hasil, setHasil] = useState<{ status: StatusWhoop | null; hari: HariWhoop[]; mati: boolean; memuat: boolean }>({
    status: null,
    hari: [],
    mati: false,
    memuat: true,
  });
  useEffect(() => {
    if (!athleteId) return;
    let batal = false;
    setHasil((h) => ({ ...h, memuat: true }));
    const muat = async () => {
      try {
        const status = await whoop.status(athleteId);
        const rek = status.connected ? await ambilJson<Rekaman[]>(`/api/athletes/${encodeURIComponent(athleteId)}/records?days=8&limit=200`) : [];
        if (!batal) setHasil({ status, hari: susunHarian(rek), mati: false, memuat: false });
      } catch {
        if (!batal) setHasil({ status: null, hari: [], mati: true, memuat: false });
      }
    };
    void muat();
    const t = setInterval(muat, 5 * 60 * 1000);
    return () => {
      batal = true;
      clearInterval(t);
    };
  }, [athleteId, versi]);
  return hasil;
}

