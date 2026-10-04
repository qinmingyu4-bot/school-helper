const state = {
  user: null,
  courses: [],
  documents: [],
  messages: [],
  activeCourseId: null,
  authMode: "login"
};

const authPanel = document.querySelector("#authPanel");
const appShell = document.querySelector("#appShell");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const authSubmit = document.querySelector("#authSubmit");
const nameField = document.querySelector("#nameField");
const nameInput = document.querySelector("#nameInput");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const userLine = document.querySelector("#userLine");
const logoutButton = document.querySelector("#logoutButton");
const addCourseButton = document.querySelector("#addCourseButton");
const courseList = document.querySelector("#courseList");
const activeCourseTitle = document.querySelector("#activeCourseTitle");
const statusLine = document.querySelector("#statusLine");
const documentInput = document.querySelector("#documentInput");
const documentTitleInput = document.querySelector("#documentTitleInput");
const saveDocumentButton = document.querySelector("#saveDocumentButton");
const documentList = document.querySelector("#documentList");
const documentCount = document.querySelector("#documentCount");
const chatArea = document.querySelector("#chatArea");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const modeSelect = document.querySelector("#modeSelect");
const englishTermsToggle = document.querySelector("#englishTermsToggle");
const englishAnswersToggle = document.querySelector("#englishAnswersToggle");
const chineseExplanationsToggle = document.querySelector("#chineseExplanationsToggle");
const customInstructionInput = document.querySelector("#customInstructionInput");
const preferenceStatus = document.querySelector("#preferenceStatus");

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";
  authSubmit.disabled = true;
  try {
    const payload = {
      name: nameInput.value,
      email: emailInput.value,
      password: passwordInput.value
    };
    const result = await api(`/api/auth/${state.authMode}`, {
      method: "POST",
      body: payload
    });
    state.user = result.user;
    await enterApp();
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  state.user = null;
  state.courses = [];
  state.documents = [];
  state.messages = [];
  showAuth();
});

addCourseButton.addEventListener("click", async () => {
  const name = prompt("Course name, e.g. MAT223H1F");
  if (!name?.trim()) return;
  const result = await api("/api/courses", { method: "POST", body: { name: name.trim() } });
  state.courses.unshift(result.course);
  state.activeCourseId = result.course.id;
  await loadActiveCourseData();
  renderCourses();
});

saveDocumentButton.addEventListener("click", async () => {
  const course = activeCourse();
  if (!course) return setStatus("请先创建或选择一门课程。");
  const text = documentInput.value.trim();
  if (!text) return setStatus("先粘贴一点课程资料。");
  saveDocumentButton.disabled = true;
  try {
    const title = documentTitleInput.value.trim() || `Course note ${state.documents.length + 1}`;
    const result = await api(`/api/courses/${course.id}/documents`, {
      method: "POST",
      body: { title, text, type: detectType(text) }
    });
    state.documents.unshift(result.document);
    documentInput.value = "";
    documentTitleInput.value = "";
    renderDocuments();
    setStatus("资料已保存到云端数据库。");
  } catch (error) {
    setStatus(error.message);
  } finally {
    saveDocumentButton.disabled = false;
  }
});

[englishTermsToggle, englishAnswersToggle, chineseExplanationsToggle, customInstructionInput].forEach((control) => {
  control.addEventListener("change", savePreferences);
  control.addEventListener("input", () => {
    preferenceStatus.textContent = "Editing";
  });
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const course = activeCourse();
  const message = messageInput.value.trim();
  if (!course) return setStatus("请先创建或选择一门课程。");
  if (!message) return;

  messageInput.value = "";
  sendButton.disabled = true;
  appendMessage({ role: "user", content: message });
  appendMessage({ role: "assistant", content: "正在根据云端课程资料思考..." }, "pending");
  try {
    const result = await api(`/api/courses/${course.id}/chat`, {
      method: "POST",
      body: { message, mode: modeSelect.value }
    });
    state.messages.push(...result.messages);
    await loadMessages(course.id);
    setStatus("对话已保存到云端。");
  } catch (error) {
    removePending();
    appendMessage({ role: "assistant", content: error.message });
  } finally {
    sendButton.disabled = false;
  }
});

async function boot() {
  try {
    const result = await api("/api/me");
    state.user = result.user;
    await enterApp();
  } catch {
    showAuth();
  }
}

async function enterApp() {
  authPanel.hidden = true;
  appShell.hidden = false;
  userLine.textContent = `${state.user.name} · ${state.user.email}`;
  renderPreferences();
  await loadCourses();
  if (!state.courses.length) {
    const result = await api("/api/courses", { method: "POST", body: { name: "My first course" } });
    state.courses = [result.course];
  }
  state.activeCourseId = state.courses[0].id;
  await loadActiveCourseData();
  renderCourses();
}

function showAuth() {
  authPanel.hidden = false;
  appShell.hidden = true;
  passwordInput.value = "";
}

function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
  nameField.hidden = mode !== "register";
  authSubmit.textContent = mode === "register" ? "创建账号" : "登录";
  authMessage.textContent = "";
}

async function loadCourses() {
  const result = await api("/api/courses");
  state.courses = result.courses;
}

async function loadActiveCourseData() {
  const course = activeCourse();
  if (!course) {
    state.documents = [];
    state.messages = [];
    renderDocuments();
    renderMessages();
    return;
  }
  await Promise.all([loadDocuments(course.id), loadMessages(course.id)]);
  activeCourseTitle.textContent = course.name;
}

async function loadDocuments(courseId) {
  const result = await api(`/api/courses/${courseId}/documents`);
  state.documents = result.documents;
  renderDocuments();
}

async function loadMessages(courseId) {
  const result = await api(`/api/courses/${courseId}/messages`);
  state.messages = result.messages;
  renderMessages();
}

function renderCourses() {
  if (!state.courses.length) {
    courseList.innerHTML = '<p class="empty">还没有课程。</p>';
    activeCourseTitle.textContent = "请选择课程";
    return;
  }

  courseList.innerHTML = state.courses
    .map(
      (course) => `
        <div class="course-item ${course.id === state.activeCourseId ? "active" : ""}">
          <button class="item-main" type="button" data-open-course="${course.id}">
            <strong>${escapeHtml(course.name)}</strong>
            <span>${escapeHtml(course.term || "Current term")}</span>
          </button>
          <button class="delete-button" type="button" data-delete-course="${course.id}" aria-label="删除课程">×</button>
        </div>
      `
    )
    .join("");

  courseList.querySelectorAll("[data-open-course]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeCourseId = button.dataset.openCourse;
      await loadActiveCourseData();
      renderCourses();
    });
  });

  courseList.querySelectorAll("[data-delete-course]").forEach((button) => {
    button.addEventListener("click", async () => {
      const course = state.courses.find((item) => item.id === button.dataset.deleteCourse);
      if (!course || !confirm(`删除 ${course.name}？这会删除这门课的资料和聊天记录。`)) return;
      await api(`/api/courses/${course.id}`, { method: "DELETE" });
      state.courses = state.courses.filter((item) => item.id !== course.id);
      state.activeCourseId = state.courses[0]?.id || null;
      await loadActiveCourseData();
      renderCourses();
    });
  });
}

function renderDocuments() {
  documentCount.textContent = String(state.documents.length);
  if (!state.documents.length) {
    documentList.innerHTML = '<p class="empty">还没有云端课程资料。先粘贴 syllabus 或 lecture notes。</p>';
    return;
  }
  documentList.innerHTML = state.documents
    .map(
      (doc) => `
        <div class="document-item">
          <div class="item-main">
            <strong>${escapeHtml(doc.title)}</strong>
            <span>${escapeHtml(doc.type || "Note")} · ${formatDate(doc.createdAt)}</span>
          </div>
          <button class="delete-button" type="button" data-delete-document="${doc.id}" aria-label="删除资料">×</button>
        </div>
      `
    )
    .join("");

  documentList.querySelectorAll("[data-delete-document]").forEach((button) => {
    button.addEventListener("click", async () => {
      const course = activeCourse();
      await api(`/api/courses/${course.id}/documents/${button.dataset.deleteDocument}`, { method: "DELETE" });
      state.documents = state.documents.filter((doc) => doc.id !== button.dataset.deleteDocument);
      renderDocuments();
    });
  });
}

function renderMessages() {
  chatArea.innerHTML = "";
  if (!state.messages.length) {
    appendMessage({
      role: "assistant",
      content: "欢迎回来。先保存课程资料，然后问我预习、复习、deadline、作业要求或模拟考试。"
    });
    return;
  }
  state.messages.forEach((message) => appendMessage(message));
}

function appendMessage(message, extraClass = "") {
  const item = document.createElement("article");
  item.className = `message ${message.role === "user" ? "user" : "assistant"} ${extraClass}`.trim();
  item.innerHTML = `
    <div class="avatar">${message.role === "user" ? "我" : "AI"}</div>
    <div class="bubble">${escapeHtml(message.content || "")}</div>
  `;
  chatArea.appendChild(item);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function removePending() {
  chatArea.querySelector(".pending")?.remove();
}

function renderPreferences() {
  const preferences = state.user?.preferences || {};
  englishTermsToggle.checked = preferences.englishTerms !== false;
  englishAnswersToggle.checked = preferences.englishAnswers !== false;
  chineseExplanationsToggle.checked = preferences.chineseExplanations !== false;
  customInstructionInput.value = preferences.customInstruction || "";
  preferenceStatus.textContent = "Saved";
}

async function savePreferences() {
  preferenceStatus.textContent = "Saving";
  const result = await api("/api/me/preferences", {
    method: "PUT",
    body: {
      englishTerms: englishTermsToggle.checked,
      englishAnswers: englishAnswersToggle.checked,
      chineseExplanations: chineseExplanationsToggle.checked,
      customInstruction: customInstructionInput.value
    }
  });
  state.user = result.user;
  preferenceStatus.textContent = "Saved";
}

function activeCourse() {
  return state.courses.find((course) => course.id === state.activeCourseId) || null;
}

function setStatus(text) {
  statusLine.textContent = text;
}

function detectType(text) {
  const lower = text.toLowerCase();
  if (/syllabus|course schedule|office hours|learning outcomes/.test(lower)) return "Syllabus";
  if (/deadline|due date|calendar|weekly schedule/.test(lower)) return "Schedule";
  if (/rubric|grading|criteria|points/.test(lower)) return "Rubric";
  if (/midterm|final|exam|quiz|practice test/.test(lower)) return "Exam material";
  if (/lecture|slides|reading|chapter|module/.test(lower)) return "Lecture notes";
  return "Note";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("zh-CN");
}

boot();
