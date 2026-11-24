// Penyimpanan sederhana berbasis file untuk MVP.
// Token dienkripsi AES-256-GCM. Untuk produksi, ganti dengan PostgreSQL/SQLite
// dengan antarmuka fungsi yang sama.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../data/garmin-resmi');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.ndjson');
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
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString('base64')).join('.');
}

function decrypt(str) {
  const [iv, tag, data] = str.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(out.toString('utf8'));
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { athletes: {} };
  }
}

function save(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}

export function assertConfig() {
  encKey(); // lempar error jelas bila kunci belum diisi
}

export function saveConnection(athleteId, { garminUserId, permissions, tokens }) {
  const db = load();
  db.athletes[athleteId] = {
    garminUserId,
    permissions: permissions ?? [],
    connectedAt: new Date().toISOString(),
    needsReconnect: false,
    tokensEnc: encrypt(tokens),
  };
  save(db);
}

export function getConnection(athleteId) {
  const rec = load().athletes[athleteId];
  if (!rec) return null;
  return {
    athleteId,
    garminUserId: rec.garminUserId,
    permissions: rec.permissions,
    connectedAt: rec.connectedAt,
    needsReconnect: !!rec.needsReconnect,
    tokens: decrypt(rec.tokensEnc),
  };
}

export function updateTokens(athleteId, tokens) {
  const db = load();
  if (!db.athletes[athleteId]) return;
  db.athletes[athleteId].tokensEnc = encrypt(tokens);
  db.athletes[athleteId].needsReconnect = false;
  save(db);
}

export function updatePermissions(athleteId, permissions) {
  const db = load();
  if (!db.athletes[athleteId]) return;
  db.athletes[athleteId].permissions = permissions;
  save(db);
}

export function markNeedsReconnect(athleteId) {
  const db = load();
  if (!db.athletes[athleteId]) return;
  db.athletes[athleteId].needsReconnect = true;
  save(db);
}

export function removeConnection(athleteId) {
  const db = load();
  delete db.athletes[athleteId];
  save(db);
}

export function findAthleteByGarminUser(garminUserId) {
  const db = load();
  return Object.keys(db.athletes).find((id) => db.athletes[id].garminUserId === garminUserId) ?? null;
}

export function appendEvent(ev) {
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(ev) + '\n');
}

export function readEvents({ athleteId, limit = 50 } = {}) {
  let lines;
  try {
    lines = fs.readFileSync(EVENTS_FILE, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
  const all = lines.map((l) => JSON.parse(l));
  const filtered = athleteId ? all.filter((e) => e.athleteId === athleteId) : all;
  return filtered.slice(-limit);
}
