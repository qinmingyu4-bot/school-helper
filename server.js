const http = require("http");
const crypto = require("crypto");
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");
const {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearSessionCookie,
  createId,
  createSessionToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  parseCookies,
  publicUser,
  sessionCookie,
  verifyPassword
} = require("./lib/security");
const { StudyBridgeDatabase } = require("./lib/database");

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

let pdfParse = null;
try {
  pdfParse = require("pdf-parse");
} catch {
  pdfParse = null;
}

function loadEnvFile(filePath = path.join(__dirname, ".env")) {
  if (!fsSync.existsSync(filePath)) return;
  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

const db = new StudyBridgeDatabase();
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const requireInviteCode = process.env.REQUIRE_INVITE_CODE !== "false";
const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
const allowEmailCodeFallback = process.env.ALLOW_EMAIL_CODE_FALLBACK !== "false";
const emailCodeTtlMs = Number(process.env.EMAIL_CODE_TTL_MINUTES || 15) * 60 * 1000;
const maxJsonBytes = 16 * 1024 * 1024;
const maxPdfBytes = 8 * 1024 * 1024;
const legacyOpenAiModel = String(process.env.OPENAI_MODEL || "").trim();
const simpleAiModel =
  String(process.env.OPENAI_SIMPLE_MODEL || process.env.STUDYBRIDGE_SIMPLE_MODEL || "").trim() ||
  (legacyOpenAiModel && legacyOpenAiModel !== "gpt-4o-mini" ? legacyOpenAiModel : "gpt-6-luna");
const complexAiModel =
  String(process.env.OPENAI_COMPLEX_MODEL || process.env.STUDYBRIDGE_COMPLEX_MODEL || "").trim() ||
  "gpt-6.1-sol";
const solRoutePercent = Math.max(
  0,
  Math.min(100, Number(process.env.OPENAI_SOL_ROUTE_PERCENT || process.env.STUDYBRIDGE_SOL_ROUTE_PERCENT || 15))
);
const googleClientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const googleClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function sendRedirect(res, location, headers = {}) {
  res.writeHead(302, { location, ...headers });
  res.end();
}

function normalizeInviteCode(code) {
  return String(code || "").trim().toUpperCase();
}

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

function withEffectiveRole(user) {
  if (!user) return null;
  const role = user.role === "admin" || adminEmails().includes(normalizeEmail(user.email)) ? "admin" : "student";
  return { ...user, role };
}

function createInviteCode() {
  return `SB-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function createTemporaryPassword() {
  return `SB-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function isResetRequest(invite) {
  return invite?.kind === "passwordReset";
}

function publicInvite(invite) {
  return {
    id: invite.id,
    code: invite.code,
    label: invite.label || "",
    maxUses: Number(invite.maxUses || 1),
    uses: Number(invite.uses || 0),
    active: invite.active !== false,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt
  };
}

function publicResetRequest(request) {
  return {
    id: request.id,
    email: request.email || "",
    name: request.requestName || request.label || "Student",
    userId: request.userId || "",
    status: request.status || (request.active === false ? "completed" : "pending"),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    completedAt: request.completedAt || ""
  };
}

function communitySchoolKey(school) {
  return String(school || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function communityChannelKey(type, value = "") {
  const channelType = String(type || "all").toLowerCase();
  if (channelType === "school") return `school:${communitySchoolKey(value)}`;
  if (channelType === "major") return `major:${communitySchoolKey(value)}`;
  return "all";
}

function communityChannelForUser(user, requestedType = "all") {
  const channelType = String(requestedType || "all").toLowerCase();
  if (channelType === "school") {
    const school = String(user.profile?.school || "").trim();
    const schoolKey = communitySchoolKey(school);
    if (!schoolKey) throw new Error("Please fill in your school in Profile first.");
    return { type: "school", label: school, key: communityChannelKey("school", school) };
  }
  if (channelType === "major") {
    const major = String(user.profile?.major || "").trim();
    const majorKey = communitySchoolKey(major);
    if (!majorKey) throw new Error("Please fill in your major in Profile first.");
    return { type: "major", label: major, key: communityChannelKey("major", major) };
  }
  return { type: "all", label: "StudyBridge", key: "all" };
}

function publicCommunityPost(post, viewer) {
  const likes = Array.isArray(post.likes) ? post.likes : [];
  const anonymous = post.anonymous === true;
  return {
    id: post.id,
    school: post.school || "",
    schoolKey: post.schoolKey || "",
    major: post.major || "",
    channelType: post.channelType || (post.schoolKey ? "school" : "all"),
    channelKey: post.channelKey || post.schoolKey || "all",
    channelLabel: post.channelLabel || post.school || "StudyBridge",
    topic: post.topic || "问问题",
    content: post.content || "",
    anonymous,
    authorName: anonymous ? "匿名同学" : post.authorName || "同校同学",
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    likeCount: Number(post.likeCount || likes.length || 0),
    likedByMe: likes.includes(viewer?.id)
  };
}

async function publicClassmate(connection, viewerId) {
  const peerId = (connection.userIds || []).find((id) => id !== viewerId);
  const peer = peerId ? await db.getUser(peerId) : null;
  const messages = await db.listDirectMessages(connection.id, 1);
  const last = messages[messages.length - 1] || null;
  return {
    id: connection.id,
    peer: peer
      ? {
          id: peer.id,
          name: peer.name || "同学",
          email: peer.email || "",
          school: peer.profile?.school || "",
          sbId: peer.profile?.sbId || ""
        }
      : null,
    lastMessage: last
      ? {
          content: last.content || "",
          createdAt: last.createdAt,
          mine: last.senderId === viewerId
        }
      : null,
    updatedAt: connection.updatedAt || connection.createdAt
  };
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxJsonBytes) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) return {};
  return JSON.parse(body);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) return sendError(res, 403, "Forbidden");
  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(file);
  } catch {
    const fallback = await fs.readFile(path.join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(fallback);
  }
}

async function currentUser(req) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await db.getSession(tokenHash);
  if (!session || Number(session.expiresAt) < Date.now()) {
    if (session) await db.deleteSession(tokenHash);
    return null;
  }
  const user = await db.getUser(session.userId);
  return user ? { user: withEffectiveRole(user), tokenHash } : null;
}

async function requireUser(req, res) {
  const auth = await currentUser(req);
  if (!auth) {
    sendError(res, 401, "Please log in first.");
    return null;
  }
  return auth.user;
}

async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    sendError(res, 403, "Only the StudyBridge creator can open this area.");
    return null;
  }
  return user;
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function validatePasswordPair(password, passwordConfirm) {
  if (!validatePassword(password)) throw new Error("Password must be at least 8 characters.");
  if (password !== passwordConfirm) throw new Error("The two passwords do not match.");
}

function compactDocumentText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 12000);
}

function cleanProfile(body = {}) {
  const sbId = String(body.sbId || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .slice(0, 24);
  return {
    avatarUrl: String(body.avatarUrl || "").trim().slice(0, 2200000),
    backgroundUrl: String(body.backgroundUrl || "").trim().slice(0, 2200000),
    school: String(body.school || "").trim().slice(0, 120),
    major: String(body.major || "").trim().slice(0, 120),
    sbId
  };
}

function isValidSbId(value) {
  const sbId = String(value || "").trim();
  return !sbId || /^[a-z0-9][a-z0-9._-]{2,23}$/.test(sbId);
}

function decodeBase64Data(data) {
  const raw = String(data || "");
  const clean = raw.includes(",") ? raw.split(",").pop() : raw;
  return Buffer.from(clean, "base64");
}

async function extractUploadedText(body = {}) {
  const fileName = String(body.fileName || body.title || "Uploaded file").slice(0, 180);
  const fileType = String(body.fileType || "").toLowerCase();
  const isPdf = fileType.includes("pdf") || fileName.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    if (!pdfParse) throw new Error("PDF upload support is still installing. Please try again in a minute.");
    const buffer = decodeBase64Data(body.fileData);
    if (!buffer.length) throw new Error("PDF file is empty.");
    if (buffer.length > maxPdfBytes) throw new Error("PDF is too large. Please upload a file under 8 MB.");
    const parsed = await pdfParse(buffer);
    return compactDocumentText(parsed.text || "");
  }

  return compactDocumentText(body.text || body.fileText || "");
}

function generateEmailCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function emailCodeHash(email, purpose, code) {
  return hashToken(`${purpose}:${email}:${String(code || "").trim()}`);
}

function mailSetupMessage() {
  return "Email sending is not configured yet. Add SMTP_HOST, SMTP_USER, SMTP_PASS, and MAIL_FROM in the server .env file first.";
}

function isEmailSetupError(error) {
  const message = String(error?.message || "");
  return message.includes("configured") || message.includes("installed");
}

async function sendEmail({ to, subject, text }) {
  if (!nodemailer) throw new Error("Email sender is not installed yet. Please wait for the server deploy to finish and try again.");
  const host = process.env.SMTP_HOST;
  const portNumber = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || user;
  if (!host || !from || (user && !pass)) throw new Error(mailSetupMessage());

  const transporter = nodemailer.createTransport({
    host,
    port: portNumber,
    secure: process.env.SMTP_SECURE === "true" || portNumber === 465,
    auth: user ? { user, pass } : undefined
  });

  await transporter.sendMail({ from, to, subject, text });
}

async function issueEmailCode(email, purpose) {
  const code = generateEmailCode();
  await db.createAuthCode({
    email,
    purpose,
    codeHash: emailCodeHash(email, purpose, code),
    expiresAt: Date.now() + emailCodeTtlMs,
    attempts: 0
  });

  const action = purpose === "password-reset" ? "reset your StudyBridge password" : "create your StudyBridge account";
  try {
    await sendEmail({
      to: email,
      subject: `Your StudyBridge verification code: ${code}`,
      text: `Your StudyBridge code is ${code}. Use it within ${Math.round(emailCodeTtlMs / 60000)} minutes to ${action}. If you did not request this, you can ignore this email.`
    });
    return { sent: true };
  } catch (error) {
    if (allowEmailCodeFallback && isEmailSetupError(error)) {
      console.warn(`Email delivery is not configured. Showing temporary verification code for ${email}.`);
      return {
        sent: false,
        fallbackCode: code,
        message: "Email sending is not configured yet, so a temporary verification code is shown on this page."
      };
    }
    throw error;
  }
}

async function verifyEmailCode(email, purpose, code) {
  const cleanCode = String(code || "").trim();
  if (!/^\d{6}$/.test(cleanCode)) throw new Error("Please enter the 6-digit email verification code.");
  const record = await db.getAuthCode(email, purpose);
  if (!record) throw new Error("Please send an email verification code first.");
  if (Number(record.expiresAt || 0) < Date.now()) {
    await db.deleteAuthCode(email, purpose);
    throw new Error("The email verification code expired. Please send a new one.");
  }
  if (Number(record.attempts || 0) >= 5) throw new Error("Too many incorrect code attempts. Please send a new code.");

  const expected = Buffer.from(String(record.codeHash || ""), "hex");
  const candidate = Buffer.from(emailCodeHash(email, purpose, cleanCode), "hex");
  const matches = expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
  if (!matches) {
    await db.createAuthCode({ ...record, attempts: Number(record.attempts || 0) + 1 });
    throw new Error("Email verification code is incorrect.");
  }
  await db.deleteAuthCode(email, purpose);
}

function buildStudyPrompt({ user, course, documents, history, mode, message }) {
  const docContext = documents
    .slice(0, 8)
    .map((doc) => `Source: ${doc.title}\n${doc.text.slice(0, 1800)}`)
    .join("\n\n");
  const recent = history
    .slice(-8)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");
  return [
    {
      role: "system",
      content:
        "You are StudyBridge, a bilingual academic coach for international students. Explain in Chinese, preserve key English academic terms, help students learn without doing prohibited final submissions for them, and keep answers grounded in the provided course material. When the student has provided a school, tailor examples, terminology, planning advice, and campus context to that school when useful."
    },
    {
      role: "user",
      content: `Student: ${user.name}\nSchool: ${user.profile?.school || "Not provided"}\nMajor: ${user.profile?.major || "Not provided"}\nCourse: ${course.name}\nMode: ${mode}\nPreferences: ${JSON.stringify(
        user.preferences || {}
      )}\n\nCourse material:\n${docContext || "No course material saved yet."}\n\nRecent chat:\n${recent || "No prior messages."}\n\nStudent question:\n${message}`
    }
  ];
}

function chooseAiModel({ documents = [], history = [], mode = "", message = "" }) {
  const lowerMessage = String(message || "").toLowerCase();
  const totalDocumentText = documents.reduce((total, doc) => total + String(doc.text || "").length, 0);
  const recentConversationText = history.reduce((total, item) => total + String(item.content || "").length, 0);
  const complexModes = new Set(["exam", "assignment", "cheatsheet", "cram", "review"]);
  const complexKeywords = [
    "final",
    "midterm",
    "exam",
    "quiz",
    "assignment",
    "essay",
    "research paper",
    "rubric",
    "deadline",
    "proof",
    "derive",
    "calculus",
    "statistics",
    "economics",
    "accounting",
    "finance",
    "programming",
    "code",
    "debug",
    "case study",
    "lab report",
    "thesis",
    "dissertation",
    "复习",
    "期末",
    "期中",
    "考试",
    "作业",
    "论文",
    "证明",
    "推导",
    "代码",
    "案例",
    "实验报告",
    "详细",
    "深入"
  ];

  const isComplex =
    complexModes.has(String(mode || "").toLowerCase()) ||
    String(message || "").length > 900 ||
    totalDocumentText > 9000 ||
    recentConversationText > 7000 ||
    complexKeywords.some((keyword) => lowerMessage.includes(keyword.toLowerCase()));

  if (!isComplex || solRoutePercent <= 0) return simpleAiModel;
  if (solRoutePercent >= 100) return complexAiModel;
  return crypto.randomInt(100) < solRoutePercent ? complexAiModel : simpleAiModel;
}

async function callAi(messages, model = simpleAiModel) {
  if (!process.env.OPENAI_API_KEY) {
    return "我已经把你的问题保存到云端了。现在服务器还没有配置 OPENAI_API_KEY，所以先用内置学习助手回复：请先上传 syllabus 或 lecture notes，我可以根据课程资料帮你做预习、复习、deadline 汇总和模拟出题。";
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`AI request failed: ${text}`);
  const payload = JSON.parse(text);
  return payload.choices?.[0]?.message?.content || "AI 没有返回内容，请稍后再试。";
}

async function validateInviteForRegistration(inviteCode, email) {
  if (!requireInviteCode) return { type: "open", label: "Open registration" };
  const normalized = normalizeInviteCode(inviteCode);
  const ownerCode = normalizeInviteCode(process.env.OWNER_INVITE_CODE || process.env.REGISTRATION_CODE || "");
  if (!normalized) throw new Error("Registration requires an invitation code from the creator.");
  if (ownerCode && normalized === ownerCode) {
    if (!adminEmails().includes(email)) throw new Error("Creator invitation code can only be used by the creator email.");
    return { type: "owner", code: normalized, label: "Creator invite" };
  }

  const invite = await db.findInviteByCode(normalized);
  if (!invite) throw new Error("Invitation code is invalid.");
  if (invite.active === false) throw new Error("Invitation code is disabled.");
  if (Number(invite.uses || 0) >= Number(invite.maxUses || 1)) throw new Error("Invitation code has already been used.");
  return { type: "invite", invite };
}

function appBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const protocol = req.headers["x-forwarded-proto"] || (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${port}`;
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function googleRedirectUri(req) {
  return String(process.env.GOOGLE_REDIRECT_URI || "").trim() || `${appBaseUrl(req)}/api/auth/google/callback`;
}

function googleAuthEnabled() {
  return Boolean(googleClientId && googleClientSecret);
}

function signOAuthState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "dev-studybridge-secret")
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function verifyOAuthState(state) {
  const [body, signature] = String(state || "").split(".");
  if (!body || !signature) throw new Error("Google login state is invalid.");
  const expected = crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "dev-studybridge-secret")
    .update(body)
    .digest("base64url");
  const received = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (received.length !== wanted.length || !crypto.timingSafeEqual(received, wanted)) {
    throw new Error("Google login state is invalid.");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.createdAt || Date.now() - Number(payload.createdAt) > 10 * 60 * 1000) {
    throw new Error("Google login session expired. Please try again.");
  }
  return payload;
}

function authRedirect(req, params = {}) {
  const target = new URL("/", appBaseUrl(req));
  for (const [key, value] of Object.entries(params)) {
    if (value) target.searchParams.set(key, value);
  }
  return target.toString();
}

async function signInWithGoogle(req, res, url) {
  if (!googleAuthEnabled()) {
    return sendRedirect(res, authRedirect(req, { authError: "Google login is not configured yet." }));
  }

  let statePayload;
  try {
    statePayload = verifyOAuthState(url.searchParams.get("state"));
  } catch (error) {
    return sendRedirect(res, authRedirect(req, { authError: error.message }));
  }

  const code = url.searchParams.get("code");
  if (!code) return sendRedirect(res, authRedirect(req, { authError: "Google did not return an authorization code." }));

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: googleRedirectUri(req),
        grant_type: "authorization_code"
      })
    });
    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error(tokenPayload.error_description || "Google login failed. Please try again.");
    }

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { authorization: `Bearer ${tokenPayload.access_token}` }
    });
    const googleProfile = await profileResponse.json();
    if (!profileResponse.ok || !googleProfile.email) throw new Error("Google did not return an email address.");
    if (googleProfile.email_verified === false) throw new Error("Please verify your Google email first.");

    const email = normalizeEmail(googleProfile.email);
    const existing = await db.findUserByEmail(email);
    let user = existing;

    if (user) {
      user = await db.updateUser(user.id, {
        googleSub: googleProfile.sub || user.googleSub || "",
        authProvider: user.authProvider || "google"
      });
    } else {
      if (statePayload.mode !== "register") {
        throw new Error("This Google email is not registered yet. Switch to Register and enter your invite code first.");
      }
      const inviteGrant = await validateInviteForRegistration(statePayload.inviteCode, email);
      user = await db.createUser({
        id: createId("user"),
        name: String(googleProfile.name || email.split("@")[0] || "StudyBridge Student").trim().slice(0, 80),
        email,
        passwordHash: "",
        role: adminEmails().includes(email) ? "admin" : "student",
        inviteCode: inviteGrant.code || inviteGrant.invite?.code || "",
        inviteId: inviteGrant.invite?.id || "",
        googleSub: googleProfile.sub || "",
        authProvider: "google",
        profile: {
          avatarUrl: googleProfile.picture || "",
          backgroundUrl: "",
          school: "",
          major: "",
          sbId: ""
        },
        preferences: {
          englishTerms: true,
          englishAnswers: true,
          chineseExplanations: true,
          customInstruction: ""
        }
      });
      if (inviteGrant.invite) await db.consumeInvite(inviteGrant.invite.id, user.id);
    }

    const token = createSessionToken();
    await db.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
    return sendRedirect(res, authRedirect(req, { googleAuth: "ok" }), { "set-cookie": sessionCookie(token) });
  } catch (error) {
    return sendRedirect(res, authRedirect(req, { authError: error.message || "Google login failed." }));
  }
}

async function routeApi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const method = req.method || "GET";

  if (url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, db: process.env.STUDYBRIDGE_DB || "local" });
  }

  if (url.pathname === "/api/auth/google/config" && method === "GET") {
    return sendJson(res, 200, { enabled: googleAuthEnabled() });
  }

  if (url.pathname === "/api/auth/google/start" && method === "GET") {
    if (!googleAuthEnabled()) {
      return sendRedirect(res, authRedirect(req, { authError: "Google login is not configured yet." }));
    }
    const mode = url.searchParams.get("mode") === "register" ? "register" : "login";
    const inviteCode = normalizeInviteCode(url.searchParams.get("inviteCode"));
    if (mode === "register" && requireInviteCode && !inviteCode) {
      return sendRedirect(res, authRedirect(req, { authError: "Google registration also needs an invite code." }));
    }
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", googleClientId);
    authUrl.searchParams.set("redirect_uri", googleRedirectUri(req));
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("prompt", "select_account");
    authUrl.searchParams.set(
      "state",
      signOAuthState({
        mode,
        inviteCode,
        createdAt: Date.now(),
        nonce: crypto.randomBytes(12).toString("hex")
      })
    );
    return sendRedirect(res, authUrl.toString());
  }

  if (url.pathname === "/api/auth/google/callback" && method === "GET") {
    return signInWithGoogle(req, res, url);
  }

  if (url.pathname === "/api/auth/send-verification" && method === "POST") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    if (!email.includes("@")) return sendError(res, 400, "Please enter a valid email address first.");
    if (await db.findUserByEmail(email)) return sendError(res, 409, "This email is already registered.");
    try {
      await validateInviteForRegistration(body.inviteCode, email);
      const verification = requireEmailVerification ? await issueEmailCode(email, "register") : { sent: false };
      return sendJson(res, 200, {
        ok: true,
        message: verification.message || "Verification code sent.",
        emailCode: verification.fallbackCode || "",
        emailDelivery: verification.sent ? "email" : verification.fallbackCode ? "page" : "disabled"
      });
    } catch (error) {
      const status = isEmailSetupError(error) ? 503 : 400;
      return sendError(res, status, error.message);
    }
  }

  if (url.pathname === "/api/auth/request-manual-reset" && method === "POST") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    if (!email.includes("@")) return sendError(res, 400, "Please enter a valid email address first.");
    const user = await db.findUserByEmail(email);
    if (user) {
      const existingRequests = (await db.listInvites()).filter(
        (item) => isResetRequest(item) && item.email === email && (item.status || "pending") === "pending"
      );
      if (!existingRequests.length) {
        await db.createInvite({
          id: createId("reset"),
          code: `RESET-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
          kind: "passwordReset",
          label: `Password reset for ${user.name}`,
          email,
          userId: user.id,
          requestName: user.name,
          status: "pending",
          maxUses: 1,
          createdBy: "student-request"
        });
      }
    }
    return sendJson(res, 200, {
      ok: true,
      message: "如果这个邮箱已经注册，创作者会在开发者端看到重置申请。请联系创作者领取临时密码。"
    });
  }

  if (url.pathname === "/api/auth/request-password-reset" && method === "POST") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    if (!email.includes("@")) return sendError(res, 400, "Please enter a valid email address first.");
    const user = await db.findUserByEmail(email);
    try {
      const verification = user ? await issueEmailCode(email, "password-reset") : { sent: false };
      return sendJson(res, 200, {
        ok: true,
        message: verification.message || "If this email exists, a reset code has been sent.",
        emailCode: verification.fallbackCode || "",
        emailDelivery: verification.sent ? "email" : verification.fallbackCode ? "page" : "disabled"
      });
    } catch (error) {
      const status = isEmailSetupError(error) ? 503 : 400;
      return sendError(res, status, error.message);
    }
  }

  if (url.pathname === "/api/auth/reset-password" && method === "POST") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const user = await db.findUserByEmail(email);
    if (!user) return sendError(res, 400, "Email verification code is incorrect or expired.");
    try {
      validatePasswordPair(body.password, body.passwordConfirm);
      await verifyEmailCode(email, "password-reset", body.emailCode);
      await db.updateUser(user.id, { passwordHash: hashPassword(body.password) });
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }

  if (url.pathname === "/api/auth/register" && method === "POST") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const name = String(body.name || "").trim().slice(0, 80);
    try {
      validatePasswordPair(body.password, body.passwordConfirm);
    } catch (error) {
      return sendError(res, 400, error.message);
    }
    if (!name || !email.includes("@")) {
      return sendError(res, 400, "Please provide name and valid email.");
    }
    if (await db.findUserByEmail(email)) return sendError(res, 409, "This email is already registered.");

    let inviteGrant;
    try {
      inviteGrant = await validateInviteForRegistration(body.inviteCode, email);
      if (requireEmailVerification) await verifyEmailCode(email, "register", body.emailCode);
    } catch (error) {
      return sendError(res, 403, error.message);
    }

    const user = await db.createUser({
      id: createId("user"),
      name,
      email,
      passwordHash: hashPassword(body.password),
      role: adminEmails().includes(email) ? "admin" : "student",
      inviteCode: inviteGrant.code || inviteGrant.invite?.code || "",
      inviteId: inviteGrant.invite?.id || "",
      profile: {
        avatarUrl: "",
        backgroundUrl: "",
        school: ""
      },
      preferences: {
        englishTerms: true,
        englishAnswers: true,
        chineseExplanations: true,
        customInstruction: ""
      }
    });
    if (inviteGrant.invite) await db.consumeInvite(inviteGrant.invite.id, user.id);

    const token = createSessionToken();
    await db.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
    return sendJson(res, 201, { user: publicUser(withEffectiveRole(user)) }, { "set-cookie": sessionCookie(token) });
  }

  if (url.pathname === "/api/auth/login" && method === "POST") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const user = await db.findUserByEmail(email);
    if (!user || !verifyPassword(body.password, user.passwordHash)) return sendError(res, 401, "Email or password is incorrect.");
    const token = createSessionToken();
    await db.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
    return sendJson(res, 200, { user: publicUser(withEffectiveRole(user)) }, { "set-cookie": sessionCookie(token) });
  }

  if (url.pathname === "/api/auth/logout" && method === "POST") {
    const auth = await currentUser(req);
    if (auth) await db.deleteSession(auth.tokenHash);
    return sendJson(res, 200, { ok: true }, { "set-cookie": clearSessionCookie() });
  }

  if (url.pathname === "/api/me" && method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return;
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (url.pathname === "/api/me/profile" && method === "PUT") {
    const user = await requireUser(req, res);
    if (!user) return;
    const body = await readJson(req);
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return sendError(res, 400, "Name is required.");
    const profile = cleanProfile(body);
    const updated = await db.updateUser(user.id, { name, profile });
    return sendJson(res, 200, { user: publicUser(withEffectiveRole(updated)) });
  }

  if (url.pathname === "/api/community" && method === "GET") {
  const user = await requireUser(req, res);
  if (!user) return;
  let channel;
  try {
    channel = communityChannelForUser(user, url.searchParams.get("channel") || "all");
  } catch (error) {
    return sendError(res, 400, error.message);
  }
  const posts = await db.listCommunityPosts(channel.key);
  return sendJson(res, 200, {
    channel,
    school: String(user.profile?.school || "").trim(),
    major: String(user.profile?.major || "").trim(),
    posts: posts.map((post) => publicCommunityPost(post, user))
  });
}

if (url.pathname === "/api/community/posts" && method === "POST") {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await readJson(req);
  let channel;
  try {
    channel = communityChannelForUser(user, body.channel || "all");
  } catch (error) {
    return sendError(res, 400, error.message);
  }
  const content = String(body.content || "").trim().slice(0, 1600);
  const topic = String(body.topic || "Question").trim().slice(0, 40);
  if (content.length < 3) return sendError(res, 400, "Post content is too short.");
  const school = String(user.profile?.school || "").trim();
  const major = String(user.profile?.major || "").trim();
  const post = await db.createCommunityPost({
    id: createId("post"),
    school,
    schoolKey: communitySchoolKey(school),
    major,
    channelType: channel.type,
    channelKey: channel.key,
    channelLabel: channel.label,
    topic,
    content,
    anonymous: body.anonymous === true,
    userId: user.id,
    authorName: user.name,
    authorRole: user.role || "student"
  });
  return sendJson(res, 201, { post: publicCommunityPost(post, user) });
}

const openCommunityLikeMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)\/like$/);
if (openCommunityLikeMatch && method === "PATCH") {
  const user = await requireUser(req, res);
  if (!user) return;
  let channel;
  try {
    channel = communityChannelForUser(user, url.searchParams.get("channel") || "all");
  } catch (error) {
    return sendError(res, 400, error.message);
  }
  const post = await db.toggleCommunityPostLike(channel.key, openCommunityLikeMatch[1], user.id);
  if (!post) return sendError(res, 404, "Community post not found.");
  return sendJson(res, 200, { post: publicCommunityPost(post, user) });
}

  if (url.pathname === "/api/community/school" && method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return;
    const school = String(user.profile?.school || "").trim();
    const schoolKey = communitySchoolKey(school);
    if (!schoolKey) return sendError(res, 400, "Please fill in your school in Profile first.");
    const posts = await db.listCommunityPosts(schoolKey);
    return sendJson(res, 200, {
      school,
      schoolKey,
      posts: posts.map((post) => publicCommunityPost(post, user))
    });
  }

  if (url.pathname === "/api/community/school/posts" && method === "POST") {
    const user = await requireUser(req, res);
    if (!user) return;
    const school = String(user.profile?.school || "").trim();
    const schoolKey = communitySchoolKey(school);
    if (!schoolKey) return sendError(res, 400, "Please fill in your school in Profile first.");
    const body = await readJson(req);
    const content = String(body.content || "").trim().slice(0, 1600);
    const topic = String(body.topic || "问问题").trim().slice(0, 40);
    if (content.length < 3) return sendError(res, 400, "Post content is too short.");
    const post = await db.createCommunityPost({
      id: createId("post"),
      school,
      schoolKey,
      topic,
      content,
      anonymous: body.anonymous === true,
      userId: user.id,
      authorName: user.name,
      authorRole: user.role || "student"
    });
    return sendJson(res, 201, { post: publicCommunityPost(post, user) });
  }

  const communityLikeMatch = url.pathname.match(/^\/api\/community\/school\/posts\/([^/]+)\/like$/);
  if (communityLikeMatch && method === "PATCH") {
    const user = await requireUser(req, res);
    if (!user) return;
    const schoolKey = communitySchoolKey(user.profile?.school || "");
    if (!schoolKey) return sendError(res, 400, "Please fill in your school in Profile first.");
    const post = await db.toggleCommunityPostLike(schoolKey, communityLikeMatch[1], user.id);
    if (!post) return sendError(res, 404, "Community post not found.");
    return sendJson(res, 200, { post: publicCommunityPost(post, user) });
  }

  if (url.pathname === "/api/admin/overview" && method === "GET") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const [users, invites] = await Promise.all([db.listUsers(), db.listInvites()]);
    const usersWithStats = await Promise.all(
      users.map(async (user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: withEffectiveRole(user).role,
        inviteCode: user.inviteCode || "",
        createdAt: user.createdAt,
        stats: await db.getUserStats(user.id)
      }))
    );
    const resetRequests = invites.filter(isResetRequest).map(publicResetRequest);
    return sendJson(res, 200, {
      users: usersWithStats,
      invites: invites.filter((invite) => !isResetRequest(invite)).map(publicInvite),
      resetRequests,
      creator: publicUser(admin)
    });
  }

  if (url.pathname === "/api/admin/invites" && method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const maxUses = Math.max(1, Math.min(100, Number(body.maxUses || 1)));
    const invite = await db.createInvite({
      id: createId("invite"),
      code: createInviteCode(),
      label: String(body.label || "Friend invite").trim().slice(0, 80),
      maxUses,
      createdBy: admin.id
    });
    return sendJson(res, 201, { invite: publicInvite(invite) });
  }

  const resetMatch = url.pathname.match(/^\/api\/admin\/password-resets\/([^/]+)$/);
  if (resetMatch && method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const request = (await db.listInvites()).find((item) => item.id === resetMatch[1] && isResetRequest(item));
    if (!request) return sendError(res, 404, "Password reset request not found.");
    if ((request.status || "pending") !== "pending") return sendError(res, 400, "This request has already been completed.");
    const user = request.userId ? await db.getUser(request.userId) : await db.findUserByEmail(request.email);
    if (!user) return sendError(res, 404, "Student account not found.");
    const temporaryPassword = createTemporaryPassword();
    await db.updateUser(user.id, { passwordHash: hashPassword(temporaryPassword) });
    const updated = await db.updateInvite(request.id, {
      active: false,
      status: "completed",
      completedAt: new Date().toISOString(),
      completedBy: admin.id
    });
    return sendJson(res, 200, { temporaryPassword, resetRequest: publicResetRequest(updated || request) });
  }

  const inviteMatch = url.pathname.match(/^\/api\/admin\/invites\/([^/]+)$/);
  if (inviteMatch && method === "PATCH") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const invite = await db.updateInvite(inviteMatch[1], { active: Boolean(body.active) });
    if (!invite) return sendError(res, 404, "Invitation code not found.");
    return sendJson(res, 200, { invite: publicInvite(invite) });
  }

  if (url.pathname === "/api/me/preferences" && method === "PUT") {
    const user = await requireUser(req, res);
    if (!user) return;
    const body = await readJson(req);
    const preferences = {
      englishTerms: Boolean(body.englishTerms),
      englishAnswers: Boolean(body.englishAnswers),
      chineseExplanations: Boolean(body.chineseExplanations),
      customInstruction: String(body.customInstruction || "").slice(0, 500)
    };
    const updated = await db.updateUser(user.id, { preferences });
    return sendJson(res, 200, { user: publicUser(withEffectiveRole(updated)) });
  }

  if (url.pathname === "/api/classmates" && method === "GET") {
  const user = await requireUser(req, res);
  if (!user) return;
  const connections = await db.listClassmates(user.id);
  const classmates = await Promise.all(connections.map((item) => publicClassmate(item, user.id)));
  const connectedIds = new Set(connections.flatMap((item) => item.userIds || []));
  const school = String(user.profile?.school || "").trim();
  const users = await db.listUsers();
  const candidates = users
    .filter((candidate) => candidate.id !== user.id)
    .filter((candidate) => !connectedIds.has(candidate.id))
    .filter((candidate) => !school || String(candidate.profile?.school || "").trim().toLowerCase() === school.toLowerCase())
    .slice(0, 30)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      school: candidate.profile?.school || "",
      sbId: candidate.profile?.sbId || ""
    }));
  return sendJson(res, 200, { classmates, candidates, school });
}

if (url.pathname === "/api/classmates" && method === "POST") {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await readJson(req);
  const sbId = String(body.sbId || body.studentId || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
  const email = normalizeEmail(body.email);
  if (sbId && !isValidSbId(sbId)) return sendError(res, 400, "Please enter a valid SB ID.");
  if (!sbId && !email.includes("@")) return sendError(res, 400, "Please enter your classmate's SB ID.");
  const peer = sbId ? await db.findUserBySbId(sbId) : await db.findUserByEmail(email);
  if (!peer) return sendError(res, 404, sbId ? "No StudyBridge account was found for that SB ID." : "No StudyBridge account was found for that email.");
  if (peer.id === user.id) return sendError(res, 400, "You cannot add yourself.");
  const existing = await db.findClassmateByUsers(user.id, peer.id);
  const connection = existing || await db.createClassmate({ id: createId("mate"), userIds: [user.id, peer.id] });
  return sendJson(res, existing ? 200 : 201, { classmate: await publicClassmate(connection, user.id) });
}

const directMessageMatch = url.pathname.match(/^\/api\/classmates\/([^/]+)\/messages$/);
if (directMessageMatch && method === "GET") {
  const user = await requireUser(req, res);
  if (!user) return;
  const connection = await db.getClassmate(user.id, directMessageMatch[1]);
  if (!connection) return sendError(res, 404, "Classmate chat not found.");
  const messages = await db.listDirectMessages(connection.id);
  return sendJson(res, 200, {
    messages: messages.map((message) => ({
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      senderId: message.senderId,
      mine: message.senderId === user.id
    }))
  });
}

if (directMessageMatch && method === "POST") {
  const user = await requireUser(req, res);
  if (!user) return;
  const connection = await db.getClassmate(user.id, directMessageMatch[1]);
  if (!connection) return sendError(res, 404, "Classmate chat not found.");
  const body = await readJson(req);
  const content = String(body.content || "").trim().slice(0, 1200);
  if (!content) return sendError(res, 400, "Message is required.");
  const message = await db.createDirectMessage({ id: createId("dm"), chatId: connection.id, senderId: user.id, content });
  return sendJson(res, 201, { message: { ...message, mine: true } });
}

  if (url.pathname === "/api/courses" && method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return;
    return sendJson(res, 200, { courses: await db.listCourses(user.id) });
  }

  if (url.pathname === "/api/courses" && method === "POST") {
    const user = await requireUser(req, res);
    if (!user) return;
    const body = await readJson(req);
    const name = String(body.name || "").trim().slice(0, 120);
    if (!name) return sendError(res, 400, "Course name is required.");
    const course = await db.createCourse({
      id: createId("course"),
      userId: user.id,
      name,
      term: String(body.term || "Current term").slice(0, 80)
    });
    return sendJson(res, 201, { course });
  }

  const courseMatch = url.pathname.match(/^\/api\/courses\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (courseMatch) {
    const user = await requireUser(req, res);
    if (!user) return;
    const courseId = courseMatch[1];
    const child = courseMatch[2];
    const childId = courseMatch[3];
    const course = await db.getCourse(user.id, courseId);
    if (!course) return sendError(res, 404, "Course not found.");

    if (!child && method === "DELETE") {
      await db.deleteCourse(user.id, courseId);
      return sendJson(res, 200, { ok: true });
    }

    if (child === "documents" && method === "GET") {
      return sendJson(res, 200, { documents: await db.listDocuments(user.id, courseId) });
    }
    if (child === "documents" && method === "POST") {
      const body = await readJson(req);
      const title = String(body.title || body.fileName || "Course note").trim().slice(0, 160);
      let text;
      try {
        text = body.fileData ? await extractUploadedText(body) : compactDocumentText(body.text);
      } catch (error) {
        return sendError(res, 400, error.message);
      }
      if (!text) return sendError(res, 400, "Document text is required.");
      const document = await db.createDocument({
        id: createId("doc"),
        userId: user.id,
        courseId,
        title,
        text,
        type: String(body.type || (String(body.fileName || "").toLowerCase().endsWith(".pdf") ? "PDF" : "Note")).slice(0, 60)
      });
      return sendJson(res, 201, { document });
    }
    if (child === "documents" && childId && method === "DELETE") {
      await db.deleteDocument(user.id, courseId, childId);
      return sendJson(res, 200, { ok: true });
    }

    if (child === "messages" && method === "GET") {
      return sendJson(res, 200, { messages: await db.listMessages(user.id, courseId) });
    }
    if (child === "chat" && method === "POST") {
      const body = await readJson(req);
      const message = String(body.message || "").trim().slice(0, 4000);
      const mode = String(body.mode || "guided").slice(0, 40);
      if (!message) return sendError(res, 400, "Message is required.");
      const userMessage = await db.createMessage({ id: createId("msg"), userId: user.id, courseId, role: "user", content: message, mode });
      const [documents, history] = await Promise.all([db.listDocuments(user.id, courseId), db.listMessages(user.id, courseId)]);
      const selectedModel = chooseAiModel({ documents, history, mode, message });
      console.log(`StudyBridge AI route: ${selectedModel} | mode=${mode} | docs=${documents.length}`);
      const aiContent = await callAi(buildStudyPrompt({ user, course, documents, history, mode, message }), selectedModel);
      const assistantMessage = await db.createMessage({ id: createId("msg"), userId: user.id, courseId, role: "assistant", content: aiContent, mode });
      return sendJson(res, 201, { messages: [userMessage, assistantMessage], model: selectedModel });
    }
  }

  return sendError(res, 404, "API route not found.");
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) return await routeApi(req, res);
    return await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return sendError(res, 500, error.message || "Server error.");
  }
});

server.listen(port, () => {
  console.log(`StudyBridge cloud app running on http://localhost:${port}`);
});
