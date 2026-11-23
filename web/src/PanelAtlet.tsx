import { useState, type ReactNode } from "react";
import type { HariAtlet } from "./dataAtlet.js";

/**
 * Satu tampilan untuk semua perangkat (Whoop, Garmin), bergaya aplikasi WHOOP: tiga dial,
 * metrik vital dibanding rata-rata, grafik 7 hari, tidur, latihan, stres, dan Body Battery.
 * Setiap angka memakai nama metrik aslinya; kartu tanpa data tidak ditampilkan.
 */

// Status recovery selalu disertai label; strain/tidur/energi/stres masing-masing satu hue.
// Palet tahapan tidur sudah divalidasi (CVD & kontras) untuk latar gelap.
const WARNA = {
  strain: "#3D9BF0",
  tidur: "#8BA7C4",
  energi: "#2BB5A0",
  stres: "#F08A3C",
  hijau: "#35D07F",
  kuning: "#F5C518",
  merah: "#F0435A",
};
const TAHAP = [
  { kunci: "bangun", nama: "Bangun", warna: "#C47A3E" },
  { kunci: "ringan", nama: "Ringan", warna: "#2A9BB8" },
  { kunci: "dalam", nama: "Dalam (SWS)", warna: "#7A63EA" },
  { kunci: "rem", nama: "REM", warna: "#C9548C" },
] as const;
// Tingkat stres Garmin bersifat berurutan: satu hue, terang -> gelap = istirahat -> tinggi.
const TINGKAT_STRES = [
  { kunci: "istirahat", nama: "Istirahat", warna: "#5B8FB9" },
  { kunci: "rendah", nama: "Rendah", warna: "#F6C08F" },
  { kunci: "sedang", nama: "Sedang", warna: "#F08A3C" },
  { kunci: "tinggi", nama: "Tinggi", warna: "#B8521A" },
] as const;
const ZONA = ["#1F3A52", "#25507A", "#2B66A3", "#3A80C8", "#5C9EE6", "#8CC0FF"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function statusRecovery(skor: number) {
  if (skor >= 67) return { warna: WARNA.hijau, label: "Hijau", arti: "Siap untuk beban tinggi", ikon: "▲" };
  if (skor >= 34) return { warna: WARNA.kuning, label: "Kuning", arti: "Beban sedang", ikon: "●" };
  return { warna: WARNA.merah, label: "Merah", arti: "Prioritaskan pemulihan", ikon: "▼" };
}
/** Kategori stres Garmin. */
function tingkatStres(v: number) {
  if (v <= 25) return "Istirahat";
  if (v <= 50) return "Rendah";
  if (v <= 75) return "Sedang";
  return "Tinggi";
}

const jm = (menit: number | null | undefined) =>
  menit === null || menit === undefined ? "–" : `${Math.floor(menit / 60)}:${String(Math.round(menit % 60)).padStart(2, "0")}`;
const jam = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const angka = (v: number, d = 0) => v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
const tglPendek = (t: string) => {
  const d = new Date(`${t}T12:00:00Z`);
  return { hari: HARI[d.getUTCDay()]!, tgl: d.getUTCDate() };
};
const rata = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const totalTidur = (t: HariAtlet["tidur"]) => (t ? t.ringan + t.dalam + t.rem : null);

// ───────────────────────── Dial ─────────────────────────

function Dial(props: { nilai: number | null; maks: number; warna: string; judul: string; teks: string; bawah?: ReactNode; ukuran?: number }) {
  const u = props.ukuran ?? 168;
  const tebal = Math.max(6, Math.round(u * 0.065));
  const r = (u - tebal) / 2 - 2;
  const keliling = 2 * Math.PI * r;
  const porsi = props.nilai === null ? 0 : Math.max(0, Math.min(1, props.nilai / props.maks));
  return (
    <div className="wh-dial">
      <svg width={u} height={u} viewBox={`0 0 ${u} ${u}`} role="img" aria-label={`${props.judul} ${props.teks}`}>
        <circle cx={u / 2} cy={u / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={tebal} />
        {porsi > 0 && (
        <circle
          cx={u / 2}
          cy={u / 2}
          r={r}
          fill="none"
          stroke={props.warna}
          strokeWidth={tebal}
          strokeLinecap="round"
          strokeDasharray={`${keliling * porsi} ${keliling}`}
          transform={`rotate(-90 ${u / 2} ${u / 2})`}
          className="wh-dial-busur"
        />
        )}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="wh-dial-angka" style={{ fontSize: u * 0.24 }}>
          {props.teks}
        </text>
      </svg>
      <span className="wh-dial-judul">{props.judul}</span>
      {props.bawah && <span className="wh-dial-bawah">{props.bawah}</span>}
    </div>
  );
}

// ───────────────────────── Grafik kolom 7 hari (dengan tooltip) ─────────────────────────

type Kolom = { label: string; sub: string; segmen: { nilai: number; warna: string }[]; teks: string; tip: string[] };

function GrafikKolom(props: { judul: string; data: Kolom[]; maks: number; tanda: number[]; pilih: number; ubah(i: number): void; legenda?: ReactNode }) {
  const [sorot, setSorot] = useState<number | null>(null);
  const L = 320,
    T = 150,
    atas = 18,
    bawah = 30,
    kiri = 26;
  const tinggi = T - atas - bawah;
  const lebarSlot = (L - kiri) / props.data.length;
  const lebarBatang = Math.min(24, lebarSlot * 0.56);
  const y = (v: number) => atas + tinggi - (v / props.maks) * tinggi;

  return (
    <div className="wh-grafik">
      <div className="wh-grafik-kepala">
        <h3>{props.judul}</h3>
        {props.legenda}
      </div>
      <div className="wh-grafik-badan">
        <svg viewBox={`0 0 ${L} ${T}`} role="img" aria-label={`${props.judul}: ${props.data.map((d) => `${d.label} ${d.sub} ${d.teks}`).join(", ")}`}>
          {props.tanda.map((t) => (
            <g key={t}>
              <line x1={kiri} x2={L} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <text x={kiri - 6} y={y(t)} textAnchor="end" dominantBaseline="central" className="wh-sumbu">
                {t}
              </text>
            </g>
          ))}
          {props.data.map((d, i) => {
            const cx = kiri + lebarSlot * i + lebarSlot / 2;
            const x0 = cx - lebarBatang / 2;
            let dasar = 0;
            const total = d.segmen.reduce((a, b) => a + b.nilai, 0);
            const terpilih = i === props.pilih;
            return (
              <g
                key={i}
                className={`wh-kolom ${terpilih ? "pilih" : ""} ${sorot !== null && sorot !== i ? "redup" : ""}`}
                onMouseEnter={() => setSorot(i)}
                onMouseLeave={() => setSorot(null)}
                onClick={() => props.ubah(i)}
              >
                <rect x={cx - lebarSlot / 2} y={0} width={lebarSlot} height={T} fill="transparent" />
                {terpilih && <rect x={cx - lebarSlot / 2 + 3} y={atas - 14} width={lebarSlot - 6} height={tinggi + 14} rx="6" className="wh-kolom-sorot" />}
                {d.segmen.map((g, k) => {
                  const atasSeg = dasar + g.nilai;
                  const y1 = y(atasSeg);
                  const y0 = y(dasar);
                  dasar = atasSeg;
                  const terakhir = k === d.segmen.length - 1;
                  // 2px celah antarsegmen; ujung data dibulatkan 4px, dasar tetap rata.
                  const h = Math.max(0, y0 - y1 - (terakhir ? 0 : 2));
                  if (h <= 0) return null;
                  const rr = terakhir ? Math.min(4, h, lebarBatang / 2) : 0;
                  return (
                    <path
                      key={k}
                      fill={g.warna}
                      d={`M${x0},${y1 + h} V${y1 + rr} Q${x0},${y1} ${x0 + rr},${y1} H${x0 + lebarBatang - rr} Q${x0 + lebarBatang},${y1} ${x0 + lebarBatang},${y1 + rr} V${y1 + h} Z`}
                    />
                  );
                })}
                <text x={cx} y={y(total) - 5} textAnchor="middle" className="wh-nilai-kolom">
                  {d.teks}
                </text>
                <text x={cx} y={T - 16} textAnchor="middle" className={`wh-sumbu ${terpilih ? "kuat" : ""}`}>
                  {d.label}
                </text>
                <text x={cx} y={T - 4} textAnchor="middle" className="wh-sumbu">
                  {d.sub}
                </text>
              </g>
            );
          })}
          <line x1={kiri} x2={L} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
        </svg>
        {sorot !== null && props.data[sorot] && (
          <div className="wh-tip" style={{ left: `${((kiri + lebarSlot * sorot + lebarSlot / 2) / L) * 100}%` }} role="tooltip">
            <b>
              {props.data[sorot]!.label} {props.data[sorot]!.sub}
            </b>
            {props.data[sorot]!.tip.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Legenda({ isi }: { isi: { nama: string; warna: string }[] }) {
  return (
    <span className="wh-legenda">
      {isi.map((g) => (
        <span key={g.nama}>
          <i style={{ background: g.warna }} />
          {g.nama}
        </span>
      ))}
    </span>
  );
}

function BarTumpuk({ isi, label }: { isi: { nama: string; warna: string; menit: number }[]; label: string }) {
  const total = isi.reduce((a, b) => a + b.menit, 0);
  return (
    <>
      <div className="wh-tahap" role="img" aria-label={`${label}: ${isi.map((g) => `${g.nama} ${jm(g.menit)}`).join(", ")}`}>
        {isi.map((g) => (
          <span key={g.nama} style={{ flexGrow: g.menit, background: g.warna }} title={`${g.nama} ${jm(g.menit)}`} />
        ))}
      </div>
      <ul className="wh-tahap-legenda">
        {isi.map((g) => (
          <li key={g.nama}>
            <i style={{ background: g.warna }} />
            <span>{g.nama}</span>
            <b>{jm(g.menit)}</b>
            <small>{total ? Math.round((g.menit / total) * 100) : 0}%</small>
          </li>
        ))}
      </ul>
    </>
  );
}

function Mini({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div>
      <span className="wh-label">{label}</span>
      <b>{nilai}</b>
    </div>
  );
}

// ───────────────────────── Panel utama ─────────────────────────

export function PanelAtlet({ hari: semuaHari, kepala }: { hari: HariAtlet[]; kepala?: ReactNode }) {
  // Satu-satunya hari berdata (mis. satu ekspor Garmin) tampil sendiri, tanpa 6 hari kosong.
  const hariBerdata = semuaHari.filter((x) => x.sumber.length > 0);
  const hari = hariBerdata.length > 1 ? semuaHari : hariBerdata;
  const [pilih, setPilih] = useState(hari.length - 1);
  const i = Math.min(pilih, hari.length - 1);
  const h = hari[i];
  if (!h) return null;
  const lain = hari.filter((_, k) => k !== i);
  const rec = h.recovery;
  const st = rec ? statusRecovery(rec.skor) : null;
  const t = h.tidur;
  const { hari: namaHari, tgl } = tglPendek(h.tanggal);
  const sumbu = (x: HariAtlet) => tglPendek(x.tanggal);
  // Navigasi hari, perbandingan rata-rata, dan grafik hanya berguna bila ada data di 2 hari atau lebih.
  const banyakHari = hari.filter((x) => x.sumber.length > 0).length > 1;

  // Dial menyesuaikan data yang ada: metrik WHOOP bila tersedia, metrik Garmin bila tidak.
  const dialTidur =
    t?.performa != null
      ? { judul: "Sleep", nilai: t.performa, teks: `${t.performa}%` }
      : t?.skor != null
        ? { judul: "Sleep score", nilai: t.skor, teks: `${t.skor}` }
        : { judul: "Sleep", nilai: null, teks: "–" };
  const tTotal = totalTidur(t);

  const vital = [
    { label: "HRV", ambil: (x: HariAtlet) => x.vital.hrv, satuan: "ms", d: 0, naikBaik: true },
    { label: "Detak istirahat", ambil: (x: HariAtlet) => x.vital.rhr, satuan: "bpm", d: 0, naikBaik: false },
    { label: "Respirasi", ambil: (x: HariAtlet) => x.tidur?.respirasi, satuan: "rpm", d: 1, naikBaik: null },
    { label: "SpO₂", ambil: (x: HariAtlet) => x.recovery?.spo2, satuan: "%", d: 1, naikBaik: null },
    { label: "Suhu kulit", ambil: (x: HariAtlet) => x.recovery?.suhuKulit, satuan: "°C", d: 1, naikBaik: null },
    { label: "Kalori", ambil: (x: HariAtlet) => x.kkal, satuan: "kkal", d: 0, naikBaik: null },
    { label: "Langkah", ambil: (x: HariAtlet) => x.langkah, satuan: "", d: 0, naikBaik: null },
  ].filter((v) => hari.some((x) => v.ambil(x) != null));

  const adaRecovery = hari.some((x) => x.recovery);
  const adaStrain = hari.some((x) => x.strain);
  const adaTidur = hari.some((x) => x.tidur && totalTidur(x.tidur));
  const maksTidurJam = Math.max(10, Math.ceil(Math.max(...hari.map((x) => (x.tidur ? (x.tidur.bangun + x.tidur.ringan + x.tidur.dalam + x.tidur.rem) / 60 : 0)))));

  return (
    <section className="wh" aria-label="Data atlet">
      <header className="wh-kepala">
        <div className="wh-merek">
          {h.sumber.length === 0 && <span className="wh-sumber">Tidak ada data hari ini</span>}
          {h.sumber.map((s) => (
            <span key={s} className="wh-sumber whoop">
              {s}
            </span>
          ))}
          <span className="wh-label">
            {namaHari}, {tgl} {new Date(`${h.tanggal}T12:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
          </span>
        </div>
        {kepala}
      </header>

      {banyakHari && (
        <nav className="wh-hari" aria-label="Pilih hari" style={{ gridTemplateColumns: `repeat(${hari.length}, minmax(0, 1fr))` }}>
          {hari.map((x, k) => {
            const d = sumbu(x);
            const s = x.recovery ? statusRecovery(x.recovery.skor) : null;
            return (
              <button key={x.tanggal} className={k === i ? "aktif" : ""} onClick={() => setPilih(k)} aria-pressed={k === i}>
                <span>{d.hari}</span>
                <b>{d.tgl}</b>
                <i style={{ background: s?.warna ?? "rgba(255,255,255,0.2)" }} aria-hidden="true" />
              </button>
            );
          })}
        </nav>
      )}

      <div className="wh-dial-baris">
        <Dial judul={dialTidur.judul} nilai={dialTidur.nilai} maks={100} warna={WARNA.tidur} teks={dialTidur.teks} bawah={tTotal ? `${jm(tTotal)} tidur` : "Tidak ada data"} />
        {rec ? (
          <Dial
            judul="Recovery"
            nilai={rec.skor}
            maks={100}
            warna={st!.warna}
            teks={`${rec.skor}%`}
            ukuran={200}
            bawah={
              <span className="wh-status">
                <span style={{ color: st!.warna }} aria-hidden="true">
                  {st!.ikon}
                </span>{" "}
                {st!.label} · {st!.arti}
              </span>
            }
          />
        ) : h.energi?.maks != null ? (
          <Dial
            judul="Body Battery"
            nilai={h.energi.maks}
            maks={100}
            warna={WARNA.energi}
            teks={`${h.energi.maks}`}
            ukuran={200}
            bawah={`Terendah ${h.energi.min ?? "–"} · terpakai ${h.energi.pakai ?? "–"}`}
          />
        ) : (
          <Dial judul="Recovery" nilai={null} maks={100} warna={WARNA.hijau} teks="–" ukuran={200} bawah="Tidak ada data" />
        )}
        {h.strain ? (
          <Dial
            judul="Strain"
            nilai={h.strain.skor}
            maks={21}
            warna={WARNA.strain}
            teks={angka(h.strain.skor, 1)}
            bawah={`${h.latihan.length} latihan · maks 21`}
          />
        ) : h.stres?.rata != null ? (
          <Dial
            judul="Stres"
            nilai={h.stres.rata}
            maks={100}
            warna={WARNA.stres}
            teks={`${h.stres.rata}`}
            bawah={`${tingkatStres(h.stres.rata)} · puncak ${h.stres.maks ?? "–"}`}
          />
        ) : (
          <Dial judul="Strain" nilai={null} maks={21} warna={WARNA.strain} teks="–" bawah="Tidak ada data" />
        )}
      </div>

      {vital.length > 0 && (
        <div className="wh-vital">
          {vital.map((v) => {
            const nilai = v.ambil(h);
            const r = rata(lain.map(v.ambil));
            const selisih = nilai != null && r != null ? nilai - r : null;
            const arah = selisih == null || Math.abs(selisih) < 10 ** -v.d ? 0 : selisih > 0 ? 1 : -1;
            const baik = v.naikBaik === null || arah === 0 ? null : (arah > 0) === v.naikBaik;
            return (
              <div key={v.label} className="wh-vital-item">
                <span className="wh-label">{v.label}</span>
                <b>
                  {nilai != null ? angka(nilai, v.d) : "–"}
                  {nilai != null && v.satuan && <small> {v.satuan}</small>}
                </b>
                {banyakHari && (
                  <span className={`wh-delta ${baik === null ? "" : baik ? "baik" : "buruk"}`}>
                    {selisih == null ? "rata-rata –" : `${arah > 0 ? "↑" : arah < 0 ? "↓" : "="} ${angka(Math.abs(selisih), v.d)} vs rata-rata`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {banyakHari && (adaRecovery || adaStrain || adaTidur) && (
        <div className="wh-grid">
          {adaRecovery && (
            <GrafikKolom
              judul="Recovery 7 hari"
              maks={100}
              tanda={[0, 33, 66, 100]}
              pilih={i}
              ubah={setPilih}
              legenda={
                <Legenda
                  isi={[
                    { nama: "Hijau 67+", warna: WARNA.hijau },
                    { nama: "Kuning 34–66", warna: WARNA.kuning },
                    { nama: "Merah ≤33", warna: WARNA.merah },
                  ]}
                />
              }
              data={hari.map((x) => {
                const s = x.recovery ? statusRecovery(x.recovery.skor) : null;
                return {
                  label: sumbu(x).hari,
                  sub: String(sumbu(x).tgl),
                  segmen: x.recovery ? [{ nilai: x.recovery.skor, warna: s!.warna }] : [],
                  teks: x.recovery ? `${x.recovery.skor}` : "–",
                  tip: x.recovery
                    ? [`Recovery ${x.recovery.skor}% · ${s!.label}`, `HRV ${x.recovery.hrv != null ? angka(x.recovery.hrv) : "–"} ms`, `Detak istirahat ${x.recovery.rhr ?? "–"} bpm`]
                    : ["Tidak ada data"],
                };
              })}
            />
          )}
          {adaStrain && (
            <GrafikKolom
              judul="Strain 7 hari"
              maks={21}
              tanda={[0, 7, 14, 21]}
              pilih={i}
              ubah={setPilih}
              data={hari.map((x) => ({
                label: sumbu(x).hari,
                sub: String(sumbu(x).tgl),
                segmen: x.strain ? [{ nilai: x.strain.skor, warna: WARNA.strain }] : [],
                teks: x.strain ? angka(x.strain.skor, 1) : "–",
                tip: x.strain ? [`Strain ${angka(x.strain.skor, 1)} / 21`, `${x.latihan.length} latihan`, `${x.kkal ?? "–"} kkal`] : ["Tidak ada data"],
              }))}
            />
          )}
          {adaTidur && (
            <GrafikKolom
              judul="Tidur 7 hari (jam)"
              maks={maksTidurJam}
              tanda={[0, 4, 8]}
              pilih={i}
              ubah={setPilih}
              legenda={<Legenda isi={TAHAP.map((g) => ({ nama: g.nama, warna: g.warna }))} />}
              data={hari.map((x) => ({
                label: sumbu(x).hari,
                sub: String(sumbu(x).tgl),
                segmen: x.tidur ? TAHAP.map((g) => ({ nilai: x.tidur![g.kunci] / 60, warna: g.warna })).reverse() : [],
                teks: x.tidur ? jm(totalTidur(x.tidur)) : "–",
                tip: x.tidur ? TAHAP.map((g) => `${g.nama} ${jm(x.tidur![g.kunci])}`) : ["Tidak ada data"],
              }))}
            />
          )}
        </div>
      )}

      <div className="wh-grid dua">
        {t && tTotal ? (
          <div className="wh-kartu">
            <div className="wh-grafik-kepala">
              <h3>Tidur</h3>
              {t.mulai && t.selesai && (
                <span className="wh-label">
                  {jam(t.mulai)} – {jam(t.selesai)}
                </span>
              )}
            </div>
            <BarTumpuk label="Tahapan tidur" isi={TAHAP.map((g) => ({ nama: g.nama, warna: g.warna, menit: t[g.kunci] }))} />
            {t.butuh != null && (
              <div className="wh-butuh">
                <div className="wh-butuh-teks">
                  <span>Tidur vs kebutuhan</span>
                  <b>
                    {jm(tTotal)} / {jm(t.butuh)}
                  </b>
                </div>
                <div className="wh-butuh-bar">
                  <span style={{ width: `${Math.min(100, (tTotal / t.butuh) * 100)}%` }} />
                </div>
              </div>
            )}
            <div className="wh-mini">
              {t.performa != null && <Mini label="Performa" nilai={`${t.performa}%`} />}
              {t.skor != null && <Mini label="Sleep score" nilai={`${t.skor}`} />}
              {t.efisiensi != null && <Mini label="Efisiensi" nilai={`${Math.round(t.efisiensi)}%`} />}
              {t.konsistensi != null && <Mini label="Konsistensi" nilai={`${t.konsistensi}%`} />}
              {t.gangguan != null && <Mini label="Gangguan" nilai={`${t.gangguan}×`} />}
            </div>
          </div>
        ) : null}

        {h.stres && (
          <div className="wh-kartu">
            <div className="wh-grafik-kepala">
              <h3>Stres</h3>
              {h.stres.rata != null && (
                <span className="wh-label">
                  Rata-rata {h.stres.rata} · puncak {h.stres.maks ?? "–"}
                </span>
              )}
            </div>
            <BarTumpuk label="Durasi per tingkat stres" isi={TINGKAT_STRES.map((g) => ({ nama: g.nama, warna: g.warna, menit: h.stres![g.kunci] ?? 0 }))} />
          </div>
        )}

        {h.energi && (
          <div className="wh-kartu">
            <div className="wh-grafik-kepala">
              <h3>Body Battery</h3>
              <span className="wh-label">skala 0–100</span>
            </div>
            <div className="wh-bb" role="img" aria-label={`Body Battery terendah ${h.energi.min ?? "–"}, tertinggi ${h.energi.maks ?? "–"}`}>
              {h.energi.min != null && h.energi.maks != null && (
                <span style={{ left: `${h.energi.min}%`, width: `${Math.max(1, h.energi.maks - h.energi.min)}%` }} />
              )}
            </div>
            <div className="wh-bb-sumbu">
              <span>0</span>
              <span>100</span>
            </div>
            <div className="wh-mini">
              <Mini label="Tertinggi" nilai={h.energi.maks != null ? `${h.energi.maks}` : "–"} />
              <Mini label="Terendah" nilai={h.energi.min != null ? `${h.energi.min}` : "–"} />
              {h.energi.isi != null && <Mini label="Terisi" nilai={`+${h.energi.isi}`} />}
              {h.energi.pakai != null && <Mini label="Terpakai" nilai={`−${h.energi.pakai}`} />}
            </div>
          </div>
        )}

        {(h.latihan.length > 0 || h.strain) && (
          <div className="wh-kartu">
            <div className="wh-grafik-kepala">
              <h3>Latihan</h3>
              <span className="wh-label">{h.latihan.length} aktivitas</span>
            </div>
            {h.latihan.length === 0 && <p className="wh-kosong">Tidak ada latihan tercatat. Strain hari ini dari aktivitas harian.</p>}
            <ul className="wh-latihan">
              {h.latihan.map((w, k) => {
                const totalZona = w.zona.reduce((a, b) => a + b, 0);
                return (
                  <li key={k}>
                    <Dial judul="" nilai={w.strain} maks={21} warna={WARNA.strain} teks={w.strain != null ? angka(w.strain, 1) : "–"} ukuran={56} />
                    <div className="wh-latihan-isi">
                      <div className="wh-latihan-kepala">
                        <b>{w.olahraga}</b>
                        <span className="wh-label">
                          {jam(w.mulai)} – {jam(w.selesai)}
                        </span>
                      </div>
                      <div className="wh-latihan-angka">
                        <span>Rata-rata {w.hrRata ?? "–"} bpm</span>
                        <span>Maks {w.hrMaks ?? "–"} bpm</span>
                        <span>{w.kkal ?? "–"} kkal</span>
                      </div>
                      {totalZona > 0 && (
                        <>
                          <div className="wh-zona" role="img" aria-label={w.zona.map((z, n) => `Zona ${n} ${z} menit`).join(", ")}>
                            {w.zona.map((z, n) => (
                              <span key={n} style={{ flexGrow: z, background: ZONA[n] }} title={`Zona ${n}: ${z} menit`} />
                            ))}
                          </div>
                          <div className="wh-zona-legenda">
                            {w.zona.map((z, n) => (
                              <span key={n}>
                                <i style={{ background: ZONA[n] }} />Z{n} {z}m
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {banyakHari && (
        <details className="wh-tabel">
          <summary>Lihat tabel 7 hari</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hari</th>
                  <th>Recovery</th>
                  <th>HRV</th>
                  <th>Detak ist.</th>
                  <th>Strain</th>
                  <th>Tidur</th>
                  <th>Latihan</th>
                  <th>Sumber</th>
                </tr>
              </thead>
              <tbody>
                {hari.map((x) => (
                  <tr key={x.tanggal}>
                    <td>
                      {sumbu(x).hari} {sumbu(x).tgl}
                    </td>
                    <td>{x.recovery ? `${x.recovery.skor}% (${statusRecovery(x.recovery.skor).label})` : "–"}</td>
                    <td>{x.vital.hrv != null ? `${angka(x.vital.hrv)} ms` : "–"}</td>
                    <td>{x.vital.rhr != null ? `${x.vital.rhr} bpm` : "–"}</td>
                    <td>{x.strain ? angka(x.strain.skor, 1) : "–"}</td>
                    <td>{x.tidur ? jm(totalTidur(x.tidur)) : "–"}</td>
                    <td>{x.latihan.length}</td>
                    <td>{x.sumber.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
