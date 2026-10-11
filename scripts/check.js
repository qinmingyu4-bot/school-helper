const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? javascriptFiles(file) : entry.name.endsWith(".js") ? [file] : [];
  });
}

const files = [
  path.join(root, "server.js"),
  ...["lib", "public", "scripts", "tests"].flatMap((directory) => javascriptFiles(path.join(root, directory)))
];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `Could not check ${file}\n`);
    process.exit(1);
  }
}

const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
for (const match of html.matchAll(/(?:src|href)="(\/[^"?#]+)(?:\?[^"#]*)?"/g)) {
  if (!fs.existsSync(path.join(root, "public", match[1]))) throw new Error(`Missing asset: ${match[1]}`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
if (pkg.version !== lock.version || pkg.version !== lock.packages[""].version) {
  throw new Error("Package and lockfile versions must match.");
}
console.log(`Checked ${files.length} JavaScript files, entry assets, and package versions.`);
