const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = path.join(root, "node_modules/katex");
const version = require("katex/package.json").version;
const destination = path.join(root, `public/vendor/katex-${version}`);
fs.mkdirSync(destination, { recursive: true });
for (const name of ["katex.min.js", "katex.min.css"]) fs.copyFileSync(path.join(source, "dist", name), path.join(destination, name));
const fonts = path.join(destination, "fonts");
fs.mkdirSync(fonts, { recursive: true });
for (const name of fs.readdirSync(path.join(source, "dist/fonts"))) {
  // All browsers supported by StudyBridge support WOFF2; retain that local face only.
  if (name.endsWith(".woff2")) fs.copyFileSync(path.join(source, "dist/fonts", name), path.join(fonts, name));
}
let css = fs.readFileSync(path.join(destination, "katex.min.css"), "utf8");
css = css.replace(/,url\([^)]*\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)/g, "");
fs.writeFileSync(path.join(destination, "katex.min.css"), css);
fs.copyFileSync(path.join(source, "LICENSE"), path.join(destination, "LICENSE.txt"));
console.log(`Vendored KaTeX ${version}, WOFF2 fonts and license.`);
