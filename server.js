const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fsSync = require("fs");
const fs = require("fs/promises");
const os = require("os");
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
const serverStartedAt = new Date().toISOString();
const requireInviteCode = process.env.REQUIRE_INVITE_CODE !== "false";
const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === "true";
const allowEmailCodeFallback = process.env.ALLOW_EMAIL_CODE_FALLBACK !== "false";
const emailCodeTtlMs = Number(process.env.EMAIL_CODE_TTL_MINUTES || 15) * 60 * 1000;
const maxJsonBytes = 16 * 1024 * 1024;
const maxPdfBytes = 8 * 1024 * 1024;
const localBackupDisabled = process.env.LOCAL_DB_BACKUP_DISABLED === "true";
const localBackupIntervalHours = Math.max(1, Number(process.env.LOCAL_DB_BACKUP_INTERVAL_HOURS || 6));
const localBackupRetention = Math.max(3, Number(process.env.LOCAL_DB_BACKUP_RETENTION || 72));
const legacyOpenAiModel = String(process.env.OPENAI_MODEL || "").trim();
const simpleAiModel =
  String(process.env.OPENAI_SIMPLE_MODEL || process.env.STUDYBRIDGE_SIMPLE_MODEL || "").trim() ||
  legacyOpenAiModel ||
  "gpt-4o-mini";
const complexAiModel =
  String(process.env.OPENAI_COMPLEX_MODEL || process.env.STUDYBRIDGE_COMPLEX_MODEL || "").trim() ||
  "gpt-4o";
const webSearchEnabled = process.env.OPENAI_WEB_SEARCH !== "false";
const webSearchModel =
  String(process.env.OPENAI_WEB_MODEL || process.env.STUDYBRIDGE_WEB_MODEL || "").trim() ||
  complexAiModel ||
  simpleAiModel;
const solRoutePercent = Math.max(
  0,
  Math.min(100, Number(process.env.OPENAI_SOL_ROUTE_PERCENT || process.env.STUDYBRIDGE_SOL_ROUTE_PERCENT || 15))
);
const googleClientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const googleClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
let cachedAiHealth = null;

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

const staticAssetExtensions = new Set([
  ".css",
  ".js",
  ".json",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".ico",
  ".pdf",
  ".txt",
  ".webp"
]);

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
          major: peer.profile?.major || "",
          avatarUrl: peer.profile?.avatarUrl || "",
          backgroundUrl: peer.profile?.backgroundUrl || "",
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
  const extension = path.extname(filePath).toLowerCase();
  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extension] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(file);
  } catch {
    if (staticAssetExtensions.has(extension)) {
      return sendError(res, 404, `Static asset not found: ${requested}`);
    }
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

function cleanAttachmentName(name) {
  return String(name || "Uploaded attachment").replace(/[^\w .()[\]\-@#&,+]/g, "").trim().slice(0, 180) || "Uploaded attachment";
}

function attachmentMime(body = {}) {
  return String(body.mime || body.fileType || body.type || "").trim().toLowerCase().slice(0, 120);
}

function attachmentBuffer(dataUrl = "") {
  const raw = String(dataUrl || "");
  if (!raw) return Buffer.alloc(0);
  return decodeBase64Data(raw);
}

async function normalizeChatAttachments(input = []) {
  if (!Array.isArray(input)) return [];
  const normalized = [];
  for (const raw of input.slice(0, 8)) {
    const name = cleanAttachmentName(raw.name || raw.fileName || raw.title);
    const mime = attachmentMime(raw);
    const size = Math.max(0, Math.min(Number(raw.size || 0), maxJsonBytes));
    const dataUrl = String(raw.dataUrl || raw.fileData || "").trim();
    const text = String(raw.text || raw.fileText || "").trim();
    const lowerName = name.toLowerCase();
    const kind =
      String(raw.kind || "").toLowerCase() ||
      (mime.startsWith("image/")
        ? "image"
        : mime.includes("pdf") || lowerName.endsWith(".pdf")
          ? "pdf"
          : mime.startsWith("text/") || text
            ? "text"
            : "file");

    if (kind === "image" && dataUrl.startsWith("data:image/")) {
      if (dataUrl.length > maxJsonBytes) {
        normalized.push({ name, mime, size, kind: "file", text: "Image was too large to send to AI vision." });
      } else {
        normalized.push({ name, mime, size, kind: "image", dataUrl });
      }
      continue;
    }

    if ((kind === "pdf" || mime.includes("pdf") || lowerName.endsWith(".pdf")) && dataUrl) {
      if (!pdfParse) {
        normalized.push({ name, mime: mime || "application/pdf", size, kind: "file", text: "PDF parser is not installed on the server yet." });
        continue;
      }
      try {
        const buffer = attachmentBuffer(dataUrl);
        if (buffer.length > maxPdfBytes) throw new Error("PDF is over 8 MB.");
        const parsed = await pdfParse(buffer);
        normalized.push({
          name,
          mime: mime || "application/pdf",
          size: buffer.length || size,
          kind: "pdf",
          text: compactDocumentText(parsed.text || "").slice(0, 9000)
        });
      } catch (error) {
        normalized.push({ name, mime: mime || "application/pdf", size, kind: "file", text: `PDF could not be read: ${error.message}` });
      }
      continue;
    }

    if (text) {
      normalized.push({ name, mime: mime || "text/plain", size, kind: "text", text: compactDocumentText(text).slice(0, 9000) });
      continue;
    }

    normalized.push({ name, mime: mime || "application/octet-stream", size, kind: "file", text: "The file was attached, but StudyBridge could not extract readable text from this format yet." });
  }
  return normalized;
}

function formatAttachmentContext(attachments = []) {
  if (!attachments.length) return "";
  return attachments
    .map((item, index) => {
      const lines = [`Attachment ${index + 1}: ${item.name}`, `type=${item.kind}`, `mime=${item.mime || "unknown"}`];
      if (item.kind === "image") {
        lines.push("The image is attached as vision input. Inspect it directly before answering.");
      } else if (item.text) {
        lines.push(`Extracted/readable content:\n${item.text}`);
      } else {
        lines.push("No readable content was extracted.");
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function chatAttachmentLabel(attachments = []) {
  if (!attachments.length) return "";
  return "\n\nAttachments:\n" + attachments.map((item) => `- ${item.name} (${item.kind}${item.mime ? `, ${item.mime}` : ""})`).join("\n");
}

function buildUserPromptContent(text, attachments = []) {
  const context = formatAttachmentContext(attachments);
  const promptText = context ? `${text}\n\nAttached files:\n${context}` : text;
  const imageParts = attachments
    .filter((item) => item.kind === "image" && item.dataUrl)
    .map((item) => ({
      type: "image_url",
      image_url: { url: item.dataUrl }
    }));
  if (!imageParts.length) return promptText;
  return [{ type: "text", text: promptText }, ...imageParts];
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

const scheduleItemPrefix = "[SCHEDULE_ITEM]";

function parseScheduleDocument(doc, course = {}) {
  if (!String(doc.title || "").startsWith(scheduleItemPrefix) && String(doc.type || "") !== "Schedule") return null;
  try {
    const data = JSON.parse(doc.text || "{}");
    if (!data.title || !data.startsAt) return null;
    return {
      id: doc.id,
      title: String(data.title || "").slice(0, 160),
      kind: String(data.kind || "deadline").slice(0, 40),
      course: String(data.course || course.name || "").slice(0, 100),
      startsAt: data.startsAt,
      location: String(data.location || "").slice(0, 160),
      notes: String(data.notes || "").slice(0, 600),
      completedAt: data.completedAt || ""
    };
  } catch {
    return null;
  }
}

async function listUserScheduleItems(userId) {
  const courses = await db.listCourses(userId);
  const perCourse = await Promise.all(
    courses.map(async (course) => ({
      course,
      documents: await db.listDocuments(userId, course.id)
    }))
  );
  return perCourse
    .flatMap(({ course, documents }) => documents.map((doc) => parseScheduleDocument(doc, course)).filter(Boolean))
    .filter((item) => !item.completedAt)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

function formatScheduleContext(scheduleItems = []) {
  const upcoming = scheduleItems.filter((item) => Number.isFinite(new Date(item.startsAt).getTime())).slice(0, 20);
  if (!upcoming.length) {
    return "No unfinished schedule/deadline items are saved for this student.";
  }
  return upcoming
    .map((item, index) => {
      const bits = [
        `${index + 1}. ${item.title}`,
        `course=${item.course || "unknown"}`,
        `kind=${item.kind || "deadline"}`,
        `due=${item.startsAt}`
      ];
      if (item.location) bits.push(`location=${item.location}`);
      if (item.notes) bits.push(`notes=${item.notes}`);
      return bits.join(" | ");
    })
    .join("\n");
}

function looksLikeWeatherQuestion(message) {
  return /weather|temperature|forecast|rain|snow|\u5929\u6c14|\u6c14\u6e29|\u6e29\u5ea6|\u4e0b\u96e8|\u4e0b\u96ea|\u964d\u96e8|\u964d\u96ea/i.test(
    String(message || "")
  );
}

function inferWeatherLocation(message, user) {
  const text = (String(message || "") + " " + String((user && user.profile && user.profile.school) || "")).toLowerCase();
  const locations = [
    ["Toronto", ["toronto", "\u591a\u4f26\u591a", "university of toronto", "centennial", "seneca", "george brown", "york university", "toronto metropolitan"]],
    ["Vancouver", ["vancouver", "\u6e29\u54e5\u534e", "ubc", "university of british columbia"]],
    ["Montreal", ["montreal", "\u8499\u7279\u5229\u5c14", "mcgill", "concordia"]],
    ["Waterloo", ["waterloo", "\u6ed1\u94c1\u5362"]],
    ["Hamilton", ["hamilton", "mcmaster"]],
    ["London Ontario", ["western university", "london ontario"]],
    ["Kingston Ontario", ["queen's university", "queens university", "kingston"]],
    ["Ottawa", ["ottawa", "\u6e25\u592a\u534e", "carleton"]],
    ["Calgary", ["calgary", "\u5361\u5c14\u52a0\u91cc"]],
    ["Edmonton", ["edmonton", "\u57c3\u5fb7\u8499\u987f", "university of alberta"]],
    ["New York", ["new york", "nyu", "columbia university", "\u7ebd\u7ea6"]],
    ["Boston", ["boston", "harvard", "mit", "northeastern", "boston university", "\u6ce2\u58eb\u987f"]],
    ["Los Angeles", ["los angeles", "ucla", "usc", "\u6d1b\u6749\u77f6"]],
    ["San Francisco", ["san francisco", "stanford", "berkeley", "\u65e7\u91d1\u5c71"]],
    ["Seattle", ["seattle", "university of washington", "\u897f\u96c5\u56fe"]],
    ["Chicago", ["chicago", "uchicago", "northwestern", "\u829d\u52a0\u54e5"]]
  ];
  const match = locations.find(function(row) {
    return row[1].some(function(key) { return text.includes(key); });
  });
  return match ? match[0] : "Toronto";
}

function weatherCodeLabel(code) {
  const labels = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm"
  };
  return labels[Number(code)] || "Weather code " + code;
}

async function fetchJsonWithTimeout(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Weather API returned " + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getWeatherContextForQuestion(message, user) {
  if (!looksLikeWeatherQuestion(message)) return "";
  const location = inferWeatherLocation(message, user);
  try {
    const geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(location) + "&count=1&language=en&format=json";
    const geo = await fetchJsonWithTimeout(geoUrl);
    const place = geo && geo.results && geo.results[0];
    if (!place) return "Weather lookup could not find coordinates for " + location + ".";
    const forecastUrl =
      "https://api.open-meteo.com/v1/forecast?latitude=" + place.latitude + "&longitude=" + place.longitude +
      "&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum" +
      "&forecast_days=1&timezone=auto";
    const forecast = await fetchJsonWithTimeout(forecastUrl);
    const current = forecast.current || {};
    const daily = forecast.daily || {};
    const placeLabel = place.name + (place.admin1 ? ", " + place.admin1 : "") + (place.country ? ", " + place.country : "");
    return [
      "Real-time weather lookup for " + placeLabel + ".",
      "Current condition: " + weatherCodeLabel(current.weather_code) + ".",
      "Current temperature: " + current.temperature_2m + (forecast.current_units && forecast.current_units.temperature_2m ? forecast.current_units.temperature_2m : "C") + ".",
      "Feels like: " + current.apparent_temperature + (forecast.current_units && forecast.current_units.apparent_temperature ? forecast.current_units.apparent_temperature : "C") + ".",
      "Wind speed: " + current.wind_speed_10m + (forecast.current_units && forecast.current_units.wind_speed_10m ? forecast.current_units.wind_speed_10m : "km/h") + ".",
      "Today's high/low: " + ((daily.temperature_2m_max || [])[0]) + (forecast.daily_units && forecast.daily_units.temperature_2m_max ? forecast.daily_units.temperature_2m_max : "C") + " / " + ((daily.temperature_2m_min || [])[0]) + (forecast.daily_units && forecast.daily_units.temperature_2m_min ? forecast.daily_units.temperature_2m_min : "C") + ".",
      "Today's precipitation: " + ((daily.precipitation_sum || [])[0]) + (forecast.daily_units && forecast.daily_units.precipitation_sum ? forecast.daily_units.precipitation_sum : "mm") + ".",
      "Weather data time: " + (current.time || "unknown") + "."
    ].join("\n");
  } catch (error) {
    return "Weather lookup failed: " + ((error && error.message) || "unknown error") + ". If web search is available, use it to answer the weather question instead of stopping. If no live lookup is available, tell the student the weather service is temporarily unavailable.";
  }
}

function buildStudyPrompt({ user, course, documents, history, scheduleItems, weatherContext, mode, message, attachments = [] }) {
  const preferenceInstruction = buildPreferenceInstruction(user.preferences || {});
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
        "You are StudyBridge, a bilingual academic coach and general-purpose AI assistant for international students. Answer any user question that is allowed by OpenAI safety rules; do not refuse just because the question is not about school. Explain in Chinese by default, preserve key English academic terms, and help students learn without doing prohibited final submissions for them. For course, deadline, profile, or schedule questions, ground the answer in the provided StudyBridge data first. For general knowledge, current-information questions, weather, news, product prices, policies, rankings, or any question where local StudyBridge data is missing, use reliable general knowledge and, when web search is available, use web search for fresh facts instead of claiming you cannot browse. When you rely on web information, briefly say the information comes from a live lookup and avoid pretending it came from saved course data. When the student asks about due dates, unfinished work, deadlines, exams, or what to do next, always use the global unfinished schedule/deadline context, even if the current chat is inside a different course. When real-time weather context is provided, answer the weather question directly and include practical clothing/commute advice." +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction +
        preferenceInstruction
    },
    {
      role: "user",
      content: buildUserPromptContent(`Student: ${user.name}\nSchool: ${user.profile?.school || "Not provided"}\nMajor: ${user.profile?.major || "Not provided"}\nCourse: ${course.name}\nMode: ${mode}\nLearning style instructions:\n${preferenceInstruction || "Use StudyBridge defaults: Chinese explanation with helpful English academic terms."}\nRaw preferences: ${JSON.stringify(
        user.preferences || {}
      )}\nCurrent server time: ${new Date().toISOString()}\n\nReal-time external context:\n${weatherContext || "No external context was needed or available for this question."}\n\nGlobal unfinished schedule/deadline items across this student's account:\n${formatScheduleContext(scheduleItems)}\n\nCourse material for the current chat course:\n${docContext || "No course material saved yet."}\n\nRecent chat in the current course:\n${recent || "No prior messages."}\n\nStudent question:\n${message}`, attachments)
    }
  ];
}

function buildPreferenceInstruction(preferences = {}) {
  const englishTerms = preferences.englishTerms !== false;
  const englishAnswers = preferences.englishAnswers !== false;
  const chineseExplanations = preferences.chineseExplanations !== false;
  const customInstruction = String(preferences.customInstruction || "").trim();
  const lines = [
    "\n\nLearning Style is mandatory. It overrides the general default language style unless it conflicts with safety or the user's latest message."
  ];

  if (englishTerms) {
    lines.push("- English terms ON: keep important academic keywords, formulas, course concepts, due-date labels, assignment wording, and technical terms in English. Add concise Chinese explanation after them when helpful.");
  } else {
    lines.push("- English terms OFF: translate English academic terms into Chinese when natural, but keep proper nouns, formulas, and exact course labels unchanged.");
  }

  if (englishAnswers && chineseExplanations) {
    lines.push("- English answer ON + Chinese reasoning ON: for problem-solving, assignments, emails, practice questions, exam prep, or study planning, use this order exactly: first provide the direct answer/draft in English, then provide the reasoning, steps, study plan, and warnings in Chinese.");
  } else if (englishAnswers) {
    lines.push("- English answer ON: provide the direct answer/draft in English first, then keep the rest concise.");
  } else if (chineseExplanations) {
    lines.push("- Chinese reasoning ON: explain reasoning, steps, and study strategy in Chinese first. Include English only where it improves academic accuracy.");
  } else {
    lines.push("- Keep answers concise and match the user's language.");
  }

  lines.push("- These three default options do not conflict: English terms are vocabulary anchors, English answer is the final/draft output layer, and Chinese reasoning is the explanation layer.");
  lines.push("- Do not ignore these settings. If the answer is not a question-solving task, still preserve English terms when enabled and use Chinese for explanation when enabled.");

  if (customInstruction) {
    lines.push("- Student custom instruction: " + customInstruction);
  }

  return lines.join("\n");
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

function extractResponsesText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
      if (typeof content.output_text === "string") parts.push(content.output_text);
    }
  }
  return parts.join("\n").trim();
}

function toResponsesContent(content) {
  if (!Array.isArray(content)) return content;
  return content.map((part) => {
    if (part.type === "image_url") {
      return {
        type: "input_image",
        image_url: part.image_url?.url || part.image_url || ""
      };
    }
    return {
      type: "input_text",
      text: String(part.text || "")
    };
  });
}

function toChatContent(content) {
  if (!Array.isArray(content)) return content;
  return content.map((part) => {
    if (part.type === "image_url") {
      return {
        type: "image_url",
        image_url: {
          url: part.image_url?.url || part.image_url || ""
        }
      };
    }
    return {
      type: "text",
      text: String(part.text || "")
    };
  });
}

async function callAiWithResponses(messages, model, toolType = "web_search") {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: messages.map((item) => ({
        role: item.role,
        content: toResponsesContent(item.content)
      })),
      tools: [
        {
          type: toolType,
          search_context_size: "medium"
        }
      ],
      store: false
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error("AI web request failed: " + text);
  const payload = JSON.parse(text);
  return extractResponsesText(payload) || "AI 没有返回内容，请稍后再试。";
}

async function callAiWithChatCompletions(messages, model) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: messages.map((item) => ({
        role: item.role,
        content: toChatContent(item.content)
      }))
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error("AI request failed: " + text);
  const payload = JSON.parse(text);
  return payload.choices?.[0]?.message?.content || "AI 没有返回内容，请稍后再试。";
}

async function callAi(messages, model = simpleAiModel) {
  if (!process.env.OPENAI_API_KEY) {
    return "\u6211\u5df2\u7ecf\u628a\u4f60\u7684\u95ee\u9898\u4fdd\u5b58\u5230\u4e91\u7aef\u4e86\u3002\u73b0\u5728\u670d\u52a1\u5668\u8fd8\u6ca1\u6709\u914d\u7f6e OPENAI_API_KEY\uff0c\u6240\u4ee5\u5148\u7528\u5185\u7f6e\u5b66\u4e60\u52a9\u624b\u56de\u590d\uff1a\u8bf7\u5148\u4e0a\u4f20 syllabus \u6216 lecture notes\uff0c\u6211\u53ef\u4ee5\u6839\u636e\u8bfe\u7a0b\u8d44\u6599\u5e2e\u4f60\u505a\u9884\u4e60\u3001\u590d\u4e60\u3001deadline \u6c47\u603b\u548c\u6a21\u62df\u51fa\u9898\u3002";
  }

  if (webSearchEnabled) {
    try {
      return await callAiWithResponses(messages, webSearchModel || model);
    } catch (error) {
      const message = String((error && error.message) || error);
      if (message.includes("web_search")) {
        try {
          return await callAiWithResponses(messages, webSearchModel || model, "web_search_preview");
        } catch (previewError) {
          console.warn("StudyBridge preview web route failed, falling back to chat completions: " + ((previewError && previewError.message) || previewError));
        }
      } else {
        console.warn("StudyBridge web AI route failed, falling back to chat completions: " + message);
      }
    }
  }

  return callAiWithChatCompletions(messages, model);
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


function localDatabaseFilePath() {
  return db.local?.file || path.resolve(process.env.LOCAL_DB_FILE || ".data/studybridge.json");
}

function localBackupDirectory() {
  return path.resolve(process.env.LOCAL_DB_BACKUP_DIR || path.join(path.dirname(localDatabaseFilePath()), "backups"));
}

function displayPath(filePath) {
  if (!filePath) return "";
  const normalized = path.resolve(filePath);
  const home = os.homedir();
  if (normalized.startsWith(home)) return `~${normalized.slice(home.length)}`;
  if (normalized.startsWith(__dirname)) return `.${normalized.slice(__dirname.length)}`;
  return normalized;
}

function backupFileName(reason = "auto") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cleanReason = String(reason || "auto").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 24) || "auto";
  return `studybridge-${stamp}-${cleanReason}.json`;
}

async function listLocalBackups() {
  const backupDir = localBackupDirectory();
  try {
    const names = await fs.readdir(backupDir);
    const rows = await Promise.all(
      names
        .filter((name) => /^studybridge-.+\.json$/i.test(name))
        .map(async (name) => {
const filePath = path.join(backupDir, name);
const stat = await fs.stat(filePath);
return { name, filePath, mtimeMs: stat.mtimeMs, mtime: stat.mtime.toISOString(), bytes: stat.size };
        })
    );
    return rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}

async function purgeOldLocalBackups(backups) {
  await Promise.all(
    backups.slice(localBackupRetention).map((backup) =>
      fs.unlink(backup.filePath).catch(() => {
        // A stale backup cleanup failure should not block the app.
      })
    )
  );
}

async function ensureLocalDatabaseBackup(reason = "auto") {
  if (db.mode !== "local" || localBackupDisabled) return null;
  const source = localDatabaseFilePath();
  if (!fsSync.existsSync(source)) return null;
  const backups = await listLocalBackups();
  const newest = backups[0];
  const minAgeMs = Math.max(30, Number(process.env.LOCAL_DB_BACKUP_MINUTES || 30)) * 60 * 1000;
  if (newest && Date.now() - newest.mtimeMs < minAgeMs) return newest;
  const backupDir = localBackupDirectory();
  await fs.mkdir(backupDir, { recursive: true });
  const target = path.join(backupDir, backupFileName(reason));
  await fs.copyFile(source, target);
  const stat = await fs.stat(target);
  const updated = [{ name: path.basename(target), filePath: target, mtimeMs: stat.mtimeMs, mtime: stat.mtime.toISOString(), bytes: stat.size }, ...backups];
  await purgeOldLocalBackups(updated);
  return updated[0];
}

async function localBackupStatusClean() {
  if (db.mode !== "local") {
    return {
      mode: "cloud",
      configured: true,
      ready: true,
      required: false,
      note: "Cloud database mode is enabled. Use cloud-provider backups before public launch."
    };
  }

  const source = localDatabaseFilePath();
  const fileExists = fsSync.existsSync(source);
  if (fileExists) {
    try {
      await ensureLocalDatabaseBackup("status");
    } catch {
      // The detailed status below will report backup readiness.
    }
  }
  const backups = await listLocalBackups();
  const latest = backups[0] || null;
  const maxAgeMs = Math.max(26, localBackupIntervalHours * 3) * 60 * 60 * 1000;
  const fresh = Boolean(latest && Date.now() - latest.mtimeMs <= maxAgeMs);
  const ready = !localBackupDisabled && fileExists && Boolean(latest);
  return {
    mode: "local-file",
    configured: !localBackupDisabled,
    ready,
    fresh,
    fileExists,
    filePath: displayPath(source),
    backupDir: displayPath(localBackupDirectory()),
    count: backups.length,
    latestAt: latest?.mtime || "",
    latestBytes: latest?.bytes || 0,
    retention: localBackupRetention,
    intervalHours: localBackupIntervalHours,
    note: localBackupDisabled
      ? "Local database backups are disabled. Turn on backups before inviting more users."
      : ready
        ? fresh
? "Local database backups are active. This reduces browser-close and server restart risk, but a cloud database is still safer for long-term public use."
: "Backups exist, but the newest backup is older than expected. Check the server auto-backup timer."
        : fileExists
? "Local database is present, but no backup was confirmed yet."
: "Local database file has not been created yet."
  };
}

function scheduleLocalDatabaseBackups() {
  if (db.mode !== "local" || localBackupDisabled) return;
  const run = (reason) => {
    ensureLocalDatabaseBackup(reason).catch((error) => {
      console.error("StudyBridge local database backup failed:", error.message || error);
    });
  };
  setTimeout(() => run("startup"), 3000);
  setInterval(() => run("scheduled"), localBackupIntervalHours * 60 * 60 * 1000);
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
    const localFile = mode === "local" ? localDatabaseFilePath() : "";
    const localStat = localFile && fsSync.existsSync(localFile) ? fsSync.statSync(localFile) : null;
    return {
      mode,
      ready: true,
      userCount: Array.isArray(users) ? users.length : 0,
      dataSavedWithAccount: true,
      filePath: localFile ? displayPath(localFile) : "",
      fileExists: localStat ? true : mode !== "local",
      fileUpdatedAt: localStat ? localStat.mtime.toISOString() : "",
      fileBytes: localStat ? localStat.size : 0,
      note:
        mode === "local"
? "\u7528\u6237\u8d44\u6599\u3001\u8bfe\u7a0b\u3001\u804a\u5929\u548c deadline \u90fd\u6309\u8d26\u53f7\u4fdd\u5b58\u5728\u670d\u52a1\u5668\u672c\u5730\u6570\u636e\u5e93\u3002"
: "\u4e91\u6570\u636e\u5e93\u8fde\u63a5\u6b63\u5e38\u3002"
    };
  } catch (error) {
    return {
      mode,
      ready: false,
      userCount: 0,
      dataSavedWithAccount: false,
      note: error?.message || "\u6570\u636e\u5e93\u8bfb\u53d6\u5931\u8d25\u3002"
    };
  }
}

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
          authorization: `Bearer ${apiKey}`,
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
            detail: ok ? `Current model ${model} can respond normally.` : `Current model ${model} failed: ${message || "OpenAI API returned a non-success status."}`
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ configured: true, ok: false, detail: `Current model ${model} timed out.` });
    });
    req.on("error", (error) => resolve({ configured: true, ok: false, detail: error.message || "OpenAI API connection failed." }));
    req.write(body);
    req.end();
  });
}

async function aiHealthStatus() {
  if (cachedAiHealth && Date.now() - cachedAiHealth.checkedAtMs < 60000) return cachedAiHealth.payload;
  const health = await requestOpenAiChatHealth(simpleAiModel);
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

  if (url.pathname === "/api/admin/system-status" && method === "GET") {
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
      database: await databaseStatusClean(),
      backup: await localBackupStatusClean(),
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
      autoSync: autoSyncStatusClean()
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
  const pendingRequests = (await db.listClassmateRequests(user.id)).filter((item) => (item.status || "pending") === "pending");
  const requestPeerIds = new Set(
    pendingRequests
      .flatMap((item) => [item.fromUserId, item.toUserId])
      .filter((id) => id && id !== user.id)
  );
  const requestPeers = await Promise.all([...requestPeerIds].map((id) => db.getUser(id)));
  const requestPeerById = new Map(requestPeers.filter(Boolean).map((peer) => [peer.id, peer]));
  const publicRequestPeer = (peer) => ({
    id: peer?.id || "",
    name: peer?.name || "??",
    email: peer?.email || "",
    school: peer?.profile?.school || "",
    major: peer?.profile?.major || "",
    sbId: peer?.profile?.sbId || ""
  });
  const requests = {
    incoming: pendingRequests
      .filter((item) => item.toUserId === user.id)
      .map((item) => ({
        id: item.id,
        status: item.status || "pending",
        createdAt: item.createdAt,
        from: publicRequestPeer(requestPeerById.get(item.fromUserId))
      })),
    outgoing: pendingRequests
      .filter((item) => item.fromUserId === user.id)
      .map((item) => ({
        id: item.id,
        status: item.status || "pending",
        createdAt: item.createdAt,
        to: publicRequestPeer(requestPeerById.get(item.toUserId))
      }))
  };
  const users = await db.listUsers();
  const candidates = users
    .filter((candidate) => candidate.id !== user.id)
    .filter((candidate) => !connectedIds.has(candidate.id))
    .filter((candidate) => !requestPeerIds.has(candidate.id))
    .filter((candidate) => !school || String(candidate.profile?.school || "").trim().toLowerCase() === school.toLowerCase())
    .slice(0, 30)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      school: candidate.profile?.school || "",
      major: candidate.profile?.major || "",
      sbId: candidate.profile?.sbId || ""
    }));
  return sendJson(res, 200, { classmates, candidates, school, requests });
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
  if (existing) {
    return sendJson(res, 200, { status: "connected", classmate: await publicClassmate(existing, user.id) });
  }

  const incomingRequest = await db.findClassmateRequestByUsers(peer.id, user.id);
  if (incomingRequest) {
    const accepted = await db.updateClassmateRequest(incomingRequest.id, {
      status: "accepted",
      respondedAt: new Date().toISOString()
    });
    const connection = await db.createClassmate({ id: createId("mate"), userIds: [user.id, peer.id], requestId: incomingRequest.id });
    return sendJson(res, 201, { status: "connected", request: accepted, classmate: await publicClassmate(connection, user.id) });
  }

  const existingRequest = await db.findClassmateRequestByUsers(user.id, peer.id);
  const request = existingRequest || await db.createClassmateRequest({
    id: createId("mateReq"),
    fromUserId: user.id,
    toUserId: peer.id
  });
  return sendJson(res, existingRequest ? 200 : 201, {
    status: "pending",
    request: {
      id: request.id,
      status: request.status || "pending",
      createdAt: request.createdAt
    }
  });
}

const classmateRequestMatch = url.pathname.match(/^\/api\/classmate-requests\/([^/]+)$/);
if (classmateRequestMatch && method === "PATCH") {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await readJson(req);
  const action = String(body.action || "").toLowerCase();
  if (action !== "accept" && action !== "ignore") return sendError(res, 400, "Please choose accept or ignore.");
  const request = await db.getClassmateRequest(user.id, classmateRequestMatch[1]);
  if (!request || (request.status || "pending") !== "pending") return sendError(res, 404, "Friend request not found.");
  if (request.toUserId !== user.id) return sendError(res, 403, "Only the receiver can respond to this request.");

  if (action === "ignore") {
    const ignored = await db.updateClassmateRequest(request.id, { status: "ignored", respondedAt: new Date().toISOString() });
    return sendJson(res, 200, { status: "ignored", request: ignored });
  }

  const existingConnection = await db.findClassmateByUsers(request.fromUserId, request.toUserId);
  const connection = existingConnection || await db.createClassmate({
    id: createId("mate"),
    userIds: [request.fromUserId, request.toUserId],
    requestId: request.id
  });
  const accepted = await db.updateClassmateRequest(request.id, { status: "accepted", respondedAt: new Date().toISOString() });
  return sendJson(res, 200, { status: "connected", request: accepted, classmate: await publicClassmate(connection, user.id) });
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
    if (child === "documents" && childId && (method === "PUT" || method === "PATCH")) {
      const body = await readJson(req);
      const title = String(body.title || "Course note").trim().slice(0, 160);
      let text;
      try {
        text = compactDocumentText(body.text);
      } catch (error) {
        return sendError(res, 400, error.message);
      }
      if (!title || !text) return sendError(res, 400, "Document title and text are required.");
      const document = await db.updateDocument(user.id, courseId, childId, {
        title,
        text,
        type: String(body.type || "Note").slice(0, 60)
      });
      if (!document) return sendError(res, 404, "Document not found.");
      return sendJson(res, 200, { document });
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
      const rawMessage = String(body.message || "").trim().slice(0, 4000);
      const mode = String(body.mode || "guided").slice(0, 40);
      const attachments = await normalizeChatAttachments(body.attachments);
      const message = rawMessage || (attachments.length ? "Please analyze the attached file(s)." : "");
      if (!message) return sendError(res, 400, "Message is required.");
      const userMessage = await db.createMessage({ id: createId("msg"), userId: user.id, courseId, role: "user", content: `${message}${chatAttachmentLabel(attachments)}`, mode });
      const [documents, history, scheduleItems, weatherContext] = await Promise.all([
        db.listDocuments(user.id, courseId),
        db.listMessages(user.id, courseId),
        listUserScheduleItems(user.id),
        getWeatherContextForQuestion(message, user)
      ]);
      const selectedModel = chooseAiModel({ documents, history, mode, message: `${message} ${chatAttachmentLabel(attachments)}` });
      console.log(`StudyBridge AI route: ${selectedModel} | mode=${mode} | docs=${documents.length} | schedule=${scheduleItems.length} | attachments=${attachments.length}`);
      const aiContent = await callAi(buildStudyPrompt({ user, course, documents, history, scheduleItems, weatherContext, mode, message, attachments }), selectedModel);
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
  scheduleLocalDatabaseBackups();
});
