import crypto from 'node:crypto';

// Code verifier: string acak 43-128 karakter dari set A-Z a-z 0-9 - . _ ~
// 48 byte acak -> base64url = 64 karakter (hanya A-Z a-z 0-9 - _), memenuhi aturan Garmin.
export function generateCodeVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

// Code challenge = base64url(sha256(code_verifier)), tanpa padding "="
export function codeChallengeFromVerifier(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// Parameter "state": nilai acak unik untuk mengikat redirect balik ke sesi kita
export function generateState() {
  return crypto.randomBytes(24).toString('base64url');
}
