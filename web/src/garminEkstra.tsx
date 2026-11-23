import { useEffect, useState } from "react";
import { type AktivitasGarmin, type DetailAktivitas, detailAktivitasGarmin, type EkstraGarmin, urlFitGarmin } from "./garminLive.js";
import { fmtTanggal } from "./ui.js";

/** Tampilan data Garmin tambahan di Dashboard: hanya muncul setelah data ditarik langsung dari Garmin Connect. */

const fmt = (n: number | null | undefined, satuan = "", digit = 0) =>
  n === null || n === undefined ? "–" : `${n.toLocaleString("id-ID", { maximumFractionDigits: digit })}${satuan}`;

function fmtDurasi(d: number | null): string {
  if (d === null) return "–";
  const m = Math.round(d / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}j ${String(m % 60).padStart(2, "0")}m`;
}

function Kpi({ label, nilai, catatan }: { label: string; nilai: string; catatan?: string }) {
  return (
    <div className="card kpi">
      <span className="kpi-label">{label}</span>
      <b className="kpi-nilai">{nilai}</b>
      {catatan && <span className="kpi-catatan">{catatan}</span>}
    </div>
  );
}

const Kosong = ({ teks = "Tidak ada data di akun Garmin ini." }: { teks?: string }) => <p className="muted kecil">{teks}</p>;

/**
 * Batang vertikal satu seri. Tiap batang punya tooltip (title) dan label
 * aksesibel; garis target opsional digambar putus-putus.
 */
function Batang({ nilai, label, target, judul }: { nilai: (number | null)[]; label: string[]; target?: number | null; judul: string }) {
  const maks = Math.max(1, target ?? 0, ...nilai.map((v) => v ?? 0));
  return (
    <div className="grafik-batang" role="img" aria-label={judul}>
      {target ? <span className="garis-target" style={{ bottom: `${(target / maks) * 100}%` }} aria-hidden /> : null}
      {nilai.map((v, i) => (
        <span key={i} className="batang-kolom" title={`${label[i]}: ${v === null ? "tidak ada data" : v.toLocaleString("id-ID")}`}>
          <span className={`batang ${v === null ? "kosong" : ""}`} style={{ height: `${v === null ? 0 : Math.max(2, (v / maks) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

function Skalar({ nilai }: { nilai: Record<string, number | string> }) {
  const isi = Object.entries(nilai);
  if (isi.length === 0) return <Kosong />;
  return (
    <dl className="profil kecil-profil">
      {isi.map(([k, v]) => (
        <span key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{typeof v === "number" ? v.toLocaleString("id-ID", { maximumFractionDigits: 1 }) : v}</dd>
        </span>
      ))}
    </dl>
  );
}

export function EkstraGarminPanel({ e, tanggal }: { e: EkstraGarmin; tanggal: string }) {
  const hariIni = e.langkah.find((l) => l.tanggal === tanggal) ?? e.langkah.at(-1);
  const hr = e.detakJantung;
  const zona = e.zonaHr;
  const beratAkhir = e.berat.filter((b) => b.beratKg !== null).at(-1);

  return (
    <>
      <div className="kpi-grid">
        <Kpi
          label="Langkah"
          nilai={fmt(hariIni?.langkah)}
          catatan={hariIni?.target ? `Target ${fmt(hariIni.target)} · ${fmt((hariIni.jarakMeter ?? 0) / 1000, " km", 1)}` : undefined}
        />
        <Kpi
          label="VO2 max"
          nilai={fmt(e.vo2max?.nilai, "", 1)}
          catatan={e.vo2max ? `${e.vo2max.olahraga} · ${fmtTanggal(e.vo2max.tanggal, { tahun: true })}` : "Belum ada dalam 90 hari"}
        />
        <Kpi
          label="Fitness age"
          nilai={fmt(e.fitnessAge?.usiaKebugaran, " th", 1)}
          catatan={e.fitnessAge ? `Usia ${fmt(e.fitnessAge.usia)} · bisa dicapai ${fmt(e.fitnessAge.bisaDicapai, " th", 1)}` : undefined}
        />
        <Kpi
          label="SpO2 rata-rata"
          nilai={fmt(e.spo2?.rataRata, "%")}
          catatan={e.spo2 ? `Terendah ${fmt(e.spo2.terendah, "%")} · saat tidur ${fmt(e.spo2.saatTidur, "%")}` : "Tidak terukur hari ini"}
        />
      </div>

      <div className="grid-2">
        <section className="card" aria-label="Langkah 28 hari">
          <h2>Langkah 28 hari</h2>
          {e.langkah.length === 0 ? (
            <Kosong />
          ) : (
            <>
              <Batang
                judul={`Langkah harian ${e.langkah.length} hari terakhir`}
                nilai={e.langkah.map((l) => l.langkah)}
                label={e.langkah.map((l) => fmtTanggal(l.tanggal))}
                target={hariIni?.target}
              />
              <div className="bb-label">
                <span>{fmtTanggal(e.langkah[0]!.tanggal)}</span>
                <span>{fmtTanggal(e.langkah.at(-1)!.tanggal)}</span>
              </div>
              <p className="muted kecil">
                Rata-rata {fmt(e.langkah.reduce((a, l) => a + (l.langkah ?? 0), 0) / e.langkah.length)} langkah/hari. Garis putus-putus = target hari ini.
              </p>
            </>
          )}
        </section>

        <section className="card" aria-label="Detak jantung sepanjang hari">
          <h2>Detak jantung sepanjang hari</h2>
          {!hr || hr.perJam.every((v) => v === null) ? (
            <Kosong />
          ) : (
            <>
              <Batang
                judul="Rata-rata detak jantung per jam"
                nilai={hr.perJam}
                label={hr.perJam.map((_, i) => `${String(i).padStart(2, "0")}.00`)}
              />
              <div className="bb-label">
                <span>00.00</span>
                <span>12.00</span>
                <span>23.00</span>
              </div>
              <ul className="legenda">
                <li><span>Istirahat</span><b>{fmt(hr.istirahat, " bpm")}</b><small>7 hari {fmt(hr.istirahat7Hari)}</small></li>
                <li><span>Terendah</span><b>{fmt(hr.min, " bpm")}</b></li>
                <li><span>Tertinggi</span><b>{fmt(hr.maks, " bpm")}</b></li>
              </ul>
            </>
          )}
        </section>

        <section className="card" aria-label="Zona detak jantung">
          <h2>Zona detak jantung</h2>
          {!zona || zona.batasBawah.length < 5 ? (
            <Kosong />
          ) : (
            <>
              <table>
                <tbody>
                  {zona.batasBawah.map((b, i) => (
                    <tr key={i}>
                      <td>Zona {i + 1}</td>
                      <td style={{ textAlign: "right" }}>
                        <b>
                          {b}–{i < 4 ? zona.batasBawah[i + 1]! - 1 : (zona.hrMaks ?? "")} bpm
                        </b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted kecil">
                Metode {zona.metode === "HR_MAX" ? "% HR maks" : zona.metode.replace(/_/g, " ").toLowerCase()} · HR maks {fmt(zona.hrMaks)} · HR istirahat{" "}
                {fmt(zona.hrIstirahat)}
              </p>
            </>
          )}
        </section>

        <section className="card" aria-label="Fitness age">
          <h2>Komponen fitness age</h2>
          {!e.fitnessAge || e.fitnessAge.komponen.length === 0 ? (
            <Kosong />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Komponen</th>
                  <th className="num">Saat ini</th>
                  <th className="num">Target</th>
                </tr>
              </thead>
              <tbody>
                {e.fitnessAge.komponen.map((k) => (
                  <tr key={k.nama}>
                    <td>{k.nama}</td>
                    <td className="num"><b>{fmt(k.nilai, "", 1)}</b></td>
                    <td className="num">{fmt(k.target, "", 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card" aria-label="Berat badan">
          <h2>Berat badan (90 hari)</h2>
          {!beratAkhir ? (
            <Kosong teks="Belum ada catatan berat badan." />
          ) : (
            <ul className="legenda">
              <li><span>Terakhir</span><b>{fmt(beratAkhir.beratKg, " kg", 1)}</b><small>{fmtTanggal(beratAkhir.tanggal)}</small></li>
              <li><span>BMI</span><b>{fmt(beratAkhir.bmi, "", 1)}</b></li>
              <li><span>Lemak tubuh</span><b>{fmt(beratAkhir.lemakPersen, "%", 1)}</b></li>
              <li><span>Jumlah catatan</span><b>{e.berat.length}</b></li>
            </ul>
          )}
        </section>

        <section className="card" aria-label="Hidrasi dan makanan">
          <h2>Hidrasi & makanan</h2>
          <h3 className="kecil">Hidrasi 7 hari</h3>
          {e.hidrasi.length === 0 ? <Kosong teks="Belum ada catatan hidrasi." /> : e.hidrasi.map((h) => <Skalar key={h.tanggal} nilai={h.nilai} />)}
          <h3 className="kecil">Makanan hari ini</h3>
          {!e.makanan ? <Kosong teks="Belum ada catatan makanan." /> : <Skalar nilai={{ "Makanan tercatat": e.makanan.jumlahMakanan, ...e.makanan.nilai }} />}
        </section>

        <section className="card" aria-label="Siklus menstruasi">
          <h2>Siklus menstruasi</h2>
          {!e.siklus ? <Kosong teks="Tidak ada data siklus di akun ini." /> : <Skalar nilai={e.siklus} />}
        </section>

        <section className="card" aria-label="Wellness activity">
          <h2>Wellness activity (7 hari)</h2>
          {e.aktivitasWellness.length === 0 ? <Kosong teks="Belum ada wellness activity." /> : e.aktivitasWellness.map((w, i) => <Skalar key={i} nilai={w.nilai} />)}
        </section>
      </div>
    </>
  );
}

// ───────────────────────── Aktivitas ─────────────────────────

const JENIS_AKTIVITAS: Record<string, string> = {
  running: "Lari",
  treadmill_running: "Lari treadmill",
  walking: "Jalan kaki",
  cycling: "Bersepeda",
  indoor_cycling: "Sepeda statis",
  soccer: "Sepak bola",
  strength_training: "Latihan beban",
  cardio: "Kardio",
  yoga: "Yoga",
  swimming: "Renang",
  lap_swimming: "Renang kolam",
  hiking: "Mendaki",
  breathwork: "Latihan napas",
};
const labelJenis = (k: string) => JENIS_AKTIVITAS[k] ?? (k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ") : "–");

/** Aktivitas terbaru; baris bisa dibuka untuk detail, zona HR, split, workout, dan unduh file .FIT. */
export function DaftarAktivitas({ atletId, aktivitas }: { atletId: string; aktivitas: AktivitasGarmin[] | null }) {
  const [buka, setBuka] = useState<number | null>(null);
  return (
    <section className="card flush" aria-label="Aktivitas terbaru">
      <div className="card-head">
        <h2>Aktivitas terbaru</h2>
      </div>
      {aktivitas === null ? (
        <p className="catatan-kaki muted kecil">Aktivitas tidak bisa ditarik dari Garmin.</p>
      ) : aktivitas.length === 0 ? (
        <p className="catatan-kaki muted kecil">Belum ada aktivitas tercatat di Garmin Connect.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Aktivitas</th>
                <th className="num">Durasi</th>
                <th className="num">Jarak</th>
                <th className="num">HR rata-rata / maks</th>
                <th className="num">Menit intensitas</th>
                <th className="num">Kalori</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {aktivitas.map((a) => (
                <BarisAktivitas key={a.id} atletId={atletId} a={a} terbuka={buka === a.id} ubah={() => setBuka(buka === a.id ? null : a.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BarisAktivitas({ atletId, a, terbuka, ubah }: { atletId: string; a: AktivitasGarmin; terbuka: boolean; ubah(): void }) {
  return (
    <>
      <tr>
        <td>
          {a.mulai ? fmtTanggal(a.mulai.slice(0, 10), { tahun: true }) : "–"}
          <span className="muted kecil" style={{ display: "block" }}>{a.mulai.slice(11, 16)}</span>
        </td>
        <td>
          <b>{a.nama || labelJenis(a.jenis)}</b>
          <span className="muted kecil" style={{ display: "block" }}>{labelJenis(a.jenis)}</span>
        </td>
        <td className="num">{fmtDurasi(a.durasiDetik)}</td>
        <td className="num">{a.jarakMeter === null ? "–" : fmt(a.jarakMeter / 1000, " km", 2)}</td>
        <td className="num">{a.hrRata === null ? "–" : `${Math.round(a.hrRata)} / ${a.hrMaks === null ? "–" : Math.round(a.hrMaks)} bpm`}</td>
        <td className="num">{a.menitIntensitas ?? "–"}</td>
        <td className="num">{a.kalori === null ? "–" : fmt(a.kalori, " kkal")}</td>
        <td>
          <button type="button" className="btn kecil" aria-expanded={terbuka} onClick={ubah}>
            {terbuka ? "Tutup" : "Detail"}
          </button>
        </td>
      </tr>
      {terbuka && (
        <tr className="baris-detail">
          <td colSpan={8}>
            <DetailAktivitasPanel atletId={atletId} a={a} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailAktivitasPanel({ atletId, a }: { atletId: string; a: AktivitasGarmin }) {
  const [hasil, setHasil] = useState<{ ok: true; data: DetailAktivitas } | { ok: false; pesan: string } | null>(null);
  useEffect(() => {
    let aktif = true;
    void detailAktivitasGarmin(atletId, a.id).then((h) => aktif && setHasil(h));
    return () => {
      aktif = false;
    };
  }, [atletId, a.id]);
  const totalZona = a.zonaHr.reduce<number>((s, v) => s + (v ?? 0), 0);

  return (
    <div className="stack" style={{ gap: 16 }}>
      {totalZona > 0 && (
        <div>
          <h3 className="kecil">Waktu di zona detak jantung</h3>
          <table>
            <tbody>
              {a.zonaHr.map((v, i) => (
                <tr key={i}>
                  <td>Zona {i + 1}</td>
                  <td style={{ width: "60%" }}>
                    <span className="zona-isi" style={{ width: `${((v ?? 0) / totalZona) * 100}%` }} aria-hidden />
                  </td>
                  <td className="num">
                    {fmtDurasi(v)} <span className="muted kecil">{Math.round(((v ?? 0) / totalZona) * 100)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!hasil ? (
        <p className="muted kecil">Menarik detail aktivitas…</p>
      ) : !hasil.ok ? (
        <p className="muted kecil">{hasil.pesan}</p>
      ) : (
        <>
          {hasil.data.ringkasan.length > 0 && (
            <div>
              <h3 className="kecil">Ringkasan</h3>
              <dl className="profil kecil-profil">
                {hasil.data.ringkasan.map((r) => (
                  <span key={r.label} style={{ display: "contents" }}>
                    <dt>{r.label}</dt>
                    <dd>{r.nilai}</dd>
                  </span>
                ))}
              </dl>
            </div>
          )}
          {hasil.data.split.length > 0 && (
            <div>
              <h3 className="kecil">Split</h3>
              <table>
                <thead>
                  <tr>
                    <th>Jenis</th>
                    <th className="num">Jumlah</th>
                    <th className="num">Durasi</th>
                    <th className="num">Jarak</th>
                  </tr>
                </thead>
                <tbody>
                  {hasil.data.split.map((s, i) => (
                    <tr key={i}>
                      <td>{s.jenis}</td>
                      <td className="num">{s.jumlah ?? "–"}</td>
                      <td className="num">{fmtDurasi(s.durasiDetik)}</td>
                      <td className="num">{s.jarakMeter === null ? "–" : fmt(s.jarakMeter, " m")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <h3 className="kecil">Workout</h3>
            {hasil.data.workout.length === 0 ? (
              <Kosong teks="Tidak ada workout terencana di aktivitas ini." />
            ) : (
              hasil.data.workout.map((w, i) => (
                <div key={i}>
                  <b>{w.nama}</b>
                  <Skalar nilai={w.ringkas} />
                </div>
              ))
            )}
          </div>
        </>
      )}
      <div>
        <a className="btn kecil" href={urlFitGarmin(atletId, a.id)} download>
          Unduh file .FIT (ZIP)
        </a>
      </div>
    </div>
  );
}
