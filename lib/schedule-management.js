const management = require("../public/schedule-management");
const { BATCH_SIZE, storedItems } = require("./schedule-batch");

function normalizeRequest(body) {
  if (!body || !["edit", "delete"].includes(body.operation) || !Array.isArray(body.items) || !body.items.length || body.items.length > BATCH_SIZE) {
    throw Object.assign(new Error(`每批请选择 1–${BATCH_SIZE} 条安排和有效操作。`), { statusCode: 400 });
  }
  if (body.items.some((item) => !item || [item.docId, item.courseId].some((id) => typeof id !== "string" || !/^[\w-]{1,100}$/.test(id)))) {
    throw Object.assign(new Error("安排编号无效。"), { statusCode: 400 });
  }
  const items = [...new Map(body.items.map(({ courseId, docId }) => [`${courseId}/${docId}`, { courseId, docId }])).values()];
  try { if (body.operation === "edit") management.validatePatch(body.patch); }
  catch (error) { throw Object.assign(error, { statusCode: 400 }); }
  return { operation: body.operation, items, ...(body.operation === "edit" ? { patch: body.patch } : {}) };
}

function prepareChanges(userId, request, courses, documents) {
  const owned = courses.filter((course) => course.userId === userId);
  const items = storedItems(owned, documents, userId);
  const changes = request.items.flatMap((target) => {
    const doc = documents.find((record) => record.id === target.docId && record.courseId === target.courseId && record.userId === userId);
    if (!doc && request.operation === "delete" && owned.some((course) => course.id === target.courseId)) return [];
    const item = items.find((record) => record.docId === target.docId && record.courseId === target.courseId);
    if (!item) throw Object.assign(new Error("安排不存在或无法访问，请刷新日程后重试。"), { statusCode: 404 });
    if (request.operation === "delete") return [{ before: doc }];
    let updated;
    try { updated = management.applyPatch(item, request.patch); }
    catch (error) { throw Object.assign(error, { statusCode: 400 }); }
    const { id, docId, courseId, ...data } = updated;
    const record = { ...doc, title: `[SCHEDULE_ITEM] ${data.title}`, text: JSON.stringify(data), materialStored: false, updatedAt: new Date().toISOString() };
    if (Buffer.byteLength(JSON.stringify(record), "utf8") > 250000) throw Object.assign(new Error("这条安排内容过长，请先缩短备注。"), { statusCode: 400 });
    return [{ before: doc, after: record }];
  });
  return { changes, items: storedItems(owned, changes.flatMap((change) => change.after ? [change.after] : []), userId) };
}

module.exports = { normalizeRequest, prepareChanges };
