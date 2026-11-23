import { useEffect, useState } from "react";
import { KartuWhoop } from "../KartuWhoop.js";
import { type ConfigWhoop, useWhoopAtlet, whoop } from "../whoopApi.js";
import type { IntegrasiGarmin, JenisDataGarmin } from "../../../src/index.js";
import { simulasiSinkronGarmin } from "../demo.js";
import { putusGarmin, masukGarmin, tarikGarmin, useGarminLive } from "../garminLive.js";
import { IkonGarmin, METRIK_GARMIN } from "../garmin.js";
import { fmtWaktu, Info, inisial, Pesan, Tabs, useAksi, useApp } from "../ui.js";

/**
 * Pengaturan koneksi ke Garmin Health API. Hanya Super admin dan Admin.
 *
 * Prototipe ini berjalan di browser tanpa server, jadi kredensial disimpan di
 * memori dan uji koneksi serta sinkronisasi disimulasikan. Di produksi,
 * rahasia disimpan di server (secret manager), otorisasi atlet lewat OAuth
 * Garmin Connect, dan data masuk lewat webhook ke alamat di bawah.
 */

/** Ringkasan Garmin Health API dan metrik Kondisi Atlet yang diisinya. */
const JENIS_DATA: { id: JenisDataGarmin; label: string; metrik: string[] }[] = [
  { id: "dailies", label: "Dailies", metrik: ["langkah", "menitIntensitas", "duduk", "kalori", "detakJantung", "stres", "bodyBattery"] },
  { id: "sleeps", label: "Sleeps", metrik: ["tidur"] },
  { id: "hrv", label: "HRV", metrik: ["hrv"] },
  { id: "pulse_ox", label: "Pulse Ox", metrik: ["spo2"] },
  { id: "respiration", label: "Respiration", metrik: ["respirasi"] },
  { id: "body_compositions", label: "Body Compositions", metrik: ["komposisiTubuh"] },
  { id: "blood_pressures", label: "Blood Pressures", metrik: ["tekananDarah"] },
];

function TabGarmin() {
  const { svc, actor } = useApp();
  const aksi = useAksi();
  const r = svc.integrasiGarmin(actor);
  if (!r.ok) return <Pesan umpan={{ jenis: "gagal", teks: r.reason }} />;
  const { pengaturan, atlet } = r.data;
  const terhubung = atlet.filter((a) => a.koneksi?.status === "terhubung").length;

  return (
    <>
      <div className="judul">
        <div>
          <h2>Garmin</h2>
          <p>Hubungkan Tim ke Garmin Health API agar data Kondisi Atlet masuk otomatis dari jam Garmin atlet.</p>
        </div>
        <StatusIntegrasi pengaturan={pengaturan} />
      </div>
      <Info jenis="peringatan">
        <span>
          <b>Mode prototipe.</b> Belum ada server, jadi kredensial hanya disimpan di memori browser, dan uji koneksi serta sinkronisasi
          disimulasikan. Koneksi sungguhan butuh backend HTTPS publik dan akun Garmin Connect Developer Program yang disetujui Garmin.
        </span>
      </Info>
      <Pesan umpan={aksi.umpan} />

      <LoginGarmin atlet={atlet.map((a) => ({ id: a.athleteId, nama: a.nama }))} />

      <FormKredensial key={pengaturan?.diubahAt ?? "baru"} pengaturan={pengaturan} jalankan={aksi.jalankan} setUmpan={aksi.setUmpan} />

      <section className="setelan">
        <div className="setelan-ket">
          <h2>Alamat untuk portal Garmin</h2>
          <p>Daftarkan alamat ini di Garmin Connect Developer Program. Garmin mengirim data baru ke alamat webhook.</p>
        </div>
        <div className="card stack">
          <AlamatSalin label="OAuth callback" nilai={`${location.origin}/api/garmin/oauth/callback`} />
          <AlamatSalin label="Webhook (ping/push)" nilai={`${location.origin}/api/garmin/webhook`} />
          <AlamatSalin label="Deregistrasi & izin pengguna" nilai={`${location.origin}/api/garmin/deregistration`} />
          <p className="muted kecil">
            Alamat di atas harus HTTPS dan bisa diakses dari internet. Saat ini masih alamat lokal karena prototipe belum punya server.
          </p>
        </div>
      </section>

      <section className="setelan">
        <div className="setelan-ket">
          <h2>Koneksi atlet</h2>
          <p>
            {terhubung} dari {atlet.length} atlet terhubung. Atlet harus memberi persetujuan Data wearable lalu menyetujui akses di Garmin
            Connect.
          </p>
        </div>
        <div className="card flush">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Atlet</th>
                  <th>Persetujuan</th>
                  <th>Status Garmin</th>
                  <th>Sinkron terakhir</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {atlet.map((a) => {
                  const k = a.koneksi;
                  return (
                    <tr key={a.athleteId}>
                      <td>
                        <span className="atlet-sel">
                          <span className="avatar gelap">{inisial(a.nama)}</span>
                          <span>
                            <b>{a.nama}</b>
                            {k?.garminUserId && <span className="muted kecil">{k.garminUserId}</span>}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className={`status ${a.persetujuanBerlaku ? "hijau" : "abu_abu"}`}>{a.persetujuanBerlaku ? "Diberikan" : "Belum"}</span>
                      </td>
                      <td>
                        {k?.status === "terhubung" ? (
                          <span className="status hijau">Terhubung</span>
                        ) : k?.status === "diundang" ? (
                          <span className="status kuning">Menunggu atlet</span>
                        ) : (
                          <span className="status abu_abu">Belum terhubung</span>
                        )}
                      </td>
                      <td className="muted">{k?.sinkronTerakhirAt ? fmtWaktu(k.sinkronTerakhirAt) : "–"}</td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          {k?.status === "terhubung" ? (
                            <>
                              <button
                                className="btn kecil"
                                aria-label={`Sinkron sekarang ${a.nama}`}
                                onClick={() => aksi.jalankan(simulasiSinkronGarmin(svc, a.athleteId), `Simulasi: data Garmin hari ini untuk ${a.nama} diterima.`)}
                              >
                                Sinkron sekarang
                              </button>
                              <button
                                className="btn bahaya kecil"
                                aria-label={`Putuskan ${a.nama}`}
                                onClick={() => {
                                  if (confirm(`Putuskan koneksi Garmin ${a.nama}? Data yang sudah masuk tetap tersimpan, tapi data baru berhenti masuk.`)) {
                                    aksi.jalankan(svc.putuskanGarmin(actor, { athleteId: a.athleteId }), `Koneksi Garmin ${a.nama} diputus.`);
                                  }
                                }}
                              >
                                Putuskan
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn utama kecil"
                              aria-label={`Undang ${a.nama}`}
                              disabled={!pengaturan?.aktif}
                              onClick={() =>
                                aksi.jalankan(
                                  svc.undangHubungkanGarmin(actor, { athleteId: a.athleteId }),
                                  `Undangan terkirim. ${a.nama} bisa menghubungkan akun Garmin di halaman Persetujuan Data.`
                                )
                              }
                            >
                              {k?.status === "diundang" ? "Undang ulang" : "Undang"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function StatusIntegrasi({ pengaturan }: { pengaturan: IntegrasiGarmin | null }) {
  if (!pengaturan) return <span className="status abu_abu">Belum diatur</span>;
  return (
    <div className="row">
      <span className={`status ${pengaturan.aktif ? "hijau" : "abu_abu"}`}>{pengaturan.aktif ? "Aktif" : "Nonaktif"}</span>
      <span className="status abu_abu">{pengaturan.lingkungan === "produksi" ? "Produksi" : "Evaluasi"}</span>
    </div>
  );
}

function FormKredensial({
  pengaturan,
  jalankan,
  setUmpan,
}: {
  pengaturan: IntegrasiGarmin | null;
  jalankan: ReturnType<typeof useAksi>["jalankan"];
  setUmpan: ReturnType<typeof useAksi>["setUmpan"];
}) {
  const { svc, actor, segarkan } = useApp();
  const [aktif, setAktif] = useState(pengaturan?.aktif ?? false);
  const [lingkungan, setLingkungan] = useState<IntegrasiGarmin["lingkungan"]>(pengaturan?.lingkungan ?? "evaluasi");
  const [key, setKey] = useState(pengaturan?.consumerKey ?? "");
  const [secret, setSecret] = useState("");
  const [lihat, setLihat] = useState(false);
  const [jenis, setJenis] = useState<JenisDataGarmin[]>(pengaturan?.jenisData ?? JENIS_DATA.map((j) => j.id));

  const simpan = () =>
    jalankan(svc.aturIntegrasiGarmin(actor, { aktif, lingkungan, consumerKey: key, consumerSecret: secret, jenisData: jenis }), "Pengaturan integrasi Garmin tersimpan.");

  return (
    <>
      <section className="setelan">
        <div className="setelan-ket">
          <h2>Kredensial API</h2>
          <p>Didapat dari Garmin Connect Developer Program setelah aplikasi disetujui. Rahasia tidak pernah ditampilkan ulang.</p>
        </div>
        <div className="card stack">
          <div className="row spread">
            <span>
              <b>Aktifkan integrasi</b>
              <span className="muted kecil" style={{ display: "block" }}>
                Saat nonaktif, data baru dari Garmin tidak diterima.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={aktif}
              aria-label="Aktifkan integrasi Garmin"
              className={`saklar ${aktif ? "nyala" : ""}`}
              onClick={() => setAktif((v) => !v)}
            >
              <span />
            </button>
          </div>
          <label className="field">
            Lingkungan
            <select id="garmin-lingkungan" value={lingkungan} onChange={(e) => setLingkungan(e.target.value as IntegrasiGarmin["lingkungan"])}>
              <option value="evaluasi">Evaluasi (uji coba)</option>
              <option value="produksi">Produksi</option>
            </select>
          </label>
          <label className="field">
            Consumer Key
            <input id="garmin-key" type="text" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <label className="field">
            Consumer Secret
            <span className="hint">
              {pengaturan?.consumerSecretTersimpan ? "Rahasia sudah tersimpan. Kosongkan bila tidak diganti." : "Belum ada rahasia tersimpan."}
            </span>
            <span className="sandi-baris">
              <input
                id="garmin-secret"
                type={lihat ? "text" : "password"}
                autoComplete="new-password"
                placeholder={pengaturan?.consumerSecretTersimpan ? "••••••••••••" : ""}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <button type="button" className="btn kecil" aria-pressed={lihat} onClick={() => setLihat((v) => !v)}>
                {lihat ? "Sembunyikan" : "Tampilkan"}
              </button>
            </span>
          </label>
          <div className="row">
            <button className="btn utama" onClick={simpan}>
              Simpan pengaturan
            </button>
            <button
              className="btn"
              onClick={() => {
                const lengkap = !!pengaturan?.consumerKey && !!pengaturan.consumerSecretTersimpan;
                const pesan = lengkap
                  ? "Simulasi berhasil: kredensial lengkap. Uji sungguhan ke server Garmin butuh backend."
                  : "Simpan Consumer Key dan Consumer Secret terlebih dahulu.";
                const h = svc.catatUjiKoneksiGarmin(actor, { ok: lengkap, pesan });
                if (!h.ok) setUmpan({ jenis: "gagal", teks: h.reason });
                else setUmpan({ jenis: lengkap ? "ok" : "gagal", teks: pesan });
                segarkan();
              }}
            >
              Tes koneksi
            </button>
          </div>
          {pengaturan?.ujiTerakhir && (
            <p className="muted kecil">
              Uji terakhir {fmtWaktu(pengaturan.ujiTerakhir.at)}: {pengaturan.ujiTerakhir.ok ? "berhasil" : "gagal"}. {pengaturan.ujiTerakhir.pesan}
            </p>
          )}
          {pengaturan && <p className="muted kecil">Terakhir diubah {fmtWaktu(pengaturan.diubahAt)}.</p>}
        </div>
      </section>

      <section className="setelan">
        <div className="setelan-ket">
          <h2>Jenis data</h2>
          <p>Ringkasan Garmin yang diminta dan metrik Kondisi Atlet yang diisinya. Minta seperlunya saja.</p>
        </div>
        <div className="card stack" style={{ gap: 4 }}>
          {JENIS_DATA.map((j) => (
            <label key={j.id} className="baris-jenis">
              <input
                type="checkbox"
                checked={jenis.includes(j.id)}
                onChange={(e) => setJenis((v) => (e.target.checked ? [...v, j.id] : v.filter((x) => x !== j.id)))}
              />
              <span className="stack" style={{ gap: 4 }}>
                <b>{j.label}</b>
                <span className="row" style={{ gap: 6 }}>
                  {METRIK_GARMIN.filter((m) => j.metrik.includes(m.kunci)).map((m) => (
                    <span key={m.kunci} className="chip row" style={{ gap: 4 }}>
                      <IkonGarmin path={m.ikon} ukuran={14} />
                      {m.label}
                    </span>
                  ))}
                </span>
              </span>
            </label>
          ))}
          <div style={{ marginTop: 12 }}>
            <button className="btn utama" onClick={simpan}>
              Simpan pengaturan
            </button>
          </div>
        </div>
      </section>
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

/**
 * Tarik data langsung dari Garmin Connect memakai username dan password akun
 * Garmin atlet. Ini jalur tidak resmi lewat server lokal (npm run dev); password
 * hanya dikirim ke server lokal itu lalu ke Garmin, dan tidak disimpan.
 */
function LoginGarmin({ atlet }: { atlet: { id: string; nama: string }[] }) {
  const { hariIni } = useApp();
  const live = useGarminLive();
  const [id, setId] = useState(atlet[0]?.id ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [umpan, setUmpan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [ganti, setGanti] = useState(false);
  const terhubung = live[id];

  async function jalan(f: () => Promise<{ ok: boolean; pesan: string }>) {
    setSibuk(true);
    setUmpan(null);
    const r = await f();
    setUmpan({ ok: r.ok, teks: r.pesan });
    if (r.ok) {
      setPassword("");
      setGanti(false);
    }
    setSibuk(false);
  }

  return (
    <section className="setelan">
      <div className="setelan-ket">
        <h2>Akun Garmin Connect</h2>
        <p>Masukkan username dan password Garmin Connect atlet untuk menarik statistik kesehatannya ke Dashboard.</p>
      </div>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void jalan(() => masukGarmin(id, username, password, hariIni));
        }}
      >
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
        {terhubung && !ganti ? (
          <>
            <p>
              <b>Terhubung ke akun {terhubung.nama}.</b> Sesi tersimpan di server, jadi tidak perlu login lagi. Data terakhir:{" "}
              {terhubung.tanggal}. Disinkronkan otomatis tiap jam.
            </p>
            <div className="row">
              <button type="button" className="btn utama" disabled={sibuk} onClick={() => void jalan(() => tarikGarmin(id, hariIni))}>
                {sibuk ? "Menarik…" : "Tarik sekarang"}
              </button>
              <button type="button" className="btn" disabled={sibuk} onClick={() => setGanti(true)}>
                Ganti akun
              </button>
              <button type="button" className="btn" disabled={sibuk} onClick={() => void putusGarmin(id)}>
                Putuskan
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span>Username Garmin (email)</span>
              <input type="text" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label className="field">
              <span>Password Garmin</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <div className="row">
              <button className="btn utama" disabled={sibuk || !id}>
                {sibuk ? "Menghubungkan…" : "Masuk & simpan"}
              </button>
              {terhubung && (
                <button type="button" className="btn" onClick={() => setGanti(false)}>
                  Batal
                </button>
              )}
            </div>
          </>
        )}
        {umpan && <Info jenis={umpan.ok ? "info" : "peringatan"}>{umpan.teks}</Info>}
        <p className="muted kecil">
          Jalur tidak resmi: Garmin tidak menyediakan login username/password untuk umum, sehingga bisa gagal bila akun memakai verifikasi
          dua langkah atau Garmin mengubah sistem masuknya. Password dipakai sekali untuk masuk dan tidak disimpan; yang disimpan hanya token terenkripsi di database server, sehingga tidak perlu login lagi.
        </p>
      </form>
    </section>
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
 * Setelah terhubung, server menarik 1 tahun ke belakang lalu menyinkronkan otomatis setiap jam.
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
                <button className="btn utama" disabled={sibuk} onClick={() => void aksi(() => whoop.sinkron(id, 365), "Data Whoop 1 tahun terakhir ditarik.")}>
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
