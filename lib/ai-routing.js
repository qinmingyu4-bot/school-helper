const { questionOutline } = require("./study-coverage");
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
  const isComplex =
    documentProblem ||
    (!routineQuestion && complexModes.has(String(mode || "").toLowerCase())) ||
    (!routineQuestion && [...attachments, ...savedAttachments].some((item) => item.kind === "image")
      && /怎么做|怎么解|这道题|这题|解题|教我|带我学|讲解|讲讲|\bteach\s+me\b|\bwalk\s+me\s+through\b|\bexplain\s+(this|it)\b|solve|work.*out|explain.*(problem|question)|how.*(solve|answer)/i.test(message)) ||
    String(message || "").length > 900 ||
    attachments.some((item) => String(item.text || "").length > 9000) ||
    complexKeywords.some((keyword) => lowerMessage.includes(keyword.toLowerCase()));

  // Brief follow-ups inherit the previous user task, not the amount of saved data.
  if (!isComplex && /^(继续|接着|上一题|刚才|为什么|再解释|continue|why|what about|explain that|recalculate)/i.test(String(message).trim())) {
    const previousUsers = history.filter((item) => item.role === "user" && !item.interrupted && !String(item.content || "").startsWith(String(message)));
    const previous = previousUsers.at(-1);
    if (previous) return selectAiModel({ message: previous.content, mode: previous.mode, history: previousUsers.slice(0, -1), savedAttachments }, { simpleModel, complexModel });
  }
  return isComplex ? complexModel : simpleModel;
}


module.exports = { selectAiModel };
