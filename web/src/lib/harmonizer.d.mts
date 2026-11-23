/** Tipe untuk harmonizer.mjs (penyeragaman data WHOOP + Garmin untuk atlet esports). */

export type Level = "setara" | "serupa" | "satu_sisi" | "baru" | "input";

export interface EntriKamus {
  kode: string;
  nama: string;
  en: string;
  unit: string;
  level: Level;
  whoop: string;
  garmin: string;
  definisi: string;
  kaveat: string;
  tipe?: "kategori";
}

/** Satu nilai bermetadata; satuan selalu dari kamus. */
export interface Field {
  nilai: number | string | null;
  unit: string;
  sumber: string;
  kualitas: "asli" | "turunan" | "asumsi" | "kalibrasi" | "tidak_ada" | string;
  [lain: string]: unknown;
}

export interface Aktivitas {
  sumber: string;
  id: unknown;
  jenis: string | null;
  mulai_ms: number;
  selesai_ms: number;
  durasi_menit: number;
  hr_rata: number | null;
  hr_maks: number | null;
  kkal: number | null;
  strain: number | null;
}

export interface Catatan {
  athlete_id: string;
  tanggal: string;
  sumber: "whoop" | "garmin";
  tz_offset_menit: number | null;
  jendela_tidur: { mulai_ms: number; selesai_ms: number } | null;
  metrik: Record<string, Field>;
  relatif: Record<string, { z: number | null; rata_basis: number | null; sd_basis: number | null; n_basis: number }>;
  aktivitas: Aktivitas[];
  meta: { versi_pemeta: string; id_sumber: Record<string, unknown> };
}

export interface HasilHarmonisasi {
  versi: { kamus: string; pemeta: string; param: Record<string, number> };
  catatan: Catatan[];
  sesi: unknown[];
  reaksi: unknown[];
  benchmark_reaksi: Record<string, unknown>;
  peringatan: string[];
}

export function harmonisasi(
  masukan: {
    athlete_id: string;
    whoop?: { sleeps?: unknown[]; recoveries?: unknown[]; cycles?: unknown[]; workouts?: unknown[] } | null;
    garmin?: { sleeps?: unknown[]; hrv?: unknown[]; dailies?: unknown[]; stress?: unknown[]; activities?: unknown[] } | null;
    sesi?: unknown[];
    reaksi?: unknown[];
  },
  param?: Record<string, number>,
): HasilHarmonisasi;

export const KAMUS: EntriKamus[];
export const VERSI_KAMUS: string;
export const VERSI_PEMETA: string;
export const PARAM: Readonly<Record<string, number>>;
export const ALIAS: Record<string, Record<string, [string[], string]>>;
