"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const { membershipTier } = require("./membership");
const { general } = require("../public/chat-spaces");

const MiB = 1024 * 1024;
const capacities = { standard: 512 * MiB, plus: 1024 * MiB };
const warningRatio = 0.8;
const addOnBytes = 1024 * MiB;
const countedMaterial = /^(?:DOCFILE#[^#]+#PDF$|CHAT#)/;
const uploadedTypes = new Set(["pdf", "word", "ppt", "sheet", "image", "text", "file", "docx", "pptx", "xlsx"]);
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
const statusError = (statusCode, message, properties) => Object.assign(new Error(message), { statusCode, ...properties });
const retriable = (error) => error.code === "TransactionCanceledException" &&
  (!error.cancellationReasons?.length || error.cancellationReasons.some(reason =>
    reason.Code === "ConditionalCheckFailed" || reason.Code === "TransactionConflict"));

// Original PDFs and retained chat attachment groups have their own storage records.
// Other course uploads retain only extracted text, never the original binary.
function documentBytes(doc) {
  return !doc.hasSourcePdf && !doc.blankNote && (doc.uploadedMaterial ?? uploadedTypes.has(String(doc.type).toLowerCase()))
    ? Buffer.byteLength(doc.text || "", "utf8") : 0;
}

function collectLocal(state, userId, replacing) {
  const totals = new Map();
  let previous = 0;
  const count = (owner, size) => totals.set(owner, (totals.get(owner) || 0) + size);
  for (const doc of Object.values(state.documents || {})) {
    if (userId && doc.userId !== userId) continue;
    const size = documentBytes(doc);
    count(doc.userId, size);
    if (replacing?.documentId === doc.id) previous += size;
  }
  for (const material of Object.values(state.materials || {})) {
    if (userId && material.userId !== userId || !countedMaterial.test(material.id)) continue;
    const size = material.file?.bytes ?? (material.value == null ? 0 : bytes(material.value));
    count(material.userId, size);
    if (replacing && replacing.courseId === material.courseId && replacing.id === material.id) previous += size;
  }
  return { totals, total: totals.get(userId) || 0, previous };
}

function createStorageQuota({ db, entitlement, now = () => Date.now(), limits = capacities }) {
  const locks = new Map();
  const scope = new AsyncLocalStorage();
  const pk = (userId) => "USER#" + userId;
  const key = "UPLOAD_STORAGE";
  const settings = (userId) => db.dynamo ? db.dynamo.get(pk(userId), key, { consistent: true })
    : db.local.read(state => state.uploadStorage?.[userId] || null);

  async function change(userId, mutate) {
    if (!db.dynamo) return db.local.write(state => {
      const previous = state.uploadStorage?.[userId] || {};
      const next = mutate(previous);
      if (next) (state.uploadStorage ||= {})[userId] = next;
      return next;
    }, { skipSave: result => !result });
    for (let attempt = 0; attempt < 5; attempt++) {
      const previous = await settings(userId);
      const next = mutate(previous || {});
      if (!next) return null;
      try {
        await db.dynamo.transactPut([{ pk: pk(userId), sk: key, type: "uploadStorage", data: next,
          ...(previous ? { expectedData: previous } : { createOnly: true }) }]);
        return next;
      } catch (error) { if (!retriable(error) || attempt === 4) throw error; }
    }
  }

  async function cloudUsage(userId, replacing) {
    const courses = (await db.listCourses(userId)).map(course => course.id);
    let total = 0, previous = 0;
    for (const courseId of new Set([...courses, general.id])) {
      if (courseId !== general.id) for (const doc of await db.listDocuments(userId, courseId)) {
        const size = documentBytes(doc);
        total += size;
        if (replacing?.documentId === doc.id) previous += size;
      }
      const materialPk = "MATERIAL#" + userId + "#" + courseId;
      for (const prefix of ["DOCFILE#", "CHAT#"]) {
        const rows = await db.dynamo.query(materialPk, prefix);
        for (const manifest of rows.filter(row => row.sk?.endsWith("#META") && countedMaterial.test(row.id))) {
          const size = manifest.bytes ?? rows.filter(row => row.sk?.startsWith(manifest.id + "#PART#" + manifest.revision + "#"))
            .reduce((sum, row) => sum + Buffer.byteLength(row.text || "", "utf8"), 0);
          total += size;
          if (replacing && replacing.courseId === courseId && replacing.id === manifest.id) previous += size;
        }
      }
    }
    return { total, previous };
  }

  function describe(user, stored, total) {
    const tier = membershipTier(user, now());
    const extraBytes = stored?.extraBytes || 0;
    const limitBytes = limits[tier] + extraBytes;
    return {
      tier, usedBytes: total, limitBytes, extraBytes,
      remainingBytes: Math.max(0, limitBytes - total),
      status: total >= limitBytes ? "full" : total >= limitBytes * warningRatio ? "warning" : "available",
      lastBlockedAt: stored?.lastBlockedAt || null,
      blockedBytes: stored?.blockedBytes || 0,
      requestedAt: stored?.requestedAt || null,
      requestId: stored?.requestId || null
    };
  }

  async function current(user, replacing) {
    const stored = await settings(user.id);
    const amount = db.dynamo ? await cloudUsage(user.id, replacing)
      : await db.local.read(state => collectLocal(state, user.id, replacing));
    return { quota: describe(user, stored, amount.total), previous: amount.previous };
  }

  async function serialize(userId, work) {
    const parent = scope.getStore();
    if (parent?.active && parent.userId === userId) return work();
    const before = locks.get(userId) || Promise.resolve();
    const next = before.catch(() => {}).then(async () => {
      const entry = { userId, active: true };
      const lease = db.dynamo ? { id: randomUUID(), until: now() + 5 * 60 * 1000 } : null;
      if (lease) await change(userId, stored => {
        if (stored.lock?.until > now()) throw statusError(409, "另一项资料上传仍在处理中，请稍后重试。");
        return { ...stored, lock: lease };
      });
      try { return await scope.run(entry, work); }
      finally {
        entry.active = false;
        if (lease) await change(userId, stored => {
          if (stored.lock?.id !== lease.id) return null;
          const { lock, ...rest } = stored;
          return rest;
        }).catch(() => {}); // A crashed writer's lock times out.
      }
    });
    locks.set(userId, next);
    try { return await next; }
    finally { if (locks.get(userId) === next) locks.delete(userId); }
  }

  async function withUpload(user, incoming, work, replacing) {
    if (!incoming) return work();
    return serialize(user.id, async () => {
      const { quota, previous } = await current(user, replacing);
      if (incoming > previous && quota.usedBytes - previous + incoming > quota.limitBytes) {
        const recent = Date.parse(quota.lastBlockedAt || "");
        const lastBlockedAt = new Date(now()).toISOString();
        const changed = await change(user.id, stored => now() - recent < 60000 && stored.blockedBytes === incoming
          ? null : { ...stored, lastBlockedAt, blockedBytes: incoming });
        throw statusError(409, "上传空间不足，请删除部分资料、升级 Plus 或申请加购空间。", {
          code: "UPLOAD_STORAGE_LIMIT",
          storage: { ...quota, lastBlockedAt: changed?.lastBlockedAt || quota.lastBlockedAt, blockedBytes: incoming }
        });
      }
      return work();
    });
  }

  async function overview() {
    const users = await db.listUsers();
    // In local mode read the state in memory and tally only metadata. No material
    // file is opened and no database record is rewritten to render the report.
    const snapshot = db.dynamo ? null : await db.local.read(state => ({
      totals: collectLocal(state).totals, settings: state.uploadStorage || {}
    }));
    const quotaRows = await Promise.all(users.map(async user => {
      const effective = { ...user, paidMembershipExpiresAt: await entitlement(user.id) };
      const quota = snapshot ? describe(effective, snapshot.settings[user.id], snapshot.totals.get(user.id) || 0)
        : (await current(effective)).quota;
      return { userId: user.id, name: user.name, ...quota };
    }));
    return {
      totalBytes: quotaRows.reduce((sum, row) => sum + row.usedBytes, 0),
      warning: quotaRows.filter(row => row.status === "warning").length,
      full: quotaRows.filter(row => row.status === "full").length,
      blocked: quotaRows.filter(row => now() - Date.parse(row.lastBlockedAt || "") < 7 * 86400000).length,
      requests: quotaRows.filter(row => row.requestedAt).length,
      accounts: quotaRows.filter(row => row.status !== "available" || row.requestedAt || now() - Date.parse(row.lastBlockedAt || "") < 7 * 86400000)
        .sort((a, b) => Number(Boolean(b.requestedAt)) - Number(Boolean(a.requestedAt)) || b.usedBytes / b.limitBytes - a.usedBytes / a.limitBytes)
    };
  }

  async function requestExtra(user) {
    await change(user.id, stored => stored.requestedAt ? null : { ...stored, requestedAt: new Date(now()).toISOString(), requestId: randomUUID() });
    return (await current(user)).quota;
  }

  async function grantExtra(user, requestId) {
    const result = await change(user.id, stored => {
      if (!stored.requestedAt || stored.requestId !== requestId) return null;
      return { ...stored, extraBytes: (stored.extraBytes || 0) + addOnBytes, requestedAt: null, requestId: null };
    });
    if (!result) throw statusError(409, "申请已更新，请刷新后再试。");
  }

  return { current, overview, requestExtra, grantExtra, withUpload, serialize };
}

module.exports = { createStorageQuota, capacities, bytes, documentBytes };
