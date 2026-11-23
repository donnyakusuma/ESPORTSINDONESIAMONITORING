/**
 * Data atlet dari semua perangkat, diseragamkan lewat harmonizer (lib/harmonizer.mjs):
 * satu kamus istilah, satu satuan, satu aturan tanggal (tanggal bangun lokal).
 *
 * Harmonizer menghasilkan satu catatan per atlet × tanggal × vendor dan TIDAK menggabung vendor.
 * Untuk tampilan, berkas ini menyusun catatan itu per tanggal dengan aturan dari kamus:
 *   - level "setara" / "satu_sisi" / "baru": satu nilai; WHOOP dipakai bila ada, lalu Garmin, dan sumbernya ditampilkan.
 *   - level "serupa" (rumus vendor berbeda): nilai tiap vendor ditampilkan terpisah, tidak pernah dicampur.
 */
import { harmonisasi, KAMUS, type Aktivitas, type Catatan, type EntriKamus, type Field } from "./lib/harmonizer.mjs";

export type Vendor = "whoop" | "garmin";
export const NAMA_VENDOR: Record<Vendor, string> = { whoop: "WHOOP", garmin: "Garmin" };
export const KAMUS_PER_KODE = new Map<string, EntriKamus>(KAMUS.map((k) => [k.kode, k]));

/** Rincian Garmin yang tidak ada di kamus (ditampilkan sebagai rincian vendor, bukan metrik seragam). */
export interface RinciGarmin {
  stres: { istirahat: number | null; rendah: number | null; sedang: number | null; tinggi: number | null; puncak: number | null } | null;
  bb: { min: number | null; isi: number | null; pakai: number | null } | null;
}

export interface HariTampil {
  tanggal: string;
  catatan: Partial<Record<Vendor, Catatan>>;
  aktivitas: Aktivitas[];
  rinciGarmin: RinciGarmin | null;
}

export interface Nilai {
  nilai: number;
  vendor: Vendor;
  field: Field;
}

const URUTAN: Vendor[] = ["whoop", "garmin"];

/** Nilai angka satu metrik: WHOOP dulu, lalu Garmin. Untuk metrik "serupa" pakai `nilaiVendor`. */
export function nilai(h: HariTampil | undefined, kode: string): Nilai | null {
  if (!h) return null;
  for (const v of URUTAN) {
    const f = h.catatan[v]?.metrik[kode];
    if (f && typeof f.nilai === "number") return { nilai: f.nilai, vendor: v, field: f };
  }
  return null;
}

/** Nilai metrik dari satu vendor saja. */
export function nilaiVendor(h: HariTampil | undefined, kode: string, v: Vendor): Nilai | null {
  const f = h?.catatan[v]?.metrik[kode];
  return f && typeof f.nilai === "number" ? { nilai: f.nilai, vendor: v, field: f } : null;
}

/** Nilai kategori (mis. BPR) dari vendor pertama yang punya. */
export function kategori(h: HariTampil | undefined, kode: string): { nilai: string; vendor: Vendor; field: Field } | null {
  if (!h) return null;
  for (const v of URUTAN) {
    const f = h.catatan[v]?.metrik[kode];
    if (f && typeof f.nilai === "string") return { nilai: f.nilai, vendor: v, field: f };
  }
  return null;
}

export const adaData = (h: HariTampil) => Object.keys(h.catatan).length > 0 || h.aktivitas.length > 0;

// ───────────────────────── Garmin: baris ekspor / tarikan → bentuk summary Garmin Health API ─────────────────────────

type Baris = Record<string, string | undefined>;
const n = (v: string | undefined) => (v ? Number(v) : null);
const detik = (v: string | undefined) => {
  const x = v?.match(/^(\d+):(\d{2})$/);
  return x ? (Number(x[1]) * 60 + Number(x[2])) * 60 : null;
};
const menit = (v: string | undefined) => {
  const d = detik(v);
  return d === null ? null : d / 60;
};

/**
 * Ekspor "Health Stats" Garmin Connect memakai nama kolom tampilan, bukan nama field API.
 * Fungsi ini menerjemahkannya ke bentuk yang dikenali harmonizer (ALIAS Garmin).
 */
function garminKeSummary(b: Baris, tanggal: string) {
  const dalam = detik(b["Avg. Deep Sleep (h:min)"]);
  const ringan = detik(b["Avg. Light Sleep (h:min)"]);
  const rem = detik(b["Avg. REM Sleep (h:min)"]);
  const jaga = detik(b["Avg. Sleep Awake Dur. (h:min)"]);
  const skor = n(b["Sleep Score"]);
  const adaTidur = [dalam, ringan, rem].every((x) => x !== null) || skor !== null;
  const bbMaks = n(b["Body Battery (Max)"]);
  const bbMin = n(b["Body Battery (Min)"]);
  return {
    sleeps: adaTidur
      ? [
          {
            calendarDate: tanggal,
            deepSleepDurationInSeconds: dalam,
            lightSleepDurationInSeconds: ringan,
            remSleepInSeconds: rem,
            awakeDurationInSeconds: jaga,
            durationInSeconds: [dalam, ringan, rem, jaga].every((x) => x !== null) ? dalam! + ringan! + rem! + jaga! : null,
            overallSleepScore: skor === null ? null : { value: skor },
          },
        ]
      : [],
    hrv: n(b["HRV Last Night Avg. (ms)"]) !== null ? [{ calendarDate: tanggal, lastNightAvg: n(b["HRV Last Night Avg. (ms)"]) }] : [],
    dailies: [{ calendarDate: tanggal, restingHeartRateInBeatsPerMinute: n(b["Resting HR (bpm)"]), averageStressLevel: n(b["Avg. Daily Stress Level"]) }],
    stress: bbMaks !== null || bbMin !== null ? [{ calendarDate: tanggal, timeOffsetBodyBatteryValues: [bbMaks, bbMin].filter((x) => x !== null) }] : [],
  };
}

function rinciGarmin(b: Baris): RinciGarmin {
  const stres = {
    istirahat: menit(b["Rest Stress Dur. (h:min)"]),
    rendah: menit(b["Low Stress Dur. (h:min)"]),
    sedang: menit(b["Medium Stress Dur. (h:min)"]),
    tinggi: menit(b["High Stress Dur. (h:min)"]),
    puncak: n(b["Max. Stress Level"]),
  };
  const bb = { min: n(b["Body Battery (Min)"]), isi: n(b["Body Battery (Charge)"]), pakai: n(b["Body Battery (Drain)"]) };
  return {
    stres: Object.values(stres).some((x) => x !== null) ? stres : null,
    bb: Object.values(bb).some((x) => x !== null) ? bb : null,
  };
}

/** Ringkasan aktivitas Garmin Connect, sesuai bentuk yang dikirim server lokal (garmin-tarik.ts). */
export interface AktivitasGarminRingkas {
  id: number;
  nama: string;
  jenis: string;
  /** Waktu mulai lokal "YYYY-MM-DD HH:mm:ss". */
  mulai: string;
  /** Waktu mulai ISO UTC. */
  mulaiIso: string | null;
  durasiDetik: number | null;
  kalori: number | null;
  hrRata: number | null;
  hrMaks: number | null;
}

/** Aktivitas Garmin Connect -> bentuk activity summary yang dikenali harmonizer (ALIAS.aktivitas). */
function aktivitasKeSummary(a: AktivitasGarminRingkas) {
  if (!a.mulaiIso || a.durasiDetik === null) return null;
  const utcMs = Date.parse(a.mulaiIso);
  // Selisih jam lokal dan UTC memberi offset zona waktu atlet saat aktivitas.
  const lokalMs = Date.parse(`${a.mulai.replace(" ", "T")}Z`);
  return {
    activityId: a.id,
    activityType: a.nama || a.jenis,
    startTimeInSeconds: Math.round(utcMs / 1000),
    startTimeOffsetInSeconds: Number.isFinite(lokalMs) ? Math.round((lokalMs - utcMs) / 1000) : null,
    durationInSeconds: Math.round(a.durasiDetik),
    averageHeartRateInBeatsPerMinute: a.hrRata,
    maxHeartRateInBeatsPerMinute: a.hrMaks,
    activeKilocalories: a.kalori,
  };
}

// ───────────────────────── Susun ─────────────────────────

type Rekaman = Record<string, unknown> & { type: string };

export function susunAtlet(masukan: {
  athleteId: string;
  whoop: Rekaman[];
  /** Satu baris per hari: ekspor CSV (1 hari) atau tarikan Garmin Connect (7 hari). */
  garmin: { baris: Baris; tanggal: string }[];
  /** Aktivitas dari tarikan Garmin Connect. */
  aktivitasGarmin?: AktivitasGarminRingkas[] | null;
}): { hari: HariTampil[]; peringatan: string[] } {
  const per = (t: string) => masukan.whoop.filter((r) => r.type === t);
  const adaWhoop = masukan.whoop.length > 0;
  const hariGarmin = masukan.garmin;
  const aktivitas = (masukan.aktivitasGarmin ?? []).map(aktivitasKeSummary).filter((a) => a !== null);
  const adaGarmin = hariGarmin.length > 0 || aktivitas.length > 0;
  if (!adaWhoop && !adaGarmin) return { hari: [], peringatan: [] };

  // Ringkasan per hari digabung jadi satu payload Garmin (sleeps/hrv/dailies/stress per calendarDate).
  const ringkas = hariGarmin.map((h) => garminKeSummary(h.baris, h.tanggal));
  const hasil = harmonisasi({
    athlete_id: masukan.athleteId,
    whoop: adaWhoop ? { sleeps: per("sleep"), recoveries: per("recovery"), cycles: per("cycle"), workouts: per("workout") } : null,
    garmin: adaGarmin
      ? {
          sleeps: ringkas.flatMap((r) => r.sleeps),
          hrv: ringkas.flatMap((r) => r.hrv),
          dailies: ringkas.flatMap((r) => r.dailies),
          stress: ringkas.flatMap((r) => r.stress),
          activities: aktivitas,
        }
      : null,
  });

  // Energi Total Harian Garmin: kamus meminta active + BMR. Ekspor Health Stats hanya punya "Total Calories"
  // (sudah termasuk BMR menurut Garmin Connect), jadi diisi dari sana dengan catatan asalnya.
  for (const g of hariGarmin) {
    const tot = n(g.baris["Total Calories (kcal)"]);
    const c = hasil.catatan.find((x) => x.sumber === "garmin" && x.tanggal === g.tanggal);
    if (c && tot !== null && (c.metrik.EKT?.nilai ?? null) === null) {
      c.metrik.EKT = { nilai: tot, unit: "kkal", sumber: "garmin", kualitas: "asli", catatan: "Total Calories dari Garmin Connect" };
    }
  }

  const peta = new Map<string, HariTampil>();
  const ambil = (t: string) => {
    let h = peta.get(t);
    if (!h) peta.set(t, (h = { tanggal: t, catatan: {}, aktivitas: [], rinciGarmin: null }));
    return h;
  };
  for (const c of hasil.catatan) {
    const h = ambil(c.tanggal);
    // Catatan yang hanya berisi aktivitas atau bendera "data_kurang" tidak dihitung sebagai data metrik.
    const adaMetrik = Object.entries(c.metrik).some(([k, f]) => f.nilai !== null && !(k === "BPR" && f.nilai === "data_kurang"));
    if (adaMetrik) h.catatan[c.sumber] = c;
    h.aktivitas.push(...c.aktivitas);
  }
  for (const g of hariGarmin) ambil(g.tanggal).rinciGarmin = rinciGarmin(g.baris);

  // 7 hari kalender berturut-turut sampai hari data terakhir; hari kosong tetap tampil.
  const berdata = [...peta.values()].filter(adaData).map((h) => h.tanggal).sort();
  const akhir = berdata[berdata.length - 1];
  if (!akhir) return { hari: [], peringatan: hasil.peringatan };
  const hari = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(`${akhir}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (6 - k));
    const t = d.toISOString().slice(0, 10);
    return peta.get(t) ?? { tanggal: t, catatan: {}, aktivitas: [], rinciGarmin: null };
  });
  return { hari, peringatan: hasil.peringatan };
}
