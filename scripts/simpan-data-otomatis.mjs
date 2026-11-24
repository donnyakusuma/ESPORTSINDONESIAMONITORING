// Menyimpan folder data/ (database WHOOP/Garmin) ke repo GitHub secara otomatis setelah ada login/koneksi akun.
// Dipanggil dari server WHOOP, server Garmin, dan bridge Garmin Connect. Ditunda 60 detik dan digabung,
// agar satu sesi login (plus tarikan data awal) menjadi satu commit. Matikan dengan SIMPAN_DATA_OTOMATIS=false.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TUNDA_MS = 60_000;
let timer = null;
let berjalan = false;
let ulang = false;

async function git(...args) {
  return run('git', args, { cwd: ROOT, timeout: 120_000 });
}

async function simpan() {
  if (berjalan) { ulang = true; return; }
  berjalan = true;
  try {
    await git('add', 'data');
    try { await git('diff', '--cached', '--quiet', '--', 'data'); return; } catch { /* ada perubahan */ }
    await git('commit', '-m', `Simpan database WHOOP dan Garmin otomatis (${new Date().toISOString().slice(0, 16)}Z)`, '--', 'data');
    await git('pull', '--rebase', '--autostash');
    await git('push');
    console.log('[simpan-data] data tersimpan dan di-push ke repo');
  } catch (e) {
    console.error('[simpan-data] gagal:', String(e.stderr || e.message).split('\n')[0]);
  } finally {
    berjalan = false;
    if (ulang) { ulang = false; jadwalkanSimpanData(); }
  }
}

export function jadwalkanSimpanData() {
  if (process.env.SIMPAN_DATA_OTOMATIS === 'false') return;
  clearTimeout(timer);
  timer = setTimeout(() => { void simpan(); }, TUNDA_MS);
  timer.unref?.();
}
