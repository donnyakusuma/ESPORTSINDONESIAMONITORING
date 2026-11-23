import { useEffect, useSyncExternalStore } from "react";

/**
 * Data dan status Garmin Connect lewat server lokal (npm run dev).
 * Atlet/admin login sekali dengan akun Garmin; server menyimpan token sesi
 * dan password terenkripsi. Browser hanya melihat status dan hasil tarikan.
 */
import type { AktivitasGarmin, DetailAktivitas, EkstraGarmin } from "../garmin-tarik.js";

export type { AktivitasGarmin, DetailAktivitas, EkstraGarmin };
type Baris = Record<string, string>;
interface Entri {
  nama: string;
  tanggal: string;
  data: Baris;
  /** 10 aktivitas terbaru; null bila gagal ditarik. */
  aktivitas: AktivitasGarmin[] | null;
  ekstra: EkstraGarmin | null;
  /** Ringkasan 7 hari terakhir per tanggal, dengan kolom yang sama seperti `data`. */
  riwayat: Record<string, Baris>;
}
export interface StatusGarmin {
  status: "terhubung" | "perlu_login_ulang";
  email: string;
  namaGarmin: string;
  terhubungAt: string;
  sinkronTerakhirAt: string | null;
}

/** Penyimpanan kecil yang bisa didengar komponen React. */
function toko<T>(awal: T) {
  let nilai = awal;
  const pendengar = new Set<() => void>();
  return {
    get: () => nilai,
    set(v: T) {
      nilai = v;
      pendengar.forEach((f) => f());
    },
    use: () =>
      useSyncExternalStore(
        (f) => (pendengar.add(f), () => pendengar.delete(f)),
        () => nilai
      ),
  };
}

const live = toko<Record<string, Entri>>({});
const status = toko<{ dimuat: boolean; serverMati: boolean; data: Record<string, StatusGarmin> }>({ dimuat: false, serverMati: false, data: {} });

export const useGarminLive = live.use;

/** Status koneksi semua atlet; dimuat sekali saat dipakai pertama, lalu diperbarui setelah setiap aksi. */
export function useStatusGarmin() {
  const s = status.use();
  useEffect(() => {
    if (!s.dimuat) void muatStatusGarmin();
  }, [s.dimuat]);
  return s;
}

const SERVER_MATI = "Server lokal tidak merespons. Jalankan aplikasi dengan `npm run dev` (fitur ini tidak jalan di GitHub Pages).";

async function panggil(url: string, init?: RequestInit): Promise<{ ok: boolean; pesan?: string; [k: string]: unknown }> {
  try {
    const r = await fetch(url, init);
    return await r.json();
  } catch {
    return { ok: false, pesan: SERVER_MATI, serverMati: true };
  }
}
const kirimJson = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export async function muatStatusGarmin() {
  const r = await panggil("/api/garmin/status");
  status.set({ dimuat: true, serverMati: !!r.serverMati, data: r.ok ? (r.data as Record<string, StatusGarmin>) : {} });
}

export async function tarikGarmin(atletId: string, tanggal: string, nama = ""): Promise<{ ok: boolean; pesan: string }> {
  const r = await panggil(`/api/garmin/stats?atlet=${encodeURIComponent(atletId)}&tanggal=${tanggal}&nama=${encodeURIComponent(nama)}`);
  await muatStatusGarmin();
  if (!r.ok) return { ok: false, pesan: r.pesan ?? "Gagal menarik data." };
  const data = r.data as Baris;
  live.set({ ...live.get(), [atletId]: { nama: data.Name ?? "", tanggal, data, aktivitas: (r.aktivitas as AktivitasGarmin[] | null) ?? null, ekstra: (r.ekstra as EkstraGarmin | null) ?? null, riwayat: (r.riwayat as Record<string, Baris>) ?? { [tanggal]: data } } });
  return { ok: true, pesan: "Data Garmin berhasil ditarik." };
}

/** Login sekali dengan akun Garmin Connect, lalu langsung menarik data hari ini. */
export async function masukGarmin(
  atletId: string,
  email: string,
  password: string,
  tanggal: string,
  nama: string
): Promise<{ ok: boolean; pesan: string }> {
  const r = await panggil("/api/garmin/login", kirimJson({ atletId, email, password }));
  await muatStatusGarmin();
  if (!r.ok) return { ok: false, pesan: r.pesan ?? "Login Garmin gagal." };
  const t = await tarikGarmin(atletId, tanggal, nama);
  return t.ok ? { ok: true, pesan: `${r.pesan as string} Data hari ini sudah ditarik.` } : { ok: true, pesan: `${r.pesan as string} ${t.pesan}` };
}

export async function putusGarmin(atletId: string) {
  await panggil("/api/garmin/putus", kirimJson({ atletId }));
  const { [atletId]: _, ...sisa } = live.get();
  live.set(sisa);
  await muatStatusGarmin();
}

/** Detail satu aktivitas (ringkasan, split, workout); ditarik saat dibuka. */
export async function detailAktivitasGarmin(atletId: string, id: number): Promise<{ ok: true; data: DetailAktivitas } | { ok: false; pesan: string }> {
  const r = await panggil(`/api/garmin/aktivitas/detail?atlet=${encodeURIComponent(atletId)}&id=${id}`);
  return r.ok ? { ok: true, data: r.data as DetailAktivitas } : { ok: false, pesan: r.pesan ?? "Detail aktivitas gagal ditarik." };
}

export const urlFitGarmin = (atletId: string, id: number) => `/api/garmin/aktivitas/fit?atlet=${encodeURIComponent(atletId)}&id=${id}`;
