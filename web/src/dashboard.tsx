import { gabungHari, hariDariGarmin } from "./dataAtlet.js";
import { CSV_GARMIN, TANGGAL_GARMIN } from "./data/garmin-health-stats.js";
import { useGarminLive } from "./garminLive.js";
import { PanelAtlet } from "./PanelAtlet.js";
import { useWhoopHarian } from "./whoopApi.js";

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
  const wh = useWhoopHarian(idAtlet, versi);

  const barisGarmin = live ? { data: live.data, tanggal: live.tanggal } : namaAtlet && barisCsvAtlet(namaAtlet) ? { data: barisCsvAtlet(namaAtlet)!, tanggal: TANGGAL_GARMIN } : null;
  const hari = gabungHari(wh.hari, barisGarmin ? [hariDariGarmin(barisGarmin.data, barisGarmin.tanggal)] : []);

  return (
    <>
      <div className="judul">
        <div>
          <h1>Dashboard</h1>
          <p>{namaAtlet ?? "–"}</p>
        </div>
      </div>

      {hari.length > 0 ? (
        <PanelAtlet key={idAtlet ?? ""} hari={hari} />
      ) : wh.memuat && idAtlet ? (
        <div className="card muted">Memuat data…</div>
      ) : (
        <div className="card">Belum tersinkron.</div>
      )}
    </>
  );
}
