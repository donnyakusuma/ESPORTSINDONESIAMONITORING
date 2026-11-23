import { CSV_GARMIN, TANGGAL_GARMIN } from "./data/garmin-health-stats.js";
import { useGarminLive } from "./garminLive.js";
import { KartuWhoop } from "./KartuWhoop.js";
import { useWhoopAtlet } from "./whoopApi.js";
import { fmtTanggal } from "./ui.js";

type Baris = Record<string, string>;

function parseCsv(csv: string): Baris[] {
  const [kepala, ...isi] = csv.trim().split("\n").map((l) => l.split(","));
  return isi.map((k) => Object.fromEntries(kepala!.map((h, i) => [h, (k[i] ?? "").trim()])));
}

/** "10:27" -> 627 menit; kosong -> null. */
function menit(v: string | undefined): number | null {
  const m = v?.match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function angka(v: string | undefined): number | null {
  return v ? Number(v) : null;
}
function fmtDur(m: number | null): string {
  return m === null ? "–" : `${Math.floor(m / 60)}j ${String(m % 60).padStart(2, "0")}m`;
}
const fmt = (n: number | null, satuan = "") => (n === null ? "–" : `${n.toLocaleString("id-ID")}${satuan}`);

function Kpi({ label, nilai, satuan, catatan }: { label: string; nilai: string; satuan?: string; catatan?: string }) {
  return (
    <div className="card kpi">
      <span className="kpi-label">{label}</span>
      <b className="kpi-nilai">
        {nilai}
        {satuan && nilai !== "–" && <small> {satuan}</small>}
      </b>
      {catatan && <span className="kpi-catatan">{catatan}</span>}
    </div>
  );
}

export function Dashboard({ namaAtlet, idAtlet, versi = 0 }: { namaAtlet: string | null; idAtlet: string | null; versi?: number }) {
  const live = useGarminLive()[idAtlet ?? ""];
  const wh = useWhoopAtlet(idAtlet, versi);
  const bagianWhoop = wh.ringkasan && (
    <section className="stack" aria-label="Whoop">
      <h2>Whoop · 7 hari terakhir</h2>
      <KartuWhoop r={wh.ringkasan} />
    </section>
  );
  const semua = parseCsv(CSV_GARMIN);
  const atlet = semua.filter((b) => b.Name !== "All Athletes");
  // Cocokkan nama terpilih dengan ekspor: semua kata nama di ekspor harus ada di nama atlet (mis. "Muhammad Ilham" ~ "Muhammad Saieful Ilham").
  const kata = (n: string) => n.toLowerCase().split(/\s+/);
  const b = live ? live.data : namaAtlet ? atlet.find((a) => kata(a.Name!).every((k) => kata(namaAtlet).includes(k))) : undefined;
  if (!b) {
    return (
      <>
        <div className="judul">
          <div>
            <h1>Dashboard</h1>
            <p>{namaAtlet ?? "Belum ada atlet"}</p>
          </div>
        </div>
        <div className="card">
          <p>Belum ada data Garmin untuk {namaAtlet ?? "atlet ini"} di ekspor {fmtTanggal(TANGGAL_GARMIN, { tahun: true })}.</p>
          <p className="muted kecil">Atlet dalam ekspor: {atlet.map((a) => a.Name).join(", ") || "tidak ada"}.</p>
        </div>
        {bagianWhoop}
      </>
    );
  }

  const g = (k: string) => b[k];
  const stres = [
    { label: "Istirahat", m: menit(g("Rest Stress Dur. (h:min)")), warna: "var(--siap)" },
    { label: "Rendah", m: menit(g("Low Stress Dur. (h:min)")), warna: "var(--series-2)" },
    { label: "Sedang", m: menit(g("Medium Stress Dur. (h:min)")), warna: "var(--kuning)" },
    { label: "Tinggi", m: menit(g("High Stress Dur. (h:min)")), warna: "var(--merah)" },
  ];
  const totalStres = stres.reduce((a, s) => a + (s.m ?? 0), 0);
  const bbMax = angka(g("Body Battery (Max)"));
  const bbMin = angka(g("Body Battery (Min)"));
  const tidakAda = Object.entries(b).filter(([k, v]) => k !== "Name" && v === "").map(([k]) => k.replace(/ \(.*\)$/, ""));

  const tabel: [string, string][] = [
    ["HRV semalam (rata-rata)", fmt(angka(g("HRV Last Night Avg. (ms)")), " ms")],
    ["HRV semalam (tertinggi)", fmt(angka(g("HRV Last Night High (ms)")), " ms")],
    ["Detak jantung istirahat", fmt(angka(g("Resting HR (bpm)")), " bpm")],
    ["Rata-rata tidur", fmtDur(menit(g("Avg Sleep (h:min)")))],
    ["Skor tidur", fmt(angka(g("Sleep Score")))],
    ["Tidur dalam", fmtDur(menit(g("Avg. Deep Sleep (h:min)")))],
    ["Tidur ringan", fmtDur(menit(g("Avg. Light Sleep (h:min)")))],
    ["Tidur REM", fmtDur(menit(g("Avg. REM Sleep (h:min)")))],
    ["Terjaga saat tidur", fmtDur(menit(g("Avg. Sleep Awake Dur. (h:min)")))],
    ["Tidur siang", fmtDur(menit(g("Nap Duration (h:min)")))],
    ["Total kalori", fmt(angka(g("Total Calories (kcal)")), " kkal")],
    ["Body Battery diisi", fmt(angka(g("Body Battery (Charge)")))],
    ["Body Battery terpakai", fmt(angka(g("Body Battery (Drain)")))],
    ["Stres puncak", fmt(angka(g("Max. Stress Level")))],
    ["Stres saat aktivitas", fmtDur(menit(g("Activity Stress Dur. (h:min)")))],
  ];

  return (
    <>
      <div className="judul">
        <div>
          <h1>Dashboard</h1>
          <p>
            {b.Name} · statistik kesehatan Garmin · {fmtTanggal(live?.tanggal ?? TANGGAL_GARMIN, { tahun: true })}{live && " · langsung dari Garmin Connect"}
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Detak jantung istirahat" nilai={fmt(angka(g("Resting HR (bpm)")))} satuan="bpm" />
        <Kpi label="Rata-rata stres harian" nilai={fmt(angka(g("Avg. Daily Stress Level")))} catatan={`Puncak ${fmt(angka(g("Max. Stress Level")))}`} />
        <Kpi label="Body Battery" nilai={bbMax === null ? "–" : `${bbMin ?? "–"}–${bbMax}`} catatan={`Terpakai ${fmt(angka(g("Body Battery (Drain)")))} poin`} />
        <Kpi label="Total kalori" nilai={fmt(angka(g("Total Calories (kcal)")))} satuan="kkal" />
      </div>

      {bagianWhoop}

      <div className="grid-2">
        <section className="card" aria-label="Distribusi stres">
          <h2>Distribusi stres</h2>
          <div className="bar-tumpuk" role="img" aria-label={stres.map((s) => `${s.label} ${fmtDur(s.m)}`).join(", ")}>
            {stres.map((s) => (
              <span key={s.label} style={{ width: `${totalStres ? ((s.m ?? 0) / totalStres) * 100 : 0}%`, background: s.warna }} />
            ))}
          </div>
          <ul className="legenda">
            {stres.map((s) => (
              <li key={s.label}>
                <i style={{ background: s.warna }} />
                <span>{s.label}</span>
                <b>{fmtDur(s.m)}</b>
                <small>{totalStres && s.m !== null ? `${Math.round((s.m / totalStres) * 100)}%` : "–"}</small>
              </li>
            ))}
          </ul>
          <p className="muted kecil">Total tercatat {fmtDur(totalStres)}.</p>
        </section>

        <section className="card" aria-label="Body Battery">
          <h2>Body Battery</h2>
          <div className="bb-skala" role="img" aria-label={`Terendah ${bbMin}, tertinggi ${bbMax}`}>
            {bbMin !== null && bbMax !== null && <span style={{ left: `${bbMin}%`, width: `${bbMax - bbMin}%` }} />}
          </div>
          <div className="bb-label">
            <span>0</span>
            <span>100</span>
          </div>
          <ul className="legenda">
            <li><span>Tertinggi</span><b>{fmt(bbMax)}</b></li>
            <li><span>Terendah</span><b>{fmt(bbMin)}</b></li>
            <li><span>Terpakai</span><b>{fmt(angka(g("Body Battery (Drain)")))}</b></li>
          </ul>
        </section>
      </div>

      <section className="card flush">
        <div className="card-head">
          <h2>Semua metrik</h2>
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              {tabel.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td style={{ textAlign: "right" }}><b>{v}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tidakAda.length > 0 && (
          <p className="catatan-kaki muted kecil">Tidak ada data di ekspor ini: {tidakAda.join(", ")}.</p>
        )}
      </section>
    </>
  );
}
