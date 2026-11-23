// Menarik data WHOOP ke penyimpanan lokal: backfill, rekonsiliasi, dan pemrosesan webhook.
import * as whoop from './whoop.js';
import * as store from './store.js';

// Kunci recovery = sleep_id, karena webhook v2 untuk recovery membawa UUID tidur (bukan cycle id).
const COLLECTIONS = [
  { type: 'sleep', path: '/v2/activity/sleep', id: (r) => r.id },
  { type: 'workout', path: '/v2/activity/workout', id: (r) => r.id },
  { type: 'recovery', path: '/v2/recovery', id: (r) => r.sleep_id },
  { type: 'cycle', path: '/v2/cycle', id: (r) => r.id }, // tidak ada webhook untuk cycle -> wajib polling
];

export async function syncAthlete(athleteId, days = 7) {
  const start = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const result = {};
  for (const c of COLLECTIONS) {
    try {
      const recs = await whoop.fetchCollection(athleteId, c.path, { start });
      const items = recs.filter((r) => c.id(r) != null).map((r) => ({ id: c.id(r), data: r }));
      result[c.type] = store.upsertMany(athleteId, c.type, items);
    } catch (err) {
      result[c.type] = { error: err.message };
    }
  }
  return result;
}

export async function syncAll(days = 2) {
  for (const id of store.listAthleteIds()) {
    try { await syncAthlete(id, days); } catch (e) { console.error('rekonsiliasi gagal', id, e.message); }
  }
}

// Webhook hanya pemberitahuan; datanya harus diambil lagi lewat API.
export async function handleWebhookEvent(evt) {
  const { user_id: userId, id, type, trace_id: traceId } = evt || {};
  if (!type || id == null || userId == null) return 'ignored';
  const athleteId = store.findAthleteByWhoopUser(userId);
  if (!athleteId) return 'unknown-user';
  if (store.hasTrace(traceId)) return 'duplicate';

  const [kind, action] = String(type).split('.');
  if (action === 'deleted') {
    store.deleteRecord(athleteId, kind, id); // recovery: id = UUID tidur
  } else if (action === 'updated') {
    if (kind === 'sleep' || kind === 'workout') {
      const rec = await whoop.getOne(athleteId, `/v2/activity/${kind}/${id}`);
      if (rec) store.upsertMany(athleteId, kind, [{ id: rec.id, data: rec }]);
    } else if (kind === 'recovery') {
      // id = UUID tidur -> ambil tidur untuk mendapatkan cycle_id -> ambil recovery cycle tsb
      const sleepRec = await whoop.getOne(athleteId, `/v2/activity/sleep/${id}`);
      if (sleepRec) {
        store.upsertMany(athleteId, 'sleep', [{ id: sleepRec.id, data: sleepRec }]);
        const rec = await whoop.getOne(athleteId, `/v2/cycle/${sleepRec.cycle_id}/recovery`);
        if (rec) store.upsertMany(athleteId, 'recovery', [{ id: rec.sleep_id ?? id, data: rec }]);
      }
    } else {
      return 'ignored';
    }
  } else {
    return 'ignored';
  }
  store.markTraceSeen(traceId); // ditandai setelah sukses agar pengiriman ulang tetap bisa diproses
  return `${kind}.${action}`;
}

// Ringkasan sederhana untuk dashboard pelatih.
const scored = (r) => r.data.score_state === 'SCORED' && r.data.score;
const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null);
const sum = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) * 100) / 100;

export function summarize(athleteId, days = 7) {
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const get = (type) => store.listRecords(athleteId, { type, since, limit: 100000 }).filter(scored);
  const rec = get('recovery');
  const slp = get('sleep').filter((r) => !r.data.nap);
  const cyc = get('cycle');
  const wrk = get('workout');
  return {
    days,
    recovery: {
      n: rec.length,
      avgScore: avg(rec.map((r) => r.data.score.recovery_score)),
      avgHrvRmssdMs: avg(rec.map((r) => r.data.score.hrv_rmssd_milli)),
      avgRestingHr: avg(rec.map((r) => r.data.score.resting_heart_rate)),
      latest: rec[0]?.data.score ?? null,
    },
    sleep: {
      n: slp.length,
      avgPerformancePct: avg(slp.map((r) => r.data.score.sleep_performance_percentage)),
      avgConsistencyPct: avg(slp.map((r) => r.data.score.sleep_consistency_percentage)),
    },
    cycle: {
      n: cyc.length,
      avgDayStrain: avg(cyc.map((r) => r.data.score.strain)),
      totalKilojoule: sum(cyc.map((r) => r.data.score.kilojoule ?? 0)),
    },
    workouts: {
      n: wrk.length,
      totalStrain: sum(wrk.map((r) => r.data.score.strain ?? 0)),
      avgStrain: avg(wrk.map((r) => r.data.score.strain ?? 0)),
    },
  };
}
