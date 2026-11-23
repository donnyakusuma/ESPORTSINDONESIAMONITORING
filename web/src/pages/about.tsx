import { KAMUS, VERSI_KAMUS } from "../lib/harmonizer.mjs";
import { PARAM_IND, VERSI_INDEKS } from "../lib/indeks-esports.mjs";
import { AlamatSalin } from "./integrasi.js";

/** Alamat publik (GitHub Pages, https) yang didaftarkan di WHOOP Developer Dashboard. */
export const URL_PUBLIK = "https://donnyakusuma.github.io/ESPORTSINDONESIAMONITORING/";
export const URL_PRIVACY = `${URL_PUBLIK}privacy.html`;
export const URL_REDIRECT_WHOOP = `${URL_PUBLIK}whoop-callback.html`;

export function HalamanAbout() {
  return (
    <>
      <div className="judul">
        <div>
          <h1>About</h1>
          <p>Alamat publik untuk pendaftaran WHOOP, dan kamus istilah data WHOOP + Garmin untuk atlet esports.</p>
        </div>
      </div>

      <section className="setelan">
        <div className="setelan-ket">
          <h2>1. Privacy Policy</h2>
          <p>Kebijakan privasi aplikasi: data apa yang diambil dari WHOOP dan Garmin, untuk apa, cara penyimpanan, dan cara menghapusnya.</p>
        </div>
        <div className="card stack">
          <AlamatSalin label="Privacy Policy URL" nilai={URL_PRIVACY} />
          <p className="muted kecil">
            <a href={URL_PRIVACY} target="_blank" rel="noreferrer">
              Buka halaman Privacy Policy
            </a>{" "}
            · isi field <b>Privacy Policy</b> di WHOOP dengan alamat ini.
          </p>
        </div>
      </section>

      <section className="setelan">
        <div className="setelan-ket">
          <h2>2. Redirect URL</h2>
          <p>
            Ke alamat ini WHOOP mengembalikan atlet setelah memberi izin. WHOOP mewajibkan alamat https, jadi halaman ini meneruskan kode ke
            server Whoop lokal (port 3201).
          </p>
        </div>
        <div className="card stack">
          <AlamatSalin label="Redirect URL" nilai={URL_REDIRECT_WHOOP} />
          <p className="muted kecil">
            Isi field <b>Redirect URIs</b> di WHOOP dengan alamat ini, persis sama. Nilai <code>WHOOP_REDIRECT_URI</code> di server Whoop juga
            harus sama.
          </p>
        </div>
      </section>

      <section className="stack">
        <div className="setelan-ket">
          <h2>3. Indeks Esports (v{VERSI_INDEKS})</h2>
          <p>
            Dua indeks gabungan khusus esports. <b>Usulan, belum divalidasi untuk esports</b>: bobot dan ambang adalah titik awal. Indeks ini
            penanda kesiapan relatif terhadap diri sendiri, bukan ukuran kognisi.
          </p>
        </div>
        <div className="card stack">
          <h3>IKB: Indeks Kesiapan Bermain (pagi hari)</h3>
          <p>
            <b>IKB = 50 + 10 × Σ(w·s·z) ÷ Σw</b>, dengan Σ atas komponen yang tersedia (minimal {PARAM_IND.MIN_KOMP_IKB}). z adalah z-score
            terhadap rata-rata dan simpangan baku diri sendiri pada {PARAM_IND.JENDELA_BASIS} hari sebelumnya (basis minimal {PARAM_IND.MIN_BASIS} hari),
            dibatasi ±{PARAM_IND.BATAS_Z}. s = +1 bila nilai naik itu baik, −1 bila buruk.
          </p>
          <div className="table-wrap">
            <table className="kamus-tabel">
              <thead>
                <tr>
                  <th>Komponen</th>
                  <th>Bobot w</th>
                  <th>Arah s</th>
                  <th>Arti</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["LNHRV", "ln HRV Malam", "HRV malam turun dari kebiasaan = kesiapan turun"],
                  ["DTT", "Durasi Tidur Total", "tidur lebih pendek dari kebiasaan = kesiapan turun"],
                  ["RHR", "Detak Jantung Istirahat", "detak istirahat naik dari kebiasaan = kesiapan turun"],
                  ["KETERATURAN", "Keteraturan tidur", "z = −|DTTT| ÷ SD(TTT 28 hari): makin menyimpang jadwal tidur, makin rendah"],
                  ["BEBAN", "Beban sesi kemarin", "z beban sesi (BSP) kemarin terhadap sesi-sesi sebelumnya; naik = kesiapan turun"],
                ].map(([k, nama, arti]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{PARAM_IND.BOBOT[k!]!.w}</td>
                    <td>{PARAM_IND.BOBOT[k!]!.s > 0 ? "+1" : "−1"}</td>
                    <td>
                      <b>{nama}</b>: {arti}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Pita: ≥ {PARAM_IND.PITA_NORMAL} <b>Normal</b>; {PARAM_IND.PITA_PERHATIAN}–{PARAM_IND.PITA_NORMAL - 0.01} <b>Perhatian</b>; &lt; {PARAM_IND.PITA_PERHATIAN} <b>Rendah</b>.
            Contoh hitung: z = (−0,8; −1,2; 0,5; −2,0; 0,6) → IKB = 50 + 10 × (−0,25×0,8 − 0,25×1,2 − 0,15×0,5 − 0,15×2,0 − 0,20×0,6) ÷ 1,0 = <b>40,05</b> (Perhatian).
          </p>
          <h3>IBMS: Indeks Beban Mental Sesi (per sesi)</h3>
          <p>
            Tiga komponen per sesi: BSP (sRPE × menit), KMP (kelelahan mental 1–7), dan ROS (reaktivitas otonom). Masing-masing diubah ke z-score
            terhadap sesi-sesi <b>sebelumnya</b> milik atlet yang sama ({PARAM_IND.JENDELA_SESI_HARI} hari terakhir, minimal {PARAM_IND.MIN_SESI} sesi), dibatasi ±{PARAM_IND.BATAS_Z}.
          </p>
          <p>
            <b>IBMS sesi = 50 + 10 × rata-rata z komponen yang tersedia</b> (minimal {PARAM_IND.MIN_KOMP_IBMS}). Contoh: z BSP 1,0, KMP 0,5, ROS 1,5 → <b>60</b>; tanpa KMP → <b>62,5</b>.{" "}
            <b>IBMS {PARAM_IND.HARI_IBMS} hari</b> = rata-rata IBMS sesi dalam {PARAM_IND.HARI_IBMS} hari terakhir; z-nya dibandingkan dengan rata-rata {PARAM_IND.HARI_IBMS} hari terdahulu (minimal {PARAM_IND.MIN_RATA7}).
          </p>
        </div>
      </section>

      <section className="stack">
        <div className="setelan-ket">
          <h2>4. Kamus Istilah (v{VERSI_KAMUS})</h2>
          <p>
            Satu kamus untuk data WHOOP dan Garmin. Setiap angka di Dashboard memakai nama, satuan, dan definisi dari sini. Metrik{" "}
            <b>serupa</b> (rumus vendor berbeda) selalu ditampilkan per vendor dan tidak pernah dirata-rata lintas vendor.
          </p>
        </div>
        {GRUP.map((g) => (
          <div key={g.level} className="card flush">
            <div className="card-head">
              <h3>
                {g.judul} <span className="kamus-level">{g.level}</span>
              </h3>
              <span className="muted kecil">{g.arti}</span>
            </div>
            <div className="table-wrap">
              <table className="kamus-tabel">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Istilah</th>
                    <th>Definisi</th>
                    <th>WHOOP</th>
                    <th>Garmin</th>
                    <th>Kaveat</th>
                  </tr>
                </thead>
                <tbody>
                  {KAMUS.filter((k) => k.level === g.level).map((k) => (
                    <tr key={k.kode}>
                      <td>{k.kode}</td>
                      <td>
                        <b>{k.nama}</b>
                        <div className="muted kecil">
                          {k.en} · {k.unit}
                        </div>
                      </td>
                      <td>{k.definisi}</td>
                      <td className="muted">{k.whoop}</td>
                      <td className="muted">{k.garmin}</td>
                      <td className="muted">{k.kaveat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

const GRUP = [
  { level: "setara", judul: "Metrik dasar bersama", arti: "Arti dan cara ukur sama; hanya nama/satuan vendor berbeda." },
  { level: "serupa", judul: "Skor vendor", arti: "Tujuan sama, rumus berbeda. Tidak boleh digabung lintas vendor." },
  { level: "satu_sisi", judul: "Hanya satu vendor", arti: "Ada di salah satu vendor saja." },
  { level: "baru", judul: "Istilah esports (usulan)", arti: "Turunan khusus esports; belum tervalidasi." },
  { level: "input", judul: "Masukan log", arti: "Dari log pelatih/atlet, bukan dari perangkat." },
];
