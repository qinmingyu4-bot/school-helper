"use strict";

const { questionOutline } = require("./study-coverage");

const complexModes = new Set(["exam", "assignment", "cheatsheet", "cram", "review"]);
const greeting = /^(?:hi|hello|hey|thanks|thank you|你好|您好|谢谢|早上好|晚上好|晚安)[!！。,.，?？\s]*$/i;
const reasoning = [
  /证明|推导|演算|分析原因|利弊|可行性分析|怎么解|这(?:道)?题(?:怎么做|.{0,6}的答案)|求(?:极限|导数|积分|概率|特征值)|解题|解答|做题|算出|求解|纠错|调试|逐题|每个小问|检查思路|模拟(?:试卷|考试)|出.{0,12}(?:练习题|试卷)/i,
  /(?:编写|实现|修复|排查|重构).{0,20}(?:代码|脚本|程序)|\b(?:fix|implement|refactor|optimi[sz]e)\b.{0,30}\b(?:code|script|program|algorithm)\b/i,
  /\b(?:prove|derive|deriv(?:ation|e)|debug|solve|troubleshoot)\b|\b(?:compare|evaluate|justify)\b.{0,60}\b(?:tradeoffs?|alternatives?|evidence|arguments?|results?)\b/i,
  /\b(?:show|check|verify)\s+(?:the|my|your)\s+(?:work(?:ing)?|calculations?|reasoning)\b/i,
  /\b(?:create|write|generate|prepare|design)\b.{0,45}\b(?:mock (?:exam|paper|test)|practice (?:exam|test|questions)|research paper|lab report|thesis|script|program)\b/i
];
const simpleTransform = /^(?:(?:请|帮我|能不能|可以|只|please\s+|can you\s+|could you\s+)\s*)*(?:[把将][^,，:：\n]{1,28}?)?(?:翻译|润色|校对|改写|缩写|摘要|概括|总结|提取|摘录|识别文字|转成文字|translate\b|proofread\b|rephrase\b|summari[sz]e\b|extract\b|transcribe\b|shorten\b|fix (?:the )?(?:typos|grammar)\b)/i;
const simpleLookup = [
  /(?:什么时候|几号|哪天|几点|什么时间).{0,18}(?:交|截止|考试|上课)|(?:截止|作业|考试|测验|课程|上课).{0,18}(?:什么时候|哪天|几号|几点|什么时间)/i,
  /(?:是什么|是什么意思)(?=[?？。!！,，\s]|$)|^(?:(?:请问[，, ]*)?什么(?:是|叫)|(?:please\s+)?define\b|what does .* mean)/i,
  /^what (?:is|are)\b.{0,35}\b(?:deadline|due date|exam date)\b|^when\b.{0,55}\b(?:due|exam|deadline|class|quiz|assignment|lecture|tutorial)\b/i
];
const everyday = /天气|气温|番茄炒鸡蛋|怎么做.*(?:饭|菜|面包)|\b(?:weather|forecast)\b/i;
const tutoring = /学[习習]|讲解|解释|教我|带我学|解题|怎么做|怎么解|这题|题目|小问|\b(?:teach|explain|solve)\b|walk.*through|step.by.step/i;
const sourceReference = /上传|附件|讲义|试卷|练习卷|这部分|这份资料|上一题|这题|(?:第一|第[二三四五六七八九十\d]+)题|\b(?:pdf|file|attachment|lecture|document|paper|previous question|this (?:section|material))\b/i;
const imageTutoring = /怎么做|怎么解|这道题|这题|解题|教我|带我学|讲解|讲讲|\bteach\s+me\b|\bwalk\s+me\s+through\b|\bexplain\s+(this|it)\b|\bsolve\b|work.*out|explain.*(problem|question)|how.*(solve|answer)/i;
const followUp = /^(继续|接着|上一题|刚才|为什么|再解释|continue\b|why\b|what about\b|explain that\b|recalculate\b)/i;

function selectAiModel({ history = [], mode = "", message = "", attachments = [], savedAttachments = [], documents = [] }, models) {
  const { simpleModel, complexModel } = models;
  const request = String(message || "").trim();
  if (greeting.test(request)) return simpleModel;

  // Pasted material can contain any subject words. Classify the instruction for
  // an explicit transform, while still considering a second task in that instruction.
  const initialLine = request.split(/[\n:：]/, 1)[0];
  const transform = simpleTransform.test(initialLine);
  const intent = transform ? initialLine : request;
  if (reasoning.some((pattern) => pattern.test(intent))) return complexModel;
  if (transform || simpleLookup.some((pattern) => pattern.test(intent)) || everyday.test(intent)) return simpleModel;

  const relevantSources = sourceReference.test(request) ? [...attachments, ...savedAttachments] : attachments;
  if (tutoring.test(request) && (relevantSources.some((item) => item.kind === "pdf")
    || [...attachments, ...savedAttachments, ...documents].some((item) => questionOutline(item.text).length >= 2))) return complexModel;
  if (imageTutoring.test(request) && [...attachments, ...savedAttachments].some((item) => item.kind === "image")) return complexModel;
  if (request.length > 900 || attachments.some((item) => String(item.text || "").length > 9000)) return complexModel;

  if (followUp.test(request)) {
    const earlier = history.filter((item) => item.role === "user" && !item.interrupted);
    // The current message may already be in persistence.
    if (String(earlier.at(-1)?.content || "").trim() === request) earlier.pop();
    const previous = earlier.pop();
    if (previous) return selectAiModel({ message: previous.content, mode: previous.mode, history: earlier, savedAttachments, documents }, models);
  }
  return complexModes.has(String(mode || "").toLowerCase()) ? complexModel : simpleModel;
}

module.exports = { selectAiModel };
