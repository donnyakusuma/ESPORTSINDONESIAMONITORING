// ============================================================================
// harmonizer.mjs: penyeragaman data WHOOP + Garmin untuk atlet esports (1 file, tanpa dependensi)
// Node >= 20.  Jalankan:  node harmonizer.mjs --demo     (contoh data sintetis)
//                         node harmonizer.mjs --kamus    (cetak kamus istilah)
// Pakai di kode:  import { harmonisasi } from './harmonizer.mjs';
// Nama field Garmin bertanda ASUMSI (lihat ALIAS) harus dicocokkan dengan payload nyata.
// ============================================================================
// Kamus istilah: satu-satunya tempat nama, satuan, dan definisi operasional didefinisikan.
// Pemeta (mappers) hanya boleh mengeluarkan kode yang ada di sini (diperiksa oleh field() dan oleh tes).
//
// level:
//   setara     = arti dan cara ukur sama; hanya penamaan/satuan vendor berbeda (catatan lintas perangkat tetap berlaku)
//   serupa     = tujuan sama, rumus berbeda. Nilai TIDAK boleh digabung lintas vendor.
//   satu_sisi  = hanya ada di salah satu vendor
//   baru       = istilah turunan khusus esports (usulan; belum tervalidasi)
//   input      = data masukan dari log pelatih/atlet, bukan dari perangkat

const VERSI_KAMUS = '0.1.0';

const KAMUS = [
  // ---------- A. Metrik dasar bersama ----------
  { kode: 'DTT', nama: 'Durasi Tidur Total', en: 'Total Sleep Time', unit: 'menit', level: 'setara',
    whoop: 'sleep.score.stage_summary: total_light + total_slow_wave + total_rem (milidetik -> menit)',
    garmin: 'sleeps: deepSleepDurationInSeconds + lightSleepDurationInSeconds + remSleepInSeconds (detik -> menit)',
    definisi: 'Waktu yang benar-benar tidur dalam satu periode tidur utama, tidak termasuk waktu terjaga.',
    kaveat: 'Penentuan tidur vs terjaga oleh pergelangan tangan akurat untuk waktu dan durasi, tetapi lemah untuk tahap tidur (Miller 2022).' },
  { kode: 'WTT', nama: 'Waktu di Tempat Tidur', en: 'Time in Bed', unit: 'menit', level: 'setara',
    whoop: 'sleep.score.stage_summary.total_in_bed_time_milli',
    garmin: 'sleeps.durationInSeconds (ASUMSI: sudah termasuk terjaga; contoh sumber sekunder 5400+14400+6300+900=27000)',
    definisi: 'Rentang dari mulai sampai selesai periode tidur, termasuk terjaga.',
    kaveat: 'Sisi Garmin berdasarkan contoh sumber sekunder, harus dicek dengan data nyata.' },
  { kode: 'ET', nama: 'Efisiensi Tidur', en: 'Sleep Efficiency', unit: '%', level: 'setara',
    whoop: 'dihitung ulang: DTT / WTT x 100 (nilai vendor disimpan sebagai pembanding)',
    garmin: 'dihitung: DTT / WTT x 100',
    definisi: 'Persentase waktu di tempat tidur yang dipakai untuk tidur. Dihitung dengan rumus yang sama untuk semua vendor.',
    kaveat: 'Nilai vendor tidak dipakai agar rumusnya seragam.' },
  { kode: 'TDL', nama: 'Tidur Dalam', en: 'Slow-wave (deep) sleep', unit: 'menit', level: 'setara',
    whoop: 'total_slow_wave_sleep_time_milli', garmin: 'deepSleepDurationInSeconds',
    definisi: 'Waktu pada tahap tidur gelombang lambat.', kaveat: 'Akurasi penentuan tahap rendah pada semua perangkat konsumen (Miller 2022; Schyvens 2024).' },
  { kode: 'TRM', nama: 'Tidur REM', en: 'REM sleep', unit: 'menit', level: 'setara',
    whoop: 'total_rem_sleep_time_milli', garmin: 'remSleepInSeconds',
    definisi: 'Waktu pada tahap tidur REM.', kaveat: 'Selisih REM terhadap polisomnografi paling besar pada WHOOP dalam tinjauan Schyvens 2024.' },
  { kode: 'TRG', nama: 'Tidur Ringan', en: 'Light sleep', unit: 'menit', level: 'setara',
    whoop: 'total_light_sleep_time_milli', garmin: 'lightSleepDurationInSeconds',
    definisi: 'Waktu pada tahap tidur ringan.', kaveat: 'Lihat TDL.' },
  { kode: 'TJG', nama: 'Terjaga dalam Tidur', en: 'Wake after sleep onset (awake time)', unit: 'menit', level: 'setara',
    whoop: 'total_awake_time_milli', garmin: 'awakeDurationInSeconds',
    definisi: 'Total waktu terjaga di dalam periode tidur.', kaveat: 'Bukan WASO klinis murni; bergantung algoritma vendor.' },
  { kode: 'HRV_M', nama: 'HRV Malam (RMSSD)', en: 'Overnight HRV (RMSSD)', unit: 'ms', level: 'setara',
    whoop: 'recovery.score.hrv_rmssd_milli (nilai sudah dalam milidetik)',
    garmin: 'hrv: lastNightAvg (alias hrvSummary.lastNightAvg)',
    definisi: 'RMSSD interval denyut malam hari. Satuan sama (ms), jendela hitung berbeda: WHOOP condong ke tidur gelombang lambat, Garmin rata-rata jendela 5 menit semalam.',
    kaveat: 'Boleh dibandingkan dalam satu atlet pada satu vendor. Jangan digabung lintas vendor tanpa basis per perangkat (Dial 2025).' },
  { kode: 'LNHRV', nama: 'ln HRV Malam', en: 'ln(RMSSD)', unit: 'ln(ms)', level: 'setara',
    whoop: 'dihitung: ln(HRV_M)', garmin: 'dihitung: ln(HRV_M)',
    definisi: 'Logaritma natural RMSSD malam; dipakai untuk analisis tren karena distribusi lebih simetris (Plews 2013).',
    kaveat: 'Turunan; mengikuti kaveat HRV_M.' },
  { kode: 'RHR', nama: 'Detak Jantung Istirahat', en: 'Resting heart rate', unit: 'bpm', level: 'serupa',
    whoop: 'recovery.score.resting_heart_rate (dari periode tidur)',
    garmin: 'dailies.restingHeartRateInBeatsPerMinute (rata-rata saat istirahat dalam periode pemantauan harian, sumber: kamus data Fitabase)',
    definisi: 'Detak jantung saat istirahat. Jendela ukur berbeda: WHOOP malam tidur, Garmin harian. Field jendela mencatat asalnya.',
    kaveat: 'Dibandingkan hanya terhadap basis diri sendiri pada vendor yang sama. Garmin dikeluarkan dari analisis RHR pada Dial 2025 karena inkonsistensi metodologis.' },
  { kode: 'LNP', nama: 'Laju Napas Malam', en: 'Respiratory rate (sleep)', unit: 'napas/menit', level: 'setara',
    whoop: 'sleep.score.respiratory_rate', garmin: 'sleeps.timeOffsetSleepRespiration (rata-rata nilai; nama field belum terverifikasi)',
    definisi: 'Rata-rata laju napas selama periode tidur.', kaveat: 'Sisi Garmin belum terverifikasi.' },
  { kode: 'SPO2_M', nama: 'Saturasi Oksigen Malam', en: 'Overnight SpO2', unit: '%', level: 'setara',
    whoop: 'recovery.score.spo2_percentage', garmin: 'sleeps.timeOffsetSpo2Values (rata-rata nilai)',
    definisi: 'Rata-rata saturasi oksigen darah selama tidur (Garmin: Pulse Ox).', kaveat: 'Bukan alat medis.' },
  { kode: 'EKT', nama: 'Energi Total Harian', en: 'Total energy expenditure', unit: 'kkal', level: 'setara',
    whoop: 'cycle.score.kilojoule x 0,239006 (1 kkal = 4,184 kJ)',
    garmin: 'dailies: activeKilocalories + bmrKilocalories (hanya bila keduanya ada)',
    definisi: 'Pengeluaran energi total satu hari fisiologis, termasuk metabolisme basal.',
    kaveat: 'Garmin activeKilocalories saja BUKAN setara. Cakupan kJ WHOOP (total vs aktif) perlu dikonfirmasi dengan data nyata.' },

  // ---------- B. Skor vendor ----------
  { kode: 'SPV', nama: 'Skor Pemulihan Vendor', en: 'Vendor recovery/readiness score', unit: 'skor', level: 'serupa',
    whoop: 'recovery.score.recovery_score (0-100): HRV, RHR, tidur, laju napas',
    garmin: 'Training Readiness (0-100): belum diketahui tersedia di API, dibiarkan kosong',
    definisi: 'Skor kesiapan/pemulihan yang dihitung vendor. Rumus tertutup dan berbeda.', kaveat: 'Jangan digabung atau dirata-rata lintas vendor.' },
  { kode: 'BFH', nama: 'Beban Fisiologis Harian Vendor', en: 'Vendor day load', unit: 'skor', level: 'serupa',
    whoop: 'cycle.score.strain (0-21, non-linear)', garmin: 'Acute Load (jumlah EPOC berbobot): belum terpetakan',
    definisi: 'Skor beban kardiovaskular harian vendor.', kaveat: 'Skala berbeda. Di esports, beban berbasis detak jantung kemungkinan mengecilkan beban kognitif (hipotesis).' },
  { kode: 'SKT', nama: 'Skor Kualitas Tidur Vendor', en: 'Vendor sleep score', unit: 'skor', level: 'serupa',
    whoop: 'sleep.score.sleep_performance_percentage (0-100)', garmin: 'sleeps.overallSleepScore.value (0-100)',
    definisi: 'Skor tidur versi vendor.', kaveat: 'Rumus berbeda (WHOOP terhadap kebutuhan tidur, Garmin terhadap standar usia).' },
  { kode: 'TOH', nama: 'Tegangan Otonom Harian Vendor', en: 'Vendor stress level', unit: 'skor', level: 'serupa',
    whoop: 'tidak tersedia di API', garmin: 'dailies/stress: averageStressLevel (0-100, dari HRV)',
    definisi: 'Skor stres harian vendor berbasis HRV.', kaveat: 'Nilai negatif Garmin (tidak terukur) dianggap kosong.' },
  { kode: 'BB', nama: 'Body Battery (maks harian)', en: 'Body Battery', unit: 'skor', level: 'satu_sisi',
    whoop: 'tidak ada', garmin: 'stress: timeOffsetBodyBatteryValues (maksimum)',
    definisi: 'Estimasi cadangan energi Garmin 0-100.', kaveat: 'Hanya Garmin. Nama field belum terverifikasi.' },

  // ---------- C. Istilah esports (usulan) ----------
  { kode: 'MMH', nama: 'Muatan Main Harian', en: 'Daily play load', unit: 'menit', level: 'baru',
    whoop: 'dari log sesi', garmin: 'dari log sesi',
    definisi: 'Total menit sesi bermain/latihan yang mulai pada tanggal kalender tersebut (waktu lokal).',
    kaveat: 'Dari log, bukan dari perangkat. Durasi bermain bukan jaminan beban kognitif.' },
  { kode: 'JLT', nama: 'Jeda Layar-Tidur', en: 'Screen-to-sleep gap', unit: 'menit', level: 'baru',
    whoop: 'log sesi + awal tidur', garmin: 'log sesi + awal tidur',
    definisi: 'Menit antara akhir sesi bermain terakhir dan awal periode tidur berikutnya (maksimum 24 jam ke belakang).',
    kaveat: 'Kidcaff 2026: bermain berakhir 1-2 jam sebelum tidur berkaitan dengan kualitas tidur lebih buruk (korelasi, subjek 24 atlet).' },
  { kode: 'TTT', nama: 'Titik Tengah Tidur', en: 'Mid-sleep point', unit: 'menit sejak 12:00 hari sebelumnya', level: 'baru',
    whoop: 'dari awal dan akhir tidur', garmin: 'dari awal dan akhir tidur',
    definisi: 'Titik tengah antara awal dan akhir periode tidur utama, diukur sejak pukul 12:00 hari sebelum tanggal bangun, agar tidak terpotong tengah malam.',
    kaveat: 'Jadwal tidur atlet esports bergeser larut (Lee 2021). Hubungannya dengan kualitas tidur belum konsisten antarstudi.' },
  { kode: 'DTTT', nama: 'Deviasi Titik Tengah Tidur', en: 'Mid-sleep deviation', unit: 'menit', level: 'baru',
    whoop: 'TTT dikurangi median TTT 14 hari sebelumnya', garmin: 'idem',
    definisi: 'Selisih TTT hari ini terhadap median TTT atlet itu sendiri. Positif berarti tidur lebih larut dari biasa.',
    kaveat: 'Butuh minimal 7 nilai sebelumnya.' },
  { kode: 'ROS', nama: 'Reaktivitas Otonom Sesi', en: 'Session autonomic reactivity', unit: 'bpm', level: 'baru',
    whoop: 'HR rata-rata sesi - basis RHR 28 hari', garmin: 'idem',
    definisi: 'Selisih detak jantung rata-rata sesi bermain terhadap basis RHR atlet itu sendiri. Persentase disimpan di field persen.',
    kaveat: 'Studi esports melaporkan kenaikan HR tetapi arah RMSSD tidak konsisten (Welsh 2023; Wu 2025; Ketelhut 2024; Andre 2020). Penanda gairah umum, bukan alat ukur beban kognitif.' },
  { kode: 'BSP', nama: 'Beban Sesi Persepsi', en: 'Session-RPE load', unit: 'AU', level: 'baru',
    whoop: 'log sesi', garmin: 'log sesi',
    definisi: 'sRPE (0-10) dikali durasi sesi dalam menit (Foster 2001).',
    kaveat: 'Foster 2001 divalidasi pada latihan fisik. Belum divalidasi untuk sesi esports.' },
  { kode: 'KMP', nama: 'Kelelahan Mental Pasca-Sesi', en: 'Post-session mental fatigue', unit: 'skala 1-7', level: 'input',
    whoop: 'log sesi', garmin: 'log sesi',
    definisi: 'Penilaian diri kelelahan mental setelah sesi pada skala 1-7 (skala yang dipakai Andre 2020).',
    kaveat: 'Subjektif; satu butir.' },
  { kode: 'BPR', nama: 'Bendera Perhatian Relatif', en: 'Relative attention flag', unit: 'kategori', tipe: 'kategori', level: 'baru',
    whoop: 'lnHRV, RHR, DTT terhadap basis diri sendiri', garmin: 'idem',
    definisi: 'hijau/kuning/merah dari jumlah metrik yang menyimpang >= 1 SD ke arah buruk dari basis 28 hari atlet itu sendiri. Pemicu percakapan pelatih-atlet, bukan keputusan.',
    kaveat: 'Heuristik usulan. Belum ada validasi di esports; bukti HRV esports masih terbatas (Welsh 2023).' },
];

const INDEKS = new Map(KAMUS.map((k) => [k.kode, k]));
const LEVEL_VALID = ['setara', 'serupa', 'satu_sisi', 'baru', 'input'];


const MS_MENIT = 60000;
const VERSI_PEMETA = '0.1.0';

// Angka valid atau null. Nilai kosong tidak pernah menjadi 0.
function angka(x) {
  if (x === null || x === undefined || x === '' || typeof x === 'boolean') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function bulat(x, d = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

// "+07:00", "-0500", "Z", atau angka menit -> menit
function parseOffsetMenit(s) {
  if (s === null || s === undefined) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const str = String(s).trim();
  if (/^Z$/i.test(str)) return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(str);
  if (!m) return null;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -v : v;
}

// Tanggal lokal (YYYY-MM-DD) dan menit-dalam-hari dari epoch ms dan offset menit.
function bagianLokal(epochMs, offsetMenit) {
  const d = new Date(epochMs + offsetMenit * MS_MENIT);
  return { tanggal: d.toISOString().slice(0, 10), menitHari: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function selisihHari(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

const rata = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
function simpangan(a) {
  if (a.length < 2) return null;
  const m = rata(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

// Satu nilai bermetadata. Satuan diambil dari kamus agar tidak ada dua sumber kebenaran.
function field(kode, nilai, sumber, kualitas = 'asli', extra = {}) {
  const k = INDEKS.get(kode);
  if (!k) throw new Error(`Kode tidak ada di kamus: ${kode}`);
  const v = k.tipe === 'kategori' ? (nilai == null ? null : String(nilai)) : bulat(angka(nilai), 3);
  return { nilai: v, unit: k.unit, sumber, kualitas: v === null ? 'tidak_ada' : kualitas, ...extra };
}

function catatanBaru(athlete_id, tanggal, sumber, tz_offset_menit) {
  return {
    athlete_id, tanggal, sumber, tz_offset_menit,
    jendela_tidur: null, // { mulai_ms, selesai_ms }
    metrik: {}, relatif: {}, aktivitas: [],
    meta: { versi_pemeta: VERSI_PEMETA, id_sumber: {} },
  };
}

// Ambil nilai pertama yang ada dari beberapa jalur alias ("a.b.c").
function ambil(obj, jalur) {
  for (const j of jalur) {
    let cur = obj;
    for (const p of j.split('.')) { cur = cur == null ? undefined : cur[p]; }
    if (cur !== undefined && cur !== null) return cur;
  }
  return null;
}

// Rata-rata nilai dari objek {offset: nilai} atau larik angka; kosong -> null
function rataSeri(seri) {
  if (seri == null) return null;
  const vals = (Array.isArray(seri) ? seri : Object.values(seri)).map(angka).filter((v) => v !== null);
  return vals.length ? rata(vals) : null;
}

// Pemeta WHOOP v2 -> catatan harian seragam.
// Masukan: larik objek mentah seperti yang dikembalikan API WHOOP (lihat proyek whoop-esport).
// Aturan tanggal: tanggal catatan = tanggal LOKAL saat tidur utama berakhir (tanggal bangun).
// Recovery dan cycle dipasangkan lewat sleep_id / cycle_id milik tidur itu, bukan lewat tanggal.

const SRC_WHOOP = 'whoop';
const KJ_KE_KKAL = 1 / 4.184;
const skor = (r) => r && r.score_state === 'SCORED' && r.score;

function petakanWhoop({ athlete_id, sleeps = [], recoveries = [], cycles = [], workouts = [] }) {
  const peringatan = [];
  const hari = new Map();
  const dapat = (tanggal, tz) => {
    if (!hari.has(tanggal)) hari.set(tanggal, catatanBaru(athlete_id, tanggal, SRC_WHOOP, tz));
    return hari.get(tanggal);
  };
  const offsetDari = (rec, label) => {
    const o = parseOffsetMenit(rec.timezone_offset);
    if (o === null) { peringatan.push(`${label} ${rec.id ?? ''}: timezone_offset tidak ada, dipakai UTC`); return 0; }
    return o;
  };

  // 1. Tidur utama per tanggal (bukan tidur siang), yang terpanjang bila ada lebih dari satu.
  const utama = new Map(); // tanggal -> {s, tz, endMs, inbed}
  for (const s of sleeps) {
    if (!skor(s) || s.nap || !s.start || !s.end) continue;
    const tz = offsetDari(s, 'sleep');
    const endMs = Date.parse(s.end);
    const startMs = Date.parse(s.start);
    if (!Number.isFinite(endMs) || !Number.isFinite(startMs)) { peringatan.push(`sleep ${s.id}: waktu tidak valid`); continue; }
    const { tanggal } = bagianLokal(endMs, tz);
    const inbed = angka(s.score.stage_summary?.total_in_bed_time_milli) ?? (endMs - startMs);
    const lama = utama.get(tanggal);
    if (!lama || inbed > lama.inbed) utama.set(tanggal, { s, tz, startMs, endMs, inbed });
  }

  const tidurPerId = new Map(); // sleep.id -> catatan
  const tidurPerSiklus = new Map(); // cycle_id -> catatan
  for (const [tanggal, { s, tz, startMs, endMs }] of utama) {
    const c = dapat(tanggal, tz);
    c.jendela_tidur = { mulai_ms: startMs, selesai_ms: endMs };
    c.meta.id_sumber.sleep = s.id;
    c.meta.id_sumber.cycle = s.cycle_id ?? null;
    tidurPerId.set(s.id, c);
    if (s.cycle_id != null) tidurPerSiklus.set(s.cycle_id, c);

    const st = s.score.stage_summary || {};
    const ringan = angka(st.total_light_sleep_time_milli);
    const dalam = angka(st.total_slow_wave_sleep_time_milli);
    const rem = angka(st.total_rem_sleep_time_milli);
    const jaga = angka(st.total_awake_time_milli);
    const inbed = angka(st.total_in_bed_time_milli);
    const mnt = (ms) => (ms === null ? null : ms / MS_MENIT);

    const dtt = ringan !== null && dalam !== null && rem !== null ? (ringan + dalam + rem) / MS_MENIT : null;
    const wtt = mnt(inbed);
    c.metrik.DTT = field('DTT', dtt, SRC_WHOOP, 'turunan');
    c.metrik.WTT = field('WTT', wtt, SRC_WHOOP);
    c.metrik.ET = field('ET', dtt !== null && wtt > 0 ? (dtt / wtt) * 100 : null, SRC_WHOOP, 'turunan',
      { pembanding_vendor: angka(s.score.sleep_efficiency_percentage) });
    c.metrik.TDL = field('TDL', mnt(dalam), SRC_WHOOP);
    c.metrik.TRM = field('TRM', mnt(rem), SRC_WHOOP);
    c.metrik.TRG = field('TRG', mnt(ringan), SRC_WHOOP);
    c.metrik.TJG = field('TJG', mnt(jaga), SRC_WHOOP);
    c.metrik.LNP = field('LNP', s.score.respiratory_rate, SRC_WHOOP);
    c.metrik.SKT = field('SKT', s.score.sleep_performance_percentage, SRC_WHOOP, 'asli',
      { nama_vendor: 'Sleep Performance', skala: '0-100' });
  }

  // 2. Recovery lewat sleep_id.
  for (const r of recoveries) {
    if (!skor(r)) continue;
    const c = tidurPerId.get(r.sleep_id);
    if (!c) continue; // recovery milik tidur siang atau tidur di luar jangkauan data
    const kual = r.score.user_calibrating ? 'kalibrasi' : 'asli';
    const hrv = angka(r.score.hrv_rmssd_milli);
    c.metrik.SPV = field('SPV', r.score.recovery_score, SRC_WHOOP, kual, { nama_vendor: 'Recovery', skala: '0-100' });
    c.metrik.RHR = field('RHR', r.score.resting_heart_rate, SRC_WHOOP, kual, { jendela: 'malam_tidur' });
    c.metrik.HRV_M = field('HRV_M', hrv, SRC_WHOOP, kual, { jendela: 'sws_berbobot' });
    c.metrik.LNHRV = field('LNHRV', hrv !== null && hrv > 0 ? Math.log(hrv) : null, SRC_WHOOP, 'turunan');
    c.metrik.SPO2_M = field('SPO2_M', r.score.spo2_percentage, SRC_WHOOP, kual);
  }

  // 3. Siklus (strain, energi) lewat cycle_id tidur.
  let siklusTanpaTidur = 0;
  for (const cy of cycles) {
    if (!skor(cy)) continue;
    const c = tidurPerSiklus.get(cy.id);
    if (!c) { siklusTanpaTidur += 1; continue; }
    const kj = angka(cy.score.kilojoule);
    c.metrik.BFH = field('BFH', cy.score.strain, SRC_WHOOP, 'asli', { nama_vendor: 'Day Strain', skala: '0-21' });
    c.metrik.EKT = field('EKT', kj === null ? null : kj * KJ_KE_KKAL, SRC_WHOOP, 'turunan', { kj: kj });
  }
  if (siklusTanpaTidur) peringatan.push(`${siklusTanpaTidur} siklus WHOOP dilewati karena tidak ada tidur utama yang cocok`);

  // 4. Aktivitas (kandidat sesi esports) per tanggal lokal mulai.
  for (const w of workouts) {
    if (!skor(w) || !w.start || !w.end) continue;
    const tz = offsetDari(w, 'workout');
    const mulai = Date.parse(w.start);
    const selesai = Date.parse(w.end);
    if (!Number.isFinite(mulai) || !Number.isFinite(selesai)) continue;
    const kj = angka(w.score.kilojoule);
    dapat(bagianLokal(mulai, tz).tanggal, tz).aktivitas.push({
      sumber: SRC_WHOOP, id: w.id, jenis: w.sport_name ?? null, mulai_ms: mulai, selesai_ms: selesai,
      durasi_menit: (selesai - mulai) / MS_MENIT,
      hr_rata: angka(w.score.average_heart_rate), hr_maks: angka(w.score.max_heart_rate),
      kkal: kj === null ? null : kj * KJ_KE_KKAL, strain: angka(w.score.strain),
    });
  }

  return { catatan: [...hari.values()], peringatan };
}

// Pemeta Garmin Health API -> catatan harian seragam.
//
// PERINGATAN: dokumentasi teknis Garmin berada di balik portal pengembang. Nama field di bawah
// berasal dari sumber sekunder (kamus data Fitabase, halaman integrasi Sahha, klien tidak resmi garth).
// Setiap jalur memakai daftar alias (ALIAS) supaya mudah disesuaikan setelah dicocokkan dengan
// payload nyata dari akun Garmin Anda. Status verifikasi ada di kolom STATUS.

const SRC_GARMIN = 'garmin';

const ALIAS = {
  // [jalur alias], STATUS: 'sekunder' = terlihat di sumber sekunder; 'ASUMSI' = belum terlihat di sumber mana pun
  tidur: {
    mulaiDetik: [['startTimeInSeconds'], 'ASUMSI'],
    offsetDetik: [['startTimeOffsetInSeconds'], 'ASUMSI'],
    durasiDetik: [['durationInSeconds'], 'sekunder'],
    dalam: [['deepSleepDurationInSeconds'], 'sekunder'],
    ringan: [['lightSleepDurationInSeconds'], 'sekunder'],
    rem: [['remSleepInSeconds'], 'sekunder'],
    jaga: [['awakeDurationInSeconds'], 'sekunder'],
    tanggalVendor: [['calendarDate'], 'sekunder'],
    skor: [['overallSleepScore.value', 'overallSleepScore'], 'ASUMSI'],
    spo2: [['timeOffsetSpo2Values'], 'sekunder'],
    napas: [['timeOffsetSleepRespiration'], 'ASUMSI'],
  },
  hrv: {
    tanggal: [['calendarDate'], 'sekunder'],
    rata: [['lastNightAvg', 'hrvSummary.lastNightAvg'], 'sekunder'],
  },
  harian: {
    tanggal: [['calendarDate'], 'sekunder'],
    rhr: [['restingHeartRateInBeatsPerMinute'], 'sekunder'],
    aktif: [['activeKilocalories'], 'ASUMSI'],
    bmr: [['bmrKilocalories'], 'ASUMSI'],
    stres: [['averageStressLevel'], 'ASUMSI'],
  },
  stres: {
    tanggal: [['calendarDate'], 'ASUMSI'],
    bb: [['timeOffsetBodyBatteryValues'], 'ASUMSI'],
    stres: [['averageStressLevel'], 'ASUMSI'],
  },
  aktivitas: {
    id: [['summaryId', 'activityId'], 'ASUMSI'],
    jenis: [['activityType'], 'ASUMSI'],
    mulaiDetik: [['startTimeInSeconds'], 'ASUMSI'],
    offsetDetik: [['startTimeOffsetInSeconds'], 'ASUMSI'],
    durasiDetik: [['durationInSeconds'], 'ASUMSI'],
    hrRata: [['averageHeartRateInBeatsPerMinute'], 'sekunder'],
    hrMaks: [['maxHeartRateInBeatsPerMinute'], 'ASUMSI'],
    kkal: [['activeKilocalories'], 'ASUMSI'],
  },
};

const g = (obj, grup, kunci) => ambil(obj, ALIAS[grup][kunci][0]);

function petakanGarmin({ athlete_id, sleeps = [], hrv = [], dailies = [], stress = [], activities = [] }) {
  const peringatan = [];
  const hari = new Map();
  const dapat = (tanggal, tz) => {
    if (!hari.has(tanggal)) hari.set(tanggal, catatanBaru(athlete_id, tanggal, SRC_GARMIN, tz));
    const c = hari.get(tanggal);
    if (c.tz_offset_menit == null && tz != null) c.tz_offset_menit = tz;
    return c;
  };

  // 1. Tidur. Tanggal dihitung dari akhir tidur lokal, lalu dibandingkan dengan calendarDate vendor.
  for (const s of sleeps) {
    const mulaiS = angka(g(s, 'tidur', 'mulaiDetik'));
    const offS = angka(g(s, 'tidur', 'offsetDetik'));
    const durS = angka(g(s, 'tidur', 'durasiDetik'));
    const tanggalVendor = g(s, 'tidur', 'tanggalVendor');
    let tanggal; let tz = null; let mulaiMs = null; let selesaiMs = null;
    if (mulaiS !== null && durS !== null) {
      tz = offS === null ? 0 : offS / 60;
      if (offS === null) peringatan.push(`sleep ${tanggalVendor ?? '?'}: offset waktu lokal tidak ada, dipakai UTC`);
      mulaiMs = mulaiS * 1000;
      selesaiMs = mulaiMs + durS * 1000;
      tanggal = bagianLokal(selesaiMs, tz).tanggal;
      if (tanggalVendor && tanggalVendor !== tanggal) {
        peringatan.push(`sleep: calendarDate vendor ${tanggalVendor} berbeda dari tanggal bangun hasil hitung ${tanggal}; dipakai hasil hitung`);
      }
    } else if (tanggalVendor) {
      tanggal = String(tanggalVendor);
      peringatan.push(`sleep ${tanggal}: tidak ada waktu mulai/durasi, tanggal vendor dipakai apa adanya`);
    } else continue;

    const c = dapat(tanggal, tz);
    if (mulaiMs !== null) c.jendela_tidur = { mulai_ms: mulaiMs, selesai_ms: selesaiMs };
    c.meta.id_sumber.sleep = tanggalVendor ?? tanggal;

    const dalam = angka(g(s, 'tidur', 'dalam'));
    const ringan = angka(g(s, 'tidur', 'ringan'));
    const rem = angka(g(s, 'tidur', 'rem'));
    const jaga = angka(g(s, 'tidur', 'jaga'));
    const mnt = (d) => (d === null ? null : d / 60);
    const dtt = dalam !== null && ringan !== null && rem !== null ? (dalam + ringan + rem) / 60 : null;
    const wtt = mnt(durS);
    if (dtt !== null && wtt !== null && dtt > wtt + 0.01) {
      peringatan.push(`sleep ${tanggal}: jumlah tahap tidur melebihi durationInSeconds; asumsi WTT perlu dicek`);
    }
    c.metrik.DTT = field('DTT', dtt, SRC_GARMIN, 'turunan');
    c.metrik.WTT = field('WTT', wtt, SRC_GARMIN, 'asumsi', { catatan: 'durationInSeconds dianggap termasuk waktu terjaga' });
    c.metrik.ET = field('ET', dtt !== null && wtt > 0 ? (dtt / wtt) * 100 : null, SRC_GARMIN, 'turunan');
    c.metrik.TDL = field('TDL', mnt(dalam), SRC_GARMIN);
    c.metrik.TRM = field('TRM', mnt(rem), SRC_GARMIN);
    c.metrik.TRG = field('TRG', mnt(ringan), SRC_GARMIN);
    c.metrik.TJG = field('TJG', mnt(jaga), SRC_GARMIN);
    c.metrik.SPO2_M = field('SPO2_M', rataSeri(g(s, 'tidur', 'spo2')), SRC_GARMIN, 'turunan');
    c.metrik.LNP = field('LNP', rataSeri(g(s, 'tidur', 'napas')), SRC_GARMIN, 'turunan');
    c.metrik.SKT = field('SKT', g(s, 'tidur', 'skor'), SRC_GARMIN, 'asli', { nama_vendor: 'Sleep Score', skala: '0-100' });
  }

  // 2. HRV semalam: ditempatkan pada calendarDate vendor (diasumsikan tanggal bangun).
  for (const h of hrv) {
    const tgl = g(h, 'hrv', 'tanggal');
    const nilai = angka(g(h, 'hrv', 'rata'));
    if (!tgl) continue;
    const c = dapat(String(tgl), null);
    c.metrik.HRV_M = field('HRV_M', nilai, SRC_GARMIN, 'asumsi', { jendela: 'rata2_5menit_semalam' });
    c.metrik.LNHRV = field('LNHRV', nilai !== null && nilai > 0 ? Math.log(nilai) : null, SRC_GARMIN, 'turunan');
  }

  // 3. Ringkasan harian: RHR (jendela harian), stres, energi.
  for (const d of dailies) {
    const tgl = g(d, 'harian', 'tanggal');
    if (!tgl) continue;
    const c = dapat(String(tgl), null);
    c.metrik.RHR = field('RHR', g(d, 'harian', 'rhr'), SRC_GARMIN, 'asli', { jendela: 'harian_istirahat' });
    const aktif = angka(g(d, 'harian', 'aktif'));
    const bmr = angka(g(d, 'harian', 'bmr'));
    c.metrik.EKT = field('EKT', aktif !== null && bmr !== null ? aktif + bmr : null, SRC_GARMIN, 'turunan');
    const stres = angka(g(d, 'harian', 'stres'));
    c.metrik.TOH = field('TOH', stres !== null && stres >= 0 ? stres : null, SRC_GARMIN, 'asli', { skala: '0-100' });
  }

  // 4. Rincian stres dan Body Battery.
  for (const st of stress) {
    const tgl = g(st, 'stres', 'tanggal');
    if (!tgl) continue;
    const c = dapat(String(tgl), null);
    const bbVals = (() => {
      const raw = g(st, 'stres', 'bb');
      if (raw == null) return [];
      return (Array.isArray(raw) ? raw : Object.values(raw)).map(angka).filter((v) => v !== null);
    })();
    c.metrik.BB = field('BB', bbVals.length ? Math.max(...bbVals) : null, SRC_GARMIN, 'asumsi', { agregasi: 'maks_harian' });
    if (!c.metrik.TOH || c.metrik.TOH.nilai === null) {
      const s2 = angka(g(st, 'stres', 'stres'));
      c.metrik.TOH = field('TOH', s2 !== null && s2 >= 0 ? s2 : null, SRC_GARMIN, 'asli', { skala: '0-100' });
    }
  }

  // 5. Aktivitas.
  for (const a of activities) {
    const mulaiS = angka(g(a, 'aktivitas', 'mulaiDetik'));
    const durS = angka(g(a, 'aktivitas', 'durasiDetik'));
    if (mulaiS === null || durS === null) continue;
    const offS = angka(g(a, 'aktivitas', 'offsetDetik'));
    const tz = offS === null ? 0 : offS / 60;
    const mulai = mulaiS * 1000;
    dapat(bagianLokal(mulai, tz).tanggal, tz).aktivitas.push({
      sumber: SRC_GARMIN, id: g(a, 'aktivitas', 'id'), jenis: g(a, 'aktivitas', 'jenis'),
      mulai_ms: mulai, selesai_ms: mulai + durS * 1000, durasi_menit: durS / 60,
      hr_rata: angka(g(a, 'aktivitas', 'hrRata')), hr_maks: angka(g(a, 'aktivitas', 'hrMaks')),
      kkal: angka(g(a, 'aktivitas', 'kkal')), strain: null,
    });
  }

  return { catatan: [...hari.values()], peringatan };
}

// Turunan lintas hari: basis diri sendiri (z-score), Bendera Perhatian Relatif, dan istilah esports.
// Semua ambang adalah USULAN yang dapat diubah lewat parameter; belum divalidasi untuk esports.

const PARAM = Object.freeze({
  JENDELA_BASIS: 28, // hari ke belakang yang dipakai sebagai basis
  MIN_BASIS: 14, // jumlah nilai minimum agar basis dianggap sah
  AMBANG_Z: 1, // simpangan baku
  TTT_MIN: 7, // jumlah nilai TTT minimum untuk median
  TTT_JENDELA: 14,
  JLT_MAKS_JAM: 24,
  OVERLAP_MIN: 0.5, // bagian sesi log yang harus tumpang tindih dengan aktivitas vendor
});

// Arah yang dianggap buruk: -1 = nilai turun itu buruk, +1 = nilai naik itu buruk.
const ARAH_BURUK = Object.freeze({ LNHRV: -1, RHR: +1, DTT: -1 });

const kunci = (c) => `${c.athlete_id}|${c.sumber}`;

function kelompokkan(catatan) {
  const m = new Map();
  for (const c of catatan) {
    if (!m.has(kunci(c))) m.set(kunci(c), []);
    m.get(kunci(c)).push(c);
  }
  for (const arr of m.values()) arr.sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0));
  return m;
}

// Nilai metrik pada hari-hari sebelum `tanggal` (eksklusif) dalam JENDELA_BASIS hari, dari satu atlet dan satu vendor.
function nilaiSebelum(arr, kode, tanggal, jendela) {
  const out = [];
  for (const c of arr) {
    const d = selisihHari(tanggal, c.tanggal);
    if (d >= 1 && d <= jendela) {
      const v = c.metrik[kode]?.nilai;
      if (typeof v === 'number') out.push(v);
    }
  }
  return out;
}

function tambahRelatif(catatan, p = PARAM) {
  for (const arr of kelompokkan(catatan).values()) {
    for (const c of arr) {
      const rinci = {};
      let tersedia = 0; let buruk = 0;
      for (const [kode, arah] of Object.entries(ARAH_BURUK)) {
        const x = c.metrik[kode]?.nilai;
        const basis = nilaiSebelum(arr, kode, c.tanggal, p.JENDELA_BASIS);
        if (typeof x !== 'number' || basis.length < p.MIN_BASIS) continue;
        const m = rata(basis); const s = simpangan(basis);
        const z = s > 0 ? (x - m) / s : null;
        c.relatif[kode] = { z: bulat(z, 2), rata_basis: bulat(m, 3), sd_basis: bulat(s, 3), n_basis: basis.length };
        if (z === null) continue;
        tersedia += 1;
        const adalahBuruk = z * arah >= p.AMBANG_Z;
        if (adalahBuruk) buruk += 1;
        rinci[kode] = { z: bulat(z, 2), buruk: adalahBuruk };
      }
      const bendera = tersedia < 2 ? 'data_kurang' : buruk === 0 ? 'hijau' : buruk === 1 ? 'kuning' : 'merah';
      c.metrik.BPR = field('BPR', bendera, c.sumber, 'turunan', { n_metrik: tersedia, n_buruk: buruk, rincian: rinci });
    }
  }
}

// Titik Tengah Tidur (TTT), Deviasi (DTTT), dan Jeda Layar-Tidur (JLT).
function tambahTidurEsports(catatan, sesiLog, p = PARAM) {
  for (const arr of kelompokkan(catatan).values()) {
    const riwayat = []; // [{tanggal, ttt}]
    for (const c of arr) {
      const w = c.jendela_tidur;
      if (!w) continue;
      const tz = c.tz_offset_menit ?? 0;
      const jangkar = Date.parse(`${c.tanggal}T00:00:00Z`) - 12 * 60 * MS_MENIT - tz * MS_MENIT; // 12:00 lokal hari sebelumnya
      const ttt = ((w.mulai_ms + w.selesai_ms) / 2 - jangkar) / MS_MENIT;
      const jam = (((Math.round(ttt) + 720) % 1440) + 1440) % 1440;
      const jamLokal = `${String(Math.floor(jam / 60)).padStart(2, '0')}:${String(jam % 60).padStart(2, '0')}`;
      c.metrik.TTT = field('TTT', ttt, c.sumber, 'turunan', { jam_lokal: jamLokal });
      const basis = riwayat.filter((r) => { const d = selisihHari(c.tanggal, r.tanggal); return d >= 1 && d <= p.TTT_JENDELA; }).map((r) => r.ttt);
      c.metrik.DTTT = field('DTTT', basis.length >= p.TTT_MIN ? ttt - median(basis) : null, c.sumber, 'turunan', { n_basis: basis.length });
      riwayat.push({ tanggal: c.tanggal, ttt });

      // JLT: sesi log terakhir yang berakhir sebelum awal tidur, dalam JLT_MAKS_JAM jam.
      const kandidat = sesiLog
        .filter((s) => s.athlete_id === c.athlete_id && s.selesai_ms <= w.mulai_ms && w.mulai_ms - s.selesai_ms <= p.JLT_MAKS_JAM * 60 * MS_MENIT)
        .sort((a, b) => b.selesai_ms - a.selesai_ms);
      c.metrik.JLT = field('JLT', kandidat.length ? (w.mulai_ms - kandidat[0].selesai_ms) / MS_MENIT : null, c.sumber, 'turunan');
    }
  }
}

// Muatan Main Harian (MMH) per catatan dan rincian per sesi (BSP, KMP, ROS).
function tambahSesi(catatan, sesiLog, peringatan, p = PARAM) {
  const grup = kelompokkan(catatan);
  const catatanPerAthlete = new Map();
  for (const c of catatan) {
    if (!catatanPerAthlete.has(c.athlete_id)) catatanPerAthlete.set(c.athlete_id, []);
    catatanPerAthlete.get(c.athlete_id).push(c);
  }
  const tzAtlet = (a) => catatanPerAthlete.get(a)?.find((c) => c.tz_offset_menit != null)?.tz_offset_menit ?? 0;

  const hasil = sesiLog.map((s) => {
    const tz = s.tz_offset_menit ?? tzAtlet(s.athlete_id);
    const tanggal = bagianLokal(s.mulai_ms, tz).tanggal;
    const durasi = (s.selesai_ms - s.mulai_ms) / MS_MENIT;
    const sRpe = Number.isFinite(s.srpe) && s.srpe >= 0 && s.srpe <= 10 ? s.srpe : null;
    if (s.srpe != null && sRpe === null) peringatan.push(`sesi ${s.id ?? s.mulai}: sRPE ${s.srpe} di luar 0-10, diabaikan`);
    const kmp = Number.isFinite(s.kelelahan_mental) && s.kelelahan_mental >= 1 && s.kelelahan_mental <= 7 ? s.kelelahan_mental : null;
    if (s.kelelahan_mental != null && kmp === null) peringatan.push(`sesi ${s.id ?? s.mulai}: kelelahan mental ${s.kelelahan_mental} di luar 1-7, diabaikan`);

    // HR sesi: prioritas aktivitas vendor yang tumpang tindih, lalu nilai dari log.
    let hr = Number.isFinite(s.hr_rata) ? { nilai: s.hr_rata, sumber: 'log' } : null;
    let terbaik = 0;
    for (const c of catatan) {
      if (c.athlete_id !== s.athlete_id) continue;
      for (const a of c.aktivitas) {
        const tumpang = Math.max(0, Math.min(a.selesai_ms, s.selesai_ms) - Math.max(a.mulai_ms, s.mulai_ms));
        const bagian = durasi > 0 ? tumpang / MS_MENIT / durasi : 0;
        if (bagian >= p.OVERLAP_MIN && bagian > terbaik && Number.isFinite(a.hr_rata)) {
          terbaik = bagian;
          hr = { nilai: a.hr_rata, sumber: a.sumber };
        }
      }
    }

    // ROS: terhadap basis RHR vendor yang sama dengan sumber HR (log -> vendor pertama yang punya basis).
    let ros = null;
    if (hr) {
      const urutan = hr.sumber === 'log' ? [...new Set(catatan.filter((c) => c.athlete_id === s.athlete_id).map((c) => c.sumber))] : [hr.sumber];
      for (const sumber of urutan) {
        const arr = grup.get(`${s.athlete_id}|${sumber}`);
        if (!arr) continue;
        const basis = nilaiSebelum(arr, 'RHR', tanggal, p.JENDELA_BASIS);
        if (basis.length >= p.MIN_BASIS) {
          const m = rata(basis);
          ros = { ...field('ROS', hr.nilai - m, sumber, 'turunan', { persen: bulat(((hr.nilai - m) / m) * 100, 1), basis_rhr: bulat(m, 2), n_basis: basis.length, sumber_hr: hr.sumber }) };
          break;
        }
      }
    }

    return {
      athlete_id: s.athlete_id, id: s.id ?? null, tanggal, jenis: s.jenis ?? null,
      mulai_ms: s.mulai_ms, selesai_ms: s.selesai_ms, durasi_menit: bulat(durasi, 2),
      hr_rata: hr ? { nilai: hr.nilai, sumber: hr.sumber } : null,
      BSP: field('BSP', sRpe === null ? null : sRpe * durasi, 'log', 'turunan'),
      KMP: field('KMP', kmp, 'log', 'asli'),
      ROS: ros ?? field('ROS', null, 'log'),
    };
  });

  // MMH per catatan: jumlah menit sesi yang mulai pada tanggal catatan.
  for (const c of catatan) {
    const total = hasil.filter((h) => h.athlete_id === c.athlete_id && h.tanggal === c.tanggal).reduce((a, h) => a + h.durasi_menit, 0);
    const ada = hasil.some((h) => h.athlete_id === c.athlete_id && h.tanggal === c.tanggal);
    c.metrik.MMH = field('MMH', ada ? total : null, 'log', 'turunan');
  }
  return hasil;
}

// Titik masuk modul penyeragaman data.
//
// harmonisasi({ athlete_id, whoop?, garmin?, sesi? }) -> { versi, catatan, sesi, peringatan }
//   whoop : { sleeps, recoveries, cycles, workouts }  (objek mentah API WHOOP v2)
//   garmin: { sleeps, hrv, dailies, stress, activities } (summary Garmin Health API)
//   sesi  : log sesi esports dari pelatih/atlet:
//           [{ id?, mulai: ISO, selesai: ISO, srpe?: 0-10, kelelahan_mental?: 1-7, hr_rata?: bpm, jenis?, tz_offset_menit? }]
//
// Satu catatan = satu atlet x satu tanggal bangun x satu vendor. Catatan vendor yang berbeda TIDAK digabung.


function normalisasiSesi(sesi, athlete_id, peringatan) {
  const out = [];
  for (const s of sesi) {
    const mulai = Date.parse(s.mulai);
    const selesai = Date.parse(s.selesai);
    if (!Number.isFinite(mulai) || !Number.isFinite(selesai) || selesai <= mulai) {
      peringatan.push(`sesi ${s.id ?? s.mulai}: waktu tidak valid, dilewati`);
      continue;
    }
    out.push({ ...s, athlete_id: s.athlete_id ?? athlete_id, mulai_ms: mulai, selesai_ms: selesai });
  }
  return out;
}

function harmonisasi({ athlete_id, whoop = null, garmin = null, sesi = [] }, param = PARAM) {
  if (!athlete_id) throw new Error('athlete_id wajib diisi');
  const peringatan = [];
  const catatan = [];
  if (whoop) { const r = petakanWhoop({ athlete_id, ...whoop }); catatan.push(...r.catatan); peringatan.push(...r.peringatan); }
  if (garmin) { const r = petakanGarmin({ athlete_id, ...garmin }); catatan.push(...r.catatan); peringatan.push(...r.peringatan); }
  catatan.sort((a, b) => (a.tanggal === b.tanggal ? a.sumber.localeCompare(b.sumber) : a.tanggal < b.tanggal ? -1 : 1));

  const log = normalisasiSesi(sesi, athlete_id, peringatan);
  tambahRelatif(catatan, param);
  tambahTidurEsports(catatan, log, param);
  const sesiOut = tambahSesi(catatan, log, peringatan, param);

  return {
    versi: { kamus: VERSI_KAMUS, pemeta: VERSI_PEMETA, param },
    catatan, sesi: sesiOut, peringatan,
  };
}

export { harmonisasi, petakanWhoop, petakanGarmin, KAMUS, VERSI_KAMUS, VERSI_PEMETA, PARAM, ALIAS };

// ---------- CLI ----------

// Hanya di Node (CLI). Di browser (aplikasi web) blok ini dilewati, jadi `process` dan `node:url` tidak disentuh.
const diNode = typeof globalThis.process !== 'undefined' && Array.isArray(globalThis.process.argv);
if (diNode) import('node:url').then(({ fileURLToPath }) => { if (process.argv[1] === fileURLToPath(import.meta.url)) jalankanCli(); });

function jalankanCli() {
  const arg = process.argv[2];
  if (arg === '--kamus') {
    for (const k of KAMUS) console.log(`${k.kode.padEnd(7)} [${k.level}] ${k.nama} (${k.unit})\n        ${k.definisi}`);
  } else if (arg === '--demo') {
    const M = 60000; const sleeps = []; const recoveries = []; const cycles = [];
    for (let i = 0; i < 21; i += 1) {
      const dtt = i === 20 ? 330 : i % 2 ? 440 : 420; const end = Date.UTC(2026, 10, 1 + i, 4, 0); const inbed = dtt + 20;
      sleeps.push({ id: 'sl-' + i, cycle_id: 100 + i, nap: false, score_state: 'SCORED', start: new Date(end - inbed * M).toISOString(), end: new Date(end).toISOString(), timezone_offset: '+00:00',
        score: { stage_summary: { total_in_bed_time_milli: inbed * M, total_awake_time_milli: 20 * M, total_light_sleep_time_milli: dtt * 0.55 * M, total_slow_wave_sleep_time_milli: dtt * 0.2 * M, total_rem_sleep_time_milli: dtt * 0.25 * M }, respiratory_rate: 14.5, sleep_performance_percentage: 85 } });
      recoveries.push({ cycle_id: 100 + i, sleep_id: 'sl-' + i, score_state: 'SCORED', score: { recovery_score: 70, resting_heart_rate: i === 20 ? 57 : i % 2 ? 51 : 49, hrv_rmssd_milli: i === 20 ? 44 : i % 2 ? 62 : 58, spo2_percentage: 96 } });
      cycles.push({ id: 100 + i, score_state: 'SCORED', score: { strain: 11, kilojoule: 9000 } });
    }
    const h = harmonisasi({ athlete_id: 'ATLET-01', whoop: { sleeps, recoveries, cycles, workouts: [] },
      sesi: [{ id: 'scrim-1', mulai: '2026-11-20T15:00:00Z', selesai: '2026-11-20T18:00:00Z', srpe: 7, kelelahan_mental: 5, hr_rata: 96 }] });
    const a = h.catatan.at(-1);
    console.log('DATA SINTETIS. Tanggal', a.tanggal);
    for (const k of ['DTT', 'HRV_M', 'RHR', 'TTT', 'DTTT', 'JLT', 'BPR']) console.log(k.padEnd(6), String(a.metrik[k].nilai).padEnd(10), a.metrik[k].unit);
    console.log('Sesi:', JSON.stringify(h.sesi.map((s) => ({ BSP: s.BSP.nilai, KMP: s.KMP.nilai, ROS: s.ROS.nilai }))));
  } else {
    console.log('Pakai: node harmonizer.mjs --demo | --kamus');
  }
}
