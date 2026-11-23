import { useState } from "react";
import { HalamanIntegrasiGarmin } from "./integrasi.js";
import { DaftarAtlet } from "./roster.js";
import { fmtWaktu, Kosong, Pesan, useApp } from "../ui.js";

export type HalamanManajer = "atlet" | "audit" | "integrasi";

export const MENU_MANAJER: { id: HalamanManajer; label: string }[] = [
  { id: "atlet", label: "Atlet" },
  { id: "audit", label: "Log Audit" },
  { id: "integrasi", label: "Integrasi Garmin" },
];

export function HalamanManajer({ halaman }: { halaman: HalamanManajer }) {
  if (halaman === "audit") return <HalamanLogAudit />;
  if (halaman === "integrasi") return <HalamanIntegrasiGarmin />;
  return <DaftarAtlet />;
}

export function HalamanLogAudit() {
  return (
    <>
      <div className="judul">
        <div>
          <h1>Log Audit</h1>
          <p>Semua perubahan dan pembacaan data sensitif di Tim ini.</p>
        </div>
      </div>
      <div className="card">
        <LogAudit />
      </div>
    </>
  );
}

// ───────────────────────── Log Audit ─────────────────────────

const AKSI_LABEL: Record<string, string> = {
  undangAnggota: "Mengundang anggota",
  ubahPeran: "Mengubah peran",
  daftarkanAtlet: "Mendaftarkan atlet",
  arsipkanAtlet: "Mengarsipkan atlet",
  hapusAtlet: "Menghapus atlet",
  hapusAnggota: "Menghapus anggota staf",
  ubahProfilAtlet: "Mengubah profil atlet",
  ubahProfilAnggota: "Mengubah profil anggota",
  aturIntegrasiGarmin: "Mengubah pengaturan integrasi Garmin",
  undangHubungkanGarmin: "Mengundang atlet menghubungkan Garmin",
  hubungkanAkunGarmin: "Menghubungkan akun Garmin",
  putuskanGarmin: "Memutus koneksi Garmin",
  kirimLaporan: "Mengirim laporan",
  catatPersetujuanWali: "Mencatat persetujuan wali",
  tandaiLaporanDibaca: "Membaca laporan atlet",
  berikanPersetujuan: "Mencatat persetujuan data",
  cabutPersetujuan: "Mencabut persetujuan data",
  setujuiSebagaiWali: "Persetujuan wali",
  kirimCheckIn: "Mengirim Check-in",
  ubahCheckIn: "Mengubah Check-in",
  jadwalkanSesi: "Menjadwalkan Sesi",
  catatSesi: "Mencatat Sesi",
  ubahKonfigurasiSkor: "Mengubah konfigurasi skor",
  tulisCatatan: "Menulis Catatan",
  ubahCatatan: "Mengubah Catatan",
  balasThread: "Membalas Thread",
  buatTindakLanjut: "Membuat Tindak Lanjut",
  selesaikanTindakLanjut: "Menyelesaikan Tindak Lanjut",
  bacaLinimasa: "Membaca Linimasa",
};

export function LogAudit() {
  const { svc, actor, nama } = useApp();
  const [aksi, setAksi] = useState("");
  const [batas, setBatas] = useState(50);
  const r = svc.logAudit(actor);
  if (!r.ok) return <Pesan umpan={{ jenis: "gagal", teks: r.reason }} />;
  const semua = [...r.data].reverse();
  const daftarAksi = [...new Set(semua.map((e) => e.action))].sort();
  const tersaring = semua.filter((e) => !aksi || e.action === aksi);

  return (
    <div className="stack">
      <div className="row spread">
        <select value={aksi} onChange={(e) => setAksi(e.target.value)}>
          <option value="">Semua aksi ({semua.length})</option>
          {daftarAksi.map((a) => (
            <option key={a} value={a}>
              {AKSI_LABEL[a] ?? a}
            </option>
          ))}
        </select>
        <span className="muted kecil">Terbaru di atas</span>
      </div>
      {tersaring.length === 0 ? (
        <Kosong>Belum ada entri.</Kosong>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Oleh</th>
                <th>Aksi</th>
                <th>Sasaran</th>
              </tr>
            </thead>
            <tbody>
              {tersaring.slice(0, batas).map((e) => (
                <tr key={e.id}>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {fmtWaktu(e.at)}
                  </td>
                  <td>{nama(e.actorId)}</td>
                  <td>{AKSI_LABEL[e.action] ?? e.action}</td>
                  <td className="ink-2">
                    {e.targetType === "athlete" ? nama(e.targetId) : e.targetType === "membership" ? `@${e.targetId}` : e.targetType}
                    {e.detail && e.action !== "ubahKonfigurasiSkor" && <span className="muted kecil"> · {e.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tersaring.length > batas && (
        <button className="btn" onClick={() => setBatas((b) => b + 100)}>
          Tampilkan lebih banyak ({tersaring.length - batas} lagi)
        </button>
      )}
    </div>
  );
}
