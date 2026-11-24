// Penyimpanan sederhana berbasis file untuk MVP.
// Token dienkripsi AES-256-GCM. Untuk produksi, ganti dengan PostgreSQL/SQLite
// dengan antarmuka fungsi yang sama.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { jadwalkanSimpanData } from '../../../scripts/simpan-data-otomatis.mjs';

const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../data/whoop');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function encKey() {
  const hex = process.env.TOKEN_ENC_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('TOKEN_ENC_KEY harus 64 karakter hex. Buat dengan: openssl rand -hex 32');
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decrypt(str) {
  const [iv, tag, data] = str.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}

function load() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.athletes ??= {}; db.records ??= {}; db.traces ??= [];
    return db;
  } catch {
    return { athletes: {}, records: {}, traces: [] };
  }
}

function save(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}

export function assertConfig() {
  encKey();
}

// ---------- koneksi atlet ----------
export function saveConnection(athleteId, { whoopUserId, scope, tokens }) {
  const db = load();
  db.athletes[athleteId] = {
    whoopUserId: String(whoopUserId),
    scope,
    connectedAt: new Date().toISOString(),
    needsReconnect: false,
    tokensEnc: encrypt(tokens),
  };
  save(db);
  jadwalkanSimpanData();
}

export function getConnection(athleteId) {
  const rec = load().athletes[athleteId];
  if (!rec) return null;
  return {
    athleteId,
    whoopUserId: rec.whoopUserId,
    scope: rec.scope,
    connectedAt: rec.connectedAt,
    needsReconnect: !!rec.needsReconnect,
    tokens: decrypt(rec.tokensEnc),
  };
}

export function listAthleteIds() {
  const db = load();
  return Object.keys(db.athletes).filter((id) => !db.athletes[id].needsReconnect);
}

export function updateTokens(athleteId, tokens) {
  const db = load();
  if (!db.athletes[athleteId]) return;
  db.athletes[athleteId].tokensEnc = encrypt(tokens);
  db.athletes[athleteId].needsReconnect = false;
  save(db);
}

export function markNeedsReconnect(athleteId) {
  const db = load();
  if (!db.athletes[athleteId]) return;
  db.athletes[athleteId].needsReconnect = true;
  save(db);
}

export function removeConnection(athleteId, { keepRecords = false } = {}) {
  const db = load();
  delete db.athletes[athleteId];
  if (!keepRecords) {
    for (const k of Object.keys(db.records)) if (db.records[k].athleteId === athleteId) delete db.records[k];
  }
  save(db);
}

export function findAthleteByWhoopUser(whoopUserId) {
  const db = load();
  return Object.keys(db.athletes).find((id) => db.athletes[id].whoopUserId === String(whoopUserId)) ?? null;
}

// ---------- data atlet (sleep, recovery, workout, cycle) ----------
const key = (athleteId, type, id) => `${athleteId}|${type}|${id}`;

export function upsertMany(athleteId, type, items /* [{id, data}] */) {
  if (!items.length) return 0;
  const db = load();
  const storedAt = new Date().toISOString();
  for (const { id, data } of items) {
    db.records[key(athleteId, type, id)] = { athleteId, type, id: String(id), data, storedAt };
  }
  save(db);
  return items.length;
}

export function deleteRecord(athleteId, type, id) {
  const db = load();
  const k = key(athleteId, type, id);
  const existed = k in db.records;
  delete db.records[k];
  if (existed) save(db);
  return existed;
}

const when = (r) => r.data.start ?? r.data.created_at ?? '';

export function listRecords(athleteId, { type, since, limit = 100 } = {}) {
  const db = load();
  return Object.values(db.records)
    .filter((r) => r.athleteId === athleteId && (!type || r.type === type) && (!since || when(r) >= since))
    .sort((a, b) => (when(a) < when(b) ? 1 : -1))
    .slice(0, limit);
}

// ---------- dedupe webhook (trace_id) ----------
export function hasTrace(traceId) {
  return !!traceId && load().traces.includes(traceId);
}

export function markTraceSeen(traceId) {
  if (!traceId) return true;
  const db = load();
  if (db.traces.includes(traceId)) return false;
  db.traces.push(traceId);
  if (db.traces.length > 2000) db.traces.splice(0, db.traces.length - 2000);
  save(db);
  return true;
}
