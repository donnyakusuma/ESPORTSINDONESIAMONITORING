import { useEffect, useMemo, useState } from "react";
import { tarikGarmin } from "./garminLive.js";
import { whoop } from "./whoopApi.js";
import { HalamanAbout } from "./pages/about.js";
import { Dashboard } from "./dashboard.js";
import { buatDemo, hariIniTim } from "./demo.js";
import { HalamanAtlet, MENU_ATLET } from "./pages/atlet.js";
import { HalamanManajer, MENU_MANAJER } from "./pages/manajer.js";
import { HalamanStaf, hitungKotakMasuk, MENU_STAF } from "./pages/staf.js";
import { type AppCtx, AppContext, fmtTanggal, Ikon, inisial, labelOtoritas, labelPeran, Logo } from "./ui.js";

const IKON_MENU: Record<string, string> = {
  hari_ini: "papan",
  checkin: "check",
  lapor: "lapor",
  tren: "tren",
  catatan: "catatan",
  persetujuan: "perisai",
  audit: "daftar",
  papan: "papan",
  sesi: "sesi",
  kotak_masuk: "kotak",
  konfigurasi: "gerigi",
  anggota: "tim",
  roster: "atlet",
  atlet: "atlet",
  integrasi: "tautan",
};

type Halaman =
  | { peran: "dashboard" }
  | { peran: "about" }
  | { peran: "atlet"; h: HalamanAtlet }
  | { peran: "staf"; h: HalamanStaf }
  | { peran: "manajer"; h: HalamanManajer };

function halamanAwal(): Halaman {
  return { peran: "dashboard" };
}

const KUNCI_CONTOH = "readiness-data-contoh";

/** Data contoh aktif kecuali pengguna mematikannya (disimpan di browser ini). */
function modeContoh(): boolean {
  return localStorage.getItem(KUNCI_CONTOH) !== "0";
}

function gantiModeContoh(nyala: boolean) {
  localStorage.setItem(KUNCI_CONTOH, nyala ? "1" : "0");
  location.reload();
}

export function App() {
  // Data demo dibuat sekali per muat halaman. Tidak ada login: langsung masuk sebagai admin.
  const contoh = useMemo(modeContoh, []);
  const demo = useMemo(() => buatDemo({ contoh }), [contoh]);
  return <Aplikasi demo={demo} contoh={contoh} />;
}

function Aplikasi({
  demo,
  contoh,
}: {
  demo: ReturnType<typeof buatDemo>;
  contoh: boolean;
}) {
  const [versi, setVersi] = useState(0);
  const persona = demo.daftarPersona();
  // Tanpa pilihan "Masuk sebagai": aplikasi berjalan sebagai Super admin. ?sebagai=<userId> masih bisa dipakai untuk pengujian.
  const sebagai = new URLSearchParams(location.search).get("sebagai");
  const actor = persona.find((p) => p.userId === sebagai) ?? persona[0]!;
  const [halaman, setHalaman] = useState<Halaman>(() => halamanAwal());

  const { namaAtlet, kelompokAtlet, daftarKelompok, atletAktif } = useMemo(() => {
    const r = demo.svc.anggotaTim(demo.manajer);
    const atlet = r.ok ? r.data.atlet : [];
    const staf = r.ok ? r.data.anggota.filter((m) => m.nama) : [];
    return {
      atletAktif: atlet.filter((a) => !a.archived).map((a) => ({ id: a.id, nama: a.nama, kelompok: a.kelompok ?? "" })),
      namaAtlet: new Map([...staf.map((m) => [m.userId, m.nama!] as [string, string]), ...atlet.map((a) => [a.id, a.nama] as [string, string])]),
      kelompokAtlet: new Map(atlet.flatMap((a) => (a.kelompok ? [[a.id, a.kelompok] as [string, string]] : []))),
      daftarKelompok: [...new Set(atlet.filter((a) => !a.archived && a.kelompok).map((a) => a.kelompok!))].sort((a, b) => a.localeCompare(b)),
    };
  }, [demo, versi]);
  const [pilihan, setPilihan] = useState("");
  // Kelompok yang sudah tidak punya atlet aktif otomatis kembali ke "semua".
  const kelompok = daftarKelompok.includes(pilihan) ? pilihan : "";
  // Daftar nama atlet mengikuti pilihan kelompok; atlet terpilih jatuh ke yang pertama bila tidak ada di daftar.
  const [versiWhoop, setVersiWhoop] = useState(0);
  const daftarNama = atletAktif.filter((a) => !kelompok || a.kelompok === kelompok);
  const [idAtlet, setIdAtlet] = useState("");
  const atletTerpilih = daftarNama.find((a) => a.id === idAtlet) ?? daftarNama[0];
  const [tarik, setTarik] = useState<{ sibuk: boolean; ok?: boolean; teks?: string }>({ sibuk: false });
  // Pesan sesudah kembali dari halaman login Whoop (?whoop=terhubung|ditolak|gagal|belum-diatur).
  const [hasilWhoop, setHasilWhoop] = useState(() => new URLSearchParams(location.search).get("whoop"));
  useEffect(() => {
    if (hasilWhoop) history.replaceState(null, "", location.pathname);
  }, []);

  /** Tarik dari semua perangkat yang terhubung untuk atlet terpilih (Garmin dan/atau Whoop). */
  async function tarikData() {
    if (!atletTerpilih) return;
    setTarik({ sibuk: true });
    const [g, w] = await Promise.all([
      tarikGarmin(atletTerpilih.id, hariIniTim()),
      whoop
        .status(atletTerpilih.id)
        .then((s) => (s.connected ? whoop.sinkron(atletTerpilih.id).then(() => true) : false))
        .catch(() => false),
    ]);
    setVersiWhoop((v) => v + 1);
    const berhasil = [g.ok && "Garmin", w && "Whoop"].filter(Boolean);
    setTarik({
      sibuk: false,
      ok: berhasil.length > 0,
      teks: berhasil.length ? `Data ${berhasil.join(" & ")} ditarik` : "Belum ada perangkat terhubung. Atur di Integrasi Device.",
    });
  }

  const ctx: AppCtx = {
    svc: demo.svc,
    actor,
    hariIni: hariIniTim(),
    versi,
    segarkan: () => setVersi((v) => v + 1),
    // Nama atlet diambil dari profil agar perubahan nama langsung terlihat di semua halaman.
    nama: (id) => namaAtlet.get(id) ?? id,
    kelompok,
    daftarKelompok,
    kelompokAtlet,
    pilihKelompok: setPilihan,
    akun: demo.akun,
    kontrol: demo.svc.punyaKontrol(actor),
  };

  const kotakMasuk = actor.peran !== "atlet" && actor.peran !== "manajer_tim" ? hitungKotakMasuk(ctx) : 0;
  const otoritas = labelOtoritas({ peran: actor.peran, admin: ctx.kontrol && actor.peran !== "manajer_tim" });

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <aside className="side">
          <div className="brand">
            <Logo ukuran={44} />
            <div>
              <b>Esports Indonesia</b>
              <span>Prototipe · Tahap 1</span>
            </div>
          </div>
          <nav className="nav">
            <button className={halaman.peran === "dashboard" ? "aktif" : ""} onClick={() => setHalaman({ peran: "dashboard" })}>
              <Ikon nama="papan" />
              Dashboard
            </button>
            {actor.peran === "atlet" &&
              MENU_ATLET.map((m) => (
                <button key={m.id} className={halaman.peran === "atlet" && halaman.h === m.id ? "aktif" : ""} onClick={() => setHalaman({ peran: "atlet", h: m.id })}>
                  <Ikon nama={IKON_MENU[m.id]!} />
                  {m.label}
                </button>
              ))}
            {(actor.peran === "staf_pelatih" || actor.peran === "tim_support") &&
              MENU_STAF.filter((m) => !m.kontrol || ctx.kontrol).map((m) => {
                const aktif = halaman.peran === "staf" && (halaman.h.id === m.id || (m.id === "papan" && halaman.h.id === "atlet"));
                return (
                  <button
                    key={m.id}
                    className={aktif ? "aktif" : ""}
                    onClick={() => setHalaman({ peran: "staf", h: { id: m.id } as HalamanStaf })}
                  >
                    <Ikon nama={IKON_MENU[m.id]!} />
                    {m.label}
                    {m.id === "kotak_masuk" && kotakMasuk > 0 && <span className="hitung">{kotakMasuk}</span>}
                  </button>
                );
              })}
            {actor.peran === "manajer_tim" &&
              MENU_MANAJER.map((m) => (
                <button key={m.id} className={halaman.peran === "manajer" && halaman.h === m.id ? "aktif" : ""} onClick={() => setHalaman({ peran: "manajer", h: m.id })}>
                  <Ikon nama={IKON_MENU[m.id]!} />
                  {m.label}
                </button>
              ))}
          </nav>
          <button className={`tab-about ${halaman.peran === "about" ? "aktif" : ""}`} onClick={() => setHalaman({ peran: "about" })}>
            About
          </button>
          <div className="side-foot">
            <div className="row spread saklar-contoh">
              <span>
                <b>Data contoh</b>
                <span>{contoh ? "Aktif" : "Mati"}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={contoh}
                aria-label="Tampilkan data contoh"
                className={`saklar ${contoh ? "nyala" : ""}`}
                onClick={() => gantiModeContoh(!contoh)}
              >
                <span />
              </button>
            </div>
            Prototipe: data disimpan di memori browser dan kembali ke awal saat halaman dimuat ulang.
          </div>
        </aside>

        <div className="main">
          {contoh && (
            <div className="spanduk-contoh" role="note">
              <b>Data contoh.</b> Angka, catatan, dan laporan di aplikasi ini dibuat acak untuk memberi gambaran, bukan data asli atlet atau
              pelatih.{" "}
              <button className="link" onClick={() => gantiModeContoh(false)}>
                Matikan data contoh
              </button>
            </div>
          )}
          <header className="top">
            <span className="tanggal">{fmtTanggal(ctx.hariIni)}</span>
            <div className="pilih-atlet">
              <label>
                <span>Number of event</span>
                <select value={kelompok} onChange={(e) => setPilihan(e.target.value)}>
                  <option value="">Semua kelompok</option>
                  {daftarKelompok.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Nama atlet</span>
                <span className="avatar">{atletTerpilih ? inisial(atletTerpilih.nama) : "–"}</span>
                <select value={atletTerpilih?.id ?? ""} onChange={(e) => setIdAtlet(e.target.value)} disabled={daftarNama.length === 0}>
                  {daftarNama.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nama}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="tarik-data"
                disabled={!atletTerpilih || tarik.sibuk}
                onClick={() => void tarikData()}
                title={tarik.teks}
              >
                {tarik.sibuk ? "Menarik…" : "Tarik data"}
              </button>
              {tarik.teks && (
                <span className={`tarik-info ${tarik.ok ? "ok" : ""}`} role="status">
                  {tarik.teks}
                </span>
              )}
            </div>
          </header>
          <main className="konten" key={actor.userId}>
            {hasilWhoop && (
              <div className={`spanduk-whoop ${hasilWhoop === "terhubung" ? "ok" : "gagal"}`} role="status">
                <span>
                  {
                    {
                      terhubung: "Whoop berhasil terhubung. Data 30 hari terakhir sedang ditarik dan akan tersinkron otomatis setiap jam.",
                      ditolak: "Akses Whoop tidak disetujui. Coba hubungkan lagi dari Integrasi Device > Whoop.",
                      gagal: "Whoop gagal terhubung. Periksa Client ID/Secret dan Redirect URI, lalu coba lagi.",
                      "belum-diatur": "Whoop belum diatur. Isi Client ID dan Client Secret di Integrasi Device > Whoop.",
                    }[hasilWhoop] ?? "Whoop: " + hasilWhoop
                  }
                </span>
                <button className="link" onClick={() => setHasilWhoop(null)}>
                  Tutup
                </button>
              </div>
            )}
            {halaman.peran === "about" && <HalamanAbout />}
            {halaman.peran === "dashboard" && <Dashboard
                namaAtlet={atletTerpilih?.nama ?? null}
                idAtlet={atletTerpilih?.id ?? null}
                versi={versiWhoop}
              />}
            {halaman.peran === "atlet" && <HalamanAtlet halaman={halaman.h} pindah={(h) => setHalaman({ peran: "atlet", h })} />}
            {halaman.peran === "staf" && <HalamanStaf halaman={halaman.h} pindah={(h) => setHalaman({ peran: "staf", h })} />}
            {halaman.peran === "manajer" && <HalamanManajer halaman={halaman.h} />}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
