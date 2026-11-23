import { useMemo } from "react";
import { susunAtlet } from "./dataAtlet.js";
import { CSV_GARMIN, TANGGAL_GARMIN } from "./data/garmin-health-stats.js";
import { useGarminLive } from "./garminLive.js";
import { PanelAtlet } from "./PanelAtlet.js";
import { useWhoopRekaman } from "./whoopApi.js";

type Baris = Record<string, string>;

function parseCsv(csv: string): Baris[] {
  const [kepala, ...isi] = csv.trim().split("\n").map((l) => l.split(","));
  return isi.map((k) => Object.fromEntries(kepala!.map((h, i) => [h, (k[i] ?? "").trim()])));
}

const BARIS_CSV = parseCsv(CSV_GARMIN).filter((b) => b.Name !== "All Athletes");
const kata = (n: string) => n.toLowerCase().split(/\s+/);

/** Baris ekspor Garmin milik atlet: semua kata nama di ekspor ada di nama atlet ("Muhammad Ilham" ~ "Muhammad Saieful Ilham"). */
function barisCsvAtlet(nama: string): Baris | undefined {
  return BARIS_CSV.find((a) => kata(a.Name!).every((k) => kata(nama).includes(k)));
}

export function Dashboard(props: { namaAtlet: string | null; idAtlet: string | null; versi?: number }) {
  const { namaAtlet, idAtlet, versi = 0 } = props;
  const live = useGarminLive()[idAtlet ?? ""];
  const wh = useWhoopRekaman(idAtlet, versi);

  // Semua sumber diseragamkan lewat harmonizer (kamus, satuan, dan aturan tanggal yang sama).
  const hasil = useMemo(() => {
    // Garmin: riwayat harian dari database server (sampai 1 tahun) + data terakhir; bila belum ada, ekspor CSV.
    const garmin: { baris: Record<string, string>; tanggal: string }[] = [];
    if (live) {
      for (const [tanggal, baris] of Object.entries(live.riwayat ?? {})) garmin.push({ baris, tanggal });
      if (!live.riwayat?.[live.tanggal]) garmin.push({ baris: live.data, tanggal: live.tanggal });
    } else if (namaAtlet && barisCsvAtlet(namaAtlet)) {
      garmin.push({ baris: barisCsvAtlet(namaAtlet)!, tanggal: TANGGAL_GARMIN });
    }
    return susunAtlet({ athleteId: idAtlet ?? "-", whoop: wh.rekaman, garmin });
  }, [idAtlet, namaAtlet, live, wh.rekaman]);

  return (
    <>
      <div className="judul">
        <div>
          <h1>Dashboard</h1>
          <p>{namaAtlet ?? "–"}</p>
        </div>
      </div>

      {hasil.hari.length > 0 ? (
        <PanelAtlet key={idAtlet ?? ""} hasil={hasil} />
      ) : wh.memuat && idAtlet ? (
        <div className="card muted">Memuat data…</div>
      ) : (
        <div className="card">Belum tersinkron.</div>
      )}
    </>
  );
}
