import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import * as whoop from './whoop.js';
import * as store from './store.js';
import * as sync from './sync.js';

store.assertConfig();

const app = express();

// ============ Webhook (harus sebelum express.json: butuh body mentah untuk tanda tangan) ============
// Daftarkan di WHOOP Developer Dashboard: https://DOMAIN-ANDA/whoop/webhook  (Model Version: v2)
app.post('/whoop/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const ok = whoop.verifyWebhookSignature(
    req.body,
    req.get('X-WHOOP-Signature-Timestamp'),
    req.get('X-WHOOP-Signature'),
  );
  if (!ok) return res.sendStatus(401);
  res.sendStatus(200); // balas cepat (WHOOP mengulang 5x dalam ~1 jam bila gagal); proses sesudahnya
  let evt;
  try { evt = JSON.parse(req.body.toString('utf8')); } catch { return; }
  sync.handleWebhookEvent(evt)
    .then((r) => console.log('webhook', evt.type, r))
    .catch((e) => console.error('webhook gagal:', evt.type, e.message));
});

app.use(express.json());

// ============ 0) Pengaturan kredensial WHOOP dari aplikasi (hanya dari komputer ini) ============
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const ENV_FILE = path.join(process.cwd(), '.env');
const configured = () => !!(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET && process.env.WHOOP_REDIRECT_URI);
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

function writeEnv(values) {
  let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
    process.env[k] = v; // langsung berlaku tanpa restart
  }
  fs.writeFileSync(ENV_FILE, text, { mode: 0o600 });
}

// Atlet yang akunnya terhubung (dipakai aplikasi untuk menampilkan hanya akun tersinkron).
app.get('/api/whoop/athletes', (_req, res) => {
  res.json(store.listAthleteIds());
});

app.get('/api/whoop/config', (_req, res) => {
  res.json({ configured: configured(), redirectUri: process.env.WHOOP_REDIRECT_URI || '', clientId: process.env.WHOOP_CLIENT_ID || '' });
});

app.post('/api/whoop/config', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya bisa diatur dari komputer yang menjalankan server.' });
  const clientId = String(req.body?.clientId ?? '').trim();
  const clientSecret = String(req.body?.clientSecret ?? '').trim();
  if (!clientId || !clientSecret) return res.status(400).json({ error: 'Client ID dan Client Secret wajib diisi.' });
  if (/\s/.test(clientId + clientSecret)) return res.status(400).json({ error: 'Client ID/Secret tidak boleh berisi spasi.' });
  writeEnv({ WHOOP_CLIENT_ID: clientId, WHOOP_CLIENT_SECRET: clientSecret });
  res.json({ configured: configured() });
});

// state -> { athleteId, expires } (memori; pakai Redis bila server > 1 instance)
const pending = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000;
setInterval(() => {
  for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
}, 60 * 1000).unref();

// ============ 1) Atlet menekan "Hubungkan WHOOP" ============
// PRODUKSI: athleteId harus diambil dari sesi login atlet, bukan dari query string.
app.get('/whoop/connect', (req, res) => {
  const athleteId = String(req.query.athleteId || '');
  if (!athleteId) return res.status(400).send('athleteId wajib diisi');
  if (!configured()) return res.redirect(`${APP_URL}/?whoop=belum-diatur`);
  const state = whoop.generateState();
  pending.set(state, { athleteId, expires: Date.now() + PENDING_TTL_MS });
  res.redirect(whoop.authorizationUrl(state));
});

// ============ 2) WHOOP mengarahkan balik ke sini ============
app.get('/whoop/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const ctx = pending.get(String(state));
  pending.delete(String(state)); // sekali pakai
  if (!ctx || ctx.expires < Date.now()) return res.status(400).send('State tidak valid atau kedaluwarsa');
  if (error || !code) return res.redirect(`${APP_URL}/?whoop=ditolak`);
  try {
    const tokens = await whoop.exchangeCode(String(code));
    const profile = await whoop.fetchProfileWithToken(tokens.accessToken);
    store.saveConnection(ctx.athleteId, { whoopUserId: profile.user_id, scope: tokens.scope, tokens });
    if (process.env.BACKFILL_ON_CONNECT !== 'false') {
      sync.syncAthlete(ctx.athleteId, 365).catch((e) => console.error('backfill gagal:', e.message));
    }
    res.redirect(`${APP_URL}/?whoop=terhubung`); // data 365 hari ditarik di latar belakang
  } catch (err) {
    console.error('Callback gagal:', err.message, err.body ?? '');
    res.redirect(`${APP_URL}/?whoop=gagal`);
  }
});

// ============ 3) API untuk dashboard ============
app.get('/api/athletes/:id/status', (req, res) => {
  const c = store.getConnection(req.params.id);
  if (!c) return res.json({ connected: false });
  res.json({
    connected: !c.needsReconnect,
    needsReconnect: c.needsReconnect,
    whoopUserId: c.whoopUserId,
    scope: c.scope,
    connectedAt: c.connectedAt,
  });
});

// ?type=recovery|sleep|workout|cycle &days=7 &limit=100
app.get('/api/athletes/:id/records', (req, res) => {
  const days = Number(req.query.days) || 7;
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const rows = store.listRecords(req.params.id, {
    type: req.query.type ? String(req.query.type) : undefined,
    since,
    limit: Number(req.query.limit) || 100,
  });
  res.json(rows.map((r) => ({ type: r.type, id: r.id, ...r.data })));
});

app.get('/api/athletes/:id/summary', (req, res) => {
  res.json(sync.summarize(req.params.id, Number(req.query.days) || 7));
});

// Tarik ulang data dari WHOOP (rekonsiliasi manual)
app.post('/api/athletes/:id/sync', async (req, res) => {
  try {
    res.json(await sync.syncAthlete(req.params.id, Number(req.query.days) || 7));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============ 4) Putuskan koneksi: cabut akses di WHOOP (DELETE /v2/user/access) ============
app.delete('/whoop/disconnect/:id', async (req, res) => {
  try {
    try {
      const r = await whoop.revokeAccess(req.params.id);
      if (!r.ok && ![401, 404].includes(r.status)) return res.status(502).json({ error: `WHOOP menjawab ${r.status}` });
    } catch (err) {
      if (![404, 409].includes(err.status)) throw err; // tak terhubung / token sudah mati: cukup hapus lokal
    }
    store.removeConnection(req.params.id, { keepRecords: req.query.keepRecords === 'true' });
    res.json({ disconnected: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Galat tak tertangani: jawab JSON singkat, jangan tumpahkan stack trace ke browser.
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// Rekonsiliasi berkala: webhook bisa terlewat, dan strain harian (cycle) tidak punya webhook.
// Tanpa webhook (butuh HTTPS publik), inilah yang membuat data tersinkron otomatis: saat server
// menyala lalu setiap RECONCILE_EVERY_HOURS jam (default 1; batas WHOOP 10.000 permintaan/hari).
const hours = Number(process.env.RECONCILE_EVERY_HOURS) || 1;
const reconcile = () => sync.syncAll(2).catch((e) => console.error(e));
setTimeout(reconcile, 5000).unref();
setInterval(reconcile, hours * 3600 * 1000).unref();

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Server jalan di http://localhost:${port}`));
