import { useEffect, useState } from "react";
import snapshotWhoop from "./data/whoop-snapshot.json";

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

// ───────────────────────── Rekaman mentah (diseragamkan oleh harmonizer di dataAtlet.ts) ─────────────────────────

/** Snapshot data Whoop yang ikut di repo; dipakai bila server Whoop lokal tidak aktif atau akun belum terhubung di komputer ini. */
function cadangan(athleteId: string): RekamanWhoop[] {
  return snapshotWhoop.atletId === athleteId ? (snapshotWhoop.rekaman as RekamanWhoop[]) : [];
}

export type RekamanWhoop = Record<string, unknown> & { type: string };

/**
 * Rekaman WHOOP mentah 42 hari terakhir: 7 hari untuk tampilan + 28 hari basis Bendera Perhatian Relatif.
 * Diperbarui tiap 5 menit agar hasil sinkron otomatis server ikut tampil.
 */
export function useWhoopRekaman(athleteId: string | null, versi = 0) {
  const [hasil, setHasil] = useState<{ status: StatusWhoop | null; rekaman: RekamanWhoop[]; memuat: boolean }>({
    status: null,
    rekaman: [],
    memuat: true,
  });
  useEffect(() => {
    if (!athleteId) return;
    let batal = false;
    setHasil({ status: null, rekaman: [], memuat: true });
    const muat = async () => {
      try {
        const status = await whoop.status(athleteId);
        const rekaman = status.connected ? await ambilJson<RekamanWhoop[]>(`/api/athletes/${encodeURIComponent(athleteId)}/records?days=42&limit=1000`) : cadangan(athleteId);
        if (!batal) setHasil({ status, rekaman, memuat: false });
      } catch {
        // Server Whoop tidak aktif (mis. di komputer lain): pakai snapshot agar tampilan sama.
        if (!batal) setHasil({ status: null, rekaman: cadangan(athleteId), memuat: false });
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
