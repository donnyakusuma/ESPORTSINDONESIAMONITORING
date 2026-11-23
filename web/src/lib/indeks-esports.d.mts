import type { HasilHarmonisasi } from "./harmonizer.mjs";

export const VERSI_INDEKS: string;
export const PARAM_IND: Readonly<{
  JENDELA_BASIS: number; MIN_BASIS: number; JENDELA_SESI_HARI: number; MIN_SESI: number; MIN_KOMP_IKB: number; MIN_KOMP_IBMS: number;
  BATAS_Z: number; HARI_IBMS: number; MIN_RATA7: number; PITA_NORMAL: number; PITA_PERHATIAN: number;
  BOBOT: Readonly<Record<string, { w: number; s: 1 | -1 }>>;
}>;

export interface KomponenIkb { z: number | null; z_dipakai: number | null; w: number; s: number; kontribusi: number | null }
export interface HasilIkb {
  athlete_id: string;
  tanggal: string;
  sumber: string;
  nilai: number | null;
  status: "ok" | "data_kurang";
  pita?: "normal" | "perhatian" | "rendah";
  n_komponen: number;
  komponen: Record<string, KomponenIkb>;
  reaksi: { id: string; ms: number | null; z: number | null; status: string } | null;
}
export interface HasilIbms {
  athlete_id: string;
  id: string | null;
  tanggal: string;
  jenis: string | null;
  nilai: number | null;
  status: "ok" | "data_kurang";
  n_komponen: number;
  komponen: Record<string, { z: number | null; z_dipakai: number | null }>;
}
export interface HasilIbms7 { athlete_id: string; sampai_tanggal: string; nilai: number | null; n_sesi: number; z_terhadap_riwayat: number | null; n_riwayat: number }

export function ikbDariKomponen(komp: Record<string, number | null | undefined>, p?: typeof PARAM_IND): Omit<HasilIkb, "athlete_id" | "tanggal" | "sumber" | "reaksi">;
export function ibmsDariKomponen(z: Record<string, number | null | undefined>, p?: typeof PARAM_IND): Omit<HasilIbms, "athlete_id" | "id" | "tanggal" | "jenis">;
export function hitungIndeks(
  hasil: Pick<HasilHarmonisasi, "catatan" | "sesi"> & { reaksi?: unknown[] },
  p?: typeof PARAM_IND,
): { versi: { indeks: string; param: typeof PARAM_IND }; ikb: HasilIkb[]; ibms: HasilIbms[]; ibms7: HasilIbms7[]; peringatan: string[] };
export default hitungIndeks;
