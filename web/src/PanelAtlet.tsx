import { useState, type ReactNode } from "react";
import { adaData, kategori, KAMUS_PER_KODE, NAMA_VENDOR, nilai, nilaiVendor, type HariTampil, type Nilai, type Vendor } from "./dataAtlet.js";

/**
 * Tampilan atlet bergaya aplikasi WHOOP, memakai istilah dari kamus harmonizer.
 * Setiap label adalah istilah kamus (definisi & kaveat muncul saat kursor diarahkan).
 * Metrik "serupa" (rumus vendor berbeda) selalu ditampilkan per vendor dan tidak pernah dicampur.
 */

// Warna: status (selalu disertai label), satu hue per jenis metrik, dan palet tahapan tidur
// yang sudah divalidasi (CVD & kontras) untuk latar gelap.
const WARNA = {
  beban: "#3D9BF0",
  tidur: "#8BA7C4",
  energi: "#2BB5A0",
  stres: "#F08A3C",
  hijau: "#35D07F",
  kuning: "#F5C518",
  merah: "#F0435A",
  netral: "#6E676B",
};
const TAHAP = [
  { kode: "TJG", nama: "Terjaga", warna: "#C47A3E" },
  { kode: "TRG", nama: "Ringan", warna: "#2A9BB8" },
  { kode: "TDL", nama: "Dalam", warna: "#7A63EA" },
  { kode: "TRM", nama: "REM", warna: "#C9548C" },
] as const;
const TINGKAT_STRES = [
  { kunci: "istirahat", nama: "Istirahat", warna: "#5B8FB9" },
  { kunci: "rendah", nama: "Rendah", warna: "#F6C08F" },
  { kunci: "sedang", nama: "Sedang", warna: "#F08A3C" },
  { kunci: "tinggi", nama: "Tinggi", warna: "#B8521A" },
] as const;
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** Pita warna Recovery WHOOP (aturan vendor, khusus SPV WHOOP). */
function pitaSpv(skor: number) {
  if (skor >= 67) return { warna: WARNA.hijau, label: "Hijau", ikon: "▲" };
  if (skor >= 34) return { warna: WARNA.kuning, label: "Kuning", ikon: "●" };
  return { warna: WARNA.merah, label: "Merah", ikon: "▼" };
}
const BPR_INFO: Record<string, { warna: string; label: string; ikon: string; arti: string }> = {
  hijau: { warna: WARNA.hijau, label: "Hijau", ikon: "▲", arti: "Tidak ada metrik yang menyimpang dari basis atlet" },
  kuning: { warna: WARNA.kuning, label: "Kuning", ikon: "●", arti: "1 metrik menyimpang ≥1 SD ke arah buruk" },
  merah: { warna: WARNA.merah, label: "Merah", ikon: "▼", arti: "≥2 metrik menyimpang ≥1 SD ke arah buruk" },
  data_kurang: { warna: WARNA.netral, label: "Data kurang", ikon: "○", arti: "Butuh minimal 14 hari basis dari 28 hari terakhir" },
};

/** Menit -> "j:mm"; dibulatkan ke menit dulu agar 59,7 menit menjadi "1:00", bukan "0:60". */
const jm = (menit: number | null | undefined) => {
  if (menit === null || menit === undefined) return "–";
  const m = Math.round(menit);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
const angka = (v: number, d = 0) => v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
const jamLokal = (ms: number, tzMenit: number | null) => new Date(ms + (tzMenit ?? 420) * 60000).toISOString().slice(11, 16).replace(":", ".");
const tglPendek = (t: string) => {
  const d = new Date(`${t}T12:00:00Z`);
  return { hari: HARI[d.getUTCDay()]!, tgl: d.getUTCDate() };
};
const rata = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Label istilah kamus; definisi dan kaveat tampil sebagai tooltip. */
function Istilah({ kode, children }: { kode: string; children?: ReactNode }) {
  const k = KAMUS_PER_KODE.get(kode);
  if (!k) return <>{children ?? kode}</>;
  return (
    <abbr className="istilah" title={`${k.nama} (${k.kode}, ${k.unit})\n${k.definisi}\nCatatan: ${k.kaveat}`}>
      {children ?? k.nama}
    </abbr>
  );
}

function LabelSumber({ n }: { n: Nilai | null }) {
  if (!n) return null;
  return (
    <span className="wh-asal">
      {NAMA_VENDOR[n.vendor]}
      {n.field.kualitas !== "asli" && n.field.kualitas !== "tidak_ada" ? ` · ${n.field.kualitas}` : ""}
    </span>
  );
}

// ───────────────────────── Dial ─────────────────────────

function Dial(props: { nilai: number | null; maks: number; warna: string; judul: ReactNode; teks: string; bawah?: ReactNode; ukuran?: number }) {
  const u = props.ukuran ?? 168;
  const tebal = Math.max(6, Math.round(u * 0.065));
  const r = (u - tebal) / 2 - 2;
  const keliling = 2 * Math.PI * r;
  const porsi = props.nilai === null ? 0 : Math.max(0, Math.min(1, props.nilai / props.maks));
  return (
    <div className="wh-dial">
      <svg width={u} height={u} viewBox={`0 0 ${u} ${u}`} role="img" aria-label={props.teks}>
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
      {props.judul && <span className="wh-dial-judul">{props.judul}</span>}
      {props.bawah && <span className="wh-dial-bawah">{props.bawah}</span>}
    </div>
  );
}

// ───────────────────────── Grafik kolom 7 hari (dengan tooltip) ─────────────────────────

type Kolom = { label: string; sub: string; segmen: { nilai: number; warna: string }[]; teks: string; tip: string[] };

function GrafikKolom(props: { judul: ReactNode; ringkas: string; data: Kolom[]; maks: number; tanda: number[]; pilih: number; ubah(i: number): void; legenda?: ReactNode }) {
  const [sorot, setSorot] = useState<number | null>(null);
  const L = 320,
    T = 150,
    atas = 18,
    bawah = 30,
    kiri = 26;
  const tinggi = T - atas - bawah;
  const lebarSlot = (L - kiri) / props.data.length;
  const lebarBatang = Math.min(24, lebarSlot * 0.56);
  const y = (v: number) => atas + tinggi - (Math.min(v, props.maks) / props.maks) * tinggi;

  return (
    <div className="wh-grafik">
      <div className="wh-grafik-kepala">
        <h3>{props.judul}</h3>
        {props.legenda}
      </div>
      <div className="wh-grafik-badan">
        <svg viewBox={`0 0 ${L} ${T}`} role="img" aria-label={`${props.ringkas}: ${props.data.map((d) => `${d.label} ${d.sub} ${d.teks}`).join(", ")}`}>
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
                className={`wh-kolom ${sorot !== null && sorot !== i ? "redup" : ""}`}
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

function Legenda({ isi }: { isi: { nama: ReactNode; warna: string; kunci: string }[] }) {
  return (
    <span className="wh-legenda">
      {isi.map((g) => (
        <span key={g.kunci}>
          <i style={{ background: g.warna }} />
          {g.nama}
        </span>
      ))}
    </span>
  );
}

function BarTumpuk({ isi, label }: { isi: { kunci: string; nama: ReactNode; warna: string; menit: number }[]; label: string }) {
  const total = isi.reduce((a, b) => a + b.menit, 0);
  return (
    <>
      <div className="wh-tahap" role="img" aria-label={`${label}: ${isi.map((g) => `${g.kunci} ${jm(g.menit)}`).join(", ")}`}>
        {isi.map((g) => (
          <span key={g.kunci} style={{ flexGrow: g.menit, background: g.warna }} />
        ))}
      </div>
      <ul className="wh-tahap-legenda">
        {isi.map((g) => (
          <li key={g.kunci}>
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

function Mini({ label, nilai: v }: { label: ReactNode; nilai: ReactNode }) {
  return (
    <div>
      <span className="wh-label">{label}</span>
      <b>{v}</b>
    </div>
  );
}

// ───────────────────────── Panel utama ─────────────────────────

const VITAL: { kode: string; d: number; naikBaik: boolean | null; perVendor?: boolean }[] = [
  { kode: "HRV_M", d: 0, naikBaik: true },
  { kode: "RHR", d: 0, naikBaik: false, perVendor: true },
  { kode: "LNP", d: 1, naikBaik: null },
  { kode: "SPO2_M", d: 1, naikBaik: null },
  { kode: "EKT", d: 0, naikBaik: null },
  { kode: "ET", d: 0, naikBaik: true },
];

export function PanelAtlet({ hari: semuaHari, peringatan = [] }: { hari: HariTampil[]; peringatan?: string[] }) {
  // Satu-satunya hari berdata (mis. satu ekspor Garmin) tampil sendiri, tanpa 6 hari kosong.
  const berdata = semuaHari.filter(adaData);
  const hari = berdata.length > 1 ? semuaHari : berdata;
  const [pilih, setPilih] = useState(hari.length - 1);
  const i = Math.min(pilih, hari.length - 1);
  const h = hari[i];
  if (!h) return null;
  const lain = hari.filter((_, k) => k !== i);
  const banyakHari = berdata.length > 1;
  const { hari: namaHari, tgl } = tglPendek(h.tanggal);
  const sumbu = (x: HariTampil) => tglPendek(x.tanggal);
  const vendorHari = Object.keys(h.catatan) as Vendor[];

  const bpr = kategori(h, "BPR");
  const bprInfo = BPR_INFO[bpr?.nilai ?? "data_kurang"] ?? BPR_INFO.data_kurang!;
  const rinciBpr = (bpr?.field.rincian ?? {}) as Record<string, { z: number; buruk: boolean }>;

  const skt = nilai(h, "SKT");
  const sktLain = skt ? nilaiVendor(h, "SKT", skt.vendor === "whoop" ? "garmin" : "whoop") : null;
  const spv = nilaiVendor(h, "SPV", "whoop");
  const bb = nilaiVendor(h, "BB", "garmin");
  const bfh = nilaiVendor(h, "BFH", "whoop");
  const toh = nilaiVendor(h, "TOH", "garmin");
  const dtt = nilai(h, "DTT");
  const ttt = nilai(h, "TTT");
  const dttt = nilai(h, "DTTT");
  const catTidur = h.catatan[dtt?.vendor ?? "whoop"];

  const adaSpv = hari.some((x) => nilaiVendor(x, "SPV", "whoop"));
  const adaBfh = hari.some((x) => nilaiVendor(x, "BFH", "whoop"));
  const adaDtt = hari.some((x) => nilai(x, "DTT"));
  const maksTidurJam = Math.max(10, Math.ceil(Math.max(...hari.map((x) => TAHAP.reduce((a, g) => a + (nilai(x, g.kode)?.nilai ?? 0), 0) / 60))));

  return (
    <section className="wh" aria-label="Data atlet">
      <header className="wh-kepala">
        <div className="wh-merek">
          {vendorHari.length === 0 && <span className="wh-sumber">Tidak ada data hari ini</span>}
          {vendorHari.map((v) => (
            <span key={v} className="wh-sumber whoop">
              {NAMA_VENDOR[v]}
            </span>
          ))}
          <span className="wh-label">
            {namaHari}, {tgl} {new Date(`${h.tanggal}T12:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
          </span>
        </div>
        {vendorHari.length > 0 && (
          <div className="wh-bpr" style={{ borderColor: bprInfo.warna }}>
            <span className="wh-label">
              <Istilah kode="BPR" />
            </span>
            <b>
              <span style={{ color: bprInfo.warna }} aria-hidden="true">
                {bprInfo.ikon}
              </span>{" "}
              {bprInfo.label}
            </b>
            <span className="wh-bpr-arti">
              {bprInfo.arti}
              {Object.keys(rinciBpr).length > 0 &&
                ` · ${Object.entries(rinciBpr)
                  .map(([k, r]) => `${k} z ${angka(r.z, 1)}${r.buruk ? " (buruk)" : ""}`)
                  .join(", ")}`}
            </span>
          </div>
        )}
      </header>

      {banyakHari && (
        <nav className="wh-hari" aria-label="Pilih hari" style={{ gridTemplateColumns: `repeat(${hari.length}, minmax(0, 1fr))` }}>
          {hari.map((x, k) => {
            const d = sumbu(x);
            const s = nilaiVendor(x, "SPV", "whoop");
            return (
              <button key={x.tanggal} className={k === i ? "aktif" : ""} onClick={() => setPilih(k)} aria-pressed={k === i}>
                <span>{d.hari}</span>
                <b>{d.tgl}</b>
                <i style={{ background: s ? pitaSpv(s.nilai).warna : adaData(x) ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.15)" }} aria-hidden="true" />
              </button>
            );
          })}
        </nav>
      )}

      <div className="wh-dial-baris">
        <Dial
          judul={<Istilah kode="SKT">Kualitas Tidur</Istilah>}
          nilai={skt?.nilai ?? null}
          maks={100}
          warna={WARNA.tidur}
          teks={skt ? `${angka(skt.nilai)}${skt.vendor === "whoop" ? "%" : ""}` : "–"}
          bawah={
            skt ? (
              <>
                {String(skt.field.nama_vendor ?? "")} · {NAMA_VENDOR[skt.vendor]}
                {sktLain && (
                  <>
                    <br />
                    {String(sktLain.field.nama_vendor ?? "")} {NAMA_VENDOR[sktLain.vendor]}: {angka(sktLain.nilai)}
                  </>
                )}
              </>
            ) : (
              "Tidak ada data"
            )
          }
        />
        {spv ? (
          <Dial
            judul={<Istilah kode="SPV">Pemulihan</Istilah>}
            nilai={spv.nilai}
            maks={100}
            warna={pitaSpv(spv.nilai).warna}
            teks={`${angka(spv.nilai)}%`}
            ukuran={200}
            bawah={
              <span className="wh-status">
                <span style={{ color: pitaSpv(spv.nilai).warna }} aria-hidden="true">
                  {pitaSpv(spv.nilai).ikon}
                </span>{" "}
                WHOOP Recovery · {pitaSpv(spv.nilai).label}
                {spv.field.kualitas === "kalibrasi" ? " · kalibrasi" : ""}
              </span>
            }
          />
        ) : bb ? (
          <Dial judul={<Istilah kode="BB">Body Battery</Istilah>} nilai={bb.nilai} maks={100} warna={WARNA.energi} teks={angka(bb.nilai)} ukuran={200} bawah="Maks harian · Garmin" />
        ) : (
          <Dial judul={<Istilah kode="SPV">Pemulihan</Istilah>} nilai={null} maks={100} warna={WARNA.hijau} teks="–" ukuran={200} bawah="Tidak ada data" />
        )}
        {bfh ? (
          <Dial
            judul={<Istilah kode="BFH">Beban Harian</Istilah>}
            nilai={bfh.nilai}
            maks={21}
            warna={WARNA.beban}
            teks={angka(bfh.nilai, 1)}
            bawah="WHOOP Day Strain · skala 0–21"
          />
        ) : toh ? (
          <Dial
            judul={<Istilah kode="TOH">Tegangan Otonom</Istilah>}
            nilai={toh.nilai}
            maks={100}
            warna={WARNA.stres}
            teks={angka(toh.nilai)}
            bawah={`Garmin stress · skala 0–100${h.rinciGarmin?.stres?.puncak != null ? ` · puncak ${h.rinciGarmin.stres.puncak}` : ""}`}
          />
        ) : (
          <Dial judul={<Istilah kode="BFH">Beban Harian</Istilah>} nilai={null} maks={21} warna={WARNA.beban} teks="–" bawah="Tidak ada data" />
        )}
      </div>

      <div className="wh-vital">
        {VITAL.map((v) => {
          const daftar = v.perVendor
            ? (["whoop", "garmin"] as Vendor[]).map((x) => nilaiVendor(h, v.kode, x)).filter((x): x is Nilai => !!x)
            : [nilai(h, v.kode)].filter((x): x is Nilai => !!x);
          if (daftar.length === 0 && !hari.some((x) => nilai(x, v.kode))) return null;
          const k = KAMUS_PER_KODE.get(v.kode)!;
          const utama = daftar[0] ?? null;
          // Perbandingan hanya terhadap hari lain dari vendor yang sama.
          const r = utama ? rata(lain.map((x) => nilaiVendor(x, v.kode, utama.vendor)?.nilai)) : null;
          const selisih = utama && r != null ? utama.nilai - r : null;
          const arah = selisih == null || Math.abs(selisih) < 10 ** -v.d ? 0 : selisih > 0 ? 1 : -1;
          const baik = v.naikBaik === null || arah === 0 ? null : (arah > 0) === v.naikBaik;
          return (
            <div key={v.kode} className="wh-vital-item">
              <span className="wh-label">
                <Istilah kode={v.kode} />
              </span>
              {daftar.length === 0 ? (
                <b>–</b>
              ) : (
                daftar.map((x) => (
                  <b key={x.vendor}>
                    {angka(x.nilai, v.d)}
                    <small> {k.unit === "napas/menit" ? "/mnt" : k.unit}</small>
                    {daftar.length > 1 && <small className="wh-asal-inline"> {NAMA_VENDOR[x.vendor]}</small>}
                  </b>
                ))
              )}
              <span className="wh-vital-kaki">
                {daftar.length === 1 && <LabelSumber n={utama} />}
                {banyakHari && selisih != null && (
                  <span className={`wh-delta ${baik === null ? "" : baik ? "baik" : "buruk"}`}>
                    {`${arah > 0 ? "↑" : arah < 0 ? "↓" : "="} ${angka(Math.abs(selisih), v.d)} vs rata-rata`}
                  </span>
                )}
              </span>
            </div>
          );
        })}
        {ttt && (
          <div className="wh-vital-item">
            <span className="wh-label">
              <Istilah kode="TTT" />
            </span>
            <b>{String(ttt.field.jam_lokal ?? "–").replace(":", ".")}</b>
            <span className="wh-vital-kaki">
              {dttt ? (
                <span className={`wh-delta ${Math.abs(dttt.nilai) >= 60 ? "buruk" : ""}`}>
                  <Istilah kode="DTTT">
                    {dttt.nilai >= 0 ? "+" : "−"}
                    {Math.round(Math.abs(dttt.nilai))} mnt dari biasanya
                  </Istilah>
                </span>
              ) : (
                <span className="wh-delta">
                  <Istilah kode="DTTT">deviasi: butuh ≥7 malam</Istilah>
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {banyakHari && (adaSpv || adaBfh || adaDtt) && (
        <div className="wh-grid">
          {adaSpv && (
            <GrafikKolom
              judul={
                <>
                  <Istilah kode="SPV">Pemulihan</Istilah> 7 hari
                </>
              }
              ringkas="Skor Pemulihan Vendor 7 hari"
              maks={100}
              tanda={[0, 33, 66, 100]}
              pilih={i}
              ubah={setPilih}
              legenda={
                <Legenda
                  isi={[
                    { kunci: "h", nama: "Hijau 67+", warna: WARNA.hijau },
                    { kunci: "k", nama: "Kuning 34–66", warna: WARNA.kuning },
                    { kunci: "m", nama: "Merah ≤33", warna: WARNA.merah },
                  ]}
                />
              }
              data={hari.map((x) => {
                const s = nilaiVendor(x, "SPV", "whoop");
                const hrv = nilai(x, "HRV_M");
                return {
                  label: sumbu(x).hari,
                  sub: String(sumbu(x).tgl),
                  segmen: s ? [{ nilai: s.nilai, warna: pitaSpv(s.nilai).warna }] : [],
                  teks: s ? angka(s.nilai) : "–",
                  tip: s ? [`WHOOP Recovery ${angka(s.nilai)}% · ${pitaSpv(s.nilai).label}`, `HRV Malam ${hrv ? angka(hrv.nilai) : "–"} ms`] : ["Tidak ada data"],
                };
              })}
            />
          )}
          {adaBfh && (
            <GrafikKolom
              judul={
                <>
                  <Istilah kode="BFH">Beban Harian</Istilah> 7 hari
                </>
              }
              ringkas="Beban Fisiologis Harian 7 hari"
              maks={21}
              tanda={[0, 7, 14, 21]}
              pilih={i}
              ubah={setPilih}
              data={hari.map((x) => {
                const b = nilaiVendor(x, "BFH", "whoop");
                return {
                  label: sumbu(x).hari,
                  sub: String(sumbu(x).tgl),
                  segmen: b ? [{ nilai: b.nilai, warna: WARNA.beban }] : [],
                  teks: b ? angka(b.nilai, 1) : "–",
                  tip: b ? [`WHOOP Day Strain ${angka(b.nilai, 1)} / 21`, `${x.aktivitas.length} aktivitas`] : ["Tidak ada data"],
                };
              })}
            />
          )}
          {adaDtt && (
            <GrafikKolom
              judul={
                <>
                  <Istilah kode="DTT">Tidur</Istilah> 7 hari (jam)
                </>
              }
              ringkas="Durasi tidur dan tahapannya 7 hari"
              maks={maksTidurJam}
              tanda={[0, 4, 8]}
              pilih={i}
              ubah={setPilih}
              legenda={<Legenda isi={TAHAP.map((g) => ({ kunci: g.kode, nama: <Istilah kode={g.kode}>{g.nama}</Istilah>, warna: g.warna }))} />}
              data={hari.map((x) => {
                const d = nilai(x, "DTT");
                return {
                  label: sumbu(x).hari,
                  sub: String(sumbu(x).tgl),
                  segmen: d ? TAHAP.map((g) => ({ nilai: (nilai(x, g.kode)?.nilai ?? 0) / 60, warna: g.warna })) : [],
                  teks: d ? jm(d.nilai) : "–",
                  tip: d ? [`Durasi Tidur Total ${jm(d.nilai)}`, ...TAHAP.map((g) => `${g.nama} ${jm(nilai(x, g.kode)?.nilai)}`)] : ["Tidak ada data"],
                };
              })}
            />
          )}
        </div>
      )}

      <div className="wh-grid dua">
        {dtt && (
          <div className="wh-kartu">
            <div className="wh-grafik-kepala">
              <h3>
                <Istilah kode="DTT">Tidur</Istilah>
              </h3>
              <span className="wh-label">
                {catTidur?.jendela_tidur
                  ? `${jamLokal(catTidur.jendela_tidur.mulai_ms, catTidur.tz_offset_menit)} – ${jamLokal(catTidur.jendela_tidur.selesai_ms, catTidur.tz_offset_menit)} · `
                  : ""}
                {NAMA_VENDOR[dtt.vendor]}
              </span>
            </div>
            <BarTumpuk
              label="Tahapan tidur"
              isi={TAHAP.map((g) => ({ kunci: g.kode, nama: <Istilah kode={g.kode}>{g.nama}</Istilah>, warna: g.warna, menit: nilai(h, g.kode)?.nilai ?? 0 }))}
            />
            <div className="wh-mini">
              <Mini label={<Istilah kode="DTT">Durasi tidur</Istilah>} nilai={jm(dtt.nilai)} />
              {nilai(h, "WTT") && <Mini label={<Istilah kode="WTT">Di tempat tidur</Istilah>} nilai={jm(nilai(h, "WTT")!.nilai)} />}
              {nilai(h, "ET") && (
                <Mini
                  label={<Istilah kode="ET">Efisiensi</Istilah>}
                  nilai={
                    <>
                      {angka(nilai(h, "ET")!.nilai)}%
                      {typeof nilai(h, "ET")!.field.pembanding_vendor === "number" && (
                        <small className="wh-asal-inline"> vendor {angka(nilai(h, "ET")!.field.pembanding_vendor as number)}%</small>
                      )}
                    </>
                  }
                />
              )}
              {nilai(h, "LNP") && <Mini label={<Istilah kode="LNP">Laju napas</Istilah>} nilai={`${angka(nilai(h, "LNP")!.nilai, 1)}/mnt`} />}
            </div>
          </div>
        )}

        {h.rinciGarmin?.stres && (
          <div className="wh-kartu">
            <div className="wh-grafik-kepala">
              <h3>
                <Istilah kode="TOH">Tegangan Otonom</Istilah>: rincian durasi
              </h3>
              <span className="wh-label">Garmin</span>
            </div>
            <BarTumpuk
              label="Durasi per tingkat stres Garmin"
              isi={TINGKAT_STRES.map((g) => ({ kunci: g.kunci, nama: g.nama, warna: g.warna, menit: h.rinciGarmin!.stres![g.kunci] ?? 0 }))}
            />
          </div>
        )}

        {bb && (
          <div className="wh-kartu">
            <div className="wh-grafik-kepala">
              <h3>
                <Istilah kode="BB" />
              </h3>
              <span className="wh-label">Garmin · skala 0–100</span>
            </div>
            <div className="wh-bb" role="img" aria-label={`Body Battery terendah ${h.rinciGarmin?.bb?.min ?? "–"}, tertinggi ${bb.nilai}`}>
              {h.rinciGarmin?.bb?.min != null && <span style={{ left: `${h.rinciGarmin.bb.min}%`, width: `${Math.max(1, bb.nilai - h.rinciGarmin.bb.min)}%` }} />}
            </div>
            <div className="wh-bb-sumbu">
              <span>0</span>
              <span>100</span>
            </div>
            <div className="wh-mini">
              <Mini label="Maks harian" nilai={angka(bb.nilai)} />
              {h.rinciGarmin?.bb?.min != null && <Mini label="Terendah" nilai={angka(h.rinciGarmin.bb.min)} />}
              {h.rinciGarmin?.bb?.isi != null && <Mini label="Terisi" nilai={`+${h.rinciGarmin.bb.isi}`} />}
              {h.rinciGarmin?.bb?.pakai != null && <Mini label="Terpakai" nilai={`−${h.rinciGarmin.bb.pakai}`} />}
            </div>
          </div>
        )}

        {h.aktivitas.length > 0 && (
          <div className="wh-kartu">
            <div className="wh-grafik-kepala">
              <h3>Aktivitas</h3>
              <span className="wh-label">{h.aktivitas.length} tercatat perangkat</span>
            </div>
            <ul className="wh-latihan">
              {h.aktivitas.map((a, k) => {
                const tz = h.catatan[a.sumber as Vendor]?.tz_offset_menit ?? null;
                return (
                  <li key={k}>
                    <Dial judul="" nilai={a.strain} maks={21} warna={WARNA.beban} teks={a.strain != null ? angka(a.strain, 1) : "–"} ukuran={56} />
                    <div className="wh-latihan-isi">
                      <div className="wh-latihan-kepala">
                        <b>{(a.jenis ?? "aktivitas").replace(/[-_]/g, " ")}</b>
                        <span className="wh-label">
                          {jamLokal(a.mulai_ms, tz)} – {jamLokal(a.selesai_ms, tz)} · {NAMA_VENDOR[a.sumber as Vendor] ?? a.sumber}
                        </span>
                      </div>
                      <div className="wh-latihan-angka">
                        <span>{Math.round(a.durasi_menit)} mnt</span>
                        <span>HR rata-rata {a.hr_rata ?? "–"} bpm</span>
                        <span>Maks {a.hr_maks ?? "–"} bpm</span>
                        <span>{a.kkal != null ? `${angka(a.kkal)} kkal` : "– kkal"}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="wh-kartu">
          <div className="wh-grafik-kepala">
            <h3>Metrik sesi esports</h3>
            <span className="wh-label">butuh log sesi</span>
          </div>
          <p className="wh-kosong">
            Dihitung dari log sesi (jam mulai/selesai, sRPE, kelelahan mental) yang digabung dengan data perangkat. Belum ada log sesi asli
            untuk atlet ini.
          </p>
          <ul className="wh-istilah-sesi">
            {["MMH", "JLT", "BSP", "KMP", "ROS"].map((kode) => (
              <li key={kode}>
                <Istilah kode={kode} />
                <small>{KAMUS_PER_KODE.get(kode)?.unit}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {banyakHari && (
        <details className="wh-tabel">
          <summary>Lihat tabel 7 hari</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hari</th>
                  {["BPR", "SPV", "HRV_M", "RHR", "BFH", "DTT", "ET", "TTT"].map((k) => (
                    <th key={k}>
                      <Istilah kode={k}>{k}</Istilah>
                    </th>
                  ))}
                  <th>Sumber</th>
                </tr>
              </thead>
              <tbody>
                {hari.map((x) => {
                  const f = (k: string, d = 0) => (nilai(x, k) ? angka(nilai(x, k)!.nilai, d) : "–");
                  return (
                    <tr key={x.tanggal}>
                      <td>
                        {sumbu(x).hari} {sumbu(x).tgl}
                      </td>
                      <td>{BPR_INFO[kategori(x, "BPR")?.nilai ?? ""]?.label ?? "–"}</td>
                      <td>{f("SPV")}</td>
                      <td>{f("HRV_M")}</td>
                      <td>
                        {(["whoop", "garmin"] as Vendor[])
                          .map((v) => nilaiVendor(x, "RHR", v))
                          .filter((n): n is Nilai => !!n)
                          .map((n) => `${angka(n.nilai)} (${NAMA_VENDOR[n.vendor]})`)
                          .join(" · ") || "–"}
                      </td>
                      <td>{f("BFH", 1)}</td>
                      <td>{nilai(x, "DTT") ? jm(nilai(x, "DTT")!.nilai) : "–"}</td>
                      <td>{f("ET")}</td>
                      <td>{String(nilai(x, "TTT")?.field.jam_lokal ?? "–")}</td>
                      <td>{(Object.keys(x.catatan) as Vendor[]).map((v) => NAMA_VENDOR[v]).join(", ") || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {peringatan.length > 0 && (
        <details className="wh-tabel">
          <summary>Catatan penyeragaman data ({peringatan.length})</summary>
          <ul className="wh-peringatan">
            {peringatan.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
