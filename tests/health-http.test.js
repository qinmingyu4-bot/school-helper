const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

for (const corrupt of [false, true]) test(`health endpoint returns ${corrupt ? '503 for broken storage' : '200 for ready storage'}`, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-health-http-'));
  const file = path.join(dir, 'db.json');
  if (corrupt) await fs.writeFile(file, 'private broken database');
  const child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: {
    ...process.env, NODE_ENV: 'test', PORT: '0', STUDYBRIDGE_DB: 'local', LOCAL_DB_FILE: file,
    LOCAL_DB_BACKUP_DISABLED: 'true', OPENAI_API_KEY: '', WEB_PUSH_WORKER_DISABLED: 'true',
    MAILBOX_SYNC_DISABLED: 'true', SESSION_SECRET: 'health-test-only', SMTP_HOST: ''
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.resume();
  t.after(async () => {
    if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
    await fs.rm(dir, { recursive: true, force: true });
  });
  const base = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(Error('startup timeout')), 10000);
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.stdout.on('data', chunk => {
      output += chunk; const match = output.match(/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); }
    });
  });
  const response = await fetch(base + '/api/health');
  const result = await response.json();
  assert.equal(response.status, corrupt ? 503 : 200);
  assert.equal(result.ok, !corrupt); assert.equal(result.database.ok, !corrupt);
  assert.equal(result.db, 'local'); assert.equal(typeof result.schedulePush.workerEnabled, 'boolean');
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.doesNotMatch(JSON.stringify(result), /private broken|sb-health-http/);
});
