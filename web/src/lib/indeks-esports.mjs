// ============================================================================
// indeks-esports.mjs: indeks gabungan khusus esports (1 file, tanpa dependensi)
//   IKB  = Indeks Kesiapan Bermain (pagi hari, per catatan harian)
//   IBMS = Indeks Beban Mental Sesi (per sesi) + rata-rata 7 hari
// Masukan: keluaran harmonisasi() dari harmonizer.mjs (versi kamus >= 0.2.0).
// Node >= 20.  Jalankan:  node indeks-esports.mjs --contoh   (cek hitung contoh dokumen)
// Pakai di kode:  import { hitungIndeks } from './indeks-esports.mjs';
//
// STATUS: usulan, BELUM divalidasi untuk esports. Bobot dan ambang adalah titik awal.
// Indeks ini penanda kesiapan relatif terhadap diri sendiri, bukan ukuran kognisi.
// ============================================================================

export const VERSI_INDEKS = '0.1.0';

export const PARAM_IND = Object.freeze({
  JENDELA_BASIS: 28, // hari basis TTT
  MIN_BASIS: 14, // nilai minimum basis TTT
  JENDELA_SESI_HARI: 90, // riwayat sesi yang dipakai sebagai basis z
  MIN_SESI: 10, // sesi minimum per komponen sebagai basis
  MIN_KOMP_IKB: 3,
  MIN_KOMP_IBMS: 2,
  BATAS_Z: 3,
  HARI_IBMS: 7,
  MIN_RATA7: 4, // jumlah rata-rata 7 hari terdahulu agar z IBMS-7 sah
  PITA_NORMAL: 45, // IKB >= ini: normal
  PITA_PERHATIAN: 35, // IKB >= ini: perhatian; di bawahnya: rendah
  // tanda s = +1 bila nilai naik itu baik, -1 bila buruk
  BOBOT: Object.freeze({
    LNHRV: { w: 0.25, s: +1 },
    DTT: { w: 0.25, s: +1 },
    RHR: { w: 0.15, s: -1 },
    KETERATURAN: { w: 0.15, s: +1 }, // z = -|DTTT| / SD(TTT)
    BEBAN: { w: 0.20, s: -1 }, // z beban sesi kemarin
  }),
});

const HARI_MS = 86400000;
const bulat = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const rata = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { if (a.length < 2) return null; const m = rata(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const klem = (z, b) => Math.max(-b, Math.min(b, z));
const hari = (t) => Date.parse(`${t}T00:00:00Z`) / HARI_MS; // tanggal 'YYYY-MM-DD' -> nomor hari
const zDari = (x, basis, min) => {
  if (!Number.isFinite(x) || basis.length < min) return null;
  const s = sd(basis);
  return s > 0 ? (x - rata(basis)) / s : null;
};

// ---------- inti hitung (murni, mudah diuji) ----------
// komp: { LNHRV, DTT, RHR, KETERATURAN, BEBAN } berisi z (angka) atau null/undefined bila tidak ada.
export function ikbDariKomponen(komp, p = PARAM_IND) {
  let jumlah = 0; let bobot = 0; const rinci = {};
  for (const [k, { w, s }] of Object.entries(p.BOBOT)) {
    const z = komp[k];
    if (!Number.isFinite(z)) continue;
    const zk = klem(z, p.BATAS_Z);
    jumlah += w * s * zk; bobot += w;
    rinci[k] = { z: bulat(z), z_dipakai: bulat(zk), w, s, kontribusi: bulat(w * s * zk, 3) };
  }
  const n = Object.keys(rinci).length;
  if (n < p.MIN_KOMP_IKB) return { nilai: null, status: 'data_kurang', n_komponen: n, komponen: rinci };
  const nilai = 50 + 10 * (jumlah / bobot);
  const pita = nilai >= p.PITA_NORMAL ? 'normal' : nilai >= p.PITA_PERHATIAN ? 'perhatian' : 'rendah';
  return { nilai: bulat(nilai), status: 'ok', pita, n_komponen: n, komponen: rinci };
}

// z: { BSP, KMP, ROS } berisi z (angka) atau null.
export function ibmsDariKomponen(z, p = PARAM_IND) {
  const ada = Object.entries(z).filter(([, v]) => Number.isFinite(v));
  const rinci = Object.fromEntries(ada.map(([k, v]) => [k, { z: bulat(v), z_dipakai: bulat(klem(v, p.BATAS_Z)) }]));
  if (ada.length < p.MIN_KOMP_IBMS) return { nilai: null, status: 'data_kurang', n_komponen: ada.length, komponen: rinci };
  const nilai = 50 + 10 * rata(ada.map(([, v]) => klem(v, p.BATAS_Z)));
  return { nilai: bulat(nilai), status: 'ok', n_komponen: ada.length, komponen: rinci };
}

// ---------- dari keluaran harmonizer ----------
export function hitungIndeks(hasil, p = PARAM_IND) {
  const { catatan = [], sesi = [], reaksi = [] } = hasil;
  const peringatan = [];

  // --- IBMS per sesi: z terhadap sesi-sesi SEBELUMNYA milik atlet yang sama ---
  const nilaiKomp = { BSP: (s) => s.BSP?.nilai, KMP: (s) => s.KMP?.nilai, ROS: (s) => s.ROS?.nilai };
  const sesiUrut = [...sesi].sort((a, b) => a.mulai_ms - b.mulai_ms);
  const ibms = sesiUrut.map((s) => {
    const sebelum = sesiUrut.filter((x) => x.athlete_id === s.athlete_id && x.mulai_ms < s.mulai_ms && s.mulai_ms - x.mulai_ms <= p.JENDELA_SESI_HARI * HARI_MS);
    const z = {};
    for (const [k, f] of Object.entries(nilaiKomp)) {
      const v = f(s);
      z[k] = Number.isFinite(v) ? zDari(v, sebelum.map(f).filter(Number.isFinite), p.MIN_SESI) : null;
    }
    return { athlete_id: s.athlete_id, id: s.id, tanggal: s.tanggal, jenis: s.jenis, ...ibmsDariKomponen(z, p) };
  });

  // --- IBMS 7 hari (nilai terakhir per atlet) ---
  const ibms7 = [];
  for (const a of new Set(ibms.map((x) => x.athlete_id))) {
    const ok = ibms.filter((x) => x.athlete_id === a && x.nilai !== null);
    if (!ok.length) continue;
    const tgl = [...new Set(ok.map((x) => x.tanggal))].sort();
    const akhir = tgl.at(-1);
    const rata7 = (d) => { const v = ok.filter((x) => hari(d) - hari(x.tanggal) >= 0 && hari(d) - hari(x.tanggal) < p.HARI_IBMS).map((x) => x.nilai); return v.length ? rata(v) : null; };
    const nilai = rata7(akhir);
    const riwayat = tgl.filter((d) => hari(akhir) - hari(d) >= p.HARI_IBMS).map(rata7).filter(Number.isFinite);
    const z = riwayat.length >= p.MIN_RATA7 ? zDari(nilai, riwayat, p.MIN_RATA7) : null;
    ibms7.push({ athlete_id: a, sampai_tanggal: akhir, nilai: bulat(nilai), n_sesi: ok.filter((x) => hari(akhir) - hari(x.tanggal) < p.HARI_IBMS).length, z_terhadap_riwayat: bulat(z), n_riwayat: riwayat.length });
  }

  // --- IKB per catatan harian ---
  const byKey = new Map();
  for (const c of catatan) { const k = `${c.athlete_id}|${c.sumber}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(c); }
  const ikb = catatan.map((c) => {
    const arr = byKey.get(`${c.athlete_id}|${c.sumber}`);
    const komp = { LNHRV: c.relatif?.LNHRV?.z, DTT: c.relatif?.DTT?.z, RHR: c.relatif?.RHR?.z };

    // keteraturan: -|DTTT| / SD(TTT 28 hari sebelumnya)
    const dtttNilai = c.metrik.DTTT?.nilai;
    const tttBasis = arr.filter((x) => { const d = hari(c.tanggal) - hari(x.tanggal); return d >= 1 && d <= p.JENDELA_BASIS; }).map((x) => x.metrik.TTT?.nilai).filter(Number.isFinite);
    const sdTtt = tttBasis.length >= p.MIN_BASIS ? sd(tttBasis) : null;
    komp.KETERATURAN = Number.isFinite(dtttNilai) && sdTtt > 0 ? -Math.abs(dtttNilai) / sdTtt : null;

    // beban kemarin: rata-rata BSP sesi kemarin terhadap BSP sesi-sesi sebelumnya (tanpa sesi kemarin = komponen dikeluarkan)
    const kemarin = sesi.filter((s) => s.athlete_id === c.athlete_id && hari(c.tanggal) - hari(s.tanggal) === 1 && Number.isFinite(s.BSP?.nilai));
    if (kemarin.length) {
      const basis = sesi.filter((s) => s.athlete_id === c.athlete_id && hari(c.tanggal) - hari(s.tanggal) >= 2 && hari(c.tanggal) - hari(s.tanggal) <= p.JENDELA_SESI_HARI && Number.isFinite(s.BSP?.nilai)).map((s) => s.BSP.nilai);
      komp.BEBAN = zDari(rata(kemarin.map((s) => s.BSP.nilai)), basis, p.MIN_SESI);
    } else komp.BEBAN = null;

    const r = reaksi.find((x) => x.athlete_id === c.athlete_id && x.tanggal === c.tanggal);
    return {
      athlete_id: c.athlete_id, tanggal: c.tanggal, sumber: c.sumber, ...ikbDariKomponen(komp, p),
      reaksi: r ? { id: r.id, ms: r.WRK.nilai, z: r.z?.z ?? null, status: r.status } : null, // untuk uji validasi IKB vs reaksi
    };
  });

  return { versi: { indeks: VERSI_INDEKS, param: p }, ikb, ibms, ibms7, peringatan };
}

export default hitungIndeks;

// ---------- CLI: cek hitung contoh yang ada di dokumen spesifikasi ----------
// Hanya di Node (CLI). Di browser blok ini dilewati, jadi `process` dan `node:url` tidak disentuh.
const diNode = typeof globalThis.process !== 'undefined' && Array.isArray(globalThis.process.argv);
if (diNode) import('node:url').then(({ fileURLToPath }) => { if (process.argv[1] === fileURLToPath(import.meta.url)) jalankanCli(); });

function jalankanCli() {
  if (process.argv[2] === '--contoh') {
    const a = ikbDariKomponen({ LNHRV: -0.8, DTT: -1.2, RHR: 0.5, KETERATURAN: -2.0, BEBAN: 0.6 });
    console.log('IKB contoh (harapan 40.05):', a.nilai, a.pita);
    const b = ibmsDariKomponen({ BSP: 1.0, KMP: 0.5, ROS: 1.5 });
    const c = ibmsDariKomponen({ BSP: 1.0, KMP: null, ROS: 1.5 });
    console.log('IBMS 3 komponen (harapan 60):', b.nilai, '| tanpa KMP (harapan 62.5):', c.nilai);
  } else console.log('Pakai: node indeks-esports.mjs --contoh');
}
