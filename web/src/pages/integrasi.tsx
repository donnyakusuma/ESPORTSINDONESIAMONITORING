import { Fragment, useEffect, useState } from "react";
import { tarikGarmin, putusGarmin, useStatusGarmin } from "../garminLive.js";
import { FormLoginGarmin } from "../garminLogin.js";
import { KartuWhoop } from "../KartuWhoop.js";
import { type ConfigWhoop, useWhoopAtlet, whoop } from "../whoopApi.js";
import { fmtWaktu, Info, inisial, Tabs, useApp } from "../ui.js";

/**
 * Koneksi Garmin lewat login akun Garmin Connect (jalur tidak resmi).
 * Hanya Super admin dan Admin.
 *
 * Admin bisa menghubungkan akun atlet langsung di sini; atlet juga bisa
 * melakukannya sendiri di menu Hari Ini. Server menyimpan token sesi dan
 * password terenkripsi; password tidak pernah ditampilkan.
 */
function TabGarmin() {
  const { svc, actor, hariIni } = useApp();
  const st = useStatusGarmin();
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [formUntuk, setFormUntuk] = useState<string | null>(null);
  const [umpan, setUmpan] = useState<{ ok: boolean; teks: string } | null>(null);
  const r = svc.integrasiGarmin(actor);
  if (!r.ok) return <Info jenis="peringatan">{r.reason}</Info>;
  const atlet = r.data.atlet;
  const terhubung = atlet.filter((a) => st.data[a.athleteId]?.status === "terhubung");

  async function tarikSatu(id: string, nama: string) {
    setSibuk(id);
    setUmpan(null);
    const h = await tarikGarmin(id, hariIni, nama);
    setUmpan({ ok: h.ok, teks: h.ok ? `Data Garmin ${nama} ditarik.` : `${nama}: ${h.pesan}` });
    setSibuk(null);
  }

  async function tarikSemua() {
    setSibuk("semua");
    setUmpan(null);
    const gagal: string[] = [];
    for (const a of terhubung) {
      const h = await tarikGarmin(a.athleteId, hariIni, a.nama);
      if (!h.ok) gagal.push(`${a.nama} (${h.pesan})`);
    }
    setUmpan(
      gagal.length === 0
        ? { ok: true, teks: `Data ${terhubung.length} atlet ditarik.` }
        : { ok: false, teks: `${terhubung.length - gagal.length} berhasil, ${gagal.length} gagal: ${gagal.join("; ")}` }
    );
    setSibuk(null);
  }

  return (
    <>
      <div className="judul">
        <div>
          <h2>Garmin</h2>
          <p>
            {terhubung.length} dari {atlet.length} atlet terhubung. Hubungkan dengan email dan password Garmin Connect atlet, di sini atau oleh
            atlet sendiri di menu Hari Ini.
          </p>
        </div>
        <button className="btn utama" disabled={!!sibuk || terhubung.length === 0} onClick={() => void tarikSemua()}>
          {sibuk === "semua" ? "Menarik…" : "Tarik semua atlet"}
        </button>
      </div>
      {st.serverMati && (
        <Info jenis="peringatan">
          Server lokal tidak aktif. Jalankan aplikasi dengan <code>npm run dev</code>; koneksi Garmin tidak jalan di GitHub Pages.
        </Info>
      )}
      {umpan && <Info jenis={umpan.ok ? "info" : "peringatan"}>{umpan.teks}</Info>}

      <div className="card flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Atlet</th>
                <th>Akun Garmin</th>
                <th>Data terakhir ditarik</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {atlet.map((a) => {
                const k = st.data[a.athleteId];
                const formTerbuka = formUntuk === a.athleteId;
                return (
                  <Fragment key={a.athleteId}>
                    <tr>
                      <td>
                        <span className="atlet-sel">
                          <span className="avatar gelap">{inisial(a.nama)}</span>
                          <b>{a.nama}</b>
                        </span>
                      </td>
                      <td>
                        {k?.status === "terhubung" ? (
                          <span className="stack" style={{ gap: 2 }}>
                            <span className="status hijau">Terhubung</span>
                            <span className="muted kecil">{k.email}</span>
                          </span>
                        ) : k?.status === "perlu_login_ulang" ? (
                          <span className="stack" style={{ gap: 2 }}>
                            <span className="status kuning">Perlu login ulang</span>
                            <span className="muted kecil">{k.email}</span>
                          </span>
                        ) : (
                          <span className="status abu_abu">Belum terhubung</span>
                        )}
                      </td>
                      <td className="muted">{k?.sinkronTerakhirAt ? fmtWaktu(k.sinkronTerakhirAt) : "–"}</td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          {k?.status === "terhubung" ? (
                            <button className="btn kecil" aria-label={`Tarik data ${a.nama}`} disabled={!!sibuk} onClick={() => void tarikSatu(a.athleteId, a.nama)}>
                              {sibuk === a.athleteId ? "Menarik…" : "Tarik"}
                            </button>
                          ) : (
                            <button
                              className="btn utama kecil"
                              aria-label={`Hubungkan ${a.nama}`}
                              aria-expanded={formTerbuka}
                              disabled={!!sibuk}
                              onClick={() => {
                                setFormUntuk(formTerbuka ? null : a.athleteId);
                                setUmpan(null);
                              }}
                            >
                              {k ? "Login ulang" : "Hubungkan"}
                            </button>
                          )}
                          {k && (
                            <button
                              className="btn bahaya kecil"
                              aria-label={`Putuskan ${a.nama}`}
                              disabled={!!sibuk}
                              onClick={() => {
                                if (confirm(`Putuskan akun Garmin ${a.nama}? Sesi Garmin dihapus dari server.`)) void putusGarmin(a.athleteId);
                              }}
                            >
                              Putuskan
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {formTerbuka && (
                      <tr className="baris-detail">
                        <td colSpan={4}>
                          <div style={{ maxWidth: 420 }}>
                            <FormLoginGarmin
                              atletId={a.athleteId}
                              nama={a.nama}
                              emailAwal={k?.email}
                              batal={() => setFormUntuk(null)}
                              selesai={(teks) => {
                                setFormUntuk(null);
                                setUmpan({ ok: true, teks: `${a.nama}: ${teks}` });
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted kecil">
        Jalur tidak resmi: Garmin tidak menyediakan login email/password untuk aplikasi lain, jadi bisa gagal untuk akun dengan verifikasi dua
        langkah dan bisa berhenti bekerja bila Garmin mengubah sistem masuknya. Password disimpan terenkripsi di server dan dipakai untuk login ulang otomatis.
      </p>
    </>
  );
}

export function AlamatSalin({ label, nilai }: { label: string; nilai: string }) {
  const [tersalin, setTersalin] = useState(false);
  return (
    <div className="field">
      <span>{label}</span>
      <span className="sandi-baris">
        <input type="text" readOnly value={nilai} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <button
          type="button"
          className="btn kecil"
          onClick={() => {
            void navigator.clipboard?.writeText(nilai);
            setTersalin(true);
            setTimeout(() => setTersalin(false), 1500);
          }}
        >
          {tersalin ? "Tersalin" : "Salin"}
        </button>
      </span>
    </div>
  );
}

/** Integrasi perangkat wearable: satu tab per merek. */
export function HalamanIntegrasiDevice() {
  const [tab, setTab] = useState<"garmin" | "whoop">("garmin");
  return (
    <>
      <div className="judul">
        <div>
          <h1>Integrasi Device</h1>
          <p>Hubungkan perangkat wearable atlet agar data Kondisi Atlet masuk otomatis.</p>
        </div>
      </div>
      <Tabs<"garmin" | "whoop">
        nilai={tab}
        pilihan={[
          { id: "garmin", label: "Garmin" },
          { id: "whoop", label: "Whoop" },
        ]}
        ubah={setTab}
      />
      {tab === "garmin" ? <TabGarmin /> : <TabWhoop />}
    </>
  );
}

/**
 * Whoop lewat server lokal whoop-esport (OAuth 2.0 resmi, port 3201, dialihkan oleh proxy Vite).
 * Langkah 1 mengisi Client ID/Secret dari Whoop Developer Dashboard; langkah 2 menghubungkan akun atlet.
 * Setelah terhubung, server menarik 30 hari ke belakang lalu menyinkronkan otomatis setiap jam.
 */
function TabWhoop() {
  const { svc, actor } = useApp();
  const r = svc.integrasiGarmin(actor);
  const atlet = r.ok ? r.data.atlet.map((a) => ({ id: a.athleteId, nama: a.nama })) : [];
  const [id, setId] = useState(atlet[0]?.id ?? "");
  const [versi, setVersi] = useState(0);
  const [config, setConfig] = useState<ConfigWhoop | null>(null);
  const [configMati, setConfigMati] = useState(false);
  const { status, ringkasan, mati } = useWhoopAtlet(id || null, versi);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);

  const muatConfig = () =>
    whoop
      .config()
      .then((c) => (setConfig(c), setConfigMati(false)))
      .catch(() => setConfigMati(true));
  useEffect(() => {
    void muatConfig();
  }, []);

  async function aksi(f: () => Promise<unknown>, ok: string) {
    setSibuk(true);
    setPesan(null);
    try {
      await f();
      setPesan({ ok: true, teks: ok });
    } catch (e) {
      setPesan({ ok: false, teks: e instanceof Error ? e.message : "Server Whoop tidak merespons." });
    }
    setVersi((v) => v + 1);
    setSibuk(false);
  }

  return (
    <>
      <div className="judul">
        <div>
          <h2>Whoop</h2>
          <p>Hubungkan akun Whoop atlet agar recovery, strain, tidur, dan HRV masuk otomatis.</p>
        </div>
        <span className={`status ${status?.connected ? "hijau" : "abu_abu"}`}>{status?.connected ? "Terhubung" : "Belum terhubung"}</span>
      </div>

      {(configMati || mati) && (
        <Info jenis="peringatan">
          <span>
            Server Whoop tidak aktif. Buka Terminal, jalankan <code>cd ~/Documents/whoop-esport &amp;&amp; npm run dev</code>, lalu muat ulang
            halaman ini.
          </span>
        </Info>
      )}

      {config && !config.configured && <SetelWhoop redirectUri={config.redirectUri} selesai={() => void muatConfig()} />}

      {config?.configured && (
        <section className="card stack">
          <label className="field">
            <span>Atlet</span>
            <select value={id} onChange={(e) => setId(e.target.value)}>
              {atlet.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nama}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            {!status?.connected && (
              <a className="btn utama" href={whoop.urlHubungkan(id)}>
                {status?.needsReconnect ? "Hubungkan ulang Whoop" : "Hubungkan Whoop"}
              </a>
            )}
            {status?.connected && (
              <>
                <button className="btn utama" disabled={sibuk} onClick={() => void aksi(() => whoop.sinkron(id, 7), "Data Whoop 7 hari terakhir ditarik.")}>
                  {sibuk ? "Menarik…" : "Tarik sekarang"}
                </button>
                <button className="btn" disabled={sibuk} onClick={() => void aksi(() => whoop.putus(id), "Koneksi Whoop diputus.")}>
                  Putuskan
                </button>
              </>
            )}
          </div>
          {pesan && <Info jenis={pesan.ok ? "info" : "peringatan"}>{pesan.teks}</Info>}
          <p className="muted kecil">
            {status?.connected
              ? `Terhubung${status.connectedAt ? ` sejak ${fmtWaktu(status.connectedAt)}` : ""} · ID Whoop ${status.whoopUserId}. Data tersinkron otomatis setiap jam; tombol "Tarik sekarang" untuk menarik langsung.`
              : "Tombol Hubungkan membuka halaman login Whoop. Masuk dengan akun Whoop atlet ini lalu setujui akses; Anda akan kembali ke aplikasi ini."}
          </p>
        </section>
      )}

      {ringkasan && (
        <>
          <h3>7 hari terakhir</h3>
          <KartuWhoop r={ringkasan} />
        </>
      )}
    </>
  );
}

/** Langkah sekali saja: daftarkan aplikasi di Whoop lalu tempel Client ID/Secret. Disimpan ke .env server lokal. */
function SetelWhoop({ redirectUri, selesai }: { redirectUri: string; selesai(): void }) {
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setSibuk(true);
        setGalat("");
        try {
          await whoop.simpanConfig(clientId, secret);
          setSecret("");
          selesai();
        } catch (err) {
          setGalat(err instanceof Error ? err.message : "Gagal menyimpan.");
        }
        setSibuk(false);
      }}
    >
      <h3>Langkah 1 · Daftarkan aplikasi di Whoop (sekali saja)</h3>
      <ol className="langkah">
        <li>
          Buka{" "}
          <a href="https://developer-dashboard.whoop.com" target="_blank" rel="noreferrer">
            developer-dashboard.whoop.com
          </a>{" "}
          dan masuk dengan akun Whoop Anda.
        </li>
        <li>Buat Team bila diminta, lalu klik <b>Create App</b>.</li>
        <li>
          Isi nama aplikasi bebas. Pada <b>Redirect URIs</b> masukkan persis:
          <AlamatSalin label="Redirect URI" nilai={redirectUri} />
        </li>
        <li>
          Centang semua scope: <code>read:recovery</code>, <code>read:cycles</code>, <code>read:sleep</code>, <code>read:workout</code>,{" "}
          <code>read:profile</code>, <code>read:body_measurement</code>.
        </li>
        <li>Simpan, lalu salin <b>Client ID</b> dan <b>Client Secret</b> ke form di bawah.</li>
      </ol>
      <label className="field">
        <span>Client ID</span>
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" required />
      </label>
      <label className="field">
        <span>Client Secret</span>
        <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" required />
      </label>
      {galat && <Info jenis="peringatan">{galat}</Info>}
      <div className="row">
        <button className="btn utama" disabled={sibuk}>
          {sibuk ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
      <p className="muted kecil">Disimpan hanya di file .env server Whoop di komputer ini, tidak dikirim ke tempat lain.</p>
    </form>
  );
}
