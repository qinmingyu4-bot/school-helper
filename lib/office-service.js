const crypto = require("node:crypto");
const { normalize, kinds } = require("../public/office-model");
const fail = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const { Step, Transform } = require('@tiptap/pm/transform');
const { schema } = require('./office-doc-schema');
const { applyOperations, difference } = require('./office-operations');
const publicMeta = ({ userId, materialId, shareHash, ...item }) => ({ ...item, ...(item.collaborative ? { ownerId: userId, sharing: Boolean(shareHash) } : {}) });
function createOfficeService(db) {
  const cache = new Map(), peers = new Map();
  async function snapshot(meta) {
    if (cache.has(meta.materialId)) return cache.get(meta.materialId);
    const value = await db.readMaterial(meta.userId, '_office', meta.materialId);
    if (!value) throw fail('作品暂时无法读取，请重试。', 503);
    const data = meta.collaborative ? value : { model: value };
    cache.set(meta.materialId, data);
    while (cache.size > 8) cache.delete(cache.keys().next().value);
    return data;
  }
  async function publish(meta, data, overrides = {}) {
    const materialId = `${meta.id}#${crypto.randomUUID()}`;
    const next = { ...meta, ...overrides, materialId, version: meta.version + 1, updatedAt: new Date().toISOString() };
    try {
      await db.writeMaterial(meta.userId, '_office', materialId, data);
      await db.saveOfficeProject(next, meta);
    } catch (error) {
      await db.deleteMaterials(meta.userId, '_office', materialId + '#').catch(() => {});
      throw error;
    }
    cache.set(materialId, data);
    while (cache.size > 8) cache.delete(cache.keys().next().value);
    await db.deleteMaterials(meta.userId, '_office', meta.materialId + '#').catch(() => {});
    return next;
  }
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
        const data = await snapshot(meta);
        if (data.model) return { ...publicMeta(meta), model: data.model };
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    throw fail("作品刚刚更新，请重新打开。", 503);
  }
  async function save(userId, id, body) {
    if (!/^office_[\w-]{1,80}$/.test(id)) throw fail("作品 ID 无效。");
    const existing = await db.getOfficeProject(userId, id);
    if (existing?.collaborative) throw fail("此作品已启用共同编辑，请刷新后使用同步保存。", 409);
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
  async function sharing(userId, id, enabled) {
    const meta = await db.getOfficeProject(userId, id);
    if (!meta) throw fail('作品不存在。', 404);
    const old = await snapshot(meta);
    const token = enabled ? crypto.randomBytes(32).toString('hex') : '';
    const data = { ...old, log: old.log || [], baseVersion: old.baseVersion ?? meta.version, receipts: old.receipts || [] };
    data.log = [...data.log, { version: meta.version + 1, batch: '', steps: [], changes: [] }];
    const next = await publish(meta, data, { collaborative: true, shareHash: token ? crypto.createHash('sha256').update(token).digest('hex') : '' });
    return { project: { ...publicMeta(next), model: data.model }, token };
  }
  async function authorize(userId, id, ownerId, token) {
    if (typeof ownerId !== 'string' || ownerId.length > 120) throw fail('分享链接无效。', 404);
    const meta = await db.getOfficeProject(ownerId, id);
    if (!meta?.collaborative) throw fail('分享不存在或已关闭。', 403);
    if (userId !== ownerId) {
      const supplied = crypto.createHash('sha256').update(String(token || '').slice(0, 128)).digest('hex');
      if (!meta.shareHash || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(meta.shareHash))) throw fail('分享不存在或已关闭。', 403);
    }
    return meta;
  }
  async function sync(user, id, body) {
    const mutating = Boolean(body.steps?.length || body.changes?.length);
    if (!Number.isSafeInteger(body.since) || body.since < 0 || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.peer || '')) throw fail('同步请求无效。');
    if (mutating && !/^[a-zA-Z0-9_-]{1,100}$/.test(body.batch || '')) throw fail('同步批次无效。');
    if (!Array.isArray(body.steps || []) || (body.steps || []).length > 500 || !Array.isArray(body.changes || [])) throw fail('同步内容过大。');
    for (let attempt = 0; attempt < 5; attempt++) {
      let meta = await authorize(user.id, id, body.ownerId, body.token);
      let data = await snapshot(meta);
      const tooOld = body.since < (data.baseVersion || 0);
      if (body.since > meta.version) throw fail('同步版本无效。', 409);
      const receipt = data.receipts?.find(r => r.batch === body.batch && r.peer === body.peer);
      const structural = changes => changes.some(op => op.path?.[0] === 'model' &&
        (op.path[1] !== 'sheets' || op.path.length < 4 || !['cells', 'columnWidths', 'rowHeights'].includes(op.path[3])));
      if (mutating && !receipt && !tooOld && meta.kind === 'sheets' && body.since !== meta.version &&
          (structural(body.changes || []) || data.log.filter(e => e.version > body.since).some(e => structural(e.changes))))
        throw fail('工作表结构已被另一位编辑者更改，草稿已保留，请另存副本。', 409);
      if (mutating && !receipt && !tooOld && (meta.kind !== 'docs' || body.since === meta.version)) {
        let model = data.model, name = meta.name;
        const changes = body.changes || [], steps = body.steps || [];
        if (meta.kind !== 'docs' && steps.length) throw fail('同步类型无效。');
        if (meta.kind === 'docs' && changes.some(op => op.path?.[0] === 'model' && op.path?.[1] !== 'settings')) throw fail('正文必须通过文本同步修改。');
        try {
          ({ model, name } = applyOperations({ model, name }, changes));
          if (steps.length) {
            const tr = new Transform(schema.nodeFromJSON(model.content));
            for (const json of steps) tr.step(Step.fromJSON(schema, json));
            tr.doc.check();
            model = { ...model, content: tr.doc.toJSON() };
            const validated = schema.nodeFromJSON(normalize('docs', model).content);
            if (!validated.eq(tr.doc)) throw Error('Unsupported document attributes');
          }
          model = normalize(meta.kind, model);
          if (meta.kind === 'docs') schema.nodeFromJSON(model.content).check();
          name = String(name || '未命名作品').trim().slice(0, 120);
        } catch { throw fail('修改无法安全合并，草稿已保留，请另存副本。', 422); }
        const canonicalChanges = difference({ name: meta.name, model: data.model }, { name, model })
          .filter(op => meta.kind !== 'docs' || op.path[0] === 'name' || op.path[1] === 'settings');
        const entry = { version: meta.version + 1, batch: body.batch, peer: body.peer, steps, changes: canonicalChanges };
        const log = [...data.log, entry];
        let baseVersion = data.baseVersion;
        // Bound replay work and storage; older offline clients keep their draft.
        while (log.length > 200 || JSON.stringify(log).length > 2000000) baseVersion = log.shift().version;
        data = { model, log, baseVersion, receipts: [...(data.receipts || []), { peer: body.peer, batch: body.batch }].slice(-200) };
        try { meta = await publish(meta, data, { name }); }
        catch (error) { if (error.statusCode === 409) continue; throw error; }
      }
      const key = `${meta.userId}:${id}`, now = Date.now();
      const room = peers.get(key) || new Map();
      for (const [key, peer] of room) if (now - peer.at > 15000) room.delete(key);
      if (room.size < 50 || room.has(body.peer)) room.set(body.peer, { at: now, name: String(user.name || '同学').slice(0, 60), id: body.peer });
      peers.set(key, room);
      if (peers.size > 200) peers.delete(peers.keys().next().value);
      return { project: publicMeta(meta),
        ...(body.initial || tooOld ? { model: data.model } : {}),
        resetRequired: tooOld && mutating,
        accepted: Boolean(receipt || data.receipts?.some(r => r.peer === body.peer && r.batch === body.batch)),
        entries: body.initial || tooOld ? [] : data.log.filter(entry => entry.version > body.since),
        peers: [...room.values()].map(({ name, id }) => ({ name, id })),
      };
    }
    throw fail('作品正在同步，请稍后重试。', 503);
  }
  return { list, get, save, sharing, sync, kinds };
}
module.exports = { createOfficeService };
