const fs = require("fs");
const path = require("path");

function replaceText(text, oldText, newText, label) {
  if (!text.includes(oldText)) {
    console.log(`skip ${label}`);
    return text;
  }
  console.log(`patch ${label}`);
  return text.replace(oldText, newText);
}

function insertBefore(text, anchor, addition, label) {
  if (text.includes(addition.trim().slice(0, 80))) {
    console.log(`skip ${label}`);
    return text;
  }
  if (!text.includes(anchor)) throw new Error(`Missing anchor for ${label}`);
  console.log(`patch ${label}`);
  return text.replace(anchor, `${addition}${anchor}`);
}

function patchServer() {
  const file = "server.js";
  let text = fs.readFileSync(file, "utf8");

  text = text.replace(/gpt-6-luna/g, "gpt-4o-mini").replace(/gpt-6\.1-sol/g, "gpt-4o");
  text = text.replace(
    /const simpleAiModel =\s*\n\s*String\(process\.env\.OPENAI_SIMPLE_MODEL \|\| process\.env\.STUDYBRIDGE_SIMPLE_MODEL \|\| ""\)\.trim\(\) \|\|\s*\n\s*\(legacyOpenAiModel && legacyOpenAiModel !== "gpt-4o-mini" \? legacyOpenAiModel : "gpt-4o-mini"\);/,
    'const simpleAiModel =\n  String(process.env.OPENAI_SIMPLE_MODEL || process.env.STUDYBRIDGE_SIMPLE_MODEL || "").trim() ||\n  legacyOpenAiModel ||\n  "gpt-4o-mini";'
  );

  const cleanHelpers = `
function autoSyncStatusClean() {
  const candidates = [
    path.join(os.homedir(), "studybridge-auto-deploy.sh"),
    "/home/ubuntu/studybridge-auto-deploy.sh"
  ];
  const scriptPath = candidates.find((item) => fsSync.existsSync(item)) || "";
  const logPath = path.join(os.homedir(), "studybridge-deploy.log");
  return {
    configured: Boolean(scriptPath),
    scriptPath: scriptPath ? scriptPath.replace(os.homedir(), "~") : "",
    lastLogAt: fileIsoTime(logPath),
    note: scriptPath ? "Server auto-sync script was detected." : "Server auto-sync script was not detected."
  };
}

async function databaseStatusClean() {
  const mode = db.mode || process.env.STUDYBRIDGE_DB || "local";
  try {
    const users = await db.listUsers();
    return {
      mode,
      ready: true,
      userCount: Array.isArray(users) ? users.length : 0,
      note:
        mode === "local"
          ? "Local database is readable and writable. Add backups or a cloud database before larger public use."
          : "Cloud database connection is healthy."
    };
  } catch (error) {
    return {
      mode,
      ready: false,
      userCount: 0,
      note: error?.message || "Database read failed."
    };
  }
}

`;
  text = insertBefore(text, "function requestOpenAiModelsHealth()", cleanHelpers, "clean status helpers");

  const chatHealth = `
function requestOpenAiChatHealth(model) {
  return new Promise((resolve) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      resolve({ configured: false, ok: false, detail: "OPENAI_API_KEY is not configured." });
      return;
    }

    const body = JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Reply with OK only." },
        { role: "user", content: "health check" }
      ],
      max_tokens: 4
    });

    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
        method: "POST",
        timeout: 4500,
        headers: {
          authorization: \`Bearer \${apiKey}\`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        }
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          const ok = response.statusCode >= 200 && response.statusCode < 300;
          let message = "";
          try {
            const payload = raw ? JSON.parse(raw) : {};
            message = payload?.error?.message || payload?.choices?.[0]?.message?.content || "";
          } catch {
            message = raw.slice(0, 240);
          }
          resolve({
            configured: true,
            ok,
            statusCode: response.statusCode,
            detail: ok ? \`Current model \${model} can respond normally.\` : \`Current model \${model} failed: \${message || "OpenAI API returned a non-success status."}\`
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ configured: true, ok: false, detail: \`Current model \${model} timed out.\` });
    });
    req.on("error", (error) => resolve({ configured: true, ok: false, detail: error.message || "OpenAI API connection failed." }));
    req.write(body);
    req.end();
  });
}

`;
  text = insertBefore(text, "async function aiHealthStatus()", chatHealth, "real AI chat health");
  text = text.replace("const health = await requestOpenAiModelsHealth();", "const health = await requestOpenAiChatHealth(simpleAiModel);");
  text = text.replace("database: await databaseStatus(),", "database: await databaseStatusClean(),");
  text = text.replace("autoSync: autoSyncStatus()", "autoSync: autoSyncStatusClean()");

  fs.writeFileSync(file, text, "utf8");
}

function patchLayout() {
  const file = path.join("public", "layout-fix.js");
  let text = fs.readFileSync(file, "utf8");
  text = replaceText(text, "        padding: 28px 28px 18px;", "        padding: 24px 28px 8px;", "creator bottom spacing");
  text = insertBefore(
    text,
    "      body.creator-clean-mode #developerPanel .panel-title,",
    `      body.creator-clean-mode #developerPanel:not([hidden]) > *:last-child {
        margin-bottom: 0 !important;
      }

      body.creator-clean-mode #developerPanel + #chatArea,
      body.creator-clean-mode #developerPanel + #quickPrompts,
      body.creator-clean-mode #developerPanel + #chatForm {
        display: none !important;
      }

`,
    "creator trailing cleanup"
  );
  text = text.replace("/system-status-patch.js?v=20261006-3", "/system-status-patch.js?v=20261006-4");
  fs.writeFileSync(file, text, "utf8");
}

function patchStatusScript() {
  const file = path.join("public", "system-status-patch.js");
  let text = fs.readFileSync(file, "utf8");
  text = replaceText(text, ".system-status-panel { margin-top: 18px;", ".system-status-panel { margin-top: 14px; margin-bottom: 0;", "status panel margin");
  text = replaceText(text, "gap: 10px; padding: 14px 16px 16px;", "gap: 10px; padding: 12px 16px 12px;", "status grid padding");
  text = replaceText(text, "gap: 6px; min-height: 92px;", "gap: 6px; min-height: 86px;", "status card height");
  if (!text.includes("const aiModel = system?.ai?.simpleModel || \"\";")) {
    text = text.replace("    const aiOk = Boolean(system?.ai?.ok);\n", "    const aiOk = Boolean(system?.ai?.ok);\n    const aiModel = system?.ai?.simpleModel || \"\";\n");
  }
  text = text.replace(
    /        card\(TEXT\.aiStatus, .*?\),\n/,
    '        card(TEXT.aiStatus, aiOk ? "ok" : "bad", aiOk ? TEXT.ok : aiConfigured ? "\\u68c0\\u6d4b\\u5931\\u8d25" : TEXT.notConfigured, system?.ai?.detail || (aiModel ? `\\u5f53\\u524d\\u6a21\\u578b ${aiModel} \\u8fd8\\u6ca1\\u6709\\u68c0\\u6d4b\\u901a\\u8fc7\\u3002` : "\\u540e\\u7aef\\u4f1a\\u505a\\u4e00\\u6b21\\u771f\\u5b9e AI \\u56de\\u590d\\u68c0\\u6d4b\\uff0cAI key \\u4e0d\\u4f1a\\u5728\\u524d\\u7aef\\u663e\\u793a\\u3002")),\n'
  );
  text = text.replace(
    /        card\(TEXT\.emailCode, .*?\),\n/,
    '        card(TEXT.emailCode, emailConfigured || !emailRequired ? "ok" : "bad", emailConfigured ? "\\u53d1\\u4fe1\\u5df2\\u914d\\u7f6e" : emailRequired ? "\\u8981\\u6c42\\u9a8c\\u8bc1\\u4f46\\u672a\\u914d\\u7f6e\\u53d1\\u4fe1" : "\\u975e\\u5fc5\\u9700", emailConfigured ? "\\u90ae\\u7bb1\\u9a8c\\u8bc1\\u7801\\u53ef\\u4ee5\\u771f\\u5b9e\\u53d1\\u9001\\u3002" : emailRequired ? "\\u6ce8\\u518c\\u4f1a\\u4f9d\\u8d56\\u90ae\\u7bb1\\u9a8c\\u8bc1\\u7801\\u3002" : "\\u5f53\\u524d\\u4f7f\\u7528\\u9080\\u8bf7\\u7801\\u63a7\\u5236\\u6ce8\\u518c\\uff0c\\u6682\\u4e0d\\u5f3a\\u5236\\u90ae\\u7bb1\\u53d1\\u4fe1\\u3002"),\n'
  );
  fs.writeFileSync(file, text, "utf8");
}

function patchEnvExamples() {
  for (const file of [".env.example", "env.github.example"]) {
    if (!fs.existsSync(file)) continue;
    let text = fs.readFileSync(file, "utf8");
    text = text.replace(/OPENAI_SIMPLE_MODEL=.*/g, "OPENAI_SIMPLE_MODEL=gpt-4o-mini");
    text = text.replace(/OPENAI_COMPLEX_MODEL=.*/g, "OPENAI_COMPLEX_MODEL=gpt-4o");
    fs.writeFileSync(file, text, "utf8");
  }
}

patchServer();
patchLayout();
patchStatusScript();
patchEnvExamples();
console.log("system diagnostics hardening complete");
