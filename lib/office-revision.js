const invalid = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

function revisionBlocks(value) {
  if (!Array.isArray(value) || !value.length || value.length > 500)
    throw invalid("请先写入文字，或选中需要修改的段落。");
  const ids = new Set();
  let length = 0;
  const blocks = value.map((block) => {
    if (!block || typeof block.id !== "string" || !/^b\d+$/.test(block.id) ||
        ids.has(block.id) || typeof block.text !== "string")
      throw invalid("文档修改范围无效，请重新选择。");
    ids.add(block.id);
    length += block.text.length;
    return { id: block.id, text: block.text };
  });
  if (length > 20000)
    throw invalid("本次修改超过 20,000 字符，请选中较短的内容分段修改。");
  if (!blocks.some((block) => block.text.trim()))
    throw invalid("请先写入文字，再告诉 AI 需要怎样改进。");
  return blocks;
}

function revisionEdits(result, blocks) {
  let plan;
  try {
    plan = JSON.parse(String(result).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    throw invalid("AI 未返回有效的修改，请重试。", 502);
  }
  if (!plan || !Array.isArray(plan.edits) || plan.edits.length > blocks.length)
    throw invalid("AI 返回的修改范围无效，请重试。", 502);
  const source = new Map(blocks.map((block) => [block.id, block.text]));
  const seen = new Set();
  let length = 0;
  const edits = plan.edits.map((edit) => {
    if (!edit || !source.has(edit.id) || seen.has(edit.id) || typeof edit.text !== "string")
      throw invalid("AI 返回的修改范围无效，请重试。", 502);
    seen.add(edit.id);
    length += edit.text.length;
    return { id: edit.id, text: edit.text };
  });
  if (length > 30000) throw invalid("AI 返回的修改过长，请缩小范围后重试。", 502);
  return edits.filter((edit) => edit.text !== source.get(edit.id));
}

module.exports = { revisionBlocks, revisionEdits };
