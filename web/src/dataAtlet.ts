/**
 * Satu hari data atlet dari semua perangkat (Whoop, Garmin), digabung jadi satu tampilan.
 * Bila satu metrik ada di kedua sumber, Whoop dipakai; Garmin mengisi yang kosong.
 */
export type Sumber = "Whoop" | "Garmin";

export interface HariAtlet {
  tanggal: string; // YYYY-MM-DD (WIB)
  sumber: Sumber[];
  recovery: { skor: number; hrv: number | null; rhr: number | null; spo2: number | null; suhuKulit: number | null } | null;
  /** Metrik harian yang tidak bergantung pada skor recovery (dari Garmin, atau Whoop bila ada). */
  vital: { hrv: number | null; rhr: number | null };
  tidur: {
    mulai: string | null;
    selesai: string | null;
    /** Sleep performance WHOOP (%). */
    performa: number | null;
    /** Sleep Score Garmin (0–100). */
    skor: number | null;
    konsistensi: number | null;
    efisiensi: number | null;
    respirasi: number | null;
    gangguan: number | null;
    /** Durasi dalam menit. */
    bangun: number;
    ringan: number;
    dalam: number;
    rem: number;
    butuh: number | null;
  } | null;
  strain: { skor: number; kkal: number | null; hrRata: number | null; hrMaks: number | null } | null;
  kkal: number | null;
  langkah: number | null;
  /** Body Battery Garmin. */
  energi: { maks: number | null; min: number | null; isi: number | null; pakai: number | null } | null;
  /** Stres Garmin: tingkat rata-rata/puncak (0–100) dan durasi per tingkat (menit). */
  stres: { rata: number | null; maks: number | null; istirahat: number | null; rendah: number | null; sedang: number | null; tinggi: number | null } | null;
  latihan: {
    olahraga: string;
    mulai: string;
    selesai: string;
    strain: number | null;
    hrRata: number | null;
    hrMaks: number | null;
    kkal: number | null;
    /** Menit di zona detak jantung 0–5. */
    zona: number[];
  }[];
}

export function hariKosong(tanggal: string, sumber: Sumber): HariAtlet {
  return {
    tanggal,
    sumber: [sumber],
    recovery: null,
    vital: { hrv: null, rhr: null },
    tidur: null,
    strain: null,
    kkal: null,
    langkah: null,
    energi: null,
    stres: null,
    latihan: [],
  };
}

// ───────────────────────── Garmin (baris ekspor / tarikan Garmin Connect) ─────────────────────────

type Baris = Record<string, string | undefined>;
const n = (v: string | undefined) => (v ? Number(v) : null);
const m = (v: string | undefined) => {
  const x = v?.match(/^(\d+):(\d{2})$/);
  return x ? Number(x[1]) * 60 + Number(x[2]) : null;
};

export function hariDariGarmin(b: Baris, tanggal: string): HariAtlet {
  const h = hariKosong(tanggal, "Garmin");
  h.vital = { hrv: n(b["HRV Last Night Avg. (ms)"]), rhr: n(b["Resting HR (bpm)"]) };
  h.kkal = n(b["Total Calories (kcal)"]);
  const tahap = [m(b["Avg. Sleep Awake Dur. (h:min)"]), m(b["Avg. Light Sleep (h:min)"]), m(b["Avg. Deep Sleep (h:min)"]), m(b["Avg. REM Sleep (h:min)"])];
  const skorTidur = n(b["Sleep Score"]);
  if (skorTidur !== null || tahap.some((x) => x !== null)) {
    h.tidur = {
      mulai: null,
      selesai: null,
      performa: null,
      skor: skorTidur,
      konsistensi: null,
      efisiensi: null,
      respirasi: null,
      gangguan: null,
      bangun: tahap[0] ?? 0,
      ringan: tahap[1] ?? 0,
      dalam: tahap[2] ?? 0,
      rem: tahap[3] ?? 0,
      butuh: null,
    };
  }
  const energi = { maks: n(b["Body Battery (Max)"]), min: n(b["Body Battery (Min)"]), isi: n(b["Body Battery (Charge)"]), pakai: n(b["Body Battery (Drain)"]) };
  if (Object.values(energi).some((x) => x !== null)) h.energi = energi;
  const stres = {
    rata: n(b["Avg. Daily Stress Level"]),
    maks: n(b["Max. Stress Level"]),
    istirahat: m(b["Rest Stress Dur. (h:min)"]),
    rendah: m(b["Low Stress Dur. (h:min)"]),
    sedang: m(b["Medium Stress Dur. (h:min)"]),
    tinggi: m(b["High Stress Dur. (h:min)"]),
  };
  if (Object.values(stres).some((x) => x !== null)) h.stres = stres;
  return h;
}

/** Gabungkan hari-hari dari beberapa sumber; Whoop diutamakan, Garmin mengisi yang kosong. */
export function gabungHari(whoop: HariAtlet[], garmin: HariAtlet[]): HariAtlet[] {
  const peta = new Map(whoop.map((h) => [h.tanggal, { ...h, vital: { ...h.vital } }]));
  for (const g of garmin) {
    const w = peta.get(g.tanggal);
    if (!w) {
      peta.set(g.tanggal, g);
      continue;
    }
    w.sumber = [...new Set([...w.sumber, ...g.sumber])];
    w.vital.hrv ??= g.vital.hrv;
    w.vital.rhr ??= g.vital.rhr;
    w.kkal ??= g.kkal;
    w.langkah ??= g.langkah;
    w.tidur ??= g.tidur;
    if (w.tidur && g.tidur) w.tidur = { ...w.tidur, skor: w.tidur.skor ?? g.tidur.skor };
    w.energi ??= g.energi;
    w.stres ??= g.stres;
  }
  // Recovery WHOOP juga mengisi metrik vital harian.
  for (const h of peta.values()) {
    if (h.recovery) {
      h.vital.hrv = h.recovery.hrv ?? h.vital.hrv;
      h.vital.rhr = h.recovery.rhr ?? h.vital.rhr;
    }
    h.kkal = h.strain?.kkal ?? h.kkal;
  }
  // 7 hari kalender berturut-turut sampai hari data terakhir; hari tanpa data tetap tampil (kosong).
  const tanggal = [...peta.keys()].sort();
  const akhir = tanggal[tanggal.length - 1];
  if (!akhir) return [];
  return Array.from({ length: 7 }, (_, k) => {
    const d = new Date(`${akhir}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (6 - k));
    const t = d.toISOString().slice(0, 10);
    return peta.get(t) ?? { ...hariKosong(t, "Whoop"), sumber: [] };
  });
}
