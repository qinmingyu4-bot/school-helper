#!/usr/bin/env bash
set -euo pipefail
umask 077

target="${1:?Expected deployment commit}"
cd "${2:-$HOME/school-helper}"
[[ "$target" =~ ^[a-f0-9]{40}$ ]] || exit 1
test -z "$(git status --porcelain --untracked-files=no)"
previous="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$previous" "$target"
backup_root="${STUDYBRIDGE_RELEASE_BACKUP_ROOT:-$HOME/studybridge-release-backups}"
mkdir -p "$backup_root"
chmod 700 "$backup_root"
backup="$(mktemp -d "$backup_root/release-${target:0:12}-XXXXXXXX")"
git show "$target:scripts/release-backup.js" > "$backup/backup-runner.cjs"
printf '%s\n' "$previous" > "$backup/previous-commit.txt"
restore_needed=0
push_config_changed=0

recover() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ] && [ "$restore_needed" -eq 1 ]; then
    echo "Release failed; restoring previous application code without restoring or deleting user data."
    if [ -f "$backup/manifest.json" ] && git cat-file -e "$target:scripts/material-compat.js" 2>/dev/null; then
      pm2 stop studybridge || true
      git show "$target:scripts/material-compat.js" > "$backup/material-compat.cjs"
      if ! node "$backup/material-compat.cjs" "$PWD" "$backup/manifest.json"; then
        echo "Retaining current code and private data; compatibility recovery requires inspection."
        exit "$result"
      fi
    fi
    if [ "$(git rev-parse HEAD)" != "$previous" ]; then
      git switch --detach "$previous" && npm ci --omit=dev || true
    fi
    if [ "$push_config_changed" -eq 1 ] && [ -f "$backup/environment.env" ]; then
      cp "$backup/environment.env" .env
      chmod 600 .env
    fi
    pm2 restart studybridge --update-env && pm2 save || true
  fi
  exit "$result"
}
trap recover EXIT

# Pause writes for a consistent backup of the database and authored files.
restore_needed=1
pm2 stop studybridge
node "$backup/backup-runner.cjs" "$PWD" "$backup" "$previous" "$target"
git merge --ff-only "$target"
npm ci --omit=dev

# Code installation must not change the configuration or local persisted data.
node - "$backup" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const backup = process.argv[2];
try {
const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
if (manifest.environmentSha256) {
  const current = crypto.createHash('sha256').update(fs.readFileSync('.env')).digest('hex');
  assert.equal(current, manifest.environmentSha256, 'Production configuration changed during deployment.');
}
if (manifest.mode === 'local') {
  const current = JSON.parse(fs.readFileSync(manifest.databaseFile, 'utf8'));
  const saved = JSON.parse(fs.readFileSync(path.join(backup, 'database.json'), 'utf8'));
  assert.ok(JSON.stringify(current) === JSON.stringify(saved), 'Production data changed during code installation.');
}
} catch {
  console.error('Production configuration/data verification failed. Private data is not included in this log.');
  process.exit(1);
}
NODE

# This release is authorized to enable scheduled Web Push. Generate keys only on the server,
# after the private backup and unchanged-data check, and preserve valid keys on later releases.
push_config_changed=1
node scripts/configure-web-push.js "$PWD/.env" "https://studybridge.ink" --ensure
pm2 restart studybridge --update-env
port="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).port" "$backup/manifest.json")"
[[ "$port" =~ ^[0-9]+$ ]] || exit 1
curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 "http://127.0.0.1:$port/api/health" -o "$backup/live-health.json"
curl --fail --silent --show-error "http://127.0.0.1:$port/app.js" -o "$backup/live-app.js"
node - "$backup" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const backup = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
const health = JSON.parse(fs.readFileSync(path.join(backup, 'live-health.json'), 'utf8'));
assert.equal(health.ok, true);
assert.equal(health.schedulePush?.configured, true, 'Schedule push keys are not loaded.');
assert.equal(health.schedulePush?.workerEnabled, true, 'Schedule push worker is not running.');
assert.equal(health.db, manifest.mode, 'Application switched database mode.');
assert.ok(fs.readFileSync(path.join(backup, 'live-app.js')).equals(fs.readFileSync('public/app.js')), 'Application is not serving the expected release.');
NODE
# Apply to existing app virtual hosts only, after application verification. The
# installer validates and restores Nginx on failure; recover() restores app code.
if [ -f /etc/nginx/sites-available/studybridge-domain ] || [ -f /etc/nginx/sites-available/studybridge-ip ]; then
  sudo python3 aws/web-performance.py
fi
pm2 save
restore_needed=0
echo "Deployed $(node -p "require('./package.json').version") at $(git rev-parse HEAD). Private backup: $backup"
