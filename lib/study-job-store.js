"use strict";
const conflict = () => Object.assign(new Error("Study task changed; retry."), { statusCode: 409, code: "StudyConflict" });
const active = (job) => ["accepting", "queued", "planning", "running"].includes(job.status);
const record = (job) => ({ pk: `USER#${job.userId}`, sk: `COURSE#${job.courseId}#STUDYJOB#${job.id}`, type: "studyJob", data: job });
const queueRecord = (job) => ({ pk: "STUDY_QUEUE", sk: `JOB#${job.id}`, type: "studyQueue", data: { userId: job.userId, courseId: job.courseId, id: job.id, active: active(job), createdAt: job.createdAt } });

module.exports = {
  async pruneMaterialRevisions(userId, courseId, prefix, keep) {
    const ids = this.dynamo
      ? (await this.dynamo.query(`MATERIAL#${userId}#${courseId}`, prefix)).filter((item) => item.sk.endsWith("#META")).map((item) => item.id)
      : await this.local.read((state) => Object.values(state.materials || {}).filter((item) => item.userId === userId && item.courseId === courseId && item.id.startsWith(prefix)).map((item) => item.id));
    for (const id of ids) if (id !== keep) await this.deleteMaterials(userId, courseId, id + "#");
  },
  async saveStudyMessage(message) {
    const record = { ...message, kind: "message" };
    const conversations = require("../public/course-conversations");
    const conversationId = record.conversationId || conversations.DEFAULT_ID;
    if (!this.dynamo) return this.local.write((state) => {
      const key = conversations.key(record.userId, record.courseId, conversationId), conversation = state.conversations?.[key];
      if (state.courses?.[record.courseId]?.userId !== record.userId || conversation?.deletedAt || !conversation && conversationId !== conversations.DEFAULT_ID) throw new Error("Conversation not found.");
      state.conversations ||= {};
      state.conversations[key] = conversations.touch(conversation || { id: conversationId, userId: record.userId, courseId: record.courseId, kind: "conversation", title: "默认对话", createdAt: record.createdAt }, record);
      if (state.messages[record.id]?.role === "user") return state.messages[record.id];
      state.messages[record.id] = record; return record;
    });
    const pk = `USER#${record.userId}`, sk = `COURSE#${record.courseId}#MSG#${record.createdAt}#${record.id}`, convKey = `COURSE#${record.courseId}#CONV#${conversationId}`;
    for (let attempt = 0; attempt < 8; attempt++) {
      const old = await this.dynamo.get(pk, sk, { consistent: true }), conversation = await this.dynamo.get(pk, convKey, { consistent: true }), course = await this.getCourse(record.userId, record.courseId);
      if (!course || conversation?.deletedAt || !conversation && conversationId !== conversations.DEFAULT_ID) throw new Error("Conversation not found.");
      if (old?.role === "user") return old;
      const nextConversation = conversations.touch(conversation || { id: conversationId, userId: record.userId, courseId: record.courseId, kind: "conversation", title: "默认对话", createdAt: record.createdAt }, record);
      try { await this.dynamo.transactPut([{ pk, sk, type: "message", data: record, ...(old ? { expectedData: old } : { createOnly: true }) },
        { pk, sk: convKey, type: "conversation", data: nextConversation, ...(conversation ? { expectedData: conversation } : { createOnly: true }) },
        { pk, sk: `COURSE#${record.courseId}`, checkOnly: true, expectedData: course }]); return record; }
      catch (error) { if (error.code !== "TransactionCanceledException" || attempt === 7) throw error; }
    }
  },
  async getStudyJob(userId, courseId, id) {
    if (this.dynamo) return this.dynamo.get(`USER#${userId}`, `COURSE#${courseId}#STUDYJOB#${id}`, { consistent: true });
    return this.local.read((state) => { const job = state.studyJobs?.[id]; return job?.userId === userId && job.courseId === courseId ? job : null; });
  },
  async saveStudyJob(job, revision = null) {
    const next = { ...job, kind: "studyJob", revision: (revision ?? 0) + 1, updatedAt: new Date().toISOString() };
    if (!this.dynamo) return this.local.write((state) => {
      state.studyJobs ||= {};
      const old = state.studyJobs[job.id];
      if (revision === null ? Boolean(old) : old?.revision !== revision) throw conflict();
      state.studyJobs[job.id] = next;
      return next;
    });
    const old = await this.getStudyJob(job.userId, job.courseId, job.id);
    if (revision === null ? Boolean(old) : old?.revision !== revision) throw conflict();
    try { await this.dynamo.transactPut([{ ...record(next), ...(old ? { expectedData: old } : { createOnly: true }) }, active(next) ? queueRecord(next) : { pk: "STUDY_QUEUE", sk: `JOB#${next.id}`, deleteOnly: true }]); }
    catch (error) { if (error.code === "TransactionCanceledException") throw conflict(); throw error; }
    return next;
  },
  async updateStudyJob(userId, courseId, id, change) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const old = await this.getStudyJob(userId, courseId, id);
      if (!old) return null;
      const next = await change(structuredClone(old));
      if (!next) return old;
      try { return await this.saveStudyJob(next, old.revision); }
      catch (error) { if (error.code !== "StudyConflict" || attempt === 7) throw error; }
    }
  },
  async listStudyJobs(userId, courseId, conversationId) {
    const jobs = this.dynamo ? await this.dynamo.query(`USER#${userId}`, `COURSE#${courseId}#STUDYJOB#`)
      : await this.local.read((state) => Object.values(state.studyJobs || {}).filter((job) => job.userId === userId && job.courseId === courseId));
    return jobs.filter((job) => job.conversationId === conversationId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async pendingStudyJobs() {
    if (!this.dynamo) return this.local.read((state) => Object.values(state.studyJobs || {}).filter(active));
    const references = (await this.dynamo.query("STUDY_QUEUE", "JOB#")).filter((item) => item.active);
    const jobs = [];
    for (const ref of references) { const job = await this.getStudyJob(ref.userId, ref.courseId, ref.id); if (job && active(job)) jobs.push(job); }
    return jobs;
  },
  async studySlot(slot, token, expiresAt, acquire = false) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 1) throw new Error("Invalid study slot.");
    const next = { token, expiresAt };
    if (!this.dynamo) return this.local.write((state) => {
      state.studySlots ||= {};
      const old = state.studySlots[slot];
      if (acquire ? old?.expiresAt > Date.now() : old?.token !== token) return false;
      state.studySlots[slot] = next;
      return true;
    }, { skipSave: (changed) => !changed });
    const pk = "STUDY_QUEUE", sk = `SLOT#${slot}`, old = await this.dynamo.get(pk, sk, { consistent: true });
    if (acquire ? old?.expiresAt > Date.now() : old?.token !== token) return false;
    try { await this.dynamo.transactPut([{ pk, sk, type: "studySlot", data: next, ...(old ? { expectedData: old } : { createOnly: true }) }]); return true; }
    catch (error) { if (error.code === "TransactionCanceledException") return false; throw error; }
  },
  async compactStudyMaterials() {
    if (this.dynamo) return;
    const records = await this.local.read((state) => Object.values(state.materials || {}).filter((item) => !item.file && /^(CHAT#|DOCFILE#)/.test(item.id)).map(({ userId, courseId, id }) => ({ userId, courseId, id })));
    const files = require("./material-files");
    for (const { userId, courseId, id } of records) {
      const key = `${userId}#${courseId}#${id}`;
      const old = await this.local.read((state) => state.materials?.[key]);
      if (!old || old.file) continue;
      const digest = files.hash(JSON.stringify(old.value));
      const file = await files.write(this.local.file, userId, courseId, id, old.value);
      await files.read(this.local.file, userId, courseId, id, file);
      await this.local.write((state) => {
        const current = state.materials?.[key];
        if (current && !current.file && files.hash(JSON.stringify(current.value)) === digest) state.materials[key] = { userId, courseId, id, file };
      });
    }
  }
};
