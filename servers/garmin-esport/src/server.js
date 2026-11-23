import crypto from 'node:crypto';
import express from 'express';
import { generateState } from './pkce.js';
import * as garmin from './garmin.js';
import * as store from './store.js';

store.assertConfig();

const app = express();
app.use(express.json({ limit: '10mb' }));

// state -> { verifier, athleteId, expires } (disimpan di memori; pakai Redis bila server > 1 instance)
const pending = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000;
setInterval(() => {
  for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
}, 60 * 1000).unref();

// ============ 1) Atlet menekan "Hubungkan Garmin" ============
// PRODUKSI: athleteId harus diambil dari sesi login atlet, bukan dari query string.
app.get('/garmin/connect', (req, res) => {
  const athleteId = String(req.query.athleteId || '');
  if (!athleteId) return res.status(400).send('athleteId wajib diisi');
  const state = generateState();
  const { url, verifier } = garmin.createAuthorization(state);
  pending.set(state, { verifier, athleteId, expires: Date.now() + PENDING_TTL_MS });
  res.redirect(url);
});

// ============ 2) Garmin mengarahkan balik ke sini ============
app.get('/garmin/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const ctx = pending.get(String(state));
  pending.delete(String(state)); // sekali pakai
  if (!ctx || ctx.expires < Date.now()) return res.status(400).send('State tidak valid atau kedaluwarsa');
  if (error || !code) return res.status(400).send('Atlet menolak atau Garmin mengembalikan error');
  try {
    const tokens = await garmin.exchangeCode({ code: String(code), verifier: ctx.verifier });
    const garminUserId = await garmin.fetchUserId(tokens.accessToken);
    const permissions = await garmin.fetchPermissions(tokens.accessToken);
    store.saveConnection(ctx.athleteId, { garminUserId, permissions, tokens });
    res.send(`<h2>Garmin berhasil terhubung</h2><p>Izin: ${permissions.join(', ') || '-'}</p>`);
  } catch (err) {
    console.error('Callback gagal:', err.message, err.body ?? '');
    res.status(502).send('Gagal menukar kode dengan Garmin');
  }
});

// ============ 3) Status & data untuk dashboard ============
app.get('/api/athletes/:id/status', (req, res) => {
  const c = store.getConnection(req.params.id);
  if (!c) return res.json({ connected: false });
  res.json({
    connected: !c.needsReconnect,
    needsReconnect: c.needsReconnect,
    garminUserId: c.garminUserId,
    permissions: c.permissions,
    connectedAt: c.connectedAt,
    refreshExpiresAt: c.tokens.refreshExpiresAt ? new Date(c.tokens.refreshExpiresAt).toISOString() : null,
  });
});

app.get('/api/athletes/:id/events', (req, res) => {
  res.json(store.readEvents({ athleteId: req.params.id, limit: Number(req.query.limit) || 50 }));
});

// Perbarui daftar izin dari Garmin (GET /user/permissions)
app.post('/api/athletes/:id/sync-permissions', async (req, res) => {
  try {
    const r = await garmin.syncPermissions(req.params.id);
    res.status(r.status).json(r.body);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============ 4) Putuskan koneksi (WAJIB memanggil DELETE /user/registration) ============
app.delete('/garmin/disconnect/:id', async (req, res) => {
  try {
    const r = await garmin.deleteRegistration(req.params.id);
    if (!r.ok && r.status !== 404) return res.status(502).json({ error: `Garmin menjawab ${r.status}` });
    store.removeConnection(req.params.id);
    res.json({ disconnected: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============ 5) Webhook (mode PUSH) ============
// Daftarkan di Garmin Developer Portal: https://DOMAIN/garmin/webhook/<WEBHOOK_SECRET>/<jenis>
// Contoh jenis: activities, dailies, sleeps, deregistrations, userPermissions
app.post('/garmin/webhook/:secret/:kind', (req, res) => {
  const expected = Buffer.from(process.env.WEBHOOK_SECRET || '');
  const given = Buffer.from(req.params.secret);
  if (!expected.length || expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return res.sendStatus(404);
  }
  res.sendStatus(200); // balas cepat; proses sesudahnya
  ingest(req.params.kind, req.body).catch((e) => console.error('ingest gagal:', e));
});

async function ingest(kind, body) {
  const receivedAt = new Date().toISOString();
  for (const [group, items] of Object.entries(body || {})) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const garminUserId = item?.userId ?? null;
      const athleteId = garminUserId ? store.findAthleteByGarminUser(garminUserId) : null;
      store.appendEvent({ receivedAt, kind, group, garminUserId, athleteId, item });

      // VERIFIKASI nama group ini terhadap dokumentasi di Garmin Developer Portal.
      if (athleteId && /deregistr/i.test(group)) store.removeConnection(athleteId);
      if (athleteId && /permission/i.test(group)) await garmin.syncPermissions(athleteId).catch(() => {});
    }
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Server jalan di http://localhost:${port}`));
