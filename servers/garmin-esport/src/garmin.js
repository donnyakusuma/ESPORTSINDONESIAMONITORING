// Klien OAuth2 PKCE + REST untuk Garmin Connect Developer Program.
// Endpoint mengikuti dokumen resmi "Garmin Connect Developer Program - OAuth2.0 PKCE Specification".
import { generateCodeVerifier, codeChallengeFromVerifier } from './pkce.js';
import * as store from './store.js';

export class GarminError extends Error {
  constructor(message, status = 500, body = '') {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function need(name) {
  const v = process.env[name];
  if (!v) throw new GarminError(`Env ${name} belum diisi`, 500);
  return v;
}

const urls = () => ({
  auth: process.env.GARMIN_AUTH_URL || 'https://connect.garmin.com/oauth2Confirm',
  token: process.env.GARMIN_TOKEN_URL || 'https://diauth.garmin.com/di-oauth2-service/oauth/token',
  api: process.env.GARMIN_API_BASE || 'https://apis.garmin.com/wellness-api/rest',
});

// ---------- STEP 1: Authorization Request ----------
export function createAuthorization(state) {
  const verifier = generateCodeVerifier();
  const challenge = codeChallengeFromVerifier(verifier);
  const url = new URL(urls().auth);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: need('GARMIN_CLIENT_ID'),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: need('GARMIN_REDIRECT_URI'),
    state,
  }).toString();
  return { url: url.toString(), verifier };
}

// ---------- STEP 2: Access Token Request ----------
async function postToken(params) {
  const res = await fetch(urls().token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  if (!res.ok) throw new GarminError(`Token endpoint ${res.status}`, res.status, text);
  return JSON.parse(text);
}

// Dokumen Garmin: kurangi >= 600 detik dari masa berlaku agar sempat refresh.
const SAFETY_SECONDS = 600;

function normalizeTokens(json) {
  const now = Date.now();
  const expiresIn = Number(json.expires_in ?? 0);
  const refreshIn = Number(json.refresh_token_expires_in ?? 0);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    scope: json.scope,
    accessExpiresAt: now + Math.max(expiresIn - SAFETY_SECONDS, 0) * 1000,
    refreshExpiresAt: refreshIn ? now + refreshIn * 1000 : null,
  };
}

export async function exchangeCode({ code, verifier }) {
  const json = await postToken({
    grant_type: 'authorization_code',
    client_id: need('GARMIN_CLIENT_ID'),
    client_secret: need('GARMIN_CLIENT_SECRET'),
    code,
    code_verifier: verifier,
    redirect_uri: need('GARMIN_REDIRECT_URI'),
  });
  return normalizeTokens(json);
}

// ---------- Refresh Token ----------
// Refresh token berganti setiap kali refresh -> wajib disimpan ulang, dan jangan
// ada dua refresh bersamaan untuk atlet yang sama (kunci per atlet).
const refreshLocks = new Map();

export function refreshTokens(athleteId) {
  if (refreshLocks.has(athleteId)) return refreshLocks.get(athleteId);
  const p = (async () => {
    const conn = store.getConnection(athleteId);
    if (!conn) throw new GarminError('Atlet belum terhubung ke Garmin', 404);
    try {
      const json = await postToken({
        grant_type: 'refresh_token',
        client_id: need('GARMIN_CLIENT_ID'),
        client_secret: need('GARMIN_CLIENT_SECRET'),
        refresh_token: conn.tokens.refreshToken,
      });
      const tokens = normalizeTokens(json);
      store.updateTokens(athleteId, tokens);
      return tokens;
    } catch (err) {
      if (err instanceof GarminError && (err.status === 400 || err.status === 401)) {
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
  if (!conn) throw new GarminError('Atlet belum terhubung ke Garmin', 404);
  if (conn.needsReconnect) throw new GarminError('Atlet harus connect ulang ke Garmin', 409);
  if (Date.now() < conn.tokens.accessExpiresAt) return conn.tokens.accessToken;
  return (await refreshTokens(athleteId)).accessToken;
}

// ---------- Memanggil API dengan Authorization: Bearer ----------
async function rawApi(method, path, accessToken) {
  const res = await fetch(urls().api + path, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* biarkan teks mentah */ }
  return { status: res.status, ok: res.ok, body };
}

export async function apiCall(athleteId, method, path) {
  let res = await rawApi(method, path, await getAccessToken(athleteId));
  if (res.status === 401) {
    // token ditolak sebelum waktunya: paksa refresh sekali lalu ulangi
    const t = await refreshTokens(athleteId);
    res = await rawApi(method, path, t.accessToken);
  }
  return res;
}

// ---------- Endpoint dari dokumen PKCE ----------
// GET /user/id            -> {"userId": "..."} (ID tetap walau atlet connect ulang)
export async function fetchUserId(accessToken) {
  const r = await rawApi('GET', '/user/id', accessToken);
  if (!r.ok) throw new GarminError(`GET /user/id gagal (${r.status})`, r.status, JSON.stringify(r.body));
  return r.body.userId;
}

// GET /user/permissions   -> ["ACTIVITY_EXPORT", "HEALTH_EXPORT", ...]
export async function fetchPermissions(accessToken) {
  const r = await rawApi('GET', '/user/permissions', accessToken);
  if (!r.ok) throw new GarminError(`GET /user/permissions gagal (${r.status})`, r.status, JSON.stringify(r.body));
  return r.body;
}

export async function syncPermissions(athleteId) {
  const r = await apiCall(athleteId, 'GET', '/user/permissions');
  if (r.ok && Array.isArray(r.body)) store.updatePermissions(athleteId, r.body);
  return r;
}

// DELETE /user/registration -> WAJIB dipanggil bila aplikasi menyediakan tombol
// "Hapus akun / Putuskan koneksi" di sisi kita.
export async function deleteRegistration(athleteId) {
  const r = await apiCall(athleteId, 'DELETE', '/user/registration');
  return r;
}
