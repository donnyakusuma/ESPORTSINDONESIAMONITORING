// Uji alur lengkap dengan server Garmin TIRUAN (tanpa menyentuh Garmin asli).
// Jalankan: npm test
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { codeChallengeFromVerifier, generateCodeVerifier } from '../src/pkce.js';

const MOCK = 4100, APP = 3100;
const sha = (v) => crypto.createHash('sha256').update(v).digest('base64url');

// ---- 0) PKCE: vektor uji resmi RFC 7636 Appendix B ----
assert.equal(
  codeChallengeFromVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
  'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
);
const v = generateCodeVerifier();
assert.ok(v.length >= 43 && v.length <= 128 && /^[A-Za-z0-9\-._~]+$/.test(v));
console.log('ok  PKCE sesuai RFC 7636');

// ---- Garmin tiruan ----
const m = { challenges: new Map(), accessToken: null, refreshToken: null, refreshCalls: 0, deleted: 0, lastBearer: null };
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${MOCK}`);
  if (u.pathname === '/oauth2Confirm') {
    assert.equal(u.searchParams.get('response_type'), 'code');
    assert.equal(u.searchParams.get('client_id'), 'cid');
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    m.challenges.set('CODE1', u.searchParams.get('code_challenge'));
    const back = new URL(u.searchParams.get('redirect_uri'));
    back.searchParams.set('code', 'CODE1');
    back.searchParams.set('state', u.searchParams.get('state'));
    res.writeHead(302, { Location: back.toString() }).end();
    return;
  }
  if (u.pathname === '/token' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      assert.equal(req.headers['content-type'], 'application/x-www-form-urlencoded');
      const p = new URLSearchParams(raw);
      assert.equal(p.get('client_id'), 'cid');
      assert.equal(p.get('client_secret'), 'sec');
      if (p.get('grant_type') === 'authorization_code') {
        assert.equal(sha(p.get('code_verifier')), m.challenges.get(p.get('code')));
        assert.equal(p.get('redirect_uri'), `http://localhost:${APP}/garmin/callback`);
        m.accessToken = 'AT1'; m.refreshToken = 'RT1';
        // 600 detik = langsung dianggap kedaluwarsa oleh margin pengaman -> memicu refresh
        return res.end(JSON.stringify({ access_token: 'AT1', expires_in: 600, token_type: 'bearer', refresh_token: 'RT1', scope: 'CONNECT_READ', refresh_token_expires_in: 7775998 }));
      }
      if (p.get('grant_type') === 'refresh_token') {
        m.refreshCalls++;
        if (p.get('refresh_token') !== m.refreshToken) return res.writeHead(400).end('{"error":"invalid_grant"}');
        m.accessToken = 'AT' + (m.refreshCalls + 1); m.refreshToken = 'RT' + (m.refreshCalls + 1);
        return setTimeout(() => res.end(JSON.stringify({ access_token: m.accessToken, expires_in: 86400, refresh_token: m.refreshToken, refresh_token_expires_in: 7775998 })), 50);
      }
      res.writeHead(400).end();
    });
    return;
  }
  // REST API
  m.lastBearer = req.headers.authorization;
  if (req.headers.authorization !== `Bearer ${m.accessToken}`) return res.writeHead(401).end();
  if (u.pathname === '/api/user/id') return res.end('{"userId":"G-USER-1"}');
  if (u.pathname === '/api/user/permissions') return res.end('["ACTIVITY_EXPORT","HEALTH_EXPORT"]');
  if (u.pathname === '/api/user/registration' && req.method === 'DELETE') { m.deleted++; return res.writeHead(204).end(); }
  res.writeHead(404).end();
});
await new Promise((r) => mock.listen(MOCK, r));

// ---- Aplikasi kita ----
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garmin-test-'));
const child = spawn(process.execPath, ['src/server.js'], {
  env: {
    ...process.env, PORT: APP, DATA_DIR: dataDir,
    GARMIN_CLIENT_ID: 'cid', GARMIN_CLIENT_SECRET: 'sec',
    GARMIN_REDIRECT_URI: `http://localhost:${APP}/garmin/callback`,
    TOKEN_ENC_KEY: crypto.randomBytes(32).toString('hex'), WEBHOOK_SECRET: 'rahasia123',
    GARMIN_AUTH_URL: `http://localhost:${MOCK}/oauth2Confirm`,
    GARMIN_TOKEN_URL: `http://localhost:${MOCK}/token`,
    GARMIN_API_BASE: `http://localhost:${MOCK}/api`,
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

// ---- 1) Connect -> consent -> callback ----
let r = await A('/garmin/connect?athleteId=a1');
assert.equal(r.status, 302);
const authUrl = r.headers.get('location');
assert.match(authUrl, /code_challenge_method=S256/);
r = await fetch(authUrl, { redirect: 'manual' }); // atlet menyetujui di Garmin
const callbackUrl = r.headers.get('location');
r = await fetch(callbackUrl);
assert.equal(r.status, 200);
console.log('ok  connect -> consent -> callback -> token (verifier cocok dengan challenge)');

// ---- 2) State sekali pakai & state palsu ditolak ----
assert.equal((await fetch(callbackUrl)).status, 400);
assert.equal((await fetch(`http://localhost:${APP}/garmin/callback?code=x&state=palsu`)).status, 400);
console.log('ok  state dipakai ulang / palsu ditolak');

// ---- 3) Status ----
let st = await (await A('/api/athletes/a1/status')).json();
assert.equal(st.connected, true);
assert.equal(st.garminUserId, 'G-USER-1');
assert.deepEqual(st.permissions, ['ACTIVITY_EXPORT', 'HEALTH_EXPORT']);
console.log('ok  status + userId + permissions tersimpan');

// ---- 4) Token kedaluwarsa: 3 panggilan paralel -> hanya 1 refresh, refresh token berputar ----
const rs = await Promise.all([1, 2, 3].map(() => A('/api/athletes/a1/sync-permissions', { method: 'POST' })));
rs.forEach((x) => assert.equal(x.status, 200));
assert.equal(m.refreshCalls, 1);
assert.equal(m.lastBearer, 'Bearer AT2');
await A('/api/athletes/a1/sync-permissions', { method: 'POST' }); // token masih valid -> tanpa refresh lagi
assert.equal(m.refreshCalls, 1);
console.log('ok  refresh otomatis, 1x untuk 3 request paralel, refresh token baru dipakai');

// ---- 5) Webhook ----
assert.equal((await A('/garmin/webhook/salah/activities', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404);
const wh = await A('/garmin/webhook/rahasia123/activities', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ activities: [{ userId: 'G-USER-1', summaryId: 's1', activityType: 'RUNNING' }, { userId: 'ORANG-LAIN', summaryId: 's2' }] }),
});
assert.equal(wh.status, 200);
await new Promise((r) => setTimeout(r, 200));
const ev = await (await A('/api/athletes/a1/events')).json();
assert.equal(ev.length, 1);
assert.equal(ev[0].item.summaryId, 's1');
console.log('ok  webhook: rahasia salah ditolak, data dipetakan ke atlet yang benar');

// ---- 6) Disconnect ----
r = await A('/garmin/disconnect/a1', { method: 'DELETE' });
assert.equal(r.status, 200);
assert.equal(m.deleted, 1);
st = await (await A('/api/athletes/a1/status')).json();
assert.equal(st.connected, false);
console.log('ok  disconnect memanggil DELETE /user/registration dan menghapus token lokal');

console.log('\nSEMUA UJI LULUS');
finish(0);
