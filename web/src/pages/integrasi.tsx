import { useEffect, useState } from "react";
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

function AlamatSalin({ label, nilai }: { label: string; nilai: string }) {
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
  const terhubung = live[id];

  async function jalan(f: () => Promise<{ ok: boolean; pesan: string }>) {
    setSibuk(true);
    setUmpan(null);
    const r = await f();
    setUmpan({ ok: r.ok, teks: r.pesan });
    if (r.ok) setPassword("");
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
            {sibuk ? "Menghubungkan…" : terhubung ? "Masuk ulang & tarik data" : "Masuk & tarik data"}
          </button>
          {terhubung && (
            <>
              <button type="button" className="btn" disabled={sibuk} onClick={() => void jalan(() => tarikGarmin(id, hariIni))}>
                Tarik ulang
              </button>
              <button type="button" className="btn" disabled={sibuk} onClick={() => void putusGarmin(id)}>
                Putuskan
              </button>
            </>
          )}
        </div>
        {umpan && <Info jenis={umpan.ok ? "info" : "peringatan"}>{umpan.teks}</Info>}
        {terhubung && <p className="muted kecil">Terhubung ke akun {terhubung.nama}. Lihat hasilnya di Dashboard.</p>}
        <p className="muted kecil">
          Jalur tidak resmi: Garmin tidak menyediakan login username/password untuk umum, sehingga bisa gagal bila akun memakai verifikasi
          dua langkah atau Garmin mengubah sistem masuknya. Password tidak disimpan; sesi hilang saat server dimatikan.
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

type StatusWhoop = { connected: boolean; needsReconnect?: boolean; whoopUserId?: string; connectedAt?: string };
type RingkasanWhoop = {
  recovery: { n: number; avgScore: number | null; avgHrvRmssdMs: number | null; avgRestingHr: number | null };
  sleep: { n: number; avgPerformancePct: number | null };
  cycle: { n: number; avgDayStrain: number | null };
  workouts: { n: number };
};

const f = (n: number | null | undefined, s = "") => (n === null || n === undefined ? "–" : `${n}${s}`);

/**
 * Whoop lewat server lokal whoop-esport (OAuth 2.0 resmi, port 3200, dialihkan oleh proxy Vite).
 * Butuh WHOOP_CLIENT_ID dan WHOOP_CLIENT_SECRET dari Whoop Developer Dashboard di .env server itu.
 */
function TabWhoop() {
  const r = useApp().svc.integrasiGarmin(useApp().actor);
  const atlet = r.ok ? r.data.atlet.map((a) => ({ id: a.athleteId, nama: a.nama })) : [];
  const [id, setId] = useState(atlet[0]?.id ?? "");
  const [status, setStatus] = useState<StatusWhoop | null>(null);
  const [ringkas, setRingkas] = useState<RingkasanWhoop | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [mati, setMati] = useState(false);

  async function muat(athleteId: string) {
    try {
      const s = (await (await fetch(`/api/athletes/${encodeURIComponent(athleteId)}/status`)).json()) as StatusWhoop;
      setStatus(s);
      setMati(false);
      setRingkas(s.connected ? ((await (await fetch(`/api/athletes/${encodeURIComponent(athleteId)}/summary?days=7`)).json()) as RingkasanWhoop) : null);
    } catch {
      setMati(true);
      setStatus(null);
      setRingkas(null);
    }
  }
  useEffect(() => {
    if (id) void muat(id);
  }, [id]);

  async function aksi(f: () => Promise<Response>, ok: string) {
    setSibuk(true);
    setPesan(null);
    try {
      const res = await f();
      const j = await res.json().catch(() => ({}));
      setPesan(res.ok ? { ok: true, teks: ok } : { ok: false, teks: (j as { error?: string }).error ?? `Gagal (${res.status})` });
    } catch {
      setPesan({ ok: false, teks: "Server Whoop tidak merespons." });
    }
    await muat(id);
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
      {mati && (
        <Info jenis="peringatan">
          <span>
            Server Whoop tidak aktif. Jalankan <code>npm run dev</code> di folder <code>whoop-esport</code> (port 3200), lalu isi
            WHOOP_CLIENT_ID dan WHOOP_CLIENT_SECRET di <code>.env</code>-nya.
          </span>
        </Info>
      )}
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
            <a className="btn utama" href={`/whoop/connect?athleteId=${encodeURIComponent(id)}`}>
              {status?.needsReconnect ? "Hubungkan ulang Whoop" : "Hubungkan Whoop"}
            </a>
          )}
          {status?.connected && (
            <>
              <button className="btn utama" disabled={sibuk} onClick={() => void aksi(() => fetch(`/api/athletes/${encodeURIComponent(id)}/sync?days=7`, { method: "POST" }), "Data Whoop 7 hari terakhir ditarik.")}>
                {sibuk ? "Menarik…" : "Tarik data"}
              </button>
              <button className="btn" disabled={sibuk} onClick={() => void aksi(() => fetch(`/whoop/disconnect/${encodeURIComponent(id)}`, { method: "DELETE" }), "Koneksi Whoop diputus.")}>
                Putuskan
              </button>
            </>
          )}
        </div>
        {pesan && <Info jenis={pesan.ok ? "info" : "peringatan"}>{pesan.teks}</Info>}
        {status?.connected && (
          <p className="muted kecil">
            Terhubung{status.connectedAt ? ` sejak ${fmtWaktu(status.connectedAt)}` : ""} · ID Whoop {status.whoopUserId}
          </p>
        )}
      </section>
      {ringkas && (
        <section className="kpi-grid" aria-label="Ringkasan 7 hari">
          <div className="card kpi"><span className="kpi-label">Recovery rata-rata</span><b className="kpi-nilai">{f(ringkas.recovery.avgScore, "%")}</b><span className="kpi-catatan">{ringkas.recovery.n} hari</span></div>
          <div className="card kpi"><span className="kpi-label">HRV rata-rata</span><b className="kpi-nilai">{f(ringkas.recovery.avgHrvRmssdMs)}<small> ms</small></b><span className="kpi-catatan">Istirahat {f(ringkas.recovery.avgRestingHr, " bpm")}</span></div>
          <div className="card kpi"><span className="kpi-label">Performa tidur</span><b className="kpi-nilai">{f(ringkas.sleep.avgPerformancePct, "%")}</b><span className="kpi-catatan">{ringkas.sleep.n} malam</span></div>
          <div className="card kpi"><span className="kpi-label">Strain harian</span><b className="kpi-nilai">{f(ringkas.cycle.avgDayStrain)}</b><span className="kpi-catatan">{ringkas.workouts.n} latihan</span></div>
        </section>
      )}
      <Info>
        <span>
          Alur resmi Whoop (OAuth 2.0). Redirect URL <code>http://localhost:3200/whoop/callback</code> harus didaftarkan di Whoop Developer
          Dashboard; bila Whoop mewajibkan HTTPS, pakai tunnel dan ubah <code>WHOOP_REDIRECT_URI</code>.
        </span>
      </Info>
    </>
  );
}
