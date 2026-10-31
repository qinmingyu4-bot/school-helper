const { questionOutline } = require("./study-coverage");

// Subject names and study modes alone do not make a short recall question hard.
const demandingTask = /证明|推导|复杂|综合题|多步|深入|论文|编程|调试|算法|微积分|求导|积分|微分|矩阵|优化|博弈|几何|图表|曲线|\b(?:prove|proof|derive|derivation|disprove|essay|thesis|dissertation|debug|code|coding|programming|algorithm|calculus|integral|derivative|differential|matrix|optimi[sz]ation|geometry)\b|multi[- ]step|in[- ]depth|case study|lab report|research paper|mock (?:paper|exam|test)|模拟(?:卷|试卷|考试)|[∫∂∇∑]|\\(?:int|sum|lim|partial|nabla)\b/i;
const objectiveQuestion = /选择题|单选|多选|判断题|判断正误|判断对错|是否正确|对还是错|multiple[- ]choice|\bmcqs?\b|\btrue\s*(?:or|\/|-)\s*false\b|\b[tf]\s*\/\s*[tf]\b/i;
const basicRecall = /什么是|是什么意思|定义|名词解释|概念|术语|知识点|复习要点|基础复习|闪卡|单词|\b(?:define|definition|flashcards?|vocabulary)\b|\bwhat (?:is|are)\b|key (?:concepts|terms|points)|basic review/i;
const reviewRequest = /复习|回顾|记忆|背诵|\b(?:review|revise|recap|memorize)\b/i;
const followUp = /^(继续|接着|上一题|刚才|为什么|再解释|continue\b|why\b|what about\b|explain that\b|recalculate\b)/i;

function isSimpleStudyQuestion(question, request = "") {
  const text = String(question.text || "").trim(), shared = String(question.shared || "");
  if (!text || text.length > 900 || shared.length > 2000 || question.visual || question.parts?.length > 1 || question.dependsOn?.length) return false;
  if (/如图|图中|图表|下图|见图|\b(?:graph|diagram|figure|plot|shown)\b/i.test(text + "\n" + shared)) return false;
  if (/上一题|前一题|上题|上述|\babove\b|previous (?:question|part)|preceding/i.test(text)) return false;
  if (demandingTask.test(`${request}\n${text}\n${shared}`)) return false;
  const options = /(?:^|\n)\s*A[.)、．:：]\s*\S/i.test(text) && /(?:^|\n)\s*B[.)、．:：]\s*\S/i.test(text);
  return objectiveQuestion.test(text) || basicRecall.test(text) || options;
}

function selectStudyBatchModel({ questions = [], message = "" } = {}, { simpleModel, complexModel }) {
  return questions.length && questions.every((question) => isSimpleStudyQuestion(question, message)) ? simpleModel : complexModel;
}

function selectAiModel({ history = [], mode = "", message = "", attachments = [], savedAttachments = [], documents = [] }, { simpleModel, complexModel }) {
  const lowerMessage = String(message || "").toLowerCase();
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

  const routineQuestion = /^(hi|hello|hey|thanks|thank you|你好|您好|谢谢|早上好|晚上好|晚安)[!！。,.，?？\s]*$/i.test(String(message).trim())
    || /weather|forecast|天气|气温|新闻|news|怎么做.*(饭|菜|面包)|番茄炒鸡蛋/i.test(message);
  const tutoring = /学习|讲解|教我|带我学|解题|怎么做|怎么解|这题|题目|小问|完整|\bteach\b|\bexplain\b|\bsolve\b|walk.*through|step.by.step/i.test(message);
  const sources = [...attachments, ...savedAttachments];
  const documentProblem = !routineQuestion && (sources.some((item) => item.kind === "pdf" && (tutoring || /calculus|free.response|\bfrq\b|exam|试卷|习题/i.test(item.name || ""))) ||
    tutoring && [...sources, ...documents].some((item) => questionOutline(item.text).length >= 2));
  const oversized = String(message).length > 900 || attachments.some((item) => String(item.text || "").length > 9000);
  // Resolve continuations before review-mode defaults, preserving the original task.
  if (!attachments.length && !oversized && !demandingTask.test(message) && !objectiveQuestion.test(message) && !basicRecall.test(message) && followUp.test(String(message).trim())) {
    const previousUsers = history.filter((item) => item.role === "user" && !item.interrupted && !String(item.content || "").startsWith(String(message)));
    const previous = previousUsers.at(-1);
    if (previous) return selectAiModel({ message: previous.content, mode: previous.mode, history: previousUsers.slice(0, -1), savedAttachments, documents }, { simpleModel, complexModel });
  }
  // Only inspect explicitly relevant sources; old course data is not a difficulty signal.
  const named = [...sources, ...documents].filter((item) => (item.name || item.title) && lowerMessage.includes(String(item.name || item.title).toLowerCase()));
  const simpleQuestion = isSimpleStudyQuestion({ text: message });
  const refersToSource = /这(?:道|个)?(?:简单)?(?:选择|判断)?题|这部分|这张|图中|图片|截图|附件|试卷|习题|这套|这章|this (?:question|problem|paper|chapter)|these questions|(?:previous|earlier|uploaded) (?:attachment|file|paper|source)|\b(?:image|screenshot|attached)\b/i.test(message);
  const targets = attachments.length ? attachments : named.length ? named : refersToSource || tutoring && !simpleQuestion ? savedAttachments.slice(-1) : [];
  const readableSimpleSources = targets.every((item) => item.kind !== "image" && isSimpleStudyQuestion({ text: item.text }) && questionOutline(item.text).length < 2);
  const simpleSourceQuestion = targets.length > 0 && (tutoring || refersToSource || reviewRequest.test(message));
  const basicReview = reviewRequest.test(message) && !["exam", "assignment", "cheatsheet"].includes(String(mode).toLowerCase()) &&
    !/整套|这套|全部.*题|所有.*题|解答|解题|problem[- ]set|\bsolve\b|(?:all|each).*questions?/i.test(message);
  const sourceStudyTask = targets.length > 0 && (simpleQuestion || tutoring || basicReview);
  if (!oversized && !demandingTask.test(message) && readableSimpleSources &&
      (simpleQuestion || simpleSourceQuestion || basicReview && !documentProblem)) return simpleModel;
  const isComplex =
    (!routineQuestion && sourceStudyTask && !readableSimpleSources) ||
    (!routineQuestion && demandingTask.test(message)) ||
    documentProblem ||
    (!routineQuestion && complexModes.has(String(mode || "").toLowerCase())) ||
    (!routineQuestion && [...attachments, ...savedAttachments].some((item) => item.kind === "image")
      && /怎么做|怎么解|这道题|这题|解题|教我|带我学|讲解|讲讲|\bteach\s+me\b|\bwalk\s+me\s+through\b|\bexplain\s+(this|it)\b|solve|work.*out|explain.*(problem|question)|how.*(solve|answer)/i.test(message)) ||
    oversized ||
    complexKeywords.some((keyword) => lowerMessage.includes(keyword.toLowerCase()));

  return isComplex ? complexModel : simpleModel;
}


module.exports = { selectAiModel, isSimpleStudyQuestion, selectStudyBatchModel };
