const state = {
  courses: [],
  activeCourseId: null,
  documents: [],
  mode: "preview",
  answerMode: "fast",
  sessions: [],
  activeSessionId: null,
  messages: [],
  pendingImages: [],
  preferences: {
    englishTerms: true,
    englishAnswers: true,
    chineseExplanations: true,
    customInstruction: "",
    habits: {
      englishAnswerRequests: 0,
      chineseExplanationRequests: 0,
      problemSolvingRequests: 0,
      cheatsheetRequests: 0,
    },
  },
};

const modeLabels = {
  preview: "预习",
  guided: "带着学习",
  review: "复习",
  exam: "模拟出题",
  cheatsheet: "Cheatsheet 制作",
  cram: "考前急救",
};

const STORAGE_KEY = "studybridge.sessions.v2";
const DOCUMENTS_STORAGE_KEY = "studybridge.documents.v1";
const COURSES_STORAGE_KEY = "studybridge.courses.v1";
const PREFERENCES_STORAGE_KEY = "studybridge.preferences.v1";
const COVER_SEEN_DATE_KEY = "studybridge.cover.lastSeenDate";
const DEFAULT_COURSE_ID = "default-course";

const supportedTextTypes = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
];

const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const documentList = document.querySelector("#documentList");
const docCount = document.querySelector("#docCount");
const noteInput = document.querySelector("#noteInput");
const addNoteButton = document.querySelector("#addNoteButton");
const chatArea = document.querySelector("#chatArea");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const goalInput = document.querySelector("#goalInput");
const coachStatus = document.querySelector("#coachStatus");
const clearButton = document.querySelector("#clearButton");
const historyList = document.querySelector("#historyList");
const newSessionButton = document.querySelector("#newSessionButton");
const promptRow = document.querySelector("#promptRow");
const imageButton = document.querySelector("#imageButton");
const imageInput = document.querySelector("#imageInput");
const pendingImages = document.querySelector("#pendingImages");
const courseList = document.querySelector("#courseList");
const addCourseButton = document.querySelector("#addCourseButton");
const activeCourseTitle = document.querySelector("#activeCourseTitle");
const coverPage = document.querySelector("#coverPage");
const appShell = document.querySelector("#appShell");
const startButton = document.querySelector("#startButton");
const answerModeButtons = document.querySelectorAll(".answer-mode-button");
const englishTermsToggle = document.querySelector("#englishTermsToggle");
const englishAnswersToggle = document.querySelector("#englishAnswersToggle");
const chineseExplanationsToggle = document.querySelector("#chineseExplanationsToggle");
const customPreferenceInput = document.querySelector("#customPreferenceInput");
const preferenceStatus = document.querySelector("#preferenceStatus");
const preferenceMemory = document.querySelector("#preferenceMemory");

const quickPrompts = {
  preview: [
    ["预习下一节", "请帮我预习下一节课：先讲背景、关键词、我上课前应该带着哪些问题。"],
    ["课前关键词", "请从资料中提取下一节课最需要先懂的关键词，并用中文解释。"],
    ["上课问题", "请帮我准备 5 个上课时应该听答案的问题。"],
    ["10 分钟预习", "我只有 10 分钟，请给我一个超短预习路线。"],
  ],
  guided: [
    ["一步步教", "请带着我学习这部分内容，按概念、例子、检查理解的顺序来。"],
    ["举例讲解", "请用一个北美课堂常见例子解释这部分内容。"],
    ["检查理解", "请问我几个问题来检查我是否真的理解了。"],
    ["中英对照", "请用中文解释核心逻辑，并给我关键英文术语和考试表达。"],
  ],
  review: [
    ["复习清单", "请把这些资料整理成复习清单、易错点和主动回忆问题。"],
    ["主动回忆", "请生成 active recall 问题，不要直接给答案，先让我答。"],
    ["易错点", "请列出这部分最容易混淆或考试容易错的点。"],
    ["考前路线", "请按重要性排序，告诉我复习顺序。"],
  ],
  exam: [
    ["单独题目", "请根据上传资料出 8 道单独练习题，覆盖不同题型，并提供英文作答要求。"],
    ["完整试卷", "请模仿上传的 midterm/final 格式生成一份完整英文练习卷。"],
    ["按题型出题", "请按 definition、short answer、application、long response 分类出题。"],
    ["批改标准", "请给每道题配一个简短英文评分标准和中文解释。"],
  ],
  cheatsheet: [
    ["一页版", "请帮我做一页 cheatsheet：公式/概念/步骤/易错点/题型套路都要压缩得适合考前看。"],
    ["公式步骤", "请把能放进 cheatsheet 的公式、步骤和使用条件整理出来。"],
    ["题型触发词", "请整理看到哪些题目关键词就该用哪个概念、公式或方法。"],
    ["压缩改写", "请把现有内容压缩成更短、更适合写在 cheatsheet 上的版本。"],
  ],
  cram: [
    ["45 分钟急救", "我马上要考试了，请用紧急考前复习模式：先讲最低必要知识，然后直接教我怎么做题。"],
    ["只教做题", "请不要展开太多知识点，直接教我这类题考试时怎么下手。"],
    ["题型套路", "请总结最可能考的题型，以及每种题型第一步该做什么。"],
    ["错题复盘", "我会发错题，请帮我只分析第一步错在哪里和下次怎么避免。"],
  ],
};

const globalPrompts = [
  ["课程介绍", "请根据课程资料，告诉我这门课大概是什么样、主要学什么、怎么被评分。"],
  ["Deadline 汇总", "请汇总 syllabus 和课程资料中的所有 deadline、考试日期和需要提前准备的事项。"],
];

initializePreferences();
initializeCourses();
initializeDocuments();
initializeConversations();
renderQuickPrompts();

fileInput.addEventListener("change", async (event) => {
  await ingestFiles(Array.from(event.target.files || []));
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", async (event) => {
  await ingestFiles(Array.from(event.dataTransfer.files || []));
});

imageButton.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", async (event) => {
  await addPendingImages(Array.from(event.target.files || []));
  imageInput.value = "";
});

addCourseButton.addEventListener("click", () => {
  const name = prompt("Course name, e.g. MAT223H1F");
  if (!name?.trim()) return;
  addCourse(name.trim());
});

startButton.addEventListener("click", () => {
  enterWorkspace({ rememberToday: true });
});

[englishTermsToggle, englishAnswersToggle, chineseExplanationsToggle].forEach((toggle) => {
  toggle.addEventListener("change", () => {
    readPreferencesFromControls();
    savePreferences();
    renderPreferences();
    coachStatus.textContent = "已更新教学偏好";
  });
});

customPreferenceInput.addEventListener("input", () => {
  readPreferencesFromControls();
  savePreferences();
  renderPreferences();
});

["dragenter", "dragover"].forEach((eventName) => {
  chatForm.addEventListener(eventName, (event) => {
    if (!hasDraggedImages(event)) return;
    event.preventDefault();
    chatForm.classList.add("image-dragging");
    coachStatus.textContent = "松开即可把截图加入对话";
  });
});

["dragleave", "drop"].forEach((eventName) => {
  chatForm.addEventListener(eventName, (event) => {
    if (!hasDraggedImages(event)) return;
    event.preventDefault();
    chatForm.classList.remove("image-dragging");
  });
});

chatForm.addEventListener("drop", async (event) => {
  if (!hasDraggedImages(event)) return;
  await addPendingImages(Array.from(event.dataTransfer.files || []));
});

document.addEventListener("paste", async (event) => {
  const files = Array.from(event.clipboardData?.files || []).filter((file) => isImageFile(file));
  if (!files.length) return;
  event.preventDefault();
  await addPendingImages(files);
});

addNoteButton.addEventListener("click", () => {
  const text = noteInput.value.trim();
  if (!text) return;

  addDocument({
    title: `Pasted course note ${state.documents.length + 1}`,
    text,
    type: detectCourseType(text),
    size: text.length,
  });
  noteInput.value = "";
});

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.mode = button.dataset.mode;
    coachStatus.textContent = `当前模式：${modeLabels[state.mode]}`;
    renderQuickPrompts();
  });
});

answerModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    answerModeButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.answerMode = button.dataset.answerMode;
    coachStatus.textContent =
      state.answerMode === "thoughtful" ? "当前回答模式：思考模式" : "当前回答模式：快速应答";
  });
});

messageInput.addEventListener("input", resizeComposer);

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = messageInput.value.trim();
  const attachments = [...state.pendingImages];
  if (!question && !attachments.length) return;

  updatePreferenceMemory(question);
  appendMessage("user", question || "上传了图片。", [], attachments);
  messageInput.value = "";
  state.pendingImages = [];
  renderPendingImages();
  resizeComposer();

  queueCoachAnswer(question || "请参考我刚上传的图片。");
});

clearButton.addEventListener("click", () => {
  state.messages = [createWelcomeMessage()];
  updateActiveSession({ title: "New study session", messages: state.messages });
  renderMessages();
  renderHistory();
  saveSessions();
});

newSessionButton.addEventListener("click", () => {
  createSession();
});

async function addPendingImages(files) {
  const imageFiles = files.filter((file) => isImageFile(file));
  if (!imageFiles.length) return;

  const attachments = await Promise.all(imageFiles.map(readImageAttachment));
  state.pendingImages.push(...attachments);
  renderPendingImages();
  coachStatus.textContent = `已准备 ${state.pendingImages.length} 张图片，发送后会进入对话记录`;
}

function isImageFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  return (
    file.type.startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "heic", "heif", "tif", "tiff"].includes(extension)
  );
}

function hasDraggedImages(event) {
  const items = Array.from(event.dataTransfer?.items || []);
  if (items.some((item) => item.kind === "file" && item.type.startsWith("image/"))) return true;
  return Array.from(event.dataTransfer?.files || []).some((file) => isImageFile(file));
}

function readImageAttachment(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        kind: "image",
        name: file.name,
        type: file.type || "image file",
        size: file.size,
        dataUrl: String(reader.result || ""),
        createdAt: Date.now(),
      });
    };
    reader.onerror = () => {
      resolve({
        id: crypto.randomUUID(),
        kind: "image",
        name: file.name,
        type: file.type || "image file",
        size: file.size,
        dataUrl: "",
        createdAt: Date.now(),
      });
    };
    reader.readAsDataURL(file);
  });
}

function renderPendingImages() {
  pendingImages.hidden = state.pendingImages.length === 0;
  pendingImages.innerHTML = state.pendingImages
    .map(
      (image) => `
        <div class="pending-image">
          ${renderImagePreview(image)}
          <span>${escapeHtml(image.name)}</span>
          <button type="button" data-image-id="${image.id}" aria-label="移除图片">×</button>
        </div>
      `
    )
    .join("");

  pendingImages.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingImages = state.pendingImages.filter((image) => image.id !== button.dataset.imageId);
      renderPendingImages();
    });
  });
}

function renderQuickPrompts() {
  const prompts = [
    ...(quickPrompts[state.mode] || []).map((prompt) => [...prompt, "mode"]),
    ...globalPrompts.map((prompt) => [...prompt, "global"]),
  ];
  promptRow.innerHTML = prompts
    .map(([label, prompt, type]) => {
      const className = type === "global" ? ' class="global-prompt"' : "";
      return `<button${className} type="button" data-prompt="${escapeHtml(prompt)}">${escapeHtml(label)}</button>`;
    })
    .join("");

  promptRow.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      messageInput.value = button.dataset.prompt;
      messageInput.focus();
      resizeComposer();
    });
  });
}

function initializePreferences() {
  const defaults = state.preferences;
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) || "{}");
    state.preferences = {
      ...defaults,
      ...saved,
      habits: {
        ...defaults.habits,
        ...(saved.habits || {}),
      },
    };
  } catch {
    state.preferences = defaults;
  }
  renderPreferences();
}

function readPreferencesFromControls() {
  state.preferences.englishTerms = englishTermsToggle.checked;
  state.preferences.englishAnswers = englishAnswersToggle.checked;
  state.preferences.chineseExplanations = chineseExplanationsToggle.checked;
  state.preferences.customInstruction = customPreferenceInput.value.trim();
}

function renderPreferences() {
  englishTermsToggle.checked = state.preferences.englishTerms;
  englishAnswersToggle.checked = state.preferences.englishAnswers;
  chineseExplanationsToggle.checked = state.preferences.chineseExplanations;
  customPreferenceInput.value = state.preferences.customInstruction || "";
  preferenceStatus.textContent = "Saved";

  const habits = state.preferences.habits || {};
  const total =
    Number(habits.englishAnswerRequests || 0) +
    Number(habits.chineseExplanationRequests || 0) +
    Number(habits.problemSolvingRequests || 0) +
    Number(habits.cheatsheetRequests || 0);
  preferenceMemory.textContent = total
    ? `本地记忆：已根据 ${total} 次学习偏好信号调整教学方式。`
    : "StudyBridge 会根据你的常用问法更新本地记忆。";
}

function savePreferences() {
  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(state.preferences));
}

function updatePreferenceMemory(text) {
  if (!text) return;
  const lower = text.toLowerCase();
  const habits = state.preferences.habits;
  let changed = false;

  if (/英文答案|英文作答|english answer|answer in english|final answer/.test(lower)) {
    state.preferences.englishAnswers = true;
    habits.englishAnswerRequests += 1;
    changed = true;
  }

  if (/中文解释|中文讲|中文解析|用中文|chinese explanation/.test(lower)) {
    state.preferences.chineseExplanations = true;
    habits.chineseExplanationRequests += 1;
    changed = true;
  }

  if (/做题|解题|题目|problem|solve|question|exam|midterm|final|quiz/.test(lower)) {
    habits.problemSolvingRequests += 1;
    changed = true;
  }

  if (/cheatsheet|cheat sheet|公式表|一页纸|速查/.test(lower)) {
    habits.cheatsheetRequests += 1;
    changed = true;
  }

  if (/关键词|术语|key term|vocab|terminology/.test(lower)) {
    state.preferences.englishTerms = true;
    changed = true;
  }

  if (!changed) return;
  savePreferences();
  renderPreferences();
}

function initializeCourses() {
  state.courses = loadCourses();
  state.activeCourseId = state.courses[0]?.id || null;
  updateAppView();
  renderCourses();
}

function loadCourses() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COURSES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCourses() {
  localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(state.courses));
}

function updateAppView() {
  if (hasSeenCoverToday()) {
    enterWorkspace();
    return;
  }

  showCoverPage();
}

function showCoverPage() {
  coverPage.hidden = false;
  appShell.hidden = true;
  requestAnimationFrame(() => startButton.focus());
}

function enterWorkspace(options = {}) {
  if (options.rememberToday) {
    localStorage.setItem(COVER_SEEN_DATE_KEY, getTodayKey());
  }

  coverPage.hidden = true;
  appShell.hidden = false;
  if (!state.activeCourseId && state.courses[0]) {
    state.activeCourseId = state.courses[0].id;
  }
  renderCourses();
  renderDocuments();
  renderHistory();
  renderMessages();
}

function hasSeenCoverToday() {
  return localStorage.getItem(COVER_SEEN_DATE_KEY) === getTodayKey();
}

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function getActiveCourse() {
  return state.courses.find((course) => course.id === state.activeCourseId) || state.courses[0];
}

function addCourse(name) {
  const course = {
    id: crypto.randomUUID(),
    name,
    term: "Current term",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.courses.unshift(course);
  state.activeCourseId = course.id;
  state.messages = [];
  state.activeSessionId = null;
  saveCourses();
  enterWorkspace();
  renderCourses();
  ensureActiveCourseSession();
  renderDocuments();
  renderHistory();
  renderMessages();
  coachStatus.textContent = `已创建课程：${course.name}`;
}

function renderCourses() {
  if (!state.courses.length) {
    courseList.innerHTML = '<p class="empty-state">还没有课程。请先在封面页创建第一门课。</p>';
    activeCourseTitle.textContent = "留学生课程助理";
    return;
  }

  courseList.innerHTML = state.courses
    .map((course) => {
      const active = course.id === state.activeCourseId ? " active" : "";
      const docCountForCourse = state.documents.filter((document) => document.courseId === course.id).length;
      const sessionCountForCourse = state.sessions.filter((session) => session.courseId === course.id).length;
      return `
        <div class="course-item${active}" data-course-id="${course.id}">
          <button class="course-open" type="button" data-course-id="${course.id}">
            <strong>${escapeHtml(course.name)}</strong>
            <span>${docCountForCourse} files · ${sessionCountForCourse} chats</span>
          </button>
          <button class="course-delete" type="button" data-course-id="${course.id}" aria-label="删除课程">×</button>
        </div>
      `;
    })
    .join("");

  courseList.querySelectorAll(".course-open").forEach((button) => {
    button.addEventListener("click", () => {
      switchCourse(button.dataset.courseId);
    });
  });

  courseList.querySelectorAll(".course-delete").forEach((button) => {
    button.addEventListener("click", () => {
      deleteCourse(button.dataset.courseId);
    });
  });

  const activeCourse = getActiveCourse();
  activeCourseTitle.textContent = activeCourse ? activeCourse.name : "留学生课程助理";
}

function deleteCourse(courseId) {
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) return;

  const confirmed = confirm(`删除 ${course.name}？这会同时删除这门课的 Course Pack 和 Past Chats。`);
  if (!confirmed) return;

  state.courses = state.courses.filter((item) => item.id !== courseId);
  state.documents = state.documents.filter((document) => document.courseId !== courseId);
  state.sessions = state.sessions.filter((session) => session.courseId !== courseId);

  if (state.activeCourseId === courseId) {
    state.activeCourseId = state.courses[0]?.id || null;
    state.activeSessionId = null;
    state.messages = [];
  }

  saveCourses();
  saveDocuments();
  saveSessions();
  ensureActiveCourseSession();
  renderCourses();
  renderDocuments();
  renderHistory();
  renderMessages();
  if (state.activeCourseId) {
    coachStatus.textContent = `已删除课程：${course.name}`;
  } else {
    enterWorkspace();
    coachStatus.textContent = `已删除课程：${course.name}。可以从左侧添加下一门课。`;
  }
}

function switchCourse(courseId) {
  if (courseId === state.activeCourseId) return;
  if (!state.courses.some((course) => course.id === courseId)) return;
  state.activeCourseId = courseId;
  ensureActiveCourseSession();
  renderCourses();
  renderDocuments();
  renderHistory();
  renderMessages();
  coachStatus.textContent = `当前课程：${getActiveCourse()?.name || "Course"}`;
}

function currentCourseDocuments() {
  if (!state.activeCourseId) return [];
  return state.documents.filter((document) => document.courseId === state.activeCourseId);
}

function currentCourseSessions() {
  if (!state.activeCourseId) return [];
  return state.sessions.filter((session) => session.courseId === state.activeCourseId);
}

function initializeConversations() {
  state.sessions = loadSessions().map((session) => ({
    courseId: session.courseId || DEFAULT_COURSE_ID,
    ...session,
  }));
  if (state.activeCourseId) {
    ensureActiveCourseSession(false);
  }
  renderMessages();
  renderHistory();
  renderCourses();
}

function loadSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions.slice(0, 24)));
  } catch {
    coachStatus.textContent = "浏览器存储空间不足，当前对话可能无法保存";
  }
}

function initializeDocuments() {
  state.documents = loadDocuments().map((document) => ({
    courseId: document.courseId || DEFAULT_COURSE_ID,
    ...document,
  }));
  renderDocuments();
  if (currentCourseDocuments().length) {
    const readableDocs = currentCourseDocuments().filter((document) => !document.unreadable).length;
    coachStatus.textContent = `已恢复 ${readableDocs} 份本地课程资料`;
  }
  renderCourses();
}

function loadDocuments() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DOCUMENTS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDocuments() {
  try {
    const documentsToStore = state.documents.slice(0, 18).map((document) => ({
      id: document.id,
      title: document.title,
      text: document.text,
      type: document.type,
      size: document.size,
      unreadable: document.unreadable,
      summary: document.summary,
      keywords: document.keywords,
      courseId: document.courseId || DEFAULT_COURSE_ID,
      savedAt: document.savedAt || Date.now(),
    }));
    localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(documentsToStore));
  } catch {
    coachStatus.textContent = "浏览器本地存储空间不足，课程资料可能无法完整保存";
  }
}

function ensureActiveCourseSession(shouldSave = true) {
  if (!state.activeCourseId) {
    state.activeSessionId = null;
    state.messages = [];
    return;
  }

  const sessions = currentCourseSessions();
  if (!sessions.length) {
    createSession("New study session", shouldSave);
    return;
  }
  const latest = sessions[0];
  state.activeSessionId = latest.id;
  state.messages = latest.messages?.length ? latest.messages : [createWelcomeMessage()];
}

function createSession(title = "New study session", shouldSave = true) {
  if (!state.activeCourseId) return;

  const session = {
    id: crypto.randomUUID(),
    courseId: state.activeCourseId,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [createWelcomeMessage()],
  };
  state.sessions.unshift(session);
  state.activeSessionId = session.id;
  state.messages = session.messages;
  renderMessages();
  renderHistory();
  if (shouldSave) saveSessions();
}

function createWelcomeMessage() {
  const courseName = getActiveCourse()?.name || "这门课";
  return {
    role: "coach",
    content:
      `你好，这是 ${courseName} 的学习 section。我会用中文帮你理解知识点，同时保留英文关键词；做题时可以给 English answer / final answer，再用中文解释步骤和 reasoning。每门课都会有自己的资料、对话记录、学习模式和客制化教学偏好。`,
    sources: [],
    createdAt: Date.now(),
  };
}

function updateActiveSession(updates = {}) {
  const session = state.sessions.find((item) => item.id === state.activeSessionId);
  if (!session) return;
  Object.assign(session, updates, { updatedAt: Date.now() });
  state.sessions = [session, ...state.sessions.filter((item) => item.id !== session.id)];
}

function renderHistory() {
  if (!state.activeCourseId) {
    historyList.innerHTML = '<p class="empty-state">创建第一门课程后，对话会自动保存在这台浏览器里。</p>';
    return;
  }

  const sessions = currentCourseSessions();
  if (!sessions.length) {
    historyList.innerHTML = '<p class="empty-state">当前课程还没有对话。</p>';
    return;
  }

  historyList.innerHTML = sessions
    .map((session) => {
      const active = session.id === state.activeSessionId ? " active" : "";
      const count = Math.max((session.messages?.length || 1) - 1, 0);
      return `
        <div class="history-item${active}" data-session-id="${session.id}">
          <button class="history-open" type="button" data-session-id="${session.id}">
            <strong>${escapeHtml(session.title || "Study session")}</strong>
            <span>${count} messages · ${formatRelativeTime(session.updatedAt)}</span>
          </button>
          <button class="history-delete" type="button" data-session-id="${session.id}" aria-label="删除对话">×</button>
        </div>
      `;
    })
    .join("");

  historyList.querySelectorAll(".history-open").forEach((button) => {
    button.addEventListener("click", () => {
      const session = state.sessions.find((item) => item.id === button.dataset.sessionId);
      if (!session) return;
      state.activeSessionId = session.id;
      state.messages = session.messages?.length ? session.messages : [createWelcomeMessage()];
      renderMessages();
      renderHistory();
    });
  });

  historyList.querySelectorAll(".history-delete").forEach((button) => {
    button.addEventListener("click", () => {
      deleteSession(button.dataset.sessionId);
    });
  });
}

function deleteSession(sessionId) {
  const deletingActive = sessionId === state.activeSessionId;
  state.sessions = state.sessions.filter((session) => session.id !== sessionId);

  if (!currentCourseSessions().length) {
    createSession("New study session");
    return;
  }

  if (deletingActive) {
    const nextSession = currentCourseSessions()[0];
    state.activeSessionId = nextSession.id;
    state.messages = nextSession.messages?.length ? nextSession.messages : [createWelcomeMessage()];
    renderMessages();
  }

  renderHistory();
  saveSessions();
}

function renderMessages() {
  chatArea.innerHTML = "";
  if (!state.activeCourseId) return;
  state.messages.forEach((message) => {
    renderMessageElement(message.role, message.content, message.sources || [], message.attachments || []);
  });
}

async function ingestFiles(files) {
  if (!files.length) return;
  if (!state.activeCourseId) return;

  for (const file of files) {
    const extension = file.name.split(".").pop().toLowerCase();
    const canRead =
      supportedTextTypes.includes(file.type) ||
      ["txt", "md", "csv", "json", "html", "htm"].includes(extension);

    coachStatus.textContent = `正在读取 ${file.name}...`;

    if (extension === "pdf") {
      try {
        const text = await extractPdfText(file);
        addDocument({
          title: file.name,
          text: cleanText(text),
          type: detectCourseType(text, "PDF"),
          size: file.size,
        });
      } catch (error) {
        addDocument({
          title: file.name,
          text: "",
          type: "PDF file",
          size: file.size,
          unreadable: true,
          error: error.message,
        });
      }
    } else if (canRead) {
      const text = await file.text();
      addDocument({
        title: file.name,
        text: cleanText(text),
        type: detectCourseType(text, extension.toUpperCase()),
        size: file.size,
      });
    } else {
      addDocument({
        title: file.name,
        text: "",
        type: `${extension.toUpperCase()} file`,
        size: file.size,
        unreadable: true,
      });
    }
  }
}

async function extractPdfText(file) {
  const pdfjsLib =
    window.pdfjsLib || (await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs"));

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text) {
      pageTexts.push(`Page ${pageNumber}: ${text}`);
    }
  }

  const joined = pageTexts.join("\n\n").trim();
  if (!joined) {
    throw new Error("No selectable text found. This PDF may be scanned and needs OCR.");
  }

  return joined;
}

function addDocument(documentItem) {
  if (!state.activeCourseId) return;

  state.documents.unshift({
    id: crypto.randomUUID(),
    courseId: state.activeCourseId,
    summary: summarizeText(documentItem.text),
    keywords: extractKeywords(documentItem.text),
    savedAt: Date.now(),
    ...documentItem,
  });

  renderDocuments();
  saveDocuments();
  renderCourses();

  const readableDocs = currentCourseDocuments().filter((document) => !document.unreadable).length;
  coachStatus.textContent = readableDocs
    ? `已读取 ${readableDocs} 份可分析课程资料`
    : "已记录文件名，可粘贴正文让我分析";

  if (documentItem.unreadable) {
    const reason = documentItem.error ? `原因：${documentItem.error}` : "原因：暂时无法读取正文。";
    appendMessage(
      "coach",
      `我收到了《${documentItem.title}》，但没有读到可分析的正文。${reason} 你可以换文字版 PDF，或把 syllabus、lecture notes、deadline、rubric、midterm/final 的关键文字粘贴到左侧。`
    );
  } else {
    appendMessage("coach", buildDocumentLoadedReply(documentItem));
  }
}

function renderDocuments() {
  if (!state.activeCourseId) {
    docCount.textContent = "0 files";
    documentList.innerHTML =
      '<p class="empty-state">创建第一门课程后，就可以上传或粘贴 syllabus、slides、readings、midterm/final。</p>';
    return;
  }

  const documents = currentCourseDocuments();
  docCount.textContent = `${documents.length} files`;

  if (!documents.length) {
    documentList.innerHTML =
      '<p class="empty-state">当前课程还没有资料。上传或粘贴 syllabus、slides、readings、midterm/final 后，这门课会单独记住。</p>';
    return;
  }

  documentList.innerHTML = documents
    .map(
      (document) => `
        <article class="doc-item">
          <div class="doc-main">
            <strong title="${escapeHtml(document.title)}">${escapeHtml(document.title)}</strong>
            <span>${escapeHtml(document.type)} · ${formatSize(document.size)}${
              document.unreadable ? " · paste text needed" : ""
            }</span>
          </div>
          <button class="doc-delete" type="button" data-document-id="${document.id}" aria-label="删除资料">×</button>
        </article>
      `
    )
    .join("");

  documentList.querySelectorAll(".doc-delete").forEach((button) => {
    button.addEventListener("click", () => {
      deleteDocument(button.dataset.documentId);
    });
  });
}

function deleteDocument(documentId) {
  state.documents = state.documents.filter((document) => document.id !== documentId);
  renderDocuments();
  renderCourses();
  saveDocuments();
  coachStatus.textContent = "已从当前课程 Course Pack 删除资料";
}

function queueCoachAnswer(question) {
  if (state.answerMode !== "thoughtful") {
    setTimeout(() => {
      appendCoachAnswer(question);
    }, 260);
    return;
  }

  const startedAt = Date.now();
  coachStatus.textContent = "思考模式：AI 正在自习思考 0s";

  const timer = setInterval(() => {
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    coachStatus.textContent = `思考模式：AI 正在自习思考 ${seconds}s`;
  }, 500);

  setTimeout(() => {
    clearInterval(timer);
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    appendCoachAnswer(question, { thinkingSeconds: seconds });
    coachStatus.textContent = `思考完成：${seconds}s`;
  }, 3200);
}

function appendCoachAnswer(question, options = {}) {
  const context = findRelevantContext(question);
  context.memory = buildConversationMemory();
  const goal = goalInput.value.trim() || "理解课程结构，跟上进度，准备考试";
  const answer = generateCoachReply(question, context, goal);
  const thinkingSummary = options.thinkingSeconds ? buildThinkingSummary(question, context, options.thinkingSeconds) : "";
  appendMessage("coach", `${thinkingSummary}${answer.text}`, context.sources);
}

function generateCoachReply(question, context, goal) {
  const hasContext = context.excerpts.length > 0;
  const lowerQuestion = question.toLowerCase();
  const teachingNote = buildTeachingPreferenceHtml();

  if (!hasContext) {
    const recentImages = getRecentImageNames();
    return {
      text:
        recentImages.length
          ? `${teachingNote}<p>我已经收到图片：${recentImages.map(escapeHtml).join("、")}。当前静态版本可以上传、展示并保存图片到本地对话记录，但还不能真正识别图片里的题目内容。你可以把图片里的题目文字也粘贴出来，我就能继续带你做题、复习或整理。</p>`
          : `${teachingNote}<p>我现在还没有可阅读的课程正文。你可以上传 PDF、TXT、MD、CSV、JSON、HTML，粘贴 syllabus/lecture notes，或在对话框上传图片。文字资料可以直接分析；图片会保存到对话记录，若要解读图片内容，请同时粘贴题目文字。</p>`,
      sources: [],
    };
  }

  if (state.mode === "cram" || /cram|急救|临时抱佛脚|马上考试|考前|短时间|速成/.test(lowerQuestion)) {
    return {
      text: buildCramReply(context, goal),
      sources: context.sources,
    };
  }

  if (state.mode === "cheatsheet" || /cheatsheet|cheat sheet|小抄|公式表|一页纸|速查/.test(lowerQuestion)) {
    return {
      text: buildCheatsheetReply(context, goal),
      sources: context.sources,
    };
  }

  if (state.mode === "deadlines" || /deadline|due|date|schedule|calendar|考试日期|截止|日期|什么时候交/.test(lowerQuestion)) {
    return {
      text: buildDeadlineReply(context, goal),
      sources: context.sources,
    };
  }

  if (state.mode === "exam" || /quiz|exam|test|midterm|final|mock|practice|模拟|出题|试卷|考试/.test(lowerQuestion)) {
    return {
      text: buildExamReply(question, context, goal),
      sources: context.sources,
    };
  }

  if (state.mode === "review" || /review|复习|总结|考前|知识点|易错/.test(lowerQuestion)) {
    return {
      text: buildReviewReply(context, goal),
      sources: context.sources,
    };
  }

  if (state.mode === "overview" || /overview|介绍|这门课|课程是什么|评分方式|syllabus/.test(lowerQuestion)) {
    return {
      text: buildOverviewReply(context, goal),
      sources: context.sources,
    };
  }

  if (state.mode === "guided" || /带着|教我|讲解|一步步|learn|study/.test(lowerQuestion)) {
    return {
      text: buildGuidedReply(question, context, goal),
      sources: context.sources,
    };
  }

  return {
    text: buildPreviewReply(question, context, goal),
    sources: context.sources,
  };
}

function buildPreviewReply(question, context, goal) {
  const mainIdea = context.excerpts[0];
  const supporting = context.excerpts.slice(1, 3);

  return `
    <p>我会按北美课堂的预习方式来处理：先知道这节课要解决什么问题，再带着关键词和问题去上课。</p>
    ${buildTeachingPreferenceHtml()}
    <ol>
      <li><strong>预习入口：</strong>${escapeHtml(question)}</li>
      <li><strong>资料里最相关的信息：</strong>${escapeHtml(mainIdea)}</li>
      <li><strong>上课前先抓：</strong>核心概念、为什么重要、它和上一节/下一节的关系。</li>
      <li><strong>带去课堂的问题：</strong>教授会如何应用这个概念？它可能怎么出现在 quiz、midterm 或 discussion 里？</li>
    </ol>
    ${
      supporting.length
        ? `<p>补充线索：${supporting.map(escapeHtml).join("；")}。</p>`
        : ""
    }
    ${buildMemoryNote(context)}
    <p>当前目标是「${escapeHtml(goal)}」。下一步你可以让我把这部分变成 10 分钟预习清单。</p>
  `;
}

function buildGuidedReply(question, context, goal) {
  const mainIdea = context.excerpts[0];
  const examples = context.excerpts.slice(1, 4);

  return `
    <p>我们按“带着学习”的节奏来，不急着背，先建立理解框架。</p>
    ${buildTeachingPreferenceHtml()}
    <ol>
      <li><strong>先用一句话理解：</strong>${escapeHtml(mainIdea)}</li>
      <li><strong>再拆成三块：</strong>定义是什么、课堂上怎么用、考试或讨论可能怎么问。</li>
      <li><strong>检查理解：</strong>你能不能不用原文，把它讲给一个没上这门课的人听？</li>
      <li><strong>下一步练习：</strong>请你先回答“这部分最重要的关键词是什么”，我再帮你修正。</li>
    </ol>
    ${examples.length ? `<p>可以一起看的材料线索：${examples.map(escapeHtml).join("；")}。</p>` : ""}
    ${buildMemoryNote(context)}
    <p>当前目标是「${escapeHtml(goal)}」。</p>
  `;
}

function buildReviewReply(context, goal) {
  const keywords = unique(context.keywords).slice(0, 8);
  const points = context.excerpts.slice(0, 4);

  return `
    <p>复习时不要只重读资料。我们用 active recall 的方式整理：</p>
    ${buildTeachingPreferenceHtml()}
    <ul>
      ${points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
    </ul>
    <p><strong>关键词：</strong>${keywords.map(escapeHtml).join("、") || "继续补充 lecture notes 后生成"}</p>
    <p><strong>复习顺序：</strong>先解释概念，再补例子，再做自测，最后标出不确定点带去 office hours 或 discussion。</p>
    ${buildMemoryNote(context)}
    <p>当前目标是「${escapeHtml(goal)}」。</p>
  `;
}

function buildCheatsheetReply(context, goal) {
  const keywords = unique(context.keywords).slice(0, 10);
  const keyLines = context.excerpts.slice(0, 5);

  return `
    <p>我会把 cheatsheet 做成“考试时能快速用”的一页结构，不是长笔记。建议分成 5 块：</p>
    ${buildTeachingPreferenceHtml()}
    <ol>
      <li><strong>Core ideas / 核心概念：</strong>${keywords.slice(0, 5).map(escapeHtml).join("、") || "先补充 lecture notes 后生成"}</li>
      <li><strong>Steps / Methods：</strong>把常见题型写成步骤，例如 identify → choose method → solve → check units/logic。</li>
      <li><strong>Common traps：</strong>列出最容易混淆的定义、条件、例外和 professor 强调过的点。</li>
      <li><strong>Mini examples：</strong>每个重要方法只保留一个最短例子，重点写“第一步怎么判断”。</li>
      <li><strong>Exam triggers：</strong>看到哪些关键词就该用哪个公式、概念或解题套路。</li>
    </ol>
    <p><strong>可直接放入 cheatsheet 的材料：</strong>${keyLines.map(escapeHtml).join("；")}</p>
    ${buildMemoryNote(context)}
    <p>下一步你可以说“把它压缩成一页版”或“按 final 允许的 cheatsheet 格式整理”。</p>
  `;
}

function buildCramReply(context, goal) {
  const keywords = unique(context.keywords).slice(0, 8);
  const points = context.excerpts.slice(0, 4);

  return `
    <p>进入考前急救模式。现在重点不是完整学完，而是在短时间内把“会做题”放到第一位。</p>
    ${buildTeachingPreferenceHtml()}
    <ol>
      <li><strong>最低必要知识：</strong>${points[0] ? escapeHtml(points[0]) : "先锁定 syllabus/lecture notes 里最高频的概念。"}</li>
      <li><strong>必须会识别的题型：</strong>definition、short answer、application、case/problem solving、comparison。</li>
      <li><strong>做题第一步：</strong>先判断题目在考哪个关键词：${keywords.map(escapeHtml).join("、") || "继续补充资料后生成"}。</li>
      <li><strong>解题模板：</strong>读题圈 action verb → 写出相关概念/公式 → 套入条件 → 先写 English final answer → 用中文解释 why → 检查是否回答了问题。</li>
      <li><strong>训练顺序：</strong>先看 1 个例题怎么做，再立刻做 3 个同类题；错题只记录“第一步错在哪里”。</li>
    </ol>
    <p><strong>接下来 45 分钟安排：</strong>10 分钟补最低知识，25 分钟做题，10 分钟复盘错题模式。最后阶段以题带知识，不再重新读整章。</p>
    ${buildMemoryNote(context)}
    <p>你现在可以把一道题发来，我会只按“考试中怎么下手”的方式带你做。</p>
  `;
}

function buildExamReply(question, context, goal) {
  const keywords = unique(context.keywords).slice(0, 6);
  const terms = keywords.length >= 4 ? keywords : ["concept", "application", "short answer", "case analysis", "calculation", "essay"];
  const wantsFullExam = /完整|整套|final|midterm|exam|试卷|format|格式/.test(question.toLowerCase());

  if (wantsFullExam) {
    return `
      <p>我会按“模仿 midterm/final 格式”的方向生成一份练习卷。静态原型会根据已读资料推断题型；如果你上传了样卷，我会优先模仿它的结构。</p>
      ${buildTeachingPreferenceHtml()}
      <ol>
        <li><strong>Section A: Key Terms</strong> 解释 5 个关键词：${terms.slice(0, 5).map(escapeHtml).join("、")}。</li>
        <li><strong>Section B: Short Answer</strong> 任选 3 题，每题用 4-6 句话回答，要求包含定义和例子。</li>
        <li><strong>Section C: Application</strong> 给一个课堂情境，要求把概念应用进去并解释 reasoning。</li>
        <li><strong>Section D: Longer Response</strong> 写一题综合题，比较两个概念或分析一个 case。</li>
      </ol>
      <p><strong>建议时长：</strong>60-90 分钟。正式作答建议用英文；复盘时我会用中文解释哪里扣分、怎么改。</p>
    `;
  }

  return `
    <p>我先给你一组单独练习题，用来检查是否真的理解资料，而不是只看过。</p>
    ${buildTeachingPreferenceHtml()}
    <ol>
      <li>Define「${escapeHtml(terms[0])}」and give one course-based example.</li>
      <li>Explain why「${escapeHtml(terms[1])}」matters in this course.</li>
      <li>Compare「${escapeHtml(terms[2])}」and「${escapeHtml(terms[3])}」in 5-7 sentences.</li>
      <li>Design one possible short-answer question your professor might ask from this material.</li>
      <li>List one point you are still unsure about and turn it into an office hours question.</li>
    </ol>
    <p><strong>Answer format：</strong>请先尝试用英文写 final answer；如果卡住，我会用中文拆解 reasoning。</p>
    <p>当前目标是「${escapeHtml(goal)}」。如果你想要完整试卷，可以直接说“按 final 格式出一整套”。</p>
  `;
}

function buildOverviewReply(context, goal) {
  const keywords = unique(context.keywords).slice(0, 8);
  const points = context.excerpts.slice(0, 4);

  return `
    <p>我会像选课前/开学第一周那样介绍这门课，重点不是某一次作业，而是课程整体地图。</p>
    ${buildTeachingPreferenceHtml()}
    <ol>
      <li><strong>这门课大概在学什么：</strong>${escapeHtml(points[0] || "需要更多 syllabus 或 course description 来判断。")}</li>
      <li><strong>你会反复遇到的主题：</strong>${keywords.map(escapeHtml).join("、") || "继续补充资料后生成"}</li>
      <li><strong>北美课堂常见要求：</strong>reading before class、participation/discussion、quiz/midterm/final、project 或 writing task。</li>
      <li><strong>建议学习方式：</strong>每周先看 learning outcomes，再读 slides/readings，最后用题目或讨论问题检查理解。</li>
    </ol>
    <p>当前目标是「${escapeHtml(goal)}」。</p>
  `;
}

function buildDeadlineReply(context, goal) {
  const deadlineItems = extractDeadlineItemsFromDocuments();
  const fallbackLines = extractDeadlineLines(context.excerpts.join(" "));
  const grouped = groupDeadlineItems(deadlineItems);

  return `
    <p>我会把课程资料里的时间点当成 planning system 来整理：due dates、exam dates、reading schedule 和提前准备事项。</p>
    ${buildTeachingPreferenceHtml()}
    ${
      deadlineItems.length
        ? renderDeadlineGroups(grouped)
        : fallbackLines.length
          ? `<ul>${fallbackLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
        : `<p>我在可读片段里还没有抓到明确日期。你可以粘贴 syllabus 的 schedule/calendar 部分，我会整理成清单。</p>`
    }
    <ol>
      <li><strong>建议做法：</strong>把每个 deadline 往前拆成 start date、draft/checkpoint、final review。</li>
      <li><strong>考试准备：</strong>midterm/final 至少提前 7-10 天开始做 active recall 和模拟题。</li>
      <li><strong>上课节奏：</strong>每周固定看 readings/slides，避免只在 due date 前补。</li>
    </ol>
    ${buildMemoryNote(context)}
    <p>当前目标是「${escapeHtml(goal)}」。</p>
  `;
}

function extractDeadlineItemsFromDocuments() {
  return currentCourseDocuments()
    .filter((document) => !document.unreadable && document.text)
    .flatMap((document) =>
      extractDeadlineLines(document.text).map((line) => ({
        line,
        source: document.title,
        category: classifyDeadlineLine(line),
      }))
    )
    .slice(0, 30);
}

function classifyDeadlineLine(line) {
  const lower = line.toLowerCase();
  if (/midterm|final|exam|test|考试/.test(lower)) return "Exams";
  if (/quiz|测验/.test(lower)) return "Quizzes";
  if (/due|deadline|submit|submission|assignment|project|paper|report|截止|提交/.test(lower)) return "Due dates";
  if (/read|reading|chapter|module|lecture|slides|week|class|课前|预习/.test(lower)) return "Readings / class prep";
  return "Other dates";
}

function groupDeadlineItems(items) {
  return items.reduce((groups, item) => {
    groups[item.category] ||= [];
    groups[item.category].push(item);
    return groups;
  }, {});
}

function renderDeadlineGroups(groups) {
  const order = ["Exams", "Quizzes", "Due dates", "Readings / class prep", "Other dates"];
  return order
    .filter((category) => groups[category]?.length)
    .map(
      (category) => `
        <p><strong>${escapeHtml(category)}</strong></p>
        <ul>
          ${groups[category]
            .map(
              (item) =>
                `<li>${escapeHtml(item.line)} <span class="inline-source">(${escapeHtml(item.source)})</span></li>`
            )
            .join("")}
        </ul>
      `
    )
    .join("");
}

function buildTeachingPreferenceHtml() {
  return `<p><strong>教学方式：</strong>${escapeHtml(buildTeachingPreferenceText())}</p>`;
}

function buildThinkingSummary(question, context, seconds) {
  const directions = [
    `先判断问题属于 ${escapeHtml(modeLabels[state.mode] || "当前学习")} 场景`,
    context.excerpts.length ? "再从 Course Pack 中找最相关的 syllabus / notes / exam material" : "先检查是否有可阅读课程资料",
    "然后决定回答应偏向概念解释、做题步骤、deadline planning 还是 exam language",
    "最后按你的 Learning Style 输出：中文解释、英文关键词和考试作答表达",
  ];

  return `
    <details class="thinking-summary">
      <summary>思考 ${Number(seconds || 1)}s</summary>
      <ul>
        ${directions.map((direction) => `<li>${direction}</li>`).join("")}
      </ul>
      <p>问题入口：${escapeHtml(question).slice(0, 120)}</p>
    </details>
  `;
}

function buildTeachingPreferenceText() {
  const preference = state.preferences;
  const parts = [];

  if (preference.chineseExplanations) {
    parts.push("知识点用中文解释，先帮你理解逻辑");
  }
  if (preference.englishTerms) {
    parts.push("关键概念保留 English terms / exam vocabulary");
  }
  if (preference.englishAnswers) {
    parts.push("做题时优先给 English final answer，再用中文解释步骤");
  }
  if (preference.customInstruction) {
    parts.push(`你的客制化要求：${preference.customInstruction}`);
  }

  return parts.length
    ? parts.join("；")
    : "按你的设置提供教学；你可以在左侧 Learning Style 里调整。";
}

function buildMemoryNote(context) {
  if (!context.memory) return "";
  return `<p><strong>结合最近对话：</strong>${escapeHtml(context.memory)}</p>`;
}

function findRelevantContext(question) {
  const queryTerms = tokenize(question);
  const readableDocuments = currentCourseDocuments().filter((document) => !document.unreadable && document.text);
  const scored = readableDocuments
    .map((document) => {
      const sentences = splitSentences(document.text);
      const rankedSentences = sentences
        .map((sentence) => ({
          sentence,
          score: scoreText(sentence, queryTerms),
        }))
        .sort((a, b) => b.score - a.score);

      return {
        document,
        score: rankedSentences[0]?.score || 0,
        excerpts: rankedSentences.slice(0, 2).map((item) => item.sentence),
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored.filter((item) => item.score > 0).slice(0, 3);
  const selected = best.length ? best : scored.slice(0, 3);

  return {
    excerpts: selected.flatMap((item) => item.excerpts).filter(Boolean).slice(0, 5),
    sources: selected.map((item) => item.document.title),
    keywords: selected.flatMap((item) => item.document.keywords),
  };
}

function buildDocumentLoadedReply(documentItem) {
  const summary = summarizeText(documentItem.text);
  return `
    <p>我读完了《${escapeHtml(documentItem.title)}》。我会按北美课程语境先抓这些信息：</p>
    ${buildTeachingPreferenceHtml()}
    <ul>
      ${summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
    <p>你可以继续问：“这门课是什么样？”“帮我预习下一节”“带着我学这一章”“按 final 格式出一套题”“汇总所有 deadline”。</p>
  `;
}

function appendMessage(role, content, sources = [], attachments = []) {
  const messageRecord = {
    role,
    content,
    sources,
    attachments,
    createdAt: Date.now(),
  };
  state.messages.push(messageRecord);
  renderMessageElement(role, content, sources, attachments);

  const firstUserMessage = state.messages.find((message) => message.role === "user");
  const title = firstUserMessage ? firstUserMessage.content.replace(/<[^>]+>/g, "").slice(0, 36) : "New study session";
  updateActiveSession({ title, messages: state.messages });
  renderHistory();
  saveSessions();
}

function renderMessageElement(role, content, sources = [], attachments = []) {
  const message = document.createElement("article");
  message.className = `message ${role === "user" ? "user-message" : "coach-message"}`;
  const safeContent = content.trim().startsWith("<") ? content : `<p>${escapeHtml(content)}</p>`;
  const attachmentHtml = attachments.length
    ? `<div class="message-attachments">${attachments.map(renderImageAttachment).join("")}</div>`
    : "";
  const sourceHtml = sources.length
    ? `<div class="source-strip">${unique(sources)
        .map((source) => `<span class="source-chip">${escapeHtml(source)}</span>`)
        .join("")}</div>`
    : "";

  message.innerHTML = `
    <div class="avatar">${role === "user" ? "我" : "AI"}</div>
    <div class="bubble">${safeContent}${attachmentHtml}${sourceHtml}</div>
  `;
  chatArea.appendChild(message);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function renderImageAttachment(image) {
  return `
    <figure class="image-attachment">
      ${renderImagePreview(image)}
      <figcaption>${escapeHtml(image.name)} · ${formatSize(image.size)}</figcaption>
    </figure>
  `;
}

function renderImagePreview(image) {
  if (image.dataUrl && /^data:image\//.test(image.dataUrl) && isPreviewableImageType(image)) {
    return `<img src="${image.dataUrl}" alt="${escapeHtml(image.name)}" loading="lazy" />`;
  }
  return `<div class="image-fallback">IMG</div>`;
}

function isPreviewableImageType(image) {
  const extension = image.name.split(".").pop().toLowerCase();
  return !["heic", "heif", "tif", "tiff"].includes(extension);
}

function resizeComposer() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 150)}px`;
}

function detectCourseType(text, fallback = "TEXT") {
  const lower = text.toLowerCase();
  if (/midterm|final|exam|practice test|sample exam/.test(lower)) return "Exam material";
  if (/deadline|due date|course schedule|calendar|weekly schedule/.test(lower)) return "Schedule";
  if (/rubric|criteria|grading|points|marking/.test(lower)) return "Rubric";
  if (/assignment|prompt|submit|deadline|due date/.test(lower)) return "Assignment";
  if (/syllabus|course schedule|office hours|learning outcomes/.test(lower)) return "Syllabus";
  if (/lecture|slides|reading|chapter|module/.test(lower)) return "Lecture notes";
  return fallback;
}

function summarizeText(text) {
  const sentences = splitSentences(text).slice(0, 5);
  if (sentences.length) return sentences.map((sentence) => sentence.slice(0, 126));
  return ["内容较短。你可以继续补充 syllabus、lecture notes、midterm/final 样卷或 deadline，我会一起纳入后续学习。"];
}

function extractDeadlineLines(text) {
  const datePattern =
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\b\d{4}-\d{1,2}-\d{1,2}|\bweek\s+\d{1,2}\b/i;
  return splitScheduleLines(text)
    .filter((line) => datePattern.test(line) || /deadline|due|midterm|final|exam|quiz|submit|submission|assignment|project|paper|test|reading|schedule|截止|考试|提交|测验/.test(line.toLowerCase()))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, lines) => line.length > 8 && lines.indexOf(line) === index)
    .slice(0, 8);
}

function splitScheduleLines(text) {
  const cleaned = cleanText(text);
  const lineLike = cleaned
    .replace(/(Page \d+:)/g, "\n$1 ")
    .replace(/(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2})/gi, "\n$1")
    .replace(/(\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/g, "\n$1")
    .replace(/(\bWeek\s+\d{1,2}\b)/gi, "\n$1")
    .split(/\n+|(?<=[。！？.!?])\s+/)
    .map((line) => line.trim());

  return lineLike.filter(Boolean);
}

function splitSentences(text) {
  return cleanText(text)
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 10)
    .slice(0, 90);
}

function cleanText(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(text) {
  const tokens = tokenize(text);
  const counts = new Map();
  tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([token]) => token);
}

function tokenize(text) {
  const chineseTerms = (text.match(/[\u4e00-\u9fa5]{2,}/g) || []).flatMap((term) => {
    if (term.length <= 6) return [term];
    const chunks = [];
    for (let index = 0; index < term.length - 1; index += 2) {
      chunks.push(term.slice(index, index + 4));
    }
    return chunks;
  });

  const englishTerms = (text.toLowerCase().match(/[a-z0-9-]{3,}/g) || []).filter(
    (term) => !["the", "and", "for", "with", "that", "this", "from", "you", "your"].includes(term)
  );

  return [...chineseTerms, ...englishTerms].filter((term) => term.length >= 2);
}

function scoreText(text, queryTerms) {
  if (!queryTerms.length) return 1;
  const lowerText = text.toLowerCase();
  return queryTerms.reduce((score, term) => score + (lowerText.includes(term.toLowerCase()) ? 2 : 0), 0);
}

function buildConversationMemory() {
  const recentMessages = currentCourseSessions()
    .flatMap((session) => session.messages || [])
    .slice(-6)
    .map((message) => {
      const text = message.content.replace(/<[^>]+>/g, "").slice(0, 80);
      const imageNames = (message.attachments || []).map((image) => `图片:${image.name}`).join("、");
      return [text, imageNames].filter(Boolean).join(" ");
    });

  if (!recentMessages.length) return "";
  return unique(recentMessages).slice(-4).join("；");
}

function getRecentImageNames() {
  return state.messages
    .flatMap((message) => message.attachments || [])
    .slice(-4)
    .map((image) => image.name);
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - Number(timestamp || Date.now());
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day ago`;
}

function formatSize(bytes) {
  if (!bytes) return "short text";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
