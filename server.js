const http = require("http");
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

const db = new StudyBridgeDatabase();
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

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

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) return {};
  if (body.length > 1024 * 1024) throw new Error("Request body is too large.");
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
  return user ? { user, tokenHash } : null;
}

async function requireUser(req, res) {
  const auth = await currentUser(req);
  if (!auth) {
    sendError(res, 401, "Please log in first.");
    return null;
  }
  return auth.user;
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function compactDocumentText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 12000);
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
        "You are StudyBridge, a bilingual academic coach for international students. Explain in Chinese, preserve key English academic terms, help students learn without doing prohibited final submissions for them, and keep answers grounded in the provided course material."
    },
    {
      role: "user",
      content: `Student: ${user.name}\nCourse: ${course.name}\nMode: ${mode}\nPreferences: ${JSON.stringify(
        user.preferences || {}
      )}\n\nCourse material:\n${docContext || "No course material saved yet."}\n\nRecent chat:\n${recent || "No prior messages."}\n\nStudent question:\n${message}`
    }
  ];
}

async function callAi(messages) {
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
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.35
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`AI request failed: ${text}`);
  const payload = JSON.parse(text);
  return payload.choices?.[0]?.message?.content || "AI 没有返回内容，请稍后再试。";
}

async function routeApi(req, res) {
  const url = new URL(req.url, "http://localhost");
  const method = req.method || "GET";

  if (url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, db: process.env.STUDYBRIDGE_DB || "local" });
  }

  if (url.pathname === "/api/auth/register" && method === "POST") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name || !email.includes("@") || !validatePassword(body.password)) {
      return sendError(res, 400, "Please provide name, valid email, and password with at least 8 characters.");
    }
    if (await db.findUserByEmail(email)) return sendError(res, 409, "This email is already registered.");
    const user = await db.createUser({
      id: createId("user"),
      name,
      email,
      passwordHash: hashPassword(body.password),
      preferences: {
        englishTerms: true,
        englishAnswers: true,
        chineseExplanations: true,
        customInstruction: ""
      }
    });
    const token = createSessionToken();
    await db.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
    return sendJson(res, 201, { user: publicUser(user) }, { "set-cookie": sessionCookie(token) });
  }

  if (url.pathname === "/api/auth/login" && method === "POST") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const user = await db.findUserByEmail(email);
    if (!user || !verifyPassword(body.password, user.passwordHash)) return sendError(res, 401, "Email or password is incorrect.");
    const token = createSessionToken();
    await db.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
    return sendJson(res, 200, { user: publicUser(user) }, { "set-cookie": sessionCookie(token) });
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
    return sendJson(res, 200, { user: publicUser(updated) });
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
    const course = await db.createCourse({ id: createId("course"), userId: user.id, name, term: String(body.term || "Current term").slice(0, 80) });
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
      const title = String(body.title || "Course note").trim().slice(0, 160);
      const text = compactDocumentText(body.text);
      if (!text) return sendError(res, 400, "Document text is required.");
      const document = await db.createDocument({ id: createId("doc"), userId: user.id, courseId, title, text, type: String(body.type || "Note").slice(0, 60) });
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
      const aiContent = await callAi(buildStudyPrompt({ user, course, documents, history, mode, message }));
      const assistantMessage = await db.createMessage({ id: createId("msg"), userId: user.id, courseId, role: "assistant", content: aiContent, mode });
      return sendJson(res, 201, { messages: [userMessage, assistantMessage] });
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
