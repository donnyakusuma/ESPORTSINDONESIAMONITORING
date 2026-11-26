import { useSyncExternalStore } from "react";

/** Data tarikan langsung dari Garmin Connect, per atlet (hanya di memori browser; password tidak disimpan). */
type Baris = Record<string, string>;
interface Entri {
  nama: string;
  tanggal: string;
  data: Baris;
  /** Riwayat harian dari database server (tanggal -> data), sampai 1 tahun. */
  riwayat?: Record<string, Baris>;
  /** Server sedang menarik riwayat 1 tahun ke belakang. */
  mengisi?: boolean;
  /** Hari yang sudah diperiksa dari total (selama `mengisi`). */
  diperiksa?: number | null;
  totalHari?: number;
}
let simpan: Record<string, Entri> = {};
const pendengar = new Set<() => void>();
const ubah = (s: Record<string, Entri>) => {
  simpan = s;
  pendengar.forEach((f) => f());
};

export function useGarminLive(): Record<string, Entri> {
  return useSyncExternalStore(
    (f) => (pendengar.add(f), () => pendengar.delete(f)),
    () => simpan,
  );
}

async function panggil(url: string, init?: RequestInit): Promise<{ ok: boolean; pesan?: string; [k: string]: unknown }> {
  try {
    const r = await fetch(url, init);
    return await r.json();
  } catch {
    return { ok: false, pesan: "Server lokal tidak merespons. Jalankan aplikasi dengan `npm run dev` (fitur ini tidak jalan di GitHub Pages)." };
  }
}

/** Muat data Garmin yang tersimpan di database server (hasil sinkron otomatis), tanpa login ulang. */
let jadwal: ReturnType<typeof setTimeout> | undefined;
export async function muatGarminTersimpan() {
  const r = await panggil("/api/garmin/saved");
  if (!r.ok) return;
  type Baru = { atletId: string; nama: string; terakhir: { tanggal: string; data: Baris } | null; riwayat?: Record<string, Baris>; mengisi?: boolean; diperiksa?: number | null; totalHari?: number };
  const daftar = r.atlet as Baru[];
  const baru = { ...simpan };
  for (const a of daftar)
    if (a.terakhir)
      baru[a.atletId] = { nama: a.nama, tanggal: a.terakhir.tanggal, data: a.terakhir.data, riwayat: a.riwayat ?? {}, mengisi: a.mengisi, diperiksa: a.diperiksa, totalHari: a.totalHari };
  ubah(baru);
  // Selama riwayat 1 tahun sedang ditarik, muat ulang tiap 15 detik agar Dashboard ikut terisi.
  clearTimeout(jadwal);
  if (daftar.some((a) => a.mengisi)) jadwal = setTimeout(() => void muatGarminTersimpan(), 15_000);
}

export async function tarikGarmin(atletId: string, tanggal: string): Promise<{ ok: boolean; pesan: string }> {
  const r = await panggil(`/api/garmin/stats?atlet=${encodeURIComponent(atletId)}&tanggal=${tanggal}`);
  if (!r.ok) return { ok: false, pesan: r.pesan ?? "Gagal menarik data." };
  const data = r.data as Baris;
  const lama = simpan[atletId];
  // Riwayat yang sudah ada dipertahankan; data hari ini ikut masuk riwayat.
  ubah({ ...simpan, [atletId]: { ...lama, nama: data.Name ?? "", tanggal, data, riwayat: { ...lama?.riwayat, [tanggal]: data }, mengisi: true } });
  void muatGarminTersimpan(); // mulai memantau penarikan riwayat 1 tahun
  return { ok: true, pesan: "Data Garmin Connect berhasil ditarik." };
}

export async function masukGarmin(atletId: string, username: string, password: string, tanggal: string): Promise<{ ok: boolean; pesan: string }> {
  const r = await panggil("/api/garmin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ atletId, username, password }),
  });
  if (!r.ok) return { ok: false, pesan: r.pesan ?? "Login gagal." };
  const t = await tarikGarmin(atletId, tanggal);
  return t.ok ? { ok: true, pesan: `Terhubung sebagai ${r.nama as string}. ${t.pesan}` } : t;
}

export async function putusGarmin(atletId: string) {
  await panggil("/api/garmin/logout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ atletId }) });
  const { [atletId]: _, ...sisa } = simpan;
  ubah(sisa);
}
