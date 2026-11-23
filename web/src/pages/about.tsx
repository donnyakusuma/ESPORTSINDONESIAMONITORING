import { KAMUS, VERSI_KAMUS } from "../lib/harmonizer.mjs";
import { AlamatSalin } from "./integrasi.js";

/** Alamat publik (GitHub Pages, https) yang didaftarkan di WHOOP Developer Dashboard. */
export const URL_PUBLIK = "https://donnyakusuma.github.io/esportsindonesiamonitoring/";
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
          <h2>3. Kamus Istilah (v{VERSI_KAMUS})</h2>
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
