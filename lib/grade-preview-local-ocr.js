"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const compile = promisify(execFile);

const available = () => process.platform === "darwin" && fs.existsSync("/usr/bin/clang") && fs.existsSync("/Library/Developer/CommandLineTools/usr/bin/clang");
function extractRows(observations) {
  const groups = [];
  for (const line of [...observations].filter((o) => typeof o.text === "string" && Number.isFinite(o.y) && Number.isFinite(o.x)).sort((a, b) => b.y - a.y)) {
    let group = groups.find((g) => Math.abs(g.y - line.y) < Math.max(.007, Math.min(g.height, line.height || .02) * .6));
    if (!group) { group = { y: line.y, height: line.height || .02, lines: [] }; groups.push(group); }
    group.lines.push(line);
  }
  const rows = [];
  for (const group of groups) {
    const evidence = group.lines.sort((a, b) => a.x - b.x).map((o) => o.text).join("    ");
    const match = /(\d+(?:[.,]\d+)?)\s*(?:\/|／|out\s+of)\s*(\d+(?:[.,]\d+)?)/i.exec(evidence) || /(\d+(?:[.,]\d+)?)\s*[%％]/.exec(evidence);
    if (!match) continue;
    const name = evidence.slice(0, match.index).replace(/(?:score|grade|得分|成绩)\s*[:：]?\s*$/i, "").replace(/[\s:：|–—-]+$/, "").trim();
    if (!name || /\b(?:total|average|overall|weighted|subtotal)\b|总评|均分|总成绩|总计|平均/i.test(name)) continue;
    rows.push({ name: name.slice(0, 120), categoryName: "", score: Number(match[1].replace(",", ".")), max: match[2] ? Number(match[2].replace(",", ".")) : 100, evidence: evidence.slice(0, 800) });
  }
  return { rows: rows.slice(0, 100) };
}
async function recognizeLocal(file, { signal } = {}) {
  if (!available() || file.kind !== "grades") return Promise.reject(new Error("当前设备不支持本地截图识别。"));
  const bytes = Buffer.from(file.content.image_url.split(",")[1], "base64");
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "studybridge-grade-ocr-"));
  try {
    const binary = path.join(directory, "recognize");
    await compile("/usr/bin/clang", ["-fno-modules", "-fobjc-arc", "-framework", "Foundation", "-framework", "Vision", "-framework", "ImageIO", "-framework", "CoreGraphics", path.join(__dirname, "../scripts/grade-preview-ocr.m"), "-o", binary], { signal, timeout: 30000, maxBuffer: 256 * 1024 });
    return await new Promise((resolve, reject) => {
      const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"], signal });
      let output = "";
      child.stdout.on("data", (data) => { output += data.toString(); if (output.length > 2 * 1024 * 1024) child.kill(); });
      child.stderr.resume();
      child.stdin.on("error", () => {});
      child.once("error", reject);
      child.once("close", (code) => {
        if (code !== 0) return reject(new Error("本地文字识别失败，请选择清晰截图或手动填写。"));
        try { resolve(JSON.stringify(extractRows(JSON.parse(output)))); }
        catch { reject(new Error("无法读取本地识别结果，请重试。")); }
      });
      child.stdin.end(bytes);
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("本地文字识别失败，请选择清晰截图或手动填写。");
  } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
}
module.exports = { available, extractRows, recognizeLocal };
