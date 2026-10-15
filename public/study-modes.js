(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeStudyModes = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const modes = {
    preview: {
      label: "预习",
      instruction: "Prepare the student before class: identify prerequisite knowledge, explain the topic's background and key terms, give a short reading route, and suggest questions to listen for in class. Respect any requested preparation time budget.",
      prompts: [
        ["预习下一节", "请帮我预习下一节课：先讲背景、关键词、我上课前应该带着哪些问题。"],
        ["课前关键词", "请从资料中提取下一节课最需要先懂的关键词，并用中文解释。"],
        ["上课问题", "请帮我准备 5 个上课时应该听答案的问题。"],
        ["10 分钟预习", "我只有 10 分钟，请给我一个超短预习路线。"]
      ]
    },
    guided: {
      label: "带着学习",
      instruction: "Teach progressively: introduce a manageable concept, show a worked example, and check understanding before moving on. Scaffold difficult steps and adapt to the student's answers. When they request an interactive check, ask a small number of questions and wait for their response instead of supplying all answers immediately.",
      prompts: [
        ["一步步教", "请带着我学习这部分内容，按概念、例子、检查理解的顺序来。"],
        ["举例讲解", "请用一个北美课堂常见例子解释这部分内容。"],
        ["检查理解", "请问我几个问题来检查我是否真的理解了。"],
        ["中英对照", "请用中文解释核心逻辑，并给我关键英文术语和考试表达。"]
      ]
    },
    review: {
      label: "复习",
      instruction: "Consolidate course knowledge with a prioritized review checklist, connections between concepts, common misconceptions, and active recall questions. Suggest a realistic review sequence or spaced practice when relevant. If the student asks to attempt recall questions first, withhold answers until they respond.",
      prompts: [
        ["复习清单", "请把这些资料整理成复习清单、易错点和主动回忆问题。"],
        ["主动回忆", "请生成 active recall 问题，不要直接给答案，先让我答。"],
        ["易错点", "请列出这部分最容易混淆或考试容易错的点。"],
        ["考前路线", "请按重要性排序，告诉我复习顺序。"]
      ]
    },
    assignment: {
      label: "作业辅助",
      instruction: "Interpret the assignment's deliverables, constraints, and grading rubric; break the work into actionable steps. Review the student's reasoning or draft against requirements and identify missing evidence. Respect requests for guidance without writing the final submission. Help prepare specific questions for the professor or TA when useful.",
      prompts: [
        ["读懂题目", "请帮我读懂这份作业要求：任务是什么、限制是什么、rubric 在看什么。"],
        ["拆解步骤", "请把这份作业拆成可执行步骤，但不要直接替我写最终提交内容。"],
        ["检查思路", "我会发我的思路或草稿，请帮我检查是否符合要求、哪里需要补证据。"],
        ["Office hours 问题", "请根据这份作业帮我准备可以问 professor/TA 的高质量问题。"]
      ]
    },
    exam: {
      label: "模拟出题",
      instruction: "Create practice questions or a complete mock exam grounded in the supplied course material. Match the supplied exam format, topic coverage, and difficulty where available; label assumptions about timing and marks. Include scoring rubrics or separate answer keys when requested, and withhold solutions during an interactive test. Never present invented practice questions as official or leaked exam questions.",
      prompts: [
        ["单独题目", "请根据上传资料出 8 道单独练习题，覆盖不同题型，并提供英文作答要求。"],
        ["完整试卷", "请模仿上传的 midterm/final 格式生成一份完整英文练习卷。"],
        ["按题型出题", "请按 definition、short answer、application、long response 分类出题。"],
        ["批改标准", "请给每道题配一个简短英文评分标准和中文解释。"]
      ]
    },
    cheatsheet: {
      label: "Cheatsheet 制作",
      instruction: "Produce a compact, fast-lookup reference sheet rather than a prose summary. Prioritize formulas with symbol definitions and usage conditions, decision rules, problem-solving steps, and common traps. Honor the exam's page, side, and allowed-content restrictions; distinguish essential content from optional content when space is limited.",
      prompts: [
        ["一页版", "请帮我做一页 cheatsheet：公式/概念/步骤/易错点/题型套路都要压缩得适合考前看。"],
        ["公式步骤", "请把能放进 cheatsheet 的公式、步骤和使用条件整理出来。"],
        ["题型触发词", "请整理看到哪些题目关键词就该用哪个概念、公式或方法。"],
        ["压缩改写", "请把现有内容压缩成更短、更适合写在 cheatsheet 上的版本。"]
      ]
    },
    cram: {
      label: "考前急救",
      instruction: "Triage preparation under time pressure. Work within the student's time budget, prioritizing high-yield material supported by the course sources, minimum prerequisite knowledge, recognizable problem patterns, and the first step for each pattern. Keep explanations brief and immediately actionable. For mistakes, identify the first incorrect step and how to avoid it. Do not claim to know what will appear on the actual exam.",
      prompts: [
        ["45 分钟急救", "我只有 45 分钟就要考试了，请安排紧急考前复习：先讲最低必要知识，然后直接教我怎么做题。"],
        ["只教做题", "请不要展开太多知识点，直接教我这类题考试时怎么下手。"],
        ["题型套路", "请根据课程资料总结重点练习题型，以及每种题型第一步该做什么。"],
        ["错题复盘", "我会发错题，请帮我只分析第一步错在哪里和下次怎么避免。"]
      ]
    }
  };
  const globalPrompts = [
    ["课程介绍", "请根据课程资料，告诉我这门课大概是什么样、主要学什么、怎么被评分。"],
    ["Deadline 汇总", "请汇总 syllabus 和课程资料中的所有 deadline、考试日期和需要提前准备的事项。"]
  ];
  const defaultMode = "guided";
  const explanationInstruction = `

Study problem explanations:
- A brief request such as "怎么做", "这题怎么解", or "how do I solve this?", including a question attached as an image, asks for teaching, not merely an answer check. Default to a complete, approachable worked explanation.
- Start with a one-sentence answer or direction, then explain what the question asks and which given facts matter. Define unfamiliar concepts and notation before using them; do not assume the student already understands the key term.
- Break the solution into a few clearly labelled steps. Explain why each important step follows, including sign changes, inequalities, substitutions, units, and assumptions when relevant. Use one concrete calculation or example from the actual problem if it helps bridge a conceptual gap.
- For a graph or diagram, connect the axes and visible features to the mathematical quantities. Distinguish what is visibly shown from what the equation predicts, and explicitly compare the two. Do not invent details that are unreadable in an image.
- Finish with a concise answer addressing the exact question and one useful takeaway or likely misconception when helpful. Explain when an extra calculation is unnecessary instead of solving an unrelated problem. Use readable paragraphs, short headings, and separated formulas rather than a dense paragraph.
- Scale detail to the difficulty and the student's request; depth comes from explanations, not repetition or a mandatory word count. Explicit requests for a short answer, hints only, interactive quizzes, page-limited cheatsheets, and exam-cram time budgets take priority. Respect the resolved Learning Style language choices, including English answers with Chinese explanations when those options are enabled; avoid redundant full translations.
- These teaching requirements apply to academic problem-solving, not unrelated everyday questions, email drafts, or document-generation tasks.`;
  const getMode = (id) => Object.hasOwn(modes, id) ? modes[id] : null;
  function buildInstruction(id) {
    const mode = getMode(id);
    if (!mode) return "";
    return `\n\nSelected study mode: ${id} (${mode.label}).\n${mode.instruction}\nApply this workflow to academic tasks, while honoring the student's latest explicit request and learning preferences. For interactive quizzes, follow the requested answer timing instead of the general final-answer-first default. Ground course-specific content in the supplied materials; label assumptions and ask for missing materials rather than inventing facts. Do not force this workflow onto unrelated general questions.` + explanationInstruction;
  }
  return { modes, globalPrompts, defaultMode, getMode, buildInstruction };
});
