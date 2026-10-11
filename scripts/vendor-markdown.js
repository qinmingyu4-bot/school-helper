const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const destination = path.join(root, "public/vendor");
const dependencies = ["markdown-it", "entities", "linkify-it", "mdurl", "punycode.js", "uc.micro"];
const version = require("markdown-it/package.json").version;
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(require.resolve("markdown-it/browser"), path.join(destination, `markdown-it-${version}.min.js`));
const notices = dependencies.map((name) => {
  const directory = path.join(root, "node_modules", name);
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  const license = fs.readdirSync(directory).find((file) => /^license(?:[.-]|$)/i.test(file));
  if (!license) throw new Error(`Missing license for ${name}`);
  return `${name} ${pkg.version}\n${fs.readFileSync(path.join(directory, license), "utf8")}`;
});
fs.writeFileSync(path.join(destination, "markdown-it-LICENSE.txt"), notices.join("\n\n---\n\n"));
console.log(`Vendored markdown-it ${version} browser bundle and dependency licenses.`);
