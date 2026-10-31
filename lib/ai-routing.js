const { questionOutline } = require("./study-coverage");

// Subject names and study modes alone do not make a short recall question hard.
const demandingTask = /证明|推导|复杂|综合题|多步|深入|论文|编程|调试|算法|微积分|求导|积分|微分|矩阵|优化|博弈|几何|图表|曲线|\b(?:prove|proof|derive|derivation|disprove|essay|thesis|dissertation|debug|code|coding|programming|algorithm|calculus|integral|derivative|differential|matrix|optimi[sz]ation|geometry)\b|multi[- ]step|in[- ]depth|case study|lab report|research paper|mock (?:paper|exam|test)|模拟(?:卷|试卷|考试)|[∫∂∇∑]|\\(?:int|sum|lim|partial|nabla)\b/i;
const objectiveQuestion = /选择题|单选|多选|判断题|判断正误|判断对错|是否正确|对还是错|multiple[- ]choice|\bmcqs?\b|\btrue\s*(?:or|\/|-)\s*false\b|\b[tf]\s*\/\s*[tf]\b/i;
const basicRecall = /什么是|是什么意思|定义|名词解释|概念|术语|知识点|复习要点|基础复习|闪卡|单词|\b(?:define|definition|flashcards?|vocabulary)\b|\bwhat (?:is|are)\b|key (?:concepts|terms|points)|basic review/i;
const reviewRequest = /复习|回顾|记忆|背诵|\b(?:review|revise|recap|memorize)\b/i;
const followUp = /^(继续|接着|上一题|刚才|为什么|再解释|continue\b|why\b|what about\b|explain that\b|recalculate\b)/i;
const accuracyReview = /你确定|确定吗|不对|有误|错了|检查一下|核对一下|答案.*错|算错|纠错|重新(?:检查|核对|计算|回答)|再(?:检查|核对|算)|核实|验证答案|\b(?:recheck|recalculate|incorrect|verify)\b|are you sure|double[- ]check|check (?:the|your|my) answer|answer is wrong/i;
const advancedTopic = /连续函数|可导|可微|收敛|极限|特征值|概率|置信区间|假设检验|因果|量子|药剂|诊断|法律|\b(?:continuous|differentiable|convergence|eigenvalues?|probability|bayes|causal|quantum|diagnosis|dosage|legal)\b|confidence interval|hypothesis test/i;
const reasoningRisk = /不正确|不成立|不一定|不属于|不可能|不能|除了|除外|错误|至少|至多|恰好|仅当|当且仅当|充分|必要|所有|任意|总是|一定|只有|永远|从不|如果|假如|假设|若|多选|多项选择|全选|\b(?:not|except|unless|never|always|every|all|only|if|iff)\b|select all|choose all|multiple (?:answers|responses)|necessary|sufficient|counterexample|[∀∃⇒⇔]|\\(?:forall|exists|frac|in)\b|\b[a-z]\s*[=<>^²³]/i;
const vagueScope = /这(?:道|个|章|部分)|本章|上述|附件|怎么(?:做|解)|帮我|请(?:解答|解题|判断)|整理.*知识点|\b(?:this|these|attached|please|can you|help me|solve)\b|key (?:concepts|points)|basic review/i;
function hasChoiceOptions(text) {
  return /(?:^|\n)\s*A[.)、．:：]\s*\S/i.test(text) && /(?:^|\n)\s*B[.)、．:：]\s*\S/i.test(text);
}

function isSimpleStudyQuestion(question, request = "") {
  const text = String(question.text || "").trim(), shared = String(question.shared || "");
  if (!text || text.length > 900 || shared.length > 2000 || question.visual || question.parts?.length > 1 || question.dependsOn?.length) return false;
  if (/如图|图中|图表|下图|见图|\b(?:graph|diagram|figure|plot|shown)\b/i.test(text + "\n" + shared)) return false;
  if (/上一题|前一题|上题|上述|\babove\b|previous (?:question|part)|preceding/i.test(text)) return false;
  const task = `${request}\n${text}\n${shared}`;
  const requestConditions = String(request).replace(/(?:all|each|every)\s+(?:the\s+)?(?:questions|problems|steps|working)|(?:所有|全部|每(?:一)?)\s*(?:的)?题(?:目)?/gi, "");
  if (demandingTask.test(task) || accuracyReview.test(task) || advancedTopic.test(task) || reasoningRisk.test(`${requestConditions}\n${text}\n${shared}`)) return false;
  const options = hasChoiceOptions(text);
  if (objectiveQuestion.test(text) || options) {
    const stem = text.split(/(?:^|\n)\s*A[.)、．:：]/i)[0].replace(objectiveQuestion, "").replace(/^\s*(?:\d+[.)、．:：])?\s*[:：]?\s*/, "").trim();
    if (stem.length < 6 || vagueScope.test(stem)) return false;
    // A choice label without actual options is not a complete readable question.
    if (/选择|单选|multiple[- ]choice|\bmcqs?\b/i.test(text) && !options) return false;
    return true;
  }
  return basicRecall.test(text) && !vagueScope.test(text);
}

function selectStudyBatchModel({ questions = [], message = "" } = {}, { simpleModel, complexModel }) {
  return questions.length && questions.every((question) => isSimpleStudyQuestion(question, message)) ? simpleModel : complexModel;
}

function selectAiModel({ history = [], mode = "", message = "", attachments = [], savedAttachments = [], documents = [] }, { simpleModel, complexModel }) {
  // A request to check/correct an answer must never inherit a cheaper prior route.
  if (accuracyReview.test(message)) return complexModel;
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
  if (!attachments.length && !oversized && !demandingTask.test(message) && !advancedTopic.test(message) && !reasoningRisk.test(message) && !objectiveQuestion.test(message) && !basicRecall.test(message) && followUp.test(String(message).trim())) {
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
  const sourceStudyTask = targets.length > 0 && (objectiveQuestion.test(message) || basicRecall.test(message) || tutoring || reviewRequest.test(message));
  if (!oversized && !demandingTask.test(message) && !advancedTopic.test(message) && !reasoningRisk.test(message) && readableSimpleSources &&
      (simpleQuestion || simpleSourceQuestion)) return simpleModel;
  const isComplex =
    (!routineQuestion && (objectiveQuestion.test(message) || basicRecall.test(message) || reviewRequest.test(message) || hasChoiceOptions(message))) ||
    (!routineQuestion && advancedTopic.test(message)) ||
    (!routineQuestion && reasoningRisk.test(message) && (complexModes.has(String(mode).toLowerCase()) || tutoring || followUp.test(String(message).trim()))) ||
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
