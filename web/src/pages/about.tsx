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
          <p>Alamat publik aplikasi untuk pendaftaran di WHOOP Developer Dashboard.</p>
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
    </>
  );
}
