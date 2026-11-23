import { useState, type ReactNode } from "react";
import { adaData, kategori, KAMUS_PER_KODE, nilai, pertama, type HariTampil, type HasilSusun } from "./dataAtlet.js";
import { PARAM_IND } from "./lib/indeks-esports.mjs";

/**
 * Tampilan atlet bergaya aplikasi WHOOP. Bentuknya SELALU sama, dari perangkat mana pun datanya:
 * tidak ada nama perangkat di layar. Metrik yang tidak tersedia disembunyikan, bukan diganti bentuk lain.
 * Setiap label adalah istilah kamus harmonizer; Indeks Esports (IKB, IBMS) menampilkan cara hitungnya.
 */

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
// Palet tahapan tidur sudah divalidasi (CVD & kontras) untuk latar gelap.
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

/** Pita warna skor 0-100 (sama untuk semua sumber). */
function pita(skor: number) {
  if (skor >= 67) return { warna: WARNA.hijau, label: "Hijau", ikon: "▲", arti: "Siap untuk beban tinggi" };
  if (skor >= 34) return { warna: WARNA.kuning, label: "Kuning", ikon: "●", arti: "Beban sedang" };
  return { warna: WARNA.merah, label: "Merah", ikon: "▼", arti: "Prioritaskan pemulihan" };
}
const PITA_IKB: Record<string, { warna: string; label: string; ikon: string; arti: string }> = {
  normal: { warna: WARNA.hijau, label: "Normal", ikon: "▲", arti: `IKB ≥ ${PARAM_IND.PITA_NORMAL}` },
  perhatian: { warna: WARNA.kuning, label: "Perhatian", ikon: "●", arti: `IKB ${PARAM_IND.PITA_PERHATIAN}–${PARAM_IND.PITA_NORMAL - 0.01}` },
  rendah: { warna: WARNA.merah, label: "Rendah", ikon: "▼", arti: `IKB < ${PARAM_IND.PITA_PERHATIAN}` },
};
const BPR_INFO: Record<string, { warna: string; label: string; ikon: string; arti: string }> = {
  hijau: { warna: WARNA.hijau, label: "Hijau", ikon: "▲", arti: "Tidak ada metrik yang menyimpang dari basis atlet" },
  kuning: { warna: WARNA.kuning, label: "Kuning", ikon: "●", arti: "1 metrik menyimpang ≥1 SD ke arah buruk" },
  merah: { warna: WARNA.merah, label: "Merah", ikon: "▼", arti: "≥2 metrik menyimpang ≥1 SD ke arah buruk" },
  data_kurang: { warna: WARNA.netral, label: "Data kurang", ikon: "○", arti: "Butuh minimal 14 hari basis dari 28 hari terakhir" },
};
/** Komponen IKB: nama tampilan dan arti arah (s = +1: nilai naik itu baik). */
const KOMPONEN_IKB: Record<string, string> = {
  LNHRV: "ln HRV Malam",
  DTT: "Durasi Tidur Total",
  RHR: "Detak Jantung Istirahat",
  KETERATURAN: "Keteraturan tidur",
  BEBAN: "Beban sesi kemarin",
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

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const fmtTanggalPanjang = (t: string) =>
  new Date(`${t}T12:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
function fmtRentang(a: string, b: string) {
  const x = new Date(`${a}T12:00:00Z`), y = new Date(`${b}T12:00:00Z`);
  return `${x.getUTCDate()} ${BULAN[x.getUTCMonth()]}${x.getUTCFullYear() !== y.getUTCFullYear() ? ` ${x.getUTCFullYear()}` : ""} – ${y.getUTCDate()} ${BULAN[y.getUTCMonth()]} ${y.getUTCFullYear()}`;
}

/**
 * Tren IKB satu tahun: satu titik per hari yang terhitung (hari bolong dibiarkan kosong).
 * Garis acuan di 50 (kebiasaan atlet sendiri) dan ambang pita. Klik titik untuk membuka minggu itu.
 */
function TrenTahun({ semua, pilihTanggal, lompatKe }: { semua: HariTampil[]; pilihTanggal: string; lompatKe(t: string): void }) {
  const [sorot, setSorot] = useState<number | null>(null);
  const L = 960,
    T = 190,
    atas = 14,
    bawah = 26,
    kiri = 30,
    kanan = 8;
  const tinggi = T - atas - bawah;
  const n = semua.length;
  const x = (k: number) => kiri + (n <= 1 ? 0 : (k / (n - 1)) * (L - kiri - kanan));
  const y = (v: number) => atas + tinggi - (Math.max(0, Math.min(100, v)) / 100) * tinggi;
  const titik = semua.map((h, k) => ({ k, h, v: h.ikb?.status === "ok" ? h.ikb.nilai : null })).filter((t): t is { k: number; h: HariTampil; v: number } => t.v !== null);
  // Garis hanya menyambung hari berurutan; bolong > 1 hari memutus garis.
  const ruas: string[] = [];
  let jalur = "";
  titik.forEach((t, j) => {
    const sambung = j > 0 && t.k - titik[j - 1]!.k <= 2;
    jalur += `${sambung ? "L" : (jalur ? " M" : "M")}${x(t.k).toFixed(1)},${y(t.v).toFixed(1)}`;
    if (!titik[j + 1] || titik[j + 1]!.k - t.k > 2) {
      ruas.push(jalur);
      jalur = "";
    }
  });
  // Label bulan di tanggal 1; label awal dibuang bila terlalu dekat dengan label bulan berikutnya.
  const bulanAwal = semua
    .map((h, k) => ({ h, k }))
    .filter(({ h }, k) => k === 0 || h.tanggal.endsWith("-01"))
    .filter(({ k }, j, arr) => !(j === 0 && arr[1] && x(arr[1].k) - x(k) < 48));
  const idxPilih = semua.findIndex((h) => h.tanggal === pilihTanggal);
  const s = sorot !== null ? titik.find((t) => t.k === sorot) : null;
  const rataIkb = titik.length ? titik.reduce((a, t) => a + t.v, 0) / titik.length : null;

  return (
    <div className="wh-grafik">
      <div className="wh-grafik-kepala">
        <h3>Kesiapan Bermain (IKB) 1 tahun</h3>
        <span className="wh-legenda">
          <span>
            <i style={{ background: WARNA.hijau }} />
            Normal ≥{PARAM_IND.PITA_NORMAL}
          </span>
          <span>
            <i style={{ background: WARNA.kuning }} />
            Perhatian ≥{PARAM_IND.PITA_PERHATIAN}
          </span>
          <span>
            <i style={{ background: WARNA.merah }} />
            Rendah
          </span>
          <span>
            {titik.length} hari terhitung{rataIkb !== null ? ` · rata-rata ${angka(rataIkb, 1)}` : ""}
          </span>
        </span>
      </div>
      <div className="wh-grafik-badan">
        <svg viewBox={`0 0 ${L} ${T}`} role="img" aria-label={`Tren IKB ${titik.length} hari terhitung dalam ${n} hari`} onMouseLeave={() => setSorot(null)}>
          {[0, PARAM_IND.PITA_PERHATIAN, PARAM_IND.PITA_NORMAL, 50, 100].map((t) => (
            <g key={t}>
              <line x1={kiri} x2={L - kanan} y1={y(t)} y2={y(t)} stroke={t === 50 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.07)"} strokeWidth="1" />
              {(t === 0 || t === 50 || t === 100) && (
                <text x={kiri - 6} y={y(t)} textAnchor="end" dominantBaseline="central" className="wh-sumbu">
                  {t}
                </text>
              )}
            </g>
          ))}
          {bulanAwal.map(({ h, k }) => (
            <text key={h.tanggal} x={x(k)} y={T - 8} textAnchor="start" className="wh-sumbu">
              {BULAN[Number(h.tanggal.slice(5, 7)) - 1]}
              {h.tanggal.slice(5, 7) === "01" || k === 0 ? ` ${h.tanggal.slice(2, 4)}` : ""}
            </text>
          ))}
          {idxPilih >= 0 && <rect x={x(Math.max(0, idxPilih - 6))} y={atas - 4} width={Math.max(4, x(idxPilih) - x(Math.max(0, idxPilih - 6)))} height={tinggi + 8} rx="3" className="wh-kolom-sorot" />}
          {ruas.map((d, j) => (
            <path key={j} d={d} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinejoin="round" />
          ))}
          {titik.map((t) => (
            <circle
              key={t.k}
              cx={x(t.k)}
              cy={y(t.v)}
              r={sorot === t.k ? 5 : 3}
              fill={PITA_IKB[t.h.ikb?.pita ?? "normal"]!.warna}
              stroke="#121014"
              strokeWidth="1.5"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setSorot(t.k)}
              onClick={() => lompatKe(t.h.tanggal)}
            />
          ))}
        </svg>
        {s && (
          <div className="wh-tip" style={{ left: `${(x(s.k) / L) * 100}%`, top: `${(y(s.v) / T) * 100}%` }} role="tooltip">
            <b>{fmtTanggalPanjang(s.h.tanggal)}</b>
            <span>
              IKB {angka(s.v, 1)} · {PITA_IKB[s.h.ikb?.pita ?? "normal"]!.label}
            </span>
            <span>klik untuk membuka minggu ini</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Label istilah kamus. Tooltip hanya memuat nama, kode, satuan, dan pengingat ke Kamus di About (tanpa nama perangkat). */
function Istilah({ kode, children }: { kode: string; children?: ReactNode }) {
  const k = KAMUS_PER_KODE.get(kode);
  if (!k) return <>{children ?? kode}</>;
  return (
    <abbr className="istilah" title={`${k.nama} (${k.kode}, ${k.unit})\nDefinisi dan kaveat lengkap: tab About › Kamus Istilah.`}>
      {children ?? k.nama}
    </abbr>
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

const VITAL: { kode: string; d: number; naikBaik: boolean | null }[] = [
  { kode: "HRV_M", d: 0, naikBaik: true },
  { kode: "RHR", d: 0, naikBaik: false },
  { kode: "LNP", d: 1, naikBaik: null },
  { kode: "SPO2_M", d: 1, naikBaik: null },
  { kode: "EKT", d: 0, naikBaik: null },
  { kode: "ET", d: 0, naikBaik: true },
];

export function PanelAtlet({ hasil }: { hasil: HasilSusun }) {
  // Data setahun penuh (hari bolong tetap ada). Layar menampilkan jendela 7 hari yang bisa digeser.
  const semua = hasil.hari;
  const berdata = semua.filter(adaData);
  const [akhir, setAkhir] = useState(semua.length - 1);
  const ujung = Math.min(akhir, semua.length - 1);
  // Satu-satunya hari berdata tampil sendiri, tanpa 6 hari kosong.
  const hari = berdata.length > 1 ? semua.slice(Math.max(0, ujung - 6), ujung + 1) : berdata;
  const [pilih, setPilih] = useState(hari.length - 1);
  const i = Math.min(pilih, hari.length - 1);
  /** Geser jendela agar `tanggal` menjadi hari terakhir yang tampil, lalu pilih hari itu. */
  const lompatKe = (tanggal: string) => {
    const idx = semua.findIndex((x) => x.tanggal === tanggal);
    if (idx < 0) return;
    setAkhir(Math.max(idx, Math.min(6, semua.length - 1)));
    setPilih(Math.min(idx, 6));
  };
  const geser = (langkah: number) => {
    setAkhir((a) => Math.max(Math.min(6, semua.length - 1), Math.min(semua.length - 1, Math.min(a, semua.length - 1) + langkah)));
    setPilih(6);
  };
  const h = hari[i];
  if (!h) return null;
  const lain = hari.filter((_, k) => k !== i);
  const banyakHari = berdata.length > 1;
  const { hari: namaHari, tgl } = tglPendek(h.tanggal);
  const sumbu = (x: HariTampil) => tglPendek(x.tanggal);
  const adaDataHariIni = adaData(h);

  const bpr = kategori(h, "BPR");
  const bprInfo = BPR_INFO[bpr?.nilai ?? "data_kurang"] ?? BPR_INFO.data_kurang!;
  const rinciBpr = (bpr?.field.rincian ?? {}) as Record<string, { z: number; buruk: boolean }>;

  // Tiga dial dengan slot tetap; isinya diambil dari metrik pertama yang tersedia, tanpa menyebut sumbernya.
  const tidur = pertama(h, ["SKT"]);
  const pulih = pertama(h, ["SPV", "BB"]);
  const beban = pertama(h, ["BFH", "TOH"]);
  const pulihPita = pulih ? pita(pulih.nilai) : null;
  const dtt = nilai(h, "DTT");
  const ttt = nilai(h, "TTT");
  const dttt = nilai(h, "DTTT");
  const catTidur = (Object.values(h.catatan) as NonNullable<HariTampil["catatan"][keyof HariTampil["catatan"]]>[]).find((c) => c.jendela_tidur);

  const adaPulih = hari.some((x) => pertama(x, ["SPV", "BB"]));
  const adaDtt = hari.some((x) => nilai(x, "DTT"));
  const adaIkb = hari.some((x) => x.ikb?.status === "ok");
  const maksTidurJam = Math.max(10, Math.ceil(Math.max(...hari.map((x) => TAHAP.reduce((a, g) => a + (nilai(x, g.kode)?.nilai ?? 0), 0) / 60))));

  const ikb = h.ikb;
  // IKB terakhir yang bisa dihitung sampai hari terpilih (untuk hari yang datanya belum cukup).
  const idxGlobal = semua.findIndex((x) => x.tanggal === h.tanggal);
  const ikbTerakhir = [...semua.slice(0, idxGlobal + 1)].reverse().find((x) => x.ikb?.status === "ok" && x.ikb.nilai !== null) ?? null;
  const ibms7 = hasil.ibms7[0] ?? null;

  return (
    <section className="wh" aria-label="Data atlet">
      <header className="wh-kepala">
        <div className="wh-merek">
          <span className="wh-label">
            {namaHari}, {tgl} {new Date(`${h.tanggal}T12:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
            {!adaDataHariIni && " · tidak ada data hari ini"}
          </span>
        </div>
        {adaDataHariIni && (
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
        <div className="wh-nav-minggu">
          <button className="btn kecil" onClick={() => geser(-7)} disabled={ujung <= 6}>
            ‹ 7 hari sebelumnya
          </button>
          <span className="wh-label">
            {fmtRentang(hari[0]!.tanggal, hari[hari.length - 1]!.tanggal)} · data {berdata.length} hari dalam {semua.length} hari
          </span>
          <span className="row">
            <button className="btn kecil" onClick={() => geser(7)} disabled={ujung >= semua.length - 1}>
              7 hari berikutnya ›
            </button>
            {ujung < semua.length - 1 && (
              <button className="btn kecil" onClick={() => lompatKe(semua[semua.length - 1]!.tanggal)}>
                Terbaru
              </button>
            )}
          </span>
        </div>
      )}

      {banyakHari && (
        <nav className="wh-hari" aria-label="Pilih hari" style={{ gridTemplateColumns: `repeat(${hari.length}, minmax(0, 1fr))` }}>
          {hari.map((x, k) => {
            const d = sumbu(x);
            const p = pertama(x, ["SPV", "BB"]);
            return (
              <button key={x.tanggal} className={k === i ? "aktif" : ""} onClick={() => setPilih(k)} aria-pressed={k === i}>
                <span>{d.hari}</span>
                <b>{d.tgl}</b>
                <i style={{ background: p ? pita(p.nilai).warna : adaData(x) ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.15)" }} aria-hidden="true" />
              </button>
            );
          })}
        </nav>
      )}

      <div className="wh-dial-baris">
        <Dial
          judul={<Istilah kode="SKT">Kualitas Tidur</Istilah>}
          nilai={tidur?.nilai ?? null}
          maks={100}
          warna={WARNA.tidur}
          teks={tidur ? angka(tidur.nilai) : "–"}
          bawah={tidur ? "skor 0–100" : "Tidak ada data"}
        />
        <Dial
          judul={<Istilah kode={pulih?.kode ?? "SPV"}>Pemulihan</Istilah>}
          nilai={pulih?.nilai ?? null}
          maks={100}
          warna={pulihPita?.warna ?? WARNA.netral}
          teks={pulih ? angka(pulih.nilai) : "–"}
          ukuran={200}
          bawah={
            pulihPita ? (
              <span className="wh-status">
                <span style={{ color: pulihPita.warna }} aria-hidden="true">
                  {pulihPita.ikon}
                </span>{" "}
                {pulihPita.label} · {pulihPita.arti}
              </span>
            ) : (
              "Tidak ada data"
            )
          }
        />
        <Dial
          judul={<Istilah kode={beban?.kode ?? "BFH"}>Beban Harian</Istilah>}
          nilai={beban?.nilai ?? null}
          maks={beban?.kode === "TOH" ? 100 : 21}
          warna={beban?.kode === "TOH" ? WARNA.stres : WARNA.beban}
          teks={beban ? angka(beban.nilai, beban.kode === "TOH" ? 0 : 1) : "–"}
          bawah={beban ? `skala 0–${beban.kode === "TOH" ? 100 : 21}` : "Tidak ada data"}
        />
      </div>

      {/* ───────── Indeks Esports: nilai + cara hitung ───────── */}
      <div className="wh-indeks">
        <div className="wh-kartu">
          <div className="wh-grafik-kepala">
            <h3>Indeks Kesiapan Bermain (IKB)</h3>
          </div>
          {ikb && ikb.status === "ok" && ikb.nilai !== null ? (
            <>
              <div className="wh-ikb-atas">
                <b className="wh-ikb-angka" style={{ color: PITA_IKB[ikb.pita ?? "normal"]!.warna }}>
                  {angka(ikb.nilai, 1)}
                </b>
                <span>
                  <span style={{ color: PITA_IKB[ikb.pita ?? "normal"]!.warna }} aria-hidden="true">
                    {PITA_IKB[ikb.pita ?? "normal"]!.ikon}
                  </span>{" "}
                  <b>{PITA_IKB[ikb.pita ?? "normal"]!.label}</b>
                  <br />
                  <small className="wh-label">
                    {PITA_IKB[ikb.pita ?? "normal"]!.arti} · {ikb.n_komponen} dari {Object.keys(PARAM_IND.BOBOT).length} komponen
                  </small>
                </span>
              </div>
              <div className="table-wrap wh-tabel-ikb">
                <table>
                  <thead>
                    <tr>
                      <th>Komponen</th>
                      <th>z</th>
                      <th>Bobot w</th>
                      <th>Arah s</th>
                      <th>w × s × z</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(ikb.komponen).map(([k, c]) => (
                      <tr key={k}>
                        <td>{KOMPONEN_IKB[k] ?? k}</td>
                        <td>{c.z !== null ? angka(c.z, 2) : "–"}</td>
                        <td>{angka(c.w, 2)}</td>
                        <td>{c.s > 0 ? "+1" : "−1"}</td>
                        <td>{c.kontribusi !== null ? angka(c.kontribusi, 3) : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="wh-rumus">
                IKB = 50 + 10 × Σ(w·s·z) ÷ Σw = 50 + 10 × {angka(Object.values(ikb.komponen).reduce((a, c) => a + (c.kontribusi ?? 0), 0), 3)} ÷{" "}
                {angka(Object.values(ikb.komponen).reduce((a, c) => a + c.w, 0), 2)} = <b>{angka(ikb.nilai, 1)}</b>
              </p>
            </>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <p className="wh-kosong">
                Hari ini belum bisa dihitung: IKB butuh minimal {PARAM_IND.MIN_KOMP_IKB} komponen yang punya basis ≥{PARAM_IND.MIN_BASIS} hari dari{" "}
                {PARAM_IND.JENDELA_BASIS} hari sebelumnya{ikb ? ` (tersedia ${ikb.n_komponen})` : ""}.
              </p>
              {ikbTerakhir?.ikb && (
                <div className="wh-ikb-atas">
                  <b className="wh-ikb-angka" style={{ color: PITA_IKB[ikbTerakhir.ikb.pita ?? "normal"]!.warna }}>
                    {angka(ikbTerakhir.ikb.nilai!, 1)}
                  </b>
                  <span>
                    <b>IKB terakhir terhitung</b> · {PITA_IKB[ikbTerakhir.ikb.pita ?? "normal"]!.label}
                    <br />
                    <small className="wh-label">{fmtTanggalPanjang(ikbTerakhir.tanggal)}</small>
                    <br />
                    <button className="btn kecil" onClick={() => lompatKe(ikbTerakhir.tanggal)}>
                      Lihat hari itu
                    </button>
                  </span>
                </div>
              )}
            </div>
          )}
          <details className="wh-cara">
            <summary>Cara menghitung IKB</summary>
            <ol>
              <li>
                Tiap komponen diubah menjadi <b>z-score terhadap diri sendiri</b>: z = (nilai hari ini − rata-rata {PARAM_IND.JENDELA_BASIS} hari sebelumnya) ÷ simpangan baku.
                Komponen yang basisnya &lt; {PARAM_IND.MIN_BASIS} hari dikeluarkan.
              </li>
              <li>z dibatasi ke ±{PARAM_IND.BATAS_Z} agar satu hari ekstrem tidak mendominasi.</li>
              <li>
                Setiap komponen dikali bobot <b>w</b> dan arah <b>s</b> (+1 bila nilai naik itu baik, −1 bila buruk):{" "}
                {Object.entries(PARAM_IND.BOBOT)
                  .map(([k, b]) => `${KOMPONEN_IKB[k] ?? k} (w ${b.w}, s ${b.s > 0 ? "+1" : "−1"})`)
                  .join("; ")}
                .
              </li>
              <li>
                IKB = 50 + 10 × Σ(w·s·z) ÷ Σw, dengan Σ hanya atas komponen yang tersedia (minimal {PARAM_IND.MIN_KOMP_IKB}). Skor 50 berarti sama dengan kebiasaan atlet sendiri.
              </li>
              <li>
                Pita: ≥ {PARAM_IND.PITA_NORMAL} <b>Normal</b>; {PARAM_IND.PITA_PERHATIAN}–{PARAM_IND.PITA_NORMAL - 0.01} <b>Perhatian</b>; &lt; {PARAM_IND.PITA_PERHATIAN} <b>Rendah</b>.
              </li>
              <li>Keteraturan = −|DTTT| ÷ SD(TTT {PARAM_IND.JENDELA_BASIS} hari): makin menyimpang jadwal tidurnya dari biasanya, makin rendah. Beban sesi kemarin memakai BSP kemarin terhadap sesi-sesi sebelumnya.</li>
            </ol>
            <p className="wh-label">Penanda kesiapan relatif terhadap diri sendiri, bukan ukuran kognisi, dan bukan alat seleksi.</p>
          </details>
        </div>

        <div className="wh-kartu">
          <div className="wh-grafik-kepala">
            <h3>Indeks Beban Mental Sesi (IBMS)</h3>
            <span className="wh-label">per sesi · rata-rata {PARAM_IND.HARI_IBMS} hari</span>
          </div>
          {ibms7 && ibms7.nilai !== null ? (
            <div className="wh-ikb-atas">
              <b className="wh-ikb-angka">{angka(ibms7.nilai, 1)}</b>
              <span>
                <b>Rata-rata {PARAM_IND.HARI_IBMS} hari</b>
                <br />
                <small className="wh-label">
                  {ibms7.n_sesi} sesi sampai {ibms7.sampai_tanggal}
                  {ibms7.z_terhadap_riwayat !== null ? ` · z ${angka(ibms7.z_terhadap_riwayat, 2)} terhadap riwayat` : ""}
                </small>
              </span>
            </div>
          ) : (
            <p className="wh-kosong">Belum ada log sesi (jam mulai/selesai, sRPE, kelelahan mental) untuk atlet ini, jadi IBMS belum bisa dihitung.</p>
          )}
          <details className="wh-cara">
            <summary>Cara menghitung IBMS</summary>
            <ol>
              <li>
                Tiap sesi punya tiga komponen: <Istilah kode="BSP" /> (sRPE × menit), <Istilah kode="KMP" />, dan <Istilah kode="ROS" />.
              </li>
              <li>
                Masing-masing diubah ke z-score terhadap sesi-sesi <b>sebelumnya</b> milik atlet yang sama ({PARAM_IND.JENDELA_SESI_HARI} hari terakhir, minimal {PARAM_IND.MIN_SESI} sesi), dibatasi ±{PARAM_IND.BATAS_Z}.
              </li>
              <li>
                IBMS sesi = 50 + 10 × rata-rata z komponen yang tersedia (minimal {PARAM_IND.MIN_KOMP_IBMS}). Contoh: z BSP 1,0, KMP 0,5, ROS 1,5 → 50 + 10 × 1,0 = 60; tanpa KMP → 62,5.
              </li>
              <li>
                IBMS {PARAM_IND.HARI_IBMS} hari = rata-rata IBMS sesi dalam {PARAM_IND.HARI_IBMS} hari terakhir; z-nya dibandingkan dengan rata-rata {PARAM_IND.HARI_IBMS} hari terdahulu (minimal {PARAM_IND.MIN_RATA7}).
              </li>
            </ol>
          </details>
        </div>
      </div>

      {berdata.length > 1 && semua.some((x) => x.ikb?.status === "ok") && (
        <TrenTahun semua={semua} pilihTanggal={h.tanggal} lompatKe={lompatKe} />
      )}

      <div className="wh-vital">
        {VITAL.map((v) => {
          const n = nilai(h, v.kode);
          if (!n && !hari.some((x) => nilai(x, v.kode))) return null;
          const k = KAMUS_PER_KODE.get(v.kode)!;
          const r = n ? rata(lain.map((x) => nilai(x, v.kode)?.nilai)) : null;
          const selisih = n && r != null ? n.nilai - r : null;
          const arah = selisih == null || Math.abs(selisih) < 10 ** -v.d ? 0 : selisih > 0 ? 1 : -1;
          const baik = v.naikBaik === null || arah === 0 ? null : (arah > 0) === v.naikBaik;
          return (
            <div key={v.kode} className="wh-vital-item">
              <span className="wh-label">
                <Istilah kode={v.kode} />
              </span>
              <b>
                {n ? angka(n.nilai, v.d) : "–"}
                {n && <small> {k.unit === "napas/menit" ? "/mnt" : k.unit}</small>}
              </b>
              {banyakHari && selisih != null && (
                <span className="wh-vital-kaki">
                  <span className={`wh-delta ${baik === null ? "" : baik ? "baik" : "buruk"}`}>
                    {`${arah > 0 ? "↑" : arah < 0 ? "↓" : "="} ${angka(Math.abs(selisih), v.d)} vs rata-rata`}
                  </span>
                </span>
              )}
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

      {banyakHari && (adaIkb || adaPulih || adaDtt) && (
        <div className="wh-grid">
          {adaIkb && (
            <GrafikKolom
              judul="Kesiapan Bermain 7 hari"
              ringkas="Indeks Kesiapan Bermain 7 hari"
              maks={100}
              tanda={[0, 50, 100]}
              pilih={i}
              ubah={setPilih}
              legenda={
                <Legenda
                  isi={[
                    { kunci: "n", nama: `Normal ≥${PARAM_IND.PITA_NORMAL}`, warna: WARNA.hijau },
                    { kunci: "p", nama: `Perhatian ≥${PARAM_IND.PITA_PERHATIAN}`, warna: WARNA.kuning },
                    { kunci: "r", nama: "Rendah", warna: WARNA.merah },
                  ]}
                />
              }
              data={hari.map((x) => {
                const k = x.ikb?.status === "ok" && x.ikb.nilai !== null ? x.ikb : null;
                return {
                  label: sumbu(x).hari,
                  sub: String(sumbu(x).tgl),
                  segmen: k ? [{ nilai: k.nilai!, warna: PITA_IKB[k.pita ?? "normal"]!.warna }] : [],
                  teks: k ? angka(k.nilai!) : "–",
                  tip: k ? [`IKB ${angka(k.nilai!, 1)} · ${PITA_IKB[k.pita ?? "normal"]!.label}`, `${k.n_komponen} komponen`] : ["Belum cukup data"],
                };
              })}
            />
          )}
          {adaPulih && (
            <GrafikKolom
              judul={
                <>
                  <Istilah kode="SPV">Pemulihan</Istilah> 7 hari
                </>
              }
              ringkas="Skor pemulihan 7 hari"
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
                const s = pertama(x, ["SPV", "BB"]);
                const hrv = nilai(x, "HRV_M");
                return {
                  label: sumbu(x).hari,
                  sub: String(sumbu(x).tgl),
                  segmen: s ? [{ nilai: s.nilai, warna: pita(s.nilai).warna }] : [],
                  teks: s ? angka(s.nilai) : "–",
                  tip: s ? [`Pemulihan ${angka(s.nilai)} · ${pita(s.nilai).label}`, `HRV Malam ${hrv ? angka(hrv.nilai) : "–"} ms`] : ["Tidak ada data"],
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
              {catTidur?.jendela_tidur && (
                <span className="wh-label">
                  {jamLokal(catTidur.jendela_tidur.mulai_ms, catTidur.tz_offset_menit)} – {jamLokal(catTidur.jendela_tidur.selesai_ms, catTidur.tz_offset_menit)}
                </span>
              )}
            </div>
            <BarTumpuk
              label="Tahapan tidur"
              isi={TAHAP.map((g) => ({ kunci: g.kode, nama: <Istilah kode={g.kode}>{g.nama}</Istilah>, warna: g.warna, menit: nilai(h, g.kode)?.nilai ?? 0 }))}
            />
            <div className="wh-mini">
              <Mini label={<Istilah kode="DTT">Durasi tidur</Istilah>} nilai={jm(dtt.nilai)} />
              {nilai(h, "WTT") && <Mini label={<Istilah kode="WTT">Di tempat tidur</Istilah>} nilai={jm(nilai(h, "WTT")!.nilai)} />}
              {nilai(h, "ET") && <Mini label={<Istilah kode="ET">Efisiensi</Istilah>} nilai={`${angka(nilai(h, "ET")!.nilai)}%`} />}
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
            </div>
            <BarTumpuk
              label="Durasi per tingkat stres"
              isi={TINGKAT_STRES.map((g) => ({ kunci: g.kunci, nama: g.nama, warna: g.warna, menit: h.rinciGarmin!.stres![g.kunci] ?? 0 }))}
            />
          </div>
        )}

        {h.rinciGarmin?.bb && nilai(h, "BB") && (
          <div className="wh-kartu">
            <div className="wh-grafik-kepala">
              <h3>
                <Istilah kode="BB">Body Battery</Istilah>
              </h3>
              <span className="wh-label">skala 0–100</span>
            </div>
            <div className="wh-bb" role="img" aria-label={`Body Battery terendah ${h.rinciGarmin.bb.min ?? "–"}, tertinggi ${nilai(h, "BB")!.nilai}`}>
              {h.rinciGarmin.bb.min != null && <span style={{ left: `${h.rinciGarmin.bb.min}%`, width: `${Math.max(1, nilai(h, "BB")!.nilai - h.rinciGarmin.bb.min)}%` }} />}
            </div>
            <div className="wh-bb-sumbu">
              <span>0</span>
              <span>100</span>
            </div>
            <div className="wh-mini">
              <Mini label="Maks harian" nilai={angka(nilai(h, "BB")!.nilai)} />
              {h.rinciGarmin.bb.min != null && <Mini label="Terendah" nilai={angka(h.rinciGarmin.bb.min)} />}
              {h.rinciGarmin.bb.isi != null && <Mini label="Terisi" nilai={`+${h.rinciGarmin.bb.isi}`} />}
              {h.rinciGarmin.bb.pakai != null && <Mini label="Terpakai" nilai={`−${h.rinciGarmin.bb.pakai}`} />}
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
                const tz = Object.values(h.catatan).find((c) => c?.tz_offset_menit != null)?.tz_offset_menit ?? null;
                return (
                  <li key={k}>
                    <Dial judul="" nilai={a.strain} maks={21} warna={WARNA.beban} teks={a.strain != null ? angka(a.strain, 1) : "–"} ukuran={56} />
                    <div className="wh-latihan-isi">
                      <div className="wh-latihan-kepala">
                        <b>{(a.jenis ?? "aktivitas").replace(/[-_]/g, " ")}</b>
                        <span className="wh-label">
                          {jamLokal(a.mulai_ms, tz)} – {jamLokal(a.selesai_ms, tz)}
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
      </div>

      {banyakHari && (
        <details className="wh-tabel">
          <summary>Lihat tabel 7 hari</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hari</th>
                  <th>IKB</th>
                  {["BPR", "SPV", "HRV_M", "RHR", "BFH", "DTT", "ET", "TTT"].map((k) => (
                    <th key={k}>
                      <Istilah kode={k}>{k}</Istilah>
                    </th>
                  ))}
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
                      <td>{x.ikb?.status === "ok" && x.ikb.nilai !== null ? angka(x.ikb.nilai, 1) : "–"}</td>
                      <td>{BPR_INFO[kategori(x, "BPR")?.nilai ?? ""]?.label ?? "–"}</td>
                      <td>{f("SPV")}</td>
                      <td>{f("HRV_M")}</td>
                      <td>{f("RHR")}</td>
                      <td>{f("BFH", 1)}</td>
                      <td>{nilai(x, "DTT") ? jm(nilai(x, "DTT")!.nilai) : "–"}</td>
                      <td>{f("ET")}</td>
                      <td>{String(nilai(x, "TTT")?.field.jam_lokal ?? "–")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
