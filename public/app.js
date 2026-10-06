const state = {
  user: null,
  courses: [],
  documents: [],
  messages: [],
  invites: [],
  users: [],
  activeCourseId: null,
  authMode: "login",
  workspaceMode: localStorage.getItem("studybridgeWorkspaceMode") || "student"
};

const SYSTEM_COURSE_NAMES = new Set(["Schedule & Deadlines", "Email Reply Helper"]);

function visibleCourses() {
  return state.courses.filter((course) => !SYSTEM_COURSE_NAMES.has(course.name));
}

const authPanel = document.querySelector("#authPanel");
const appShell = document.querySelector("#appShell");
const workspacePage = document.querySelector("#workspacePage");
const profilePage = document.querySelector("#profilePage");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const authSubmit = document.querySelector("#authSubmit");
const nameField = document.querySelector("#nameField");
const nameInput = document.querySelector("#nameInput");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const confirmPasswordField = document.querySelector("#confirmPasswordField");
const passwordConfirmInput = document.querySelector("#passwordConfirmInput");
const inviteField = document.querySelector("#inviteField");
const inviteInput = document.querySelector("#inviteInput");
const emailCodeField = document.querySelector("#emailCodeField");
const emailCodeInput = document.querySelector("#emailCodeInput");
const sendEmailCodeButton = document.querySelector("#sendEmailCodeButton");
const forgotPasswordButton = document.querySelector("#forgotPasswordButton");
const userLine = document.querySelector("#userLine");
const logoutButton = document.querySelector("#logoutButton");
const openProfilePageButton = document.querySelector("#openProfilePageButton");
const backToStudyButton = document.querySelector("#backToStudyButton");
const profileCover = document.querySelector("#profileCover");
const profileAvatar = document.querySelector("#profileAvatar");
const profileName = document.querySelector("#profileName");
const profileSchool = document.querySelector("#profileSchool");
const profilePreviewCover = document.querySelector("#profilePreviewCover");
const profilePreviewAvatar = document.querySelector("#profilePreviewAvatar");
const profilePreviewName = document.querySelector("#profilePreviewName");
const profilePreviewSchool = document.querySelector("#profilePreviewSchool");
const profileForm = document.querySelector("#profileForm");
const profileNameInput = document.querySelector("#profileNameInput");
const schoolInput = document.querySelector("#schoolInput");
const avatarUrlInput = document.querySelector("#avatarUrlInput");
const backgroundUrlInput = document.querySelector("#backgroundUrlInput");
const avatarFileInput = document.querySelector("#avatarFileInput");
const backgroundFileInput = document.querySelector("#backgroundFileInput");
const clearProfileImagesButton = document.querySelector("#clearProfileImagesButton");
const profileMessage = document.querySelector("#profileMessage");
const addCourseButton = document.querySelector("#addCourseButton");
const courseList = document.querySelector("#courseList");
const activeCourseTitle = document.querySelector("#activeCourseTitle");
const statusLine = document.querySelector("#statusLine");
const documentInput = document.querySelector("#documentInput");
const documentTitleInput = document.querySelector("#documentTitleInput");
const saveDocumentButton = document.querySelector("#saveDocumentButton");
const documentFileInput = document.querySelector("#documentFileInput");
const uploadDocumentButton = document.querySelector("#uploadDocumentButton");
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
const roleSwitch = document.querySelector("#roleSwitch");
const studentViewButton = document.querySelector("#studentViewButton");
const creatorViewButton = document.querySelector("#creatorViewButton");
const developerPanel = document.querySelector("#developerPanel");
const inviteForm = document.querySelector("#inviteForm");
const inviteLabelInput = document.querySelector("#inviteLabelInput");
const inviteMaxUsesInput = document.querySelector("#inviteMaxUsesInput");
const inviteList = document.querySelector("#inviteList");
const userList = document.querySelector("#userList");
const adminMessage = document.querySelector("#adminMessage");
const refreshAdminButton = document.querySelector("#refreshAdminButton");

let codeCooldownTimer = null;

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

document.querySelectorAll("[data-quick-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    messageInput.value = button.dataset.quickPrompt || "";
    messageInput.focus();
  });
});

forgotPasswordButton?.addEventListener("click", () => setAuthMode("reset"));
sendEmailCodeButton?.addEventListener("click", sendEmailCode);
openProfilePageButton?.addEventListener("click", showProfilePage);
backToStudyButton?.addEventListener("click", showStudyPage);
clearProfileImagesButton?.addEventListener("click", clearProfileImages);
avatarFileInput?.addEventListener("change", () => previewProfileImage(avatarFileInput, avatarUrlInput));
backgroundFileInput?.addEventListener("change", () => previewProfileImage(backgroundFileInput, backgroundUrlInput));
uploadDocumentButton?.addEventListener("click", uploadDocumentFile);

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";
  authSubmit.disabled = true;
  try {
    const needsConfirmation = state.authMode === "register" || state.authMode === "reset";
    if (needsConfirmation && passwordInput.value !== passwordConfirmInput.value) {
      throw new Error("两次输入的密码不一致。");
    }

    const payload = {
      name: nameInput.value,
      email: emailInput.value,
      password: passwordInput.value,
      passwordConfirm: passwordConfirmInput.value,
      inviteCode: inviteInput.value,
      emailCode: emailCodeInput.value
    };

    if (state.authMode === "reset") {
      await api("/api/auth/reset-password", { method: "POST", body: payload });
      authForm.reset();
      setAuthMode("login");
      authMessage.textContent = "密码已更新，请用新密码登录。";
      return;
    }

    const result = await api(`/api/auth/${state.authMode}`, { method: "POST", body: payload });
    state.user = result.user;
    authMessage.textContent = state.authMode === "register" ? "注册成功，正在进入 StudyBridge..." : "登录成功，正在进入 StudyBridge...";
    authForm.reset();
    window.location.reload();
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

async function sendEmailCode() {
  authMessage.textContent = "";
  const email = emailInput.value.trim();
  if (!email) {
    authMessage.textContent = "请先输入邮箱。";
    emailInput.focus();
    return;
  }
  if (state.authMode === "register" && !inviteInput.value.trim()) {
    authMessage.textContent = "请先输入邀请码，再发送验证码。";
    inviteInput.focus();
    return;
  }

  sendEmailCodeButton.disabled = true;
  try {
    const path = state.authMode === "reset" ? "/api/auth/request-password-reset" : "/api/auth/send-verification";
    await api(path, {
      method: "POST",
      body: { email, inviteCode: inviteInput.value }
    });
    authMessage.textContent = "验证码已发送，请查看邮箱。";
    startCodeCooldown(45);
  } catch (error) {
    authMessage.textContent = error.message;
    sendEmailCodeButton.disabled = false;
  }
}

function startCodeCooldown(seconds) {
  clearInterval(codeCooldownTimer);
  let remaining = seconds;
  sendEmailCodeButton.textContent = `${remaining}s`;
  codeCooldownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(codeCooldownTimer);
      sendEmailCodeButton.textContent = "发送验证码";
      sendEmailCodeButton.disabled = false;
      return;
    }
    sendEmailCodeButton.textContent = `${remaining}s`;
  }, 1000);
}

logoutButton.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  state.user = null;
  state.courses = [];
  state.documents = [];
  state.messages = [];
  state.invites = [];
  state.users = [];
  showAuth();
});

studentViewButton.addEventListener("click", () => requestWorkspaceMode("student"));
creatorViewButton.addEventListener("click", () => requestWorkspaceMode("creator"));

addCourseButton.addEventListener("click", async () => {
  const name = prompt("课程名称，例如 MAT223H1F");
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
  if (!text) return setStatus("先粘贴一点课程资料，或直接上传 PDF/文本文件。");
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
    await maybeRefreshAdmin();
  } catch (error) {
    setStatus(error.message);
  } finally {
    saveDocumentButton.disabled = false;
  }
});

async function uploadDocumentFile() {
  const course = activeCourse();
  if (!course) return setStatus("请先创建或选择一门课程。");
  const file = documentFileInput.files?.[0];
  if (!file) return setStatus("请先选择一个 PDF 或文本文件。");
  if (file.size > 8 * 1024 * 1024) return setStatus("文件太大了，请上传 8 MB 以下的文件。");

  uploadDocumentButton.disabled = true;
  try {
    const fileName = file.name || "Uploaded file";
    const isPdf = file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
    const payload = {
      title: documentTitleInput.value.trim() || fileName,
      fileName,
      fileType: file.type,
      type: isPdf ? "PDF" : detectType(fileName)
    };
    if (isPdf) {
      payload.fileData = await readFileAsDataUrl(file);
    } else {
      payload.text = await file.text();
      payload.type = detectType(payload.text || fileName);
    }
    const result = await api(`/api/courses/${course.id}/documents`, { method: "POST", body: payload });
    state.documents.unshift(result.document);
    documentFileInput.value = "";
    documentTitleInput.value = "";
    renderDocuments();
    setStatus(isPdf ? "PDF 已上传并保存到云端。" : "文件内容已保存到云端。");
    await maybeRefreshAdmin();
  } catch (error) {
    setStatus(error.message);
  } finally {
    uploadDocumentButton.disabled = false;
  }
}

[englishTermsToggle, englishAnswersToggle, chineseExplanationsToggle, customInstructionInput].forEach((control) => {
  control.addEventListener("change", savePreferences);
  control.addEventListener("input", () => {
    preferenceStatus.textContent = "Editing";
  });
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  profileMessage.textContent = "";
  try {
    const result = await api("/api/me/profile", {
      method: "PUT",
      body: {
        name: profileNameInput.value,
        school: schoolInput.value,
        avatarUrl: avatarUrlInput.value,
        backgroundUrl: backgroundUrlInput.value
      }
    });
    state.user = result.user;
    renderProfile();
    syncSchoolPreference();
    profileMessage.textContent = "已保存。AI 会用你的学校信息来辅助回答。";
    setTimeout(showStudyPage, 350);
  } catch (error) {
    profileMessage.textContent = error.message;
  }
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
    await maybeRefreshAdmin();
  } catch (error) {
    removePending();
    appendMessage({ role: "assistant", content: error.message });
  } finally {
    sendButton.disabled = false;
  }
});

inviteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminMessage.textContent = "";
  try {
    const result = await api("/api/admin/invites", {
      method: "POST",
      body: {
        label: inviteLabelInput.value,
        maxUses: inviteMaxUsesInput.value
      }
    });
    state.invites.unshift(result.invite);
    inviteLabelInput.value = "";
    inviteMaxUsesInput.value = "1";
    renderInvites();
    adminMessage.textContent = `已生成邀请码：${result.invite.code}`;
  } catch (error) {
    adminMessage.textContent = error.message;
  }
});

refreshAdminButton.addEventListener("click", () => loadAdminOverview());

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
  showStudyPage();
  renderProfile();
  renderPreferences();
  await loadCourses();
  state.activeCourseId = visibleCourses()[0]?.id || null;
  await loadActiveCourseData();
  renderCourses();
  roleSwitch.hidden = state.user.role !== "admin";
  setWorkspaceMode(state.user.role === "admin" ? state.workspaceMode : "student");
}

function showAuth() {
  authPanel.hidden = false;
  appShell.hidden = true;
  developerPanel.hidden = true;
  roleSwitch.hidden = true;
  passwordInput.value = "";
  passwordConfirmInput.value = "";
  emailCodeInput.value = "";
  setAuthMode("login");
}

function showProfilePage() {
  workspacePage.hidden = true;
  profilePage.hidden = false;
  renderProfileForm();
}

function showStudyPage() {
  profilePage.hidden = true;
  workspacePage.hidden = false;
}

function requestWorkspaceMode(mode) {
  const nextMode = mode === "creator" && state.user?.role === "admin" ? "creator" : "student";
  if ((localStorage.getItem("studybridgeWorkspaceMode") || "student") !== nextMode) {
    localStorage.setItem("studybridgeWorkspaceMode", nextMode);
    window.location.reload();
    return;
  }
  setWorkspaceMode(nextMode);
}

async function setWorkspaceMode(mode) {
  state.workspaceMode = mode === "creator" && state.user?.role === "admin" ? "creator" : "student";
  localStorage.setItem("studybridgeWorkspaceMode", state.workspaceMode);
  studentViewButton.classList.toggle("active", state.workspaceMode === "student");
  creatorViewButton.classList.toggle("active", state.workspaceMode === "creator");
  developerPanel.hidden = state.user?.role !== "admin" || state.workspaceMode !== "creator";
  if (!developerPanel.hidden) await loadAdminOverview();
}

function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
  const registering = mode === "register";
  const resetting = mode === "reset";
  const codeRequired = registering || resetting;
  nameField.hidden = !registering;
  inviteField.hidden = !registering;
  confirmPasswordField.hidden = !codeRequired;
  emailCodeField.hidden = !codeRequired;
  forgotPasswordButton.hidden = mode !== "login";
  nameInput.required = registering;
  inviteInput.required = registering;
  passwordConfirmInput.required = codeRequired;
  emailCodeInput.required = codeRequired;
  passwordInput.autocomplete = mode === "login" ? "current-password" : "new-password";
  passwordInput.placeholder = resetting ? "输入新密码" : "至少 8 位";
  authSubmit.textContent = registering ? "创建账号" : resetting ? "重设密码" : "登录";
  authMessage.textContent = resetting ? "输入邮箱，发送验证码，然后设置新密码。" : "";
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
    activeCourseTitle.textContent = "请选择课程";
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

async function loadAdminOverview() {
  if (state.user?.role !== "admin") return;
  adminMessage.textContent = "";
  try {
    const result = await api("/api/admin/overview");
    state.invites = result.invites;
    state.users = result.users;
    renderInvites();
    renderUsers();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function maybeRefreshAdmin() {
  if (state.user?.role === "admin") await loadAdminOverview();
}

function renderProfile() {
  const profile = state.user?.profile || {};
  const name = state.user?.name || "StudyBridge user";
  const school = profile.school || "添加学校后，AI 会更懂你的学习环境。";
  const initials = name.trim().slice(0, 1).toUpperCase() || "你";
  userLine.textContent = `${name} | ${state.user.email}`;
  profileName.textContent = name;
  profileSchool.textContent = school;
  profilePreviewName.textContent = name;
  profilePreviewSchool.textContent = profile.school || "还没有填写学校。";
  setImage(profileAvatar, profile.avatarUrl, initials);
  setImage(profilePreviewAvatar, profile.avatarUrl, initials);
  setBackground(profileCover, profile.backgroundUrl);
  setBackground(profilePreviewCover, profile.backgroundUrl);
}

function renderProfileForm() {
  const profile = state.user?.profile || {};
  profileNameInput.value = state.user?.name || "";
  schoolInput.value = profile.school || "";
  avatarUrlInput.value = profile.avatarUrl || "";
  backgroundUrlInput.value = profile.backgroundUrl || "";
  avatarFileInput.value = "";
  backgroundFileInput.value = "";
  profileMessage.textContent = "";
}

async function previewProfileImage(fileInput, targetInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    profileMessage.textContent = "请选择图片文件。";
    fileInput.value = "";
    return;
  }
  if (file.size > 1500 * 1024) {
    profileMessage.textContent = "图片太大了，请选择 1.5 MB 以下的图片。";
    fileInput.value = "";
    return;
  }
  targetInput.value = await readFileAsDataUrl(file);
  const draftProfile = {
    ...(state.user?.profile || {}),
    avatarUrl: avatarUrlInput.value,
    backgroundUrl: backgroundUrlInput.value,
    school: schoolInput.value
  };
  const name = profileNameInput.value || state.user?.name || "StudyBridge user";
  const initials = name.trim().slice(0, 1).toUpperCase() || "你";
  setImage(profilePreviewAvatar, draftProfile.avatarUrl, initials);
  setBackground(profilePreviewCover, draftProfile.backgroundUrl);
}

function clearProfileImages() {
  avatarUrlInput.value = "";
  backgroundUrlInput.value = "";
  avatarFileInput.value = "";
  backgroundFileInput.value = "";
  const initials = (profileNameInput.value || state.user?.name || "你").trim().slice(0, 1).toUpperCase() || "你";
  setImage(profilePreviewAvatar, "", initials);
  setBackground(profilePreviewCover, "");
  profileMessage.textContent = "图片已清空，点击保存后生效。";
}

function setImage(element, imageUrl, fallbackText) {
  if (!element) return;
  element.textContent = imageUrl ? "" : fallbackText;
  element.style.backgroundImage = imageUrl ? `url("${imageUrl}")` : "";
}

function setBackground(element, imageUrl) {
  if (!element) return;
  element.style.backgroundImage = imageUrl ? `url("${imageUrl}")` : "";
}

function syncSchoolPreference() {
  const marker = "[StudyBridge personal profile]";
  const profile = state.user?.profile || {};
  const base = customInstructionInput.value.split(marker)[0].trim();
  const lines = [];
  if (state.user?.name) lines.push(`Student preferred name: ${state.user.name}.`);
  if (profile.school) {
    lines.push(`Student school: ${profile.school}. When useful, tailor examples, terminology, academic expectations, campus context, and course-planning advice to this school.`);
  }
  const next = lines.length ? `${base}${base ? "\n\n" : ""}${marker}\n${lines.join("\n")}` : base;
  if (customInstructionInput.value !== next) {
    customInstructionInput.value = next;
    savePreferences().catch(() => {});
  }
}

function renderCourses() {
  const courses = visibleCourses();
  if (!courses.length) {
    courseList.innerHTML = '<p class="empty">还没有课程。</p>';
    activeCourseTitle.textContent = "请选择课程";
    return;
  }

  if (!courses.some((course) => course.id === state.activeCourseId)) {
    state.activeCourseId = courses[0].id;
  }

  courseList.innerHTML = courses
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
      state.activeCourseId = visibleCourses()[0]?.id || null;
      await loadActiveCourseData();
      renderCourses();
      await maybeRefreshAdmin();
    });
  });
}

function renderDocuments() {
  documentCount.textContent = String(state.documents.length);
  if (!state.documents.length) {
    documentList.innerHTML = '<p class="empty">还没有云端课程资料。可以粘贴 syllabus，或直接上传 PDF。</p>';
    return;
  }
  documentList.innerHTML = state.documents
    .map(
      (doc) => `
        <div class="document-item">
          <div class="item-main">
            <strong>${escapeHtml(doc.title)}</strong>
            <span>${escapeHtml(doc.type || "Note")} | ${formatDate(doc.createdAt)}</span>
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
      await maybeRefreshAdmin();
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

function renderInvites() {
  if (!state.invites.length) {
    inviteList.innerHTML = '<p class="empty">还没有生成过邀请码。</p>';
    return;
  }
  inviteList.innerHTML = state.invites
    .map(
      (invite) => `
        <article class="invite-item ${invite.active ? "" : "disabled"}">
          <div>
            <strong>${escapeHtml(invite.code)}</strong>
            <span>${escapeHtml(invite.label || "Friend invite")} | ${invite.uses}/${invite.maxUses} used</span>
          </div>
          <div class="button-row">
            <button class="small-button" type="button" data-copy-invite="${invite.code}">复制</button>
            <button class="small-button" type="button" data-toggle-invite="${invite.id}" data-active="${invite.active}">
              ${invite.active ? "停用" : "启用"}
            </button>
          </div>
        </article>
      `
    )
    .join("");

  inviteList.querySelectorAll("[data-copy-invite]").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard?.writeText(button.dataset.copyInvite);
      adminMessage.textContent = `已复制：${button.dataset.copyInvite}`;
    });
  });

  inviteList.querySelectorAll("[data-toggle-invite]").forEach((button) => {
    button.addEventListener("click", async () => {
      const active = button.dataset.active !== "true";
      const result = await api(`/api/admin/invites/${button.dataset.toggleInvite}`, {
        method: "PATCH",
        body: { active }
      });
      state.invites = state.invites.map((invite) => (invite.id === result.invite.id ? result.invite : invite));
      renderInvites();
    });
  });
}

function renderUsers() {
  if (!state.users.length) {
    userList.innerHTML = '<p class="empty">还没有学生注册。</p>';
    return;
  }
  userList.innerHTML = state.users
    .map(
      (user) => `
        <article class="user-item">
          <div>
            <strong>${escapeHtml(user.name)}</strong>
            <span>${escapeHtml(user.email)} | ${escapeHtml(user.role)}</span>
          </div>
          <div class="stats">
            <span>${user.stats.courses} courses</span>
            <span>${user.stats.documents} docs</span>
            <span>${user.stats.messages} chats</span>
          </div>
        </article>
      `
    )
    .join("");
}

function appendMessage(message, extraClass = "") {
  const item = document.createElement("article");
  item.className = `message ${message.role === "user" ? "user" : "assistant"} ${extraClass}`.trim();
  item.innerHTML = `
    <div class="avatar">${message.role === "user" ? "你" : "AI"}</div>
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
  const lower = String(text || "").toLowerCase();
  if (/syllabus|course schedule|office hours|learning outcomes/.test(lower)) return "Syllabus";
  if (/deadline|due date|calendar|weekly schedule/.test(lower)) return "Schedule";
  if (/rubric|grading|criteria|points/.test(lower)) return "Rubric";
  if (/midterm|final|exam|quiz|practice test/.test(lower)) return "Exam material";
  if (/lecture|slides|reading|chapter|module/.test(lower)) return "Lecture notes";
  return "Note";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败，请重试。"));
    reader.readAsDataURL(file);
  });
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
