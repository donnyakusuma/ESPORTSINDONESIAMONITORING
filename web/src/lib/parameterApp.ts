/**
 * Parameter hitungan yang dipakai aplikasi. File harmonizer.mjs dan indeks-esports.mjs tidak diubah;
 * aplikasi mengirim parameter ini saat memanggil harmonisasi() dan hitungIndeks().
 *
 * Basis minimal diturunkan dari 14 menjadi 2 hari (dalam jendela 28 hari) agar indeks tetap keluar
 * walau data bolong-bolong. Konsekuensi: z-score dari basis 2-3 hari sangat labil (simpangan baku dari
 * dua angka), jadi nilai per hari perlu dibaca hati-hati; tren beberapa hari lebih bisa dipegang.
 */
import { PARAM as PARAM_HARMONIZER } from "./harmonizer.mjs";
import { PARAM_IND as PARAM_INDEKS } from "./indeks-esports.mjs";

/** Basis minimal (hari/sesi) untuk semua z-score. */
export const BASIS_MINIMAL = 2;

export const PARAM_HARMONI: Readonly<Record<string, number>> = Object.freeze({
  ...PARAM_HARMONIZER,
  MIN_BASIS: BASIS_MINIMAL, // basis z untuk ln HRV, durasi tidur, detak istirahat, BPR, ROS
  TTT_MIN: BASIS_MINIMAL, // median titik tengah tidur untuk deviasi (DTTT)
});

export const PARAM_IND = Object.freeze({
  ...PARAM_INDEKS,
  MIN_BASIS: BASIS_MINIMAL, // basis SD titik tengah tidur untuk komponen keteraturan
  MIN_SESI: BASIS_MINIMAL, // sesi minimum per komponen IBMS
  MIN_RATA7: BASIS_MINIMAL, // rata-rata 7 hari terdahulu untuk z IBMS-7
});
