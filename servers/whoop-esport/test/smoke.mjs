// Uji alur lengkap dengan server WHOOP TIRUAN (tidak menyentuh WHOOP asli).
// Jalankan: npm test
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MOCK = 4200, APP = 3200, SECRET = 'sec';
const day = (i) => new Date(Date.now() - i * 864e5).toISOString();

// ---- data tiruan ----
const sleeps = [1, 2, 3].map((i) => ({ id: `sl-${i}`, cycle_id: 100 + i, user_id: 10129, start: day(i), nap: false, score_state: 'SCORED',
  score: { sleep_performance_percentage: 80 + i, sleep_consistency_percentage: 70 + i } }));
const recoveries = [1, 2, 3].map((i) => ({ cycle_id: 100 + i, sleep_id: `sl-${i}`, user_id: 10129, created_at: day(i), score_state: 'SCORED',
  score: { recovery_score: 100 - i * 20, resting_heart_rate: 50 + i, hrv_rmssd_milli: 60 - i } })); // 80, 60, 40
const cycles = [1, 2, 3].map((i) => ({ id: 100 + i, user_id: 10129, start: day(i), score_state: 'SCORED', score: { strain: 10 + i, kilojoule: 8000 } }));
const workouts = [{ id: 'w-1', user_id: 10129, start: day(1), sport_name: 'running', score_state: 'SCORED', score: { strain: 8 } }];
const extraSleep = { id: 'sl-new', cycle_id: 104, user_id: 10129, start: day(0), nap: false, score_state: 'SCORED', score: { sleep_performance_percentage: 90 } };
const extraRecovery = { cycle_id: 104, sleep_id: 'sl-new', user_id: 10129, created_at: day(0), score_state: 'SCORED', score: { recovery_score: 95 } };

const m = { accessToken: null, refreshToken: null, refreshCalls: 0, revoked: 0, got429: false, rate429Once: false, lastBearer: null, hits: {}, state: null };
const page = (arr, u) => {
  const size = 2, from = Number(u.searchParams.get('nextToken') || 0);
  const next = from + size < arr.length ? String(from + size) : undefined;
  return { records: arr.slice(from, from + size), ...(next ? { next_token: next } : {}) };
};

const mock = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${MOCK}`);
  const json = (o, code = 200) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(o));
  if (u.pathname === '/oauth/auth') {
    assert.equal(u.searchParams.get('response_type'), 'code');
    assert.equal(u.searchParams.get('client_id'), 'cid');
    assert.equal(u.searchParams.get('redirect_uri'), `http://localhost:${APP}/whoop/callback`);
    assert.equal(u.searchParams.get('state').length, 8); // aturan WHOOP: state 8 karakter
    const scopes = u.searchParams.get('scope').split(' ');
    for (const s of ['offline', 'read:recovery', 'read:sleep', 'read:workout', 'read:cycles', 'read:profile']) assert.ok(scopes.includes(s), s);
    const back = new URL(u.searchParams.get('redirect_uri'));
    back.searchParams.set('code', 'CODE1');
    back.searchParams.set('state', u.searchParams.get('state'));
    return res.writeHead(302, { Location: back.toString() }).end();
  }
  if (u.pathname === '/oauth/token' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      assert.equal(req.headers['content-type'], 'application/x-www-form-urlencoded');
      const p = new URLSearchParams(raw);
      assert.equal(p.get('client_id'), 'cid');
      assert.equal(p.get('client_secret'), SECRET);
      if (p.get('grant_type') === 'authorization_code') {
        assert.equal(p.get('code'), 'CODE1');
        assert.equal(p.get('redirect_uri'), `http://localhost:${APP}/whoop/callback`);
        m.accessToken = 'AT1'; m.refreshToken = 'RT1';
        // 100 dtk < margin pengaman 120 dtk -> dianggap kedaluwarsa -> request berikutnya memicu refresh
        return json({ access_token: 'AT1', expires_in: 100, token_type: 'bearer', refresh_token: 'RT1', scope: 'offline read:sleep' });
      }
      if (p.get('grant_type') === 'refresh_token') {
        m.refreshCalls++;
        assert.equal(p.get('scope'), 'offline');
        if (p.get('refresh_token') !== m.refreshToken) return json({ error: 'invalid_grant' }, 400);
        m.accessToken = 'AT' + (m.refreshCalls + 1); m.refreshToken = 'RT' + (m.refreshCalls + 1);
        return setTimeout(() => json({ access_token: m.accessToken, expires_in: 3600, refresh_token: m.refreshToken, scope: 'offline' }), 50);
      }
      res.writeHead(400).end();
    });
    return;
  }
  // ---- REST API (/developer/...) ----
  m.lastBearer = req.headers.authorization;
  if (req.headers.authorization !== `Bearer ${m.accessToken}`) return res.writeHead(401).end();
  if (m.rate429Once) { m.rate429Once = false; m.got429 = true; return res.writeHead(429, { 'X-RateLimit-Reset': '1' }).end(); }
  const p = u.pathname.replace('/developer', '');
  m.hits[p] = (m.hits[p] ?? 0) + 1;
  if (p === '/v2/user/profile/basic') return json({ user_id: 10129, email: 'x@y.z', first_name: 'A', last_name: 'B' });
  if (p === '/v2/activity/sleep') return json(page(sleeps, u));
  if (p === '/v2/recovery') return json(page(recoveries, u));
  if (p === '/v2/cycle') return json(page(cycles, u));
  if (p === '/v2/activity/workout') return json(page(workouts, u));
  if (p === '/v2/activity/sleep/sl-new') return json(extraSleep);
  if (p === '/v2/cycle/104/recovery') return json(extraRecovery);
  if (p === '/v2/user/access' && req.method === 'DELETE') { m.revoked++; return res.writeHead(204).end(); }
  res.writeHead(404).end();
});
await new Promise((r) => mock.listen(MOCK, r));

// ---- aplikasi kita ----
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whoop-test-'));
const child = spawn(process.execPath, ['src/server.js'], {
  env: {
    ...process.env, PORT: APP, DATA_DIR: dataDir, BACKFILL_ON_CONNECT: 'false',
    WHOOP_CLIENT_ID: 'cid', WHOOP_CLIENT_SECRET: SECRET,
    WHOOP_REDIRECT_URI: `http://localhost:${APP}/whoop/callback`,
    TOKEN_ENC_KEY: crypto.randomBytes(32).toString('hex'),
    WHOOP_AUTH_URL: `http://localhost:${MOCK}/oauth/auth`,
    WHOOP_TOKEN_URL: `http://localhost:${MOCK}/oauth/token`,
    WHOOP_API_BASE: `http://localhost:${MOCK}/developer`,
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const finish = (code) => { child.kill(); mock.close(); fs.rmSync(dataDir, { recursive: true, force: true }); process.exit(code); };
process.on('uncaughtException', (e) => { console.error('GAGAL:', e); finish(1); });
process.on('unhandledRejection', (e) => { console.error('GAGAL:', e); finish(1); });

for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`http://localhost:${APP}/health`)).ok) break; } catch { await new Promise((r) => setTimeout(r, 100)); }
}
const A = (p, o) => fetch(`http://localhost:${APP}${p}`, { redirect: 'manual', ...o });
const J = async (p, o) => (await A(p, o)).json();
const waitFor = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); } throw new Error('waitFor timeout'); };

// ---- 1) connect -> consent -> callback ----
let r = await A('/whoop/connect?athleteId=a1');
assert.equal(r.status, 302);
r = await fetch(r.headers.get('location'), { redirect: 'manual' }); // atlet menyetujui di WHOOP
const callbackUrl = r.headers.get('location');
const cb = await fetch(callbackUrl, { redirect: 'manual' });
assert.equal(cb.status, 302);
assert.match(cb.headers.get('location'), /\?whoop=terhubung$/); // kembali ke aplikasi
console.log('ok  connect -> consent (scope offline, state 8 karakter) -> callback -> token + profil');

// ---- 2) state sekali pakai / palsu ----
assert.equal((await fetch(callbackUrl, { redirect: 'manual' })).status, 400);
assert.equal((await fetch(`http://localhost:${APP}/whoop/callback?code=x&state=palsu123`)).status, 400);
console.log('ok  state dipakai ulang / palsu ditolak');

// ---- 2b) atur kredensial dari aplikasi ----
let cfg = await J('/api/whoop/config');
assert.equal(cfg.configured, true);
assert.equal((await A('/api/whoop/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"clientId":""}' })).status, 400);
console.log('ok  /api/whoop/config: status terbaca, input kosong ditolak');

// ---- 3) status ----
let st = await J('/api/athletes/a1/status');
assert.equal(st.connected, true);
assert.equal(st.whoopUserId, '10129');
assert.deepEqual(await J('/api/whoop/athletes'), ['a1']);
console.log('ok  status + user_id tersimpan, daftar atlet terhubung');

// ---- 4) refresh otomatis, 3 sync paralel -> hanya 1 refresh; paginasi next_token ----
const outs = await Promise.all([1, 2, 3].map(() => J('/api/athletes/a1/sync?days=7', { method: 'POST' })));
outs.forEach((o) => assert.deepEqual(o, { sleep: 3, workout: 1, recovery: 3, cycle: 3 }));
assert.equal(m.refreshCalls, 1);
assert.equal(m.lastBearer, 'Bearer AT2');
console.log('ok  refresh 1x untuk 3 sync paralel; paginasi (3 data / 2 per halaman) lengkap');

// ---- 5) records & ringkasan ----
assert.equal((await J('/api/athletes/a1/records?type=sleep')).length, 3);
const sum = await J('/api/athletes/a1/summary?days=7');
assert.equal(sum.recovery.n, 3);
assert.equal(sum.recovery.avgScore, 60);
assert.equal(sum.cycle.avgDayStrain, 12);
assert.equal(sum.workouts.n, 1);
console.log('ok  records + ringkasan (rata-rata recovery 60, strain harian 12)');

// ---- 6) 429: tunggu X-RateLimit-Reset lalu ulangi ----
m.rate429Once = true;
const o429 = await J('/api/athletes/a1/sync?days=1', { method: 'POST' });
assert.ok(m.got429);
assert.deepEqual(o429, { sleep: 3, workout: 1, recovery: 3, cycle: 3 });
console.log('ok  429 ditangani (menunggu lalu berhasil)');

// ---- 7) webhook ----
const send = (evt, { ts = String(Date.now()), sign = true } = {}) => {
  const body = JSON.stringify(evt);
  const sig = crypto.createHmac('sha256', SECRET).update(ts + body).digest('base64');
  const headers = { 'content-type': 'application/json' };
  if (sign) { headers['X-WHOOP-Signature'] = sig; headers['X-WHOOP-Signature-Timestamp'] = ts; }
  return A('/whoop/webhook', { method: 'POST', headers, body });
};
assert.equal((await send({ user_id: 10129, id: 'sl-new', type: 'sleep.updated', trace_id: 'x' }, { sign: false })).status, 401);
const bad = await A('/whoop/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'X-WHOOP-Signature': 'AAAA', 'X-WHOOP-Signature-Timestamp': '1' }, body: '{}' });
assert.equal(bad.status, 401);

assert.equal((await send({ user_id: 10129, id: 'sl-new', type: 'sleep.updated', trace_id: 't1' })).status, 200);
await waitFor(async () => (await J('/api/athletes/a1/records?type=sleep')).length === 4);
await send({ user_id: 10129, id: 'sl-new', type: 'sleep.updated', trace_id: 't1' }); // duplikat
await new Promise((r) => setTimeout(r, 300));
assert.equal(m.hits['/v2/activity/sleep/sl-new'], 1); // tidak diproses ulang
console.log('ok  webhook: tanda tangan salah ditolak, sleep.updated diambil, duplikat (trace_id) dilewati');

await send({ user_id: 10129, id: 'sl-new', type: 'recovery.updated', trace_id: 't2' }); // id = UUID tidur
await waitFor(async () => (await J('/api/athletes/a1/records?type=recovery')).length === 4);
console.log('ok  recovery.updated: UUID tidur -> cycle_id -> recovery tersimpan');

await send({ user_id: 99999, id: 'sl-new', type: 'sleep.updated', trace_id: 't3' }); // atlet tak dikenal
await send({ user_id: 10129, id: 'w-1', type: 'workout.deleted', trace_id: 't4' });
await send({ user_id: 10129, id: 'sl-1', type: 'recovery.deleted', trace_id: 't5' });
await waitFor(async () => (await J('/api/athletes/a1/records?type=workout')).length === 0
  && (await J('/api/athletes/a1/records?type=recovery')).length === 3);
console.log('ok  *.deleted menghapus data; user_id tak dikenal diabaikan');

// ---- 8) disconnect ----
r = await A('/whoop/disconnect/a1', { method: 'DELETE' });
assert.equal(r.status, 200);
assert.equal(m.revoked, 1);
st = await J('/api/athletes/a1/status');
assert.equal(st.connected, false);
assert.equal((await J('/api/athletes/a1/records')).length, 0);
console.log('ok  disconnect memanggil DELETE /v2/user/access dan menghapus token + data lokal');

console.log('\nSEMUA UJI LULUS');
finish(0);
