import { useMemo } from "react";
import { susunAtlet } from "./dataAtlet.js";
import { CSV_GARMIN, TANGGAL_GARMIN } from "./data/garmin-health-stats.js";
import { DaftarAktivitas, EkstraGarminPanel } from "./garminEkstra.js";
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
  const { hari, peringatan } = useMemo(() => {
    // Garmin Connect (7 hari + aktivitas) bila sudah ditarik; selain itu baris ekspor CSV lama.
    const csv = !live && namaAtlet ? barisCsvAtlet(namaAtlet) : undefined;
    const garmin = live
      ? Object.entries(live.riwayat).map(([tanggal, baris]) => ({ baris, tanggal }))
      : csv
        ? [{ baris: csv, tanggal: TANGGAL_GARMIN }]
        : [];
    return susunAtlet({ athleteId: idAtlet ?? "-", whoop: wh.rekaman, garmin, aktivitasGarmin: live?.aktivitas });
  }, [idAtlet, namaAtlet, live, wh.rekaman]);

  return (
    <>
      <div className="judul">
        <div>
          <h1>Dashboard</h1>
          <p>{namaAtlet ?? "–"}</p>
        </div>
      </div>

      {hari.length > 0 ? (
        <PanelAtlet key={idAtlet ?? ""} hari={hari} peringatan={peringatan} />
      ) : wh.memuat && idAtlet ? (
        <div className="card muted">Memuat data…</div>
      ) : (
        <div className="card">Belum tersinkron.</div>
      )}

      {live?.ekstra && <EkstraGarminPanel e={live.ekstra} tanggal={live.tanggal} />}
      {live && idAtlet && <DaftarAktivitas atletId={idAtlet} aktivitas={live.aktivitas} />}
    </>
  );
}
