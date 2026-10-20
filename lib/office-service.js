const crypto = require("node:crypto");
const { normalize, kinds } = require("../public/office-model");
const fail = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const publicMeta = ({ userId, materialId, ...item }) => item;
function createOfficeService(db) {
  async function list(userId) {
    return (await db.listOfficeProjects(userId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(publicMeta);
  }
  async function get(userId, id) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const meta = await db.getOfficeProject(userId, id);
      if (!meta) throw fail("作品不存在。", 404);
      try {
        const model = await db.readMaterial(userId, "_office", meta.materialId);
        if (model) return { ...publicMeta(meta), model };
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    throw fail("作品刚刚更新，请重新打开。", 503);
  }
  async function save(userId, id, body) {
    if (!/^office_[\w-]{1,80}$/.test(id)) throw fail("作品 ID 无效。");
    const existing = await db.getOfficeProject(userId, id);
    if (body.version !== (existing?.version || 0))
      throw fail("作品已在另一处更新。请另存副本，避免覆盖。", 409);
    if (existing && body.kind !== existing.kind)
      throw fail("不能更改作品类型。");
    const model = normalize(body.kind, body.model);
    if (!existing && (await list(userId)).length >= 200)
      throw fail("作品库最多保存 200 份作品。");
    const materialId = `${id}#${crypto.randomUUID()}`;
    const meta = {
      id,
      userId,
      kind: body.kind,
      name:
        String(body.name || "未命名作品")
          .trim()
          .slice(0, 120) || "未命名作品",
      version: (existing?.version || 0) + 1,
      materialId,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await db.writeMaterial(userId, "_office", materialId, model);
      await db.saveOfficeProject(meta, existing);
    } catch (error) {
      await db
        .deleteMaterials(userId, "_office", materialId + "#")
        .catch(() => {});
      throw error;
    }
    // Published snapshots are immutable. Old versions can be removed after the new manifest is durable.
    if (existing?.materialId)
      await db
        .deleteMaterials(userId, "_office", existing.materialId + "#")
        .catch(() => {});
    return publicMeta(meta);
  }
  return { list, get, save, kinds };
}
module.exports = { createOfficeService };
