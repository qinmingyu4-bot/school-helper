const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
async function main() {
  const root = path.resolve(__dirname, ".."),
    destination = path.join(root, "public/vendor");
  fs.mkdirSync(destination, { recursive: true });
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["client/office-editor.mjs"],
    outfile: "public/vendor/office-editor.min.js",
    bundle: true,
    minify: true,
    platform: "browser",
    format: "iife",
    globalName: "StudyBridgeOfficeEditor",
    target: ["es2022"],
    metafile: true,
    legalComments: "eof",
  });
  const packages = new Map();
  for (const file of Object.keys(result.metafile.inputs)) {
    if (!file.includes("node_modules/")) continue;
    let dir = path.dirname(path.join(root, file));
    while (
      dir.startsWith(root) &&
      !fs.existsSync(path.join(dir, "package.json"))
    )
      dir = path.dirname(dir);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    );
    const license = fs
      .readdirSync(dir)
      .find((name) => /^licen[cs]e(?:[.-]|$)/i.test(name));
    if (!license) throw new Error(`Missing license for ${pkg.name}`);
    packages.set(
      pkg.name,
      `${pkg.name} ${pkg.version}\n${fs.readFileSync(path.join(dir, license), "utf8")}`,
    );
  }
  fs.writeFileSync(
    path.join(destination, "office-editor-LICENSE.txt"),
    [...packages.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, text]) => text)
      .join("\n\n---\n\n"),
  );
  console.log(
    `Built Office editor with notices for ${packages.size} dependencies.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
