const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");
const { test } = require("node:test");

async function deployment(t) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-deploy-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, "checkout"), backupRoot = path.join(temporary, "release-backups"), bin = path.join(temporary, "bin");
  for (const directory of [root, backupRoot, bin, path.join(root, "public"), path.join(root, "scripts"), path.join(root, ".data")]) await fs.mkdir(directory, { recursive: true });
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "deployment@example.test");
  git("config", "user.name", "Deployment regression");
  await fs.writeFile(path.join(root, ".gitignore"), ".env\n.data/\n");
  await fs.writeFile(path.join(root, ".env"), "SESSION_SECRET=fixture-only\n");
  const data = JSON.stringify({ users: { alice: { legacy: true } }, courses: {}, documents: {}, messages: {}, unknown: "keep" });
  await fs.writeFile(path.join(root, ".data/database.json"), data);
  await fs.writeFile(path.join(root, "package.json"), '{"version":"1.1.106"}');
  await fs.writeFile(path.join(root, "public/app.js"), 'const VERSION = "1.1.106";');
  git("add", "."); git("commit", "-qm", "Previous release");
  const previous = git("rev-parse", "HEAD");
  await fs.copyFile(path.join(__dirname, "../scripts/release-backup.js"), path.join(root, "scripts/release-backup.js"));
  await fs.copyFile(path.join(__dirname, "../scripts/deploy-release.sh"), path.join(root, "scripts/deploy-release.sh"));
  await fs.writeFile(path.join(root, "package.json"), '{"version":"1.1.107"}');
  await fs.writeFile(path.join(root, "public/app.js"), 'const VERSION = "1.1.107";');
  git("add", "."); git("commit", "-qm", "New release");
  const target = git("rev-parse", "HEAD");
  git("switch", "--detach", previous);
  await fs.writeFile(path.join(bin, "npm"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await fs.writeFile(path.join(bin, "pm2"), `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(process.env.DEPLOY_TEST_LOG, process.argv.slice(2).join(' ') + '\\n');
if (process.argv[2] === 'jlist') console.log(JSON.stringify([{name:'studybridge',pm2_env:{pm_cwd:process.env.DEPLOY_TEST_ROOT,env:{STUDYBRIDGE_DB:'local',LOCAL_DB_FILE:'.data/database.json',PORT:'3000'}}}]));
`, { mode: 0o700 });
  await fs.writeFile(path.join(bin, "curl"), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2), output = args[args.indexOf('-o') + 1];
if (args.some(arg => arg.endsWith('/api/health'))) fs.writeFileSync(output, JSON.stringify({ok:true,db:process.env.DEPLOY_TEST_BAD_HEALTH ? 'dynamodb' : 'local'}));
else fs.copyFileSync(path.join(process.env.DEPLOY_TEST_ROOT,'public/app.js'), output);
`, { mode: 0o700 });
  const log = path.join(temporary, "pm2.log");
  const run = (extra = {}) => spawnSync("bash", [path.join(__dirname, "../scripts/deploy-release.sh"), target, root], {
    cwd: root, encoding: "utf8", timeout: 10000,
    env: { ...process.env, STUDYBRIDGE_RELEASE_BACKUP_ROOT: backupRoot, PATH: `${bin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
      DEPLOY_TEST_ROOT: root, DEPLOY_TEST_LOG: log, ...extra }
  });
  return { root, backupRoot, git, previous, target, log, data, run };
}

test("deployment backs up private data before installing the exact release and retains every source record", async (t) => {
  const d = await deployment(t), result = d.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(d.git("rev-parse", "HEAD"), d.target);
  assert.equal(await fs.readFile(path.join(d.root, ".data/database.json"), "utf8"), d.data);
  assert.equal(await fs.readFile(path.join(d.root, ".env"), "utf8"), "SESSION_SECRET=fixture-only\n");
  const folders = await fs.readdir(d.backupRoot);
  assert.equal(folders.length, 1);
  const backup = path.join(d.backupRoot, folders[0]);
  const manifest = JSON.parse(await fs.readFile(path.join(backup, "manifest.json"), "utf8"));
  assert.equal(manifest.previousCommit, d.previous);
  assert.equal(manifest.targetCommit, d.target);
  assert.equal(manifest.mode, "local");
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(backup, "database.json"), "utf8")), JSON.parse(d.data));
  assert.match(await fs.readFile(d.log, "utf8"), /^stop studybridge\njlist\nrestart studybridge --update-env\nsave\n$/);
});

test("backup failure prevents code installation and restarts the previous application", async (t) => {
  const d = await deployment(t);
  await fs.writeFile(path.join(d.root, ".data/database.json"), "invalid existing database");
  const result = d.run();
  assert.notEqual(result.status, 0);
  assert.equal(d.git("rev-parse", "HEAD"), d.previous);
  assert.equal(await fs.readFile(path.join(d.root, ".data/database.json"), "utf8"), "invalid existing database");
  assert.match(await fs.readFile(d.log, "utf8"), /restart studybridge --update-env/);
});

test("failed startup verification rolls back code while preserving user data and the verified backup", async (t) => {
  const d = await deployment(t), result = d.run({ DEPLOY_TEST_BAD_HEALTH: "true" });
  assert.notEqual(result.status, 0);
  assert.equal(d.git("rev-parse", "HEAD"), d.previous);
  assert.equal(await fs.readFile(path.join(d.root, ".data/database.json"), "utf8"), d.data);
  assert.equal(await fs.readFile(path.join(d.root, "public/app.js"), "utf8"), 'const VERSION = "1.1.106";');
  const calls = await fs.readFile(d.log, "utf8");
  assert.equal(calls.split("restart studybridge --update-env").length - 1, 2);
});
