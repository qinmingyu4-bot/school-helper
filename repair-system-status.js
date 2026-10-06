const fs = require("fs");
const path = require("path");

function replaceOnce(text, oldText, newText, label) {
  if (!text.includes(oldText)) {
    console.log(`skip ${label}: already changed or anchor missing`);
    return text;
  }
  console.log(`patch ${label}`);
  return text.replace(oldText, newText);
}

function mustReplaceOnce(text, oldText, newText, label) {
  if (!text.includes(oldText)) {
    throw new Error(`Missing required anchor for ${label}`);
  }
  console.log(`patch ${label}`);
  return text.replace(oldText, newText);
}

function patchLayout() {
  const file = path.join("public", "layout-fix.js");
  let text = fs.readFileSync(file, "utf8");
  text = replaceOnce(
    text,
    "        min-height: calc(100vh - 24px);\n        margin: 0;\n        padding: 28px;",
    "        min-height: 0 !important;\n        margin: 0;\n        padding: 28px 28px 18px;",
    "creator panel spacing"
  );
  text = text.replace('/system-status-patch.js?v=20261006-2', '/system-status-patch.js?v=20261006-3');
  fs.writeFileSync(file, text, "utf8");
}

function patchStatusScript() {
  const file = path.join("public", "system-status-patch.js");
  let text = fs.readFileSync(file, "utf8");
  if (!text.includes("const dbReady = Boolean(system?.database?.ready ?? health?.ok);")) {
    text = mustReplaceOnce(
      text,
      "    const dbMode = system?.database?.mode || health?.db || TEXT.unknown;\n",
      "    const dbMode = system?.database?.mode || health?.db || TEXT.unknown;\n    const dbReady = Boolean(system?.database?.ready ?? health?.ok);\n",
      "db readiness variable"
    );
  }
  text = text.replace(
    /        card\(TEXT\.dbMode, .*?\),\n/,
    '        card(TEXT.dbMode, dbReady ? "ok" : "bad", dbMode, system?.database?.note || (dbReady ? "Database is readable and writable." : "Database check failed.")),\n'
  );
  text = text.replace(
    /        card\(TEXT\.emailCode, .*?\),\n/,
    '        card(TEXT.emailCode, emailConfigured || !emailRequired ? "ok" : "bad", emailConfigured ? "Real email sending is configured" : emailRequired ? "Verification required but email sending is missing" : "Not required", emailConfigured ? "Verification emails can be sent." : emailRequired ? "Registration depends on email codes." : "Invite codes are the main registration control, so SMTP is optional for now."),\n'
  );
  fs.writeFileSync(file, text, "utf8");
}

function patchServer() {
  const file = "server.js";
  let text = fs.readFileSync(file, "utf8");

  if (!text.includes('const https = require("https");')) {
    text = mustReplaceOnce(text, 'const http = require("http");\n', 'const http = require("http");\nconst https = require("https");\n', "https import");
  }
  if (!text.includes('const os = require("os");')) {
    text = mustReplaceOnce(text, 'const fs = require("fs/promises");\n', 'const fs = require("fs/promises");\nconst os = require("os");\n', "os import");
  }
  if (!text.includes('const serverStartedAt = new Date().toISOString();')) {
    text = mustReplaceOnce(
      text,
      'const port = Number(process.env.PORT || 3000);\n',
      'const port = Number(process.env.PORT || 3000);\nconst serverStartedAt = new Date().toISOString();\n',
      "server start timestamp"
    );
  }
  if (!text.includes('let cachedAiHealth = null;')) {
    text = mustReplaceOnce(
      text,
      'const googleClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();\n',
      'const googleClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();\nlet cachedAiHealth = null;\n',
      "ai health cache"
    );
  }

  const googleAuthFunction = `function googleAuthEnabled() {
  return Boolean(googleClientId && googleClientSecret);
}
`;

  const helpers = `function googleAuthEnabled() {
  return Boolean(googleClientId && googleClientSecret);
}

function emailDeliveryConfigured() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from = String(process.env.MAIL_FROM || process.env.SMTP_FROM || user).trim();
  return Boolean(nodemailer && host && from && (!user || pass));
}

function packageVersion() {
  try {
    const pkg = JSON.parse(fsSync.readFileSync(path.join(__dirname, "package.json"), "utf8"));
    return String(pkg.version || "unknown");
  } catch {
    return "unknown";
  }
}

function fileIsoTime(filePath) {
  try {
    return fsSync.statSync(filePath).mtime.toISOString();
  } catch {
    return "";
  }
}

function autoSyncStatus() {
  const candidates = [path.join(os.homedir(), "studybridge-auto-deploy.sh"), "/home/ubuntu/studybridge-auto-deploy.sh"];
  const scriptPath = candidates.find((item) => fsSync.existsSync(item)) || "";
  const logPath = path.join(os.homedir(), "studybridge-deploy.log");
  return {
    configured: Boolean(scriptPath),
    scriptPath: scriptPath ? scriptPath.replace(os.homedir(), "~") : "",
    lastLogAt: fileIsoTime(logPath),
    note: scriptPath ? "Server auto-sync script was detected." : "Server auto-sync script was not detected."
  };
}

async function databaseStatus() {
  const mode = db.mode || process.env.STUDYBRIDGE_DB || "local";
  try {
    const users = await db.listUsers();
    return {
      mode,
      ready: true,
      userCount: Array.isArray(users) ? users.length : 0,
      note: mode === "local" ? "Local database is readable and writable. Add backups or a cloud database before larger public use." : "Cloud database connection is healthy."
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

function requestOpenAiModelsHealth() {
  return new Promise((resolve) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      resolve({ configured: false, ok: false, detail: "OPENAI_API_KEY is not configured." });
      return;
    }
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/models",
        method: "GET",
        timeout: 4500,
        headers: { authorization: "Bearer " + apiKey }
      },
      (response) => {
        response.resume();
        const ok = response.statusCode >= 200 && response.statusCode < 300;
        resolve({
          configured: true,
          ok,
          statusCode: response.statusCode,
          detail: ok ? "OpenAI API is reachable." : "OpenAI API returned a non-success status."
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ configured: true, ok: false, detail: "OpenAI API check timed out." });
    });
    req.on("error", (error) => resolve({ configured: true, ok: false, detail: error.message || "OpenAI API connection failed." }));
    req.end();
  });
}

async function aiHealthStatus() {
  if (cachedAiHealth && Date.now() - cachedAiHealth.checkedAtMs < 60000) return cachedAiHealth.payload;
  const health = await requestOpenAiModelsHealth();
  const payload = {
    ...health,
    simpleModel: simpleAiModel,
    complexModel: complexAiModel,
    complexRoutePercent: solRoutePercent,
    checkedAt: new Date().toISOString()
  };
  cachedAiHealth = { checkedAtMs: Date.now(), payload };
  return payload;
}
`;

  if (!text.includes("function emailDeliveryConfigured()")) {
    text = mustReplaceOnce(text, googleAuthFunction, helpers, "system status helpers");
  }

  const adminInvitesAnchor = '  if (url.pathname === "/api/admin/invites" && method === "POST") {\n';
  const systemRoute = `  if (url.pathname === "/api/admin/system-status" && method === "GET") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const ai = await aiHealthStatus();
    return sendJson(res, 200, {
      version: {
        app: packageVersion(),
        node: process.version,
        environment: process.env.NODE_ENV || "development"
      },
      deploy: {
        serverStartedAt,
        lastCodeUpdateAt: fileIsoTime(path.join(__dirname, "server.js"))
      },
      database: await databaseStatus(),
      ai,
      google: {
        enabled: googleAuthEnabled(),
        clientIdConfigured: Boolean(googleClientId),
        clientSecretConfigured: Boolean(googleClientSecret),
        redirectUri: googleRedirectUri(req)
      },
      email: {
        verificationRequired: requireEmailVerification,
        fallbackAllowed: allowEmailCodeFallback,
        sendingConfigured: emailDeliveryConfigured(),
        senderInstalled: Boolean(nodemailer)
      },
      autoSync: autoSyncStatus()
    });
  }

`;

  if (!text.includes('url.pathname === "/api/admin/system-status"')) {
    text = mustReplaceOnce(text, adminInvitesAnchor, systemRoute + adminInvitesAnchor, "admin system status route");
  }

  fs.writeFileSync(file, text, "utf8");
}

patchLayout();
patchStatusScript();
patchServer();
console.log("system diagnostics repair complete");
