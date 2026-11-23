import { useState } from "react";
import { masukGarmin, useStatusGarmin } from "./garminLive.js";
import { Info, useApp } from "./ui.js";

/**
 * Form login akun Garmin Connect untuk satu atlet. Dipakai di halaman atlet
 * dan di tabel admin. Server menyimpan password terenkripsi untuk login
 * ulang otomatis; password tidak pernah ditampilkan kembali.
 */
export function FormLoginGarmin({
  atletId,
  nama,
  emailAwal = "",
  batal,
  selesai,
}: {
  atletId: string;
  nama: string;
  emailAwal?: string;
  batal?(): void;
  selesai?(pesan: string): void;
}) {
  const { hariIni } = useApp();
  const [email, setEmail] = useState(emailAwal);
  const [password, setPassword] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  return (
    <form
      className="stack"
      style={{ gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        setSibuk(true);
        setGalat(null);
        void masukGarmin(atletId, email, password, hariIni, nama).then((r) => {
          setSibuk(false);
          setPassword("");
          if (r.ok) selesai?.(r.pesan);
          else setGalat(r.pesan);
        });
      }}
    >
      <label className="field">
        <span>Email Garmin Connect</span>
        <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">
        <span>Password Garmin Connect</span>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <span className="hint">Disimpan terenkripsi di server agar sesi bisa diperpanjang otomatis. Tidak pernah ditampilkan kembali.</span>
      </label>
      <div className="row">
        <button className="btn utama" disabled={sibuk || !email.trim() || !password}>
          {sibuk ? "Menghubungkan…" : "Hubungkan & tarik data"}
        </button>
        {batal && (
          <button type="button" className="btn" disabled={sibuk} onClick={batal}>
            Batal
          </button>
        )}
      </div>
      {galat && <Info jenis="peringatan">{galat}</Info>}
    </form>
  );
}

/** Status Garmin dan form hubungkan di card atlet (menu Atlet), untuk admin. */
export function GarminDiKartu({ atletId, nama }: { atletId: string; nama: string }) {
  const st = useStatusGarmin();
  const k = st.data[atletId];
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row spread" style={{ flexWrap: "nowrap" }}>
        <span className="kecil">
          <b>Garmin</b>{" "}
          {k?.status === "terhubung" ? (
            <span className="status hijau">Terhubung</span>
          ) : k?.status === "perlu_login_ulang" ? (
            <span className="status kuning">Perlu login ulang</span>
          ) : (
            <span className="status abu_abu">Belum</span>
          )}
          {k && <span className="muted" style={{ display: "block" }}>{k.email}</span>}
        </span>
        <button type="button" className="btn kecil" aria-expanded={buka} onClick={() => (setBuka(!buka), setPesan(null))}>
          {buka ? "Tutup" : k ? "Ganti akun" : "Hubungkan Garmin"}
        </button>
      </div>
      {buka && (
        <FormLoginGarmin
          atletId={atletId}
          nama={nama}
          emailAwal={k?.email}
          batal={() => setBuka(false)}
          selesai={(t) => {
            setBuka(false);
            setPesan(t);
          }}
        />
      )}
      {pesan && <Info>{pesan}</Info>}
    </div>
  );
}
