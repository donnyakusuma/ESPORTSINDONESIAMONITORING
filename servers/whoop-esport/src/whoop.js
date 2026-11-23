// Klien OAuth 2.0 + REST untuk WHOOP API v2.
// Mengikuti dokumentasi developer.whoop.com (OAuth, Rate Limiting, Webhooks, API Docs).
import crypto from 'node:crypto';
import * as store from './store.js';

export class WhoopError extends Error {
  constructor(message, status = 500, body = '') {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function need(name) {
  const v = process.env[name];
  if (!v) throw new WhoopError(`Env ${name} belum diisi`, 500);
  return v;
}

const urls = () => ({
  auth: process.env.WHOOP_AUTH_URL || 'https://api.prod.whoop.com/oauth/oauth2/auth',
  token: process.env.WHOOP_TOKEN_URL || 'https://api.prod.whoop.com/oauth/oauth2/token',
  api: process.env.WHOOP_API_BASE || 'https://api.prod.whoop.com/developer',
});

// "offline" WAJIB agar WHOOP memberi refresh token.
export const SCOPES = [
  'offline',
  'read:recovery',
  'read:cycles',
  'read:workout',
  'read:sleep',
  'read:profile',
  'read:body_measurement',
];

// WHOOP: parameter state harus tepat 8 karakter. 6 byte -> base64url = 8 karakter.
export const generateState = () => crypto.randomBytes(6).toString('base64url');

// ---------- Authorization ----------
export function authorizationUrl(state) {
  const url = new URL(urls().auth);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: need('WHOOP_CLIENT_ID'),
    redirect_uri: need('WHOOP_REDIRECT_URI'),
    scope: SCOPES.join(' '),
    state,
  }).toString();
  return url.toString();
}

// ---------- Token ----------
async function postToken(params) {
  const res = await fetch(urls().token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  if (!res.ok) throw new WhoopError(`Token endpoint ${res.status}`, res.status, text);
  return JSON.parse(text);
}

const SAFETY_SECONDS = 120; // refresh sedikit sebelum kedaluwarsa (token berumur pendek, ~1 jam)

function normalizeTokens(json) {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    scope: json.scope,
    accessExpiresAt: Date.now() + Math.max(Number(json.expires_in ?? 0) - SAFETY_SECONDS, 0) * 1000,
  };
}

export async function exchangeCode(code) {
  const json = await postToken({
    grant_type: 'authorization_code',
    code,
    client_id: need('WHOOP_CLIENT_ID'),
    client_secret: need('WHOOP_CLIENT_SECRET'),
    redirect_uri: need('WHOOP_REDIRECT_URI'),
  });
  if (!json.refresh_token) throw new WhoopError('WHOOP tidak memberi refresh token (scope "offline" belum aktif?)', 502);
  return normalizeTokens(json);
}

// Refresh token berganti setiap kali dipakai, dan refresh bersamaan akan gagal
// (yang kedua kalah). Karena itu refresh dikunci per atlet.
const refreshLocks = new Map();

export function refreshTokens(athleteId) {
  if (refreshLocks.has(athleteId)) return refreshLocks.get(athleteId);
  const p = (async () => {
    const conn = store.getConnection(athleteId);
    if (!conn) throw new WhoopError('Atlet belum terhubung ke WHOOP', 404);
    try {
      const json = await postToken({
        grant_type: 'refresh_token',
        refresh_token: conn.tokens.refreshToken,
        client_id: need('WHOOP_CLIENT_ID'),
        client_secret: need('WHOOP_CLIENT_SECRET'),
        scope: 'offline',
      });
      const tokens = normalizeTokens(json);
      store.updateTokens(athleteId, tokens);
      return tokens;
    } catch (err) {
      if (err instanceof WhoopError && (err.status === 400 || err.status === 401)) {
        store.markNeedsReconnect(athleteId); // atlet harus connect ulang
      }
      throw err;
    }
  })().finally(() => refreshLocks.delete(athleteId));
  refreshLocks.set(athleteId, p);
  return p;
}

export async function getAccessToken(athleteId) {
  const conn = store.getConnection(athleteId);
  if (!conn) throw new WhoopError('Atlet belum terhubung ke WHOOP', 404);
  if (conn.needsReconnect) throw new WhoopError('Atlet harus connect ulang ke WHOOP', 409);
  if (Date.now() < conn.tokens.accessExpiresAt) return conn.tokens.accessToken;
  return (await refreshTokens(athleteId)).accessToken;
}

// ---------- REST ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Batas default: 100 permintaan/menit, 10.000/hari. Saat 429, tunggu X-RateLimit-Reset detik.
async function rawApi(method, pathAndQuery, accessToken, attempt = 0) {
  const res = await fetch(urls().api + pathAndQuery, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (res.status === 429 && attempt < 2) {
    const wait = Math.min(Number(res.headers.get('x-ratelimit-reset')) || 5, 60);
    await sleep(wait * 1000);
    return rawApi(method, pathAndQuery, accessToken, attempt + 1);
  }
  const text = await res.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* biarkan teks mentah */ }
  return { status: res.status, ok: res.ok, body };
}

export async function apiCall(athleteId, method, pathAndQuery) {
  let res = await rawApi(method, pathAndQuery, await getAccessToken(athleteId));
  if (res.status === 401) {
    const t = await refreshTokens(athleteId); // token ditolak: paksa refresh sekali lalu ulangi
    res = await rawApi(method, pathAndQuery, t.accessToken);
  }
  return res;
}

// Koleksi berhalaman: limit maks 25, lanjut dengan next_token.
export async function fetchCollection(athleteId, path, { start, end, maxPages = 40 } = {}) {
  const out = [];
  let nextToken;
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams({ limit: '25' });
    if (start) q.set('start', start);
    if (end) q.set('end', end);
    if (nextToken) q.set('nextToken', nextToken);
    const r = await apiCall(athleteId, 'GET', `${path}?${q}`);
    if (!r.ok) throw new WhoopError(`GET ${path} gagal (${r.status})`, r.status, JSON.stringify(r.body));
    out.push(...(r.body.records ?? []));
    nextToken = r.body.next_token;
    if (!nextToken) break;
  }
  return out;
}

export async function getOne(athleteId, path) {
  const r = await apiCall(athleteId, 'GET', path);
  if (r.status === 404) return null;
  if (!r.ok) throw new WhoopError(`GET ${path} gagal (${r.status})`, r.status, JSON.stringify(r.body));
  return r.body;
}

// Dipakai sekali saat callback, memakai access token yang baru didapat.
export async function fetchProfileWithToken(accessToken) {
  const r = await rawApi('GET', '/v2/user/profile/basic', accessToken);
  if (!r.ok) throw new WhoopError(`GET /v2/user/profile/basic gagal (${r.status})`, r.status, JSON.stringify(r.body));
  return r.body; // { user_id, email, first_name, last_name }
}

// Cabut akses atlet (hormati privasi saat atlet memutus koneksi). Webhook untuk atlet ini berhenti.
export async function revokeAccess(athleteId) {
  return apiCall(athleteId, 'DELETE', '/v2/user/access');
}

// ---------- Webhook: verifikasi tanda tangan ----------
// signature = base64( HMAC-SHA256( timestamp + rawBody, client_secret ) )
export function verifyWebhookSignature(rawBody, timestamp, signature) {
  if (!timestamp || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto
    .createHmac('sha256', need('WHOOP_CLIENT_SECRET'))
    .update(Buffer.concat([Buffer.from(String(timestamp)), rawBody]))
    .digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
