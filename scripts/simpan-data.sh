#!/usr/bin/env bash
# Commit dan push database WHOOP/Garmin (folder data/) ke repo. Pemakaian: npm run simpan-data
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
[ -d data ] || { echo "Folder data/ belum ada (belum ada atlet yang login)."; exit 0; }
git add data
if git diff --cached --quiet -- data; then echo "Tidak ada perubahan data."; exit 0; fi
git commit -m "Simpan database WHOOP dan Garmin ($(date -u +%Y-%m-%dT%H:%MZ))" -- data
git pull --rebase --autostash && git push
