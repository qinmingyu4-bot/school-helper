const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function fileEnvironment(text, inherited = {}) {
  const env = { ...inherited };
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim(), index = value.indexOf("=");
    if (!value || value.startsWith("#") || index < 1) continue;
    const key = value.slice(0, index).trim();
    if (env[key] !== undefined) continue;
    let item = value.slice(index + 1).trim();
    if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) item = item.slice(1, -1);
    env[key] = item;
  }
  return env;
}

function cloudStore(root, env) {
  const keys = ["AWS_REGION", "DYNAMODB_TABLE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
    return new (require(path.join(root, "lib/aws-dynamodb.js")).DynamoStore)();
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
}

async function backupRelease({ root, directory, env, previousCommit, targetCommit, dynamo }) {
  root = path.resolve(root);
  directory = path.resolve(directory);
  if (directory === root || directory.startsWith(root + path.sep)) throw new Error("Release backups must be outside the checkout.");
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
  const manifest = { format: 1, createdAt: new Date().toISOString(), previousCommit, targetCommit,
    mode: env.STUDYBRIDGE_DB || "local", port: Number(env.PORT || 3000), files: [] };
  if (!Number.isInteger(manifest.port) || manifest.port < 1 || manifest.port > 65535) throw new Error("Invalid application port.");
  async function writeJson(name, value) {
    const bytes = Buffer.from(JSON.stringify(value));
    const file = path.join(directory, name);
    await fs.writeFile(file, bytes, { mode: 0o600, flag: "wx" });
    const saved = await fs.readFile(file);
    if (hash(saved) !== hash(bytes)) throw new Error("Backup verification failed.");
    JSON.parse(saved.toString("utf8"));
    manifest.files.push({ name, bytes: saved.length, sha256: hash(saved) });
  }
  try {
    const config = await fs.readFile(path.join(root, ".env"));
    await fs.writeFile(path.join(directory, "environment.env"), config, { mode: 0o600, flag: "wx" });
    if (hash(await fs.readFile(path.join(directory, "environment.env"))) !== hash(config)) throw new Error("Configuration backup verification failed.");
    manifest.environmentSha256 = hash(config);
  } catch (error) { if (error.code !== "ENOENT") throw error; }

  if (manifest.mode === "local") {
    const database = path.resolve(root, env.LOCAL_DB_FILE || ".data/studybridge.json");
    const data = JSON.parse(await fs.readFile(database, "utf8"));
    for (const key of ["users", "courses", "documents", "messages"]) {
      if (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key])) throw new Error("Existing local database is not valid.");
    }
    manifest.databaseFile = database;
    await writeJson("database.json", data);
    if (Object.values(data.materials || {}).some((record) => record.file)) {
      const files = require(path.join(root, "lib/material-files.js"));
      manifest.materialFiles = await files.snapshot(database, data, path.join(directory, "material-files"));
    }
    const creative = path.join(path.dirname(database), "creative-files");
    const hasCreative = await fs.stat(creative).then(() => true).catch((error) => { if (error.code === "ENOENT") return false; throw error; });
    if (hasCreative) {
      await fs.cp(creative, path.join(directory, "creative-files"), { recursive: true, errorOnExist: true, force: false });
      manifest.creativeFiles = true;
    }
  } else if (manifest.mode === "dynamodb") {
    const store = dynamo || cloudStore(root, env);
    manifest.table = store.table;
    let cursor, page = 0;
    do {
      const result = await store.call("Scan", { TableName: store.table, ConsistentRead: true,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}) });
      await writeJson(`dynamodb-${String(++page).padStart(6, "0")}.json`, { table: store.table, items: result.Items || [] });
      cursor = result.LastEvaluatedKey;
    } while (cursor && Object.keys(cursor).length);
  } else throw new Error("Unknown production database mode.");
  await writeJson("manifest.json", { ...manifest });
  return manifest;
}

async function main() {
  process.umask(0o077);
  const [root, directory, previousCommit, targetCommit] = process.argv.slice(2);
  if (!root || !directory || !/^[a-f0-9]{40}$/.test(previousCommit || "") || !/^[a-f0-9]{40}$/.test(targetCommit || "")) throw new Error("Invalid release backup arguments.");
  const apps = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
  const app = apps.find((entry) => entry.name === "studybridge");
  if (!app || path.resolve(app.pm2_env.pm_cwd) !== path.resolve(root)) throw new Error("Unexpected application working directory.");
  const config = await fs.readFile(path.join(root, ".env"), "utf8").catch((error) => { if (error.code === "ENOENT") return ""; throw error; });
  const env = fileEnvironment(config, { ...app.pm2_env, ...app.pm2_env.env });
  const manifest = await backupRelease({ root, directory, env, previousCommit, targetCommit });
  console.log(`Verified ${manifest.mode} release backup; private files remain on the server.`);
}

if (require.main === module) main().catch(() => { console.error("Release backup failed. Deployment must not continue."); process.exitCode = 1; });
module.exports = { backupRelease, fileEnvironment };
