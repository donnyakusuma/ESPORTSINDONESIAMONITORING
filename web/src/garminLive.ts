import { useSyncExternalStore } from "react";

/** Data tarikan langsung dari Garmin Connect, per atlet (hanya di memori browser; password tidak disimpan). */
type Baris = Record<string, string>;
interface Entri {
  nama: string;
  tanggal: string;
  data: Baris;
  /** Riwayat harian dari database server (tanggal -> data), sampai 1 tahun. */
  riwayat?: Record<string, Baris>;
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
export async function muatGarminTersimpan() {
  const r = await panggil("/api/garmin/saved");
  if (!r.ok) return;
  const daftar = r.atlet as { atletId: string; nama: string; terakhir: { tanggal: string; data: Baris } | null; riwayat?: Record<string, Baris> }[];
  const baru = { ...simpan };
  for (const a of daftar) if (a.terakhir) baru[a.atletId] = { nama: a.nama, tanggal: a.terakhir.tanggal, data: a.terakhir.data, riwayat: a.riwayat ?? {} };
  ubah(baru);
}

export async function tarikGarmin(atletId: string, tanggal: string): Promise<{ ok: boolean; pesan: string }> {
  const r = await panggil(`/api/garmin/stats?atlet=${encodeURIComponent(atletId)}&tanggal=${tanggal}`);
  if (!r.ok) return { ok: false, pesan: r.pesan ?? "Gagal menarik data." };
  const data = r.data as Baris;
  ubah({ ...simpan, [atletId]: { nama: data.Name ?? "", tanggal, data } });
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
