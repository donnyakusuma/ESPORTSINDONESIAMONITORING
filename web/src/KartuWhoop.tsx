import type { RingkasanWhoop } from "./whoopApi.js";

const f = (n: number | null | undefined, s = "") => (n === null || n === undefined ? "–" : `${n}${s}`);

/** Empat angka utama Whoop 7 hari terakhir. */
export function KartuWhoop({ r }: { r: RingkasanWhoop }) {
  return (
    <div className="kpi-grid">
      <div className="card kpi">
        <span className="kpi-label">Recovery rata-rata</span>
        <b className="kpi-nilai">{f(r.recovery.avgScore, "%")}</b>
        <span className="kpi-catatan">{r.recovery.n} hari</span>
      </div>
      <div className="card kpi">
        <span className="kpi-label">HRV rata-rata</span>
        <b className="kpi-nilai">
          {f(r.recovery.avgHrvRmssdMs)}
          {r.recovery.avgHrvRmssdMs !== null && <small> ms</small>}
        </b>
        <span className="kpi-catatan">Detak istirahat {f(r.recovery.avgRestingHr, " bpm")}</span>
      </div>
      <div className="card kpi">
        <span className="kpi-label">Performa tidur</span>
        <b className="kpi-nilai">{f(r.sleep.avgPerformancePct, "%")}</b>
        <span className="kpi-catatan">{r.sleep.n} malam</span>
      </div>
      <div className="card kpi">
        <span className="kpi-label">Strain harian</span>
        <b className="kpi-nilai">{f(r.cycle.avgDayStrain)}</b>
        <span className="kpi-catatan">{r.workouts.n} latihan</span>
      </div>
    </div>
  );
}
