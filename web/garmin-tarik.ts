/**
 * Penarikan dan pemetaan data Garmin Connect.
 * Tanpa import Node, supaya tipe-tipenya bisa dipakai juga oleh frontend.
 * Koordinat GPS dan foto profil sengaja tidak pernah diteruskan.
 *
 * Endpoint Garmin Connect tidak resmi dan tidak terdokumentasi, jadi beberapa
 * data dicoba dari lebih dari satu jalur; jalur yang gagal dilewati.
 */

/** Sesi Garmin berakhir atau ditolak: atlet perlu login ulang. */
export class AksesDitolak extends Error {}

/** Klien yang sudah login; path relatif terhadap https://connectapi.garmin.com. */
export interface KlienGarmin {
  get(path: string): Promise<any>;
  /** displayName pengguna, dipakai beberapa endpoint lama. */
  displayName: string;
}

type Peta = Record<string, any>;

/** Galat jaringan, 404, atau format pada satu endpoint tidak menggagalkan seluruh tarikan, kecuali akses ditolak. */
async function aman<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof AksesDitolak) throw e;
    return null;
  }
}

/** Jalur pertama yang memberi data (bukan kosong). */
async function pertama(k: KlienGarmin, paths: string[]): Promise<any> {
  for (const p of paths) {
    const v = await aman(() => k.get(p));
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

export function geserHari(tanggal: string, n: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const angka = (v: unknown): number | null => (typeof v === "number" && v >= 0 ? v : null);
const hm = (detik: unknown) => {
  if (typeof detik !== "number") return "";
  const m = Math.round(detik / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
const hmMs = (ms: unknown) => (typeof ms === "number" ? hm(ms / 1000) : "");
/** Garmin memakai -1 untuk "tidak ada data". */
const n = (v: unknown) => (typeof v === "number" && v >= 0 ? String(Math.round(v)) : "");

/** Ambil semua field angka/teks satu tingkat (dan di dalam `values`), untuk endpoint yang formatnya belum terverifikasi. */
function skalar(o: unknown): Record<string, number | string> {
  if (!o || typeof o !== "object") return {};
  const sumber = { ...(o as Peta), ...((o as Peta).values ?? {}) };
  return Object.fromEntries(
    Object.entries(sumber).filter(
      ([k, v]) => (typeof v === "number" || (typeof v === "string" && v.length < 60)) && !/pk$|^userProfile|Id$|uuid|timestamp|latitude|longitude/i.test(k)
    )
  ) as Record<string, number | string>;
}

// ───────────────────────── Ringkasan harian (kolom Dashboard) ─────────────────────────

/**
 * Satu hari statistik, dengan nama kolom yang sama seperti ekspor Garmin
 * Health Stats yang dipakai Dashboard. Ringkasan harian bisa berbentuk datar
 * (usersummary/daily) atau bersarang (v2/dailysummaries); keduanya dipetakan.
 */
export async function tarikHarian(k: KlienGarmin, nama: string, tanggal: string): Promise<Record<string, string>> {
  const dn = encodeURIComponent(k.displayName);
  const [harian, hrv, tidur] = await Promise.all([
    pertama(k, [
      `/usersummary-service/usersummary/daily/${dn}?calendarDate=${tanggal}`,
      `/usersummary-service/v2/dailysummaries?startDate=${tanggal}&endDate=${tanggal}`,
    ]),
    pertama(k, [`/hrv-service/hrv/${tanggal}`]),
    pertama(k, [
      `/wellness-service/wellness/dailySleepData/${dn}?date=${tanggal}&nonSleepBufferMinutes=60`,
      `/sleep-service/sleep/dailySleepData?date=${tanggal}`,
      `/sleep-service/sleep/dailySleep?date=${tanggal}`,
    ]),
  ]);
  const v2: Peta | undefined = harian?.data?.[0];
  const f: Peta = v2 ? {} : (harian ?? {});
  const st: Peta = v2?.stress ?? {};
  const bb: Peta = v2?.bodyBattery ?? {};
  const t: Peta = tidur?.dailySleepDTO ?? tidur ?? {};
  const h: Peta = hrv?.hrvSummary ?? {};
  // Ringkasan datar memakai detik, v2 memakai milidetik.
  const dur = (datar: string, kunciV2: string) => (v2 ? hmMs(st[kunciV2]) : hm(f[datar]));
  const stres = v2 ? [st.lowStressDurationInMillis, st.mediumStressDurationInMillis, st.highStressDurationInMillis] : [];
  return {
    Name: nama,
    "HRV Last Night Avg. (ms)": n(h.lastNightAvg),
    "Resting HR (bpm)": n(v2 ? v2.heartRate?.restingValue : f.restingHeartRate),
    "Avg Sleep (h:min)": hm(t.sleepTimeSeconds),
    "Sleep Score": n(t.sleepScores?.overall?.value),
    "Total Calories (kcal)": n(v2 ? v2.calories?.burnedTotal : f.totalKilocalories),
    "Body Battery (Max)": n(v2 ? bb.maxValue : f.bodyBatteryHighestValue),
    "Body Battery (Min)": n(v2 ? bb.minValue : f.bodyBatteryLowestValue),
    "High Stress Dur. (h:min)": dur("highStressDuration", "highStressDurationInMillis"),
    "Body Battery (Charge)": n(v2 ? bb.chargedValue : f.bodyBatteryChargedValue),
    "Body Battery (Drain)": n(v2 ? bb.drainedValue : f.bodyBatteryDrainedValue),
    "HRV Last Night High (ms)": n(h.lastNight5MinHigh),
    "Avg. Deep Sleep (h:min)": hm(t.deepSleepSeconds),
    "Avg. Light Sleep (h:min)": hm(t.lightSleepSeconds),
    "Avg. REM Sleep (h:min)": hm(t.remSleepSeconds),
    "Avg. Sleep Awake Dur. (h:min)": hm(t.awakeSleepSeconds),
    "Nap Duration (h:min)": hm(t.napTimeSeconds),
    "Activity Stress Dur. (h:min)": dur("activityStressDuration", "activityDurationInMillis"),
    "Avg. Daily Stress Level": n(v2 ? st.avgLevel : f.averageStressLevel),
    "Rest Stress Dur. (h:min)": dur("restStressDuration", "restDurationInMillis"),
    "Stress Duration (h:min)": v2
      ? hmMs(stres.every((x) => typeof x === "number") ? stres.reduce((a, b) => a + b, 0) : undefined)
      : hm(f.stressDuration),
    "Medium Stress Dur. (h:min)": dur("mediumStressDuration", "mediumStressDurationInMillis"),
    "Max. Stress Level": n(v2 ? st.maxLevel : f.maxStressLevel),
    "Low Stress Dur. (h:min)": dur("lowStressDuration", "lowStressDurationInMillis"),
    Steps: n(v2 ? v2.movement?.steps?.value : f.totalSteps),
    "Step Goal": n(v2 ? v2.movement?.steps?.goal : f.dailyStepGoal),
    "Respiration Avg. (brpm)": n(v2 ? v2.respiration?.avgValue : f.avgWakingRespirationValue),
  };
}

// ───────────────────────── Aktivitas ─────────────────────────

export interface AktivitasGarmin {
  id: number;
  nama: string;
  jenis: string;
  /** Waktu mulai lokal, "YYYY-MM-DD HH:mm:ss". */
  mulai: string;
  /** Waktu mulai ISO UTC, untuk menghitung jam di zona waktu tim. */
  mulaiIso: string | null;
  durasiDetik: number | null;
  jarakMeter: number | null;
  kalori: number | null;
  hrRata: number | null;
  hrMaks: number | null;
  menitIntensitas: number | null;
  efekLatihan: string | null;
  /** Detik di zona detak jantung 1-5. */
  zonaHr: (number | null)[];
}

export async function tarikAktivitas(k: KlienGarmin, limit: number): Promise<AktivitasGarmin[] | null> {
  return aman(async () => {
    const daftar = (await k.get(`/activitylist-service/activities/search/activities?start=0&limit=${limit}`)) as Peta[] | null;
    return (daftar ?? []).map((a) => ({
      id: a.activityId,
      nama: a.activityName ?? "",
      jenis: a.activityType?.typeKey ?? "",
      mulai: a.startTimeLocal ?? "",
      mulaiIso: typeof a.startTimeGMT === "string" ? `${a.startTimeGMT.replace(" ", "T")}Z` : null,
      durasiDetik: angka(a.duration),
      jarakMeter: angka(a.distance) || null,
      kalori: angka(a.calories),
      hrRata: angka(a.averageHR),
      hrMaks: angka(a.maxHR),
      menitIntensitas:
        typeof a.moderateIntensityMinutes === "number" || typeof a.vigorousIntensityMinutes === "number"
          ? (a.moderateIntensityMinutes ?? 0) + (a.vigorousIntensityMinutes ?? 0)
          : null,
      efekLatihan: a.trainingEffectLabel ?? null,
      zonaHr: [1, 2, 3, 4, 5].map((z) => angka(a[`hrTimeInZone_${z}`])),
    }));
  });
}

export interface DetailAktivitas {
  ringkasan: { label: string; nilai: string }[];
  split: { jenis: string; jumlah: number | null; durasiDetik: number | null; jarakMeter: number | null }[];
  workout: { nama: string; ringkas: Record<string, number | string> }[];
}

const JENIS_SPLIT: Record<string, string> = {
  INTERVAL_ACTIVE: "Aktif",
  RWD_RUN: "Lari",
  RWD_WALK: "Jalan",
  RWD_STAND: "Berdiri",
  INTERVAL_REST: "Istirahat",
  INTERVAL_WARMUP: "Pemanasan",
  INTERVAL_COOLDOWN: "Pendinginan",
};

export async function tarikDetailAktivitas(k: KlienGarmin, id: string): Promise<DetailAktivitas | null> {
  const [d, w] = await Promise.all([k.get(`/activity-service/activity/${id}`), aman(() => k.get(`/activity-service/activity/${id}/workouts`))]);
  if (!d) return null;
  const s: Peta = d.summaryDTO ?? {};
  const baris: [string, unknown, (v: number) => string][] = [
    ["Durasi bergerak", s.movingDuration, (v) => `${Math.round(v / 60)} menit`],
    ["Kecepatan rata-rata", s.averageMovingSpeed ?? s.averageSpeed, (v) => `${(v * 3.6).toFixed(1)} km/j`],
    ["Kecepatan maks", s.maxSpeed, (v) => `${(v * 3.6).toFixed(1)} km/j`],
    ["HR terendah", s.minHR, (v) => `${Math.round(v)} bpm`],
    ["Kadens rata-rata", s.averageRunCadence, (v) => `${Math.round(v)} spm`],
    ["Panjang langkah", s.strideLength, (v) => `${Math.round(v)} cm`],
    ["Langkah", s.steps, (v) => Math.round(v).toLocaleString("id-ID")],
    ["Naik / turun", s.elevationGain, (v) => `${v.toFixed(0)} / ${(s.elevationLoss ?? 0).toFixed(0)} m`],
    ["Training effect aerobik", s.trainingEffect ?? s.aerobicTrainingEffect, (v) => v.toFixed(1)],
    ["Training effect anaerobik", s.anaerobicTrainingEffect, (v) => v.toFixed(1)],
    ["Menit intensitas sedang / tinggi", s.moderateIntensityMinutes, (v) => `${v} / ${s.vigorousIntensityMinutes ?? 0}`],
    ["Perubahan Body Battery", s.differenceBodyBattery, (v) => String(v)],
    ["Perkiraan keringat", s.waterEstimated, (v) => `${Math.round(v)} ml`],
  ];
  return {
    ringkasan: [
      ...baris.flatMap(([label, v, f]) => (typeof v === "number" ? [{ label, nilai: f(v) }] : [])),
      ...(s.trainingEffectLabel ? [{ label: "Fokus latihan", nilai: String(s.trainingEffectLabel).replace(/_/g, " ").toLowerCase() }] : []),
    ],
    split: ((d.splitSummaries ?? []) as Peta[]).map((x) => ({
      jenis: JENIS_SPLIT[x.splitType] ?? String(x.splitType ?? "").replace(/_/g, " ").toLowerCase(),
      jumlah: angka(x.noOfSplits),
      durasiDetik: angka(x.duration),
      jarakMeter: angka(x.distance),
    })),
    workout: ((Array.isArray(w) ? w : []) as Peta[]).map((x) => ({ nama: x.workoutName ?? x.name ?? "Workout", ringkas: skalar(x) })),
  };
}

// ───────────────────────── Data tambahan ─────────────────────────

export interface EkstraGarmin {
  /** 28 hari sampai tanggal yang diminta. */
  langkah: { tanggal: string; langkah: number | null; target: number | null; jarakMeter: number | null }[];
  spo2: { rataRata: number | null; terendah: number | null; terbaru: number | null; rata7Hari: number | null; saatTidur: number | null } | null;
  detakJantung: { min: number | null; maks: number | null; istirahat: number | null; istirahat7Hari: number | null; perJam: (number | null)[] } | null;
  vo2max: { tanggal: string; nilai: number; olahraga: string } | null;
  fitnessAge: { usia: number | null; usiaKebugaran: number | null; bisaDicapai: number | null; komponen: { nama: string; nilai: number | null; target: number | null }[] } | null;
  zonaHr: { metode: string; batasBawah: number[]; hrMaks: number | null; hrIstirahat: number | null } | null;
  /** 90 hari terakhir. */
  berat: { tanggal: string; beratKg: number | null; bmi: number | null; lemakPersen: number | null }[];
  /** 7 hari terakhir; format respons belum terverifikasi dengan data nyata. */
  hidrasi: { tanggal: string; nilai: Record<string, number | string> }[];
  makanan: { jumlahMakanan: number; nilai: Record<string, number | string> } | null;
  siklus: Record<string, number | string> | null;
  /** 7 hari terakhir. */
  aktivitasWellness: { nilai: Record<string, number | string> }[];
}

const KOMPONEN_FITNESS_AGE: Record<string, string> = {
  vigorousDaysAvg: "Hari aktivitas berat / minggu",
  vigorousMinutesAvg: "Menit aktivitas berat / minggu",
  rhr: "Detak jantung istirahat",
  bmi: "BMI",
  bodyFat: "Lemak tubuh",
};

export async function tarikEkstra(k: KlienGarmin, tanggal: string): Promise<EkstraGarmin> {
  const dn = encodeURIComponent(k.displayName);
  const [steps, spo2, hr, vo2, fa, zona, berat, hidrasi, makanan, siklus, wellness] = await Promise.all([
    pertama(k, [`/usersummary-service/stats/steps/daily/${geserHari(tanggal, -27)}/${tanggal}`]),
    pertama(k, [`/wellness-service/wellness/daily/spo2/${tanggal}`, `/wellness-service/wellness/daily/spo2acclimation/${tanggal}`]),
    pertama(k, [`/wellness-service/wellness/dailyHeartRate?date=${tanggal}`, `/wellness-service/wellness/dailyHeartRate/${dn}?date=${tanggal}`]),
    pertama(k, [`/metrics-service/metrics/maxmet/daily/${geserHari(tanggal, -89)}/${tanggal}`]),
    pertama(k, [`/fitnessage-service/fitnessage/${tanggal}`, `/fitnessage-service/fitnessage/v2/${tanggal}`]),
    pertama(k, [`/biometric-service/heartRateZones`, `/biometric-service/heartRateZones/v2`]),
    pertama(k, [
      `/weight-service/weight/range/${geserHari(tanggal, -89)}/${tanggal}?includeAll=true`,
      `/weight-service/weight/dateRange?startDate=${geserHari(tanggal, -89)}&endDate=${tanggal}`,
    ]),
    pertama(k, [
      `/usersummary-service/usersummary/hydration/daily/${tanggal}`,
      `/usersummary-service/stats/hydration/daily/${geserHari(tanggal, -6)}/${tanggal}`,
    ]),
    pertama(k, [`/nutrition-service/food/logs/${tanggal}`]),
    pertama(k, [`/periodichealth-service/menstrualcycle/dayview/${tanggal}`, `/periodichealth-service/menstrualcycle/summary/${tanggal}`]),
    pertama(k, [`/wellnessactivity-service/activity/summary/range/${geserHari(tanggal, -6)}/${tanggal}`]),
  ]);

  // Detak jantung per jam lokal: selisih timestamp lokal dan GMT memberi offset zona waktu.
  let detakJantung: EkstraGarmin["detakJantung"] = null;
  if (hr) {
    const offset = hr.startTimestampLocal && hr.startTimestampGMT ? Date.parse(`${hr.startTimestampLocal}Z`) - Date.parse(`${hr.startTimestampGMT}Z`) : 0;
    const jam: number[][] = Array.from({ length: 24 }, () => []);
    for (const [ts, v] of (hr.heartRateValues ?? []) as [number, number | null][]) {
      if (typeof v === "number") jam[new Date(ts + offset).getUTCHours()]!.push(v);
    }
    detakJantung = {
      min: angka(hr.minHeartRate),
      maks: angka(hr.maxHeartRate),
      istirahat: angka(hr.restingHeartRate),
      istirahat7Hari: angka(hr.lastSevenDaysAvgRestingHeartRate),
      perJam: jam.map((x) => (x.length ? Math.round(x.reduce((a, b) => a + b, 0) / x.length) : null)),
    };
  }

  const vo2Terakhir = ((vo2 ?? []) as Peta[])
    .map((x) => x.generic ?? x.cycling)
    .filter((g): g is Peta => !!g && typeof (g.vo2MaxPreciseValue ?? g.vo2MaxValue) === "number")
    .sort((a, b) => String(b.calendarDate).localeCompare(String(a.calendarDate)))[0];

  const z = ((zona ?? []) as Peta[]).find((x) => x.sport === "DEFAULT") ?? (zona as Peta[] | null)?.[0];

  return {
    langkah: ((steps ?? []) as Peta[]).map((x) => ({
      tanggal: x.calendarDate,
      langkah: angka(x.totalSteps),
      target: angka(x.stepGoal),
      jarakMeter: angka(x.totalDistance),
    })),
    spo2:
      spo2 && [spo2.averageSpO2, spo2.lowestSpO2, spo2.latestSpO2, spo2.avgSleepSpO2].some((v) => typeof v === "number")
        ? {
            rataRata: angka(spo2.averageSpO2),
            terendah: angka(spo2.lowestSpO2),
            terbaru: angka(spo2.latestSpO2),
            rata7Hari: angka(spo2.lastSevenDaysAvgSpO2),
            saatTidur: angka(spo2.avgSleepSpO2),
          }
        : null,
    detakJantung,
    vo2max: vo2Terakhir
      ? { tanggal: vo2Terakhir.calendarDate, nilai: vo2Terakhir.vo2MaxPreciseValue ?? vo2Terakhir.vo2MaxValue, olahraga: String(vo2Terakhir.sport ?? "").toLowerCase() }
      : null,
    fitnessAge: fa
      ? {
          usia: angka(fa.chronologicalAge),
          usiaKebugaran: angka(fa.fitnessAge),
          bisaDicapai: angka(fa.achievableFitnessAge),
          komponen: Object.entries((fa.components ?? {}) as Record<string, Peta>).map(([k, v]) => ({
            nama: KOMPONEN_FITNESS_AGE[k] ?? k,
            nilai: angka(v.value),
            target: angka(v.targetValue),
          })),
        }
      : null,
    zonaHr: z
      ? {
          metode: z.trainingMethod ?? "",
          batasBawah: [z.zone1Floor, z.zone2Floor, z.zone3Floor, z.zone4Floor, z.zone5Floor].filter((v): v is number => typeof v === "number"),
          hrMaks: angka(z.maxHeartRateUsed),
          hrIstirahat: angka(z.restingHeartRateUsed),
        }
      : null,
    berat: ((berat?.dailyWeightSummaries ?? berat?.dateWeightList ?? []) as Peta[]).map((x) => {
      const w: Peta = x.latestWeight ?? x;
      return {
        tanggal: x.summaryDate ?? w.calendarDate ?? "",
        // Garmin menyimpan berat dalam gram.
        beratKg: typeof w.weight === "number" ? Math.round(w.weight / 100) / 10 : null,
        bmi: angka(w.bmi),
        lemakPersen: angka(w.bodyFat),
      };
    }),
    hidrasi: ((Array.isArray(hidrasi) ? hidrasi : hidrasi ? [hidrasi] : []) as Peta[])
      .map((x) => ({ tanggal: x.calendarDate ?? tanggal, nilai: skalar(x) }))
      // Hanya target tanpa asupan tidak dihitung sebagai data.
      .filter((x) => Object.entries(x.nilai).some(([k, v]) => typeof v === "number" && v > 0 && !/goal/i.test(k))),
    makanan:
      makanan && ((makanan.mealDetails ?? []).length > 0 || (makanan.loggedFoodsWithServingSizes ?? []).length > 0)
        ? { jumlahMakanan: (makanan.loggedFoodsWithServingSizes ?? []).length, nilai: skalar(makanan.dailyNutritionContent ?? makanan.nutritionContent ?? makanan) }
        : null,
    siklus: siklus ? skalar(siklus) : null,
    aktivitasWellness: ((Array.isArray(wellness) ? wellness : []) as Peta[]).map((x) => ({ nilai: skalar(x) })),
  };
}
