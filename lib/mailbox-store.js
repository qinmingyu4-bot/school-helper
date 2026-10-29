const { randomUUID } = require("node:crypto");
const batch = require("./schedule-batch");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const connectionKey = (userId, provider) => ({ pk: `USER#${userId}`, sk: `MAILBOX#${provider}` });
const draftKey = (userId, id) => ({ pk: `MAILBOX#${userId}`, sk: `DRAFT#${id}` });
const conflict = (error) => error.code === "TransactionCanceledException";

module.exports = {
  async getMailbox(userId, provider) {
    const key = connectionKey(userId, provider);
    return this.dynamo ? this.dynamo.get(key.pk, key.sk, { consistent: true }) : this.local.read((state) => state.mailboxes?.[`${userId}:${provider}`] || null);
  },
  async changeMailbox(userId, provider, mutate, { draft } = {}) {
    if (!this.dynamo) return this.local.write((state) => {
      state.mailboxes ||= {}; state.mailboxDrafts ||= {};
      const key = `${userId}:${provider}`, before = state.mailboxes[key] || null;
      const next = mutate(before);
      if (!next) return null;
      state.mailboxes[key] = next;
      if (draft) state.mailboxDrafts[`${userId}:${draft.id}`] ||= draft;
      return next;
    }, { skipSave: (result) => !result });
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = await this.getMailbox(userId, provider), next = mutate(before);
      if (!next) return null;
      const records = [{ ...connectionKey(userId, provider), type: "mailbox", data: next, ...(before ? { expectedData: before } : { createOnly: true }) },
        { pk: "MAILBOX_JOBS", sk: `${userId}#${provider}`, type: "mailboxJob", data: { userId, provider, active: next.active } }];
      if (draft) {
        const key = draftKey(userId, draft.id);
        if (!await this.dynamo.get(key.pk, key.sk, { consistent: true })) records.push({ ...key, type: "mailboxDraft", data: draft, createOnly: true });
      }
      try { await this.dynamo.transactPut(records); return next; }
      catch (error) { if (!conflict(error) || attempt === 5) throw error; }
    }
  },
  async listMailboxJobs(cursor) {
    if (this.dynamo) return this.dynamo.queryPage("MAILBOX_JOBS", { limit: 25, cursor });
    return this.local.read((state) => {
      const jobs = Object.values(state.mailboxes || {}).map(({ userId, provider, active }) => ({ userId, provider, active })).sort((a, b) => `${a.userId}:${a.provider}`.localeCompare(`${b.userId}:${b.provider}`));
      const offset = Number(cursor) || 0;
      return { rows: jobs.slice(offset, offset + 25), cursor: jobs.length > offset + 25 ? offset + 25 : null };
    });
  },
  async getMailboxDraft(userId, id) {
    const key = draftKey(userId, id);
    return this.dynamo ? this.dynamo.get(key.pk, key.sk, { consistent: true }) : this.local.read((state) => state.mailboxDrafts?.[`${userId}:${id}`] || null);
  },
  async listMailboxDrafts(userId, before = "") {
    if (this.dynamo) {
      const page = await this.dynamo.queryPage(`MAILBOX#${userId}`, { prefix: "DRAFT#", before: before ? `DRAFT#${before}` : "", limit: 20 });
      return { drafts: page.rows, nextBefore: page.cursor ? page.rows.at(-1)?.id || null : null };
    }
    return this.local.read((state) => {
      const rows = Object.values(state.mailboxDrafts || {}).filter((row) => row.userId === userId && (!before || row.id < before)).sort((a, b) => b.id.localeCompare(a.id));
      return { drafts: rows.slice(0, 20), nextBefore: rows.length > 20 ? rows[19].id : null };
    });
  },
  // The reviewed draft and imported schedule commit together. A retry, another
  // browser, a changed mailbox, or an unlink cannot silently add a second copy.
  async resolveMailboxDraft(userId, id, items, action, generation) {
    const apply = (draft, connection, courses, documents) => {
      if (!draft || draft.userId !== userId) throw fail(404, "邮件事项不存在。");
      if (!connection?.active || connection.generation !== draft.generation || generation !== draft.generation) throw fail(409, "邮箱连接已变更，请重新读取邮件助手。");
      if (draft.status !== "pending") return { draft, saved: 0, duplicates: 0, records: [], courses: [], done: true };
      const result = action === "confirm" ? batch.prepareBatch(userId, items, courses, documents) : { saved: 0, duplicates: 0, records: [], courses: [] };
      return { ...result, draft: { ...draft, status: action === "confirm" ? "confirmed" : "dismissed", resolvedAt: new Date().toISOString() } };
    };
    if (!this.dynamo) return this.local.write((state) => {
      const draft = state.mailboxDrafts?.[`${userId}:${id}`];
      const result = apply(draft, state.mailboxes?.[`${userId}:${draft?.provider}`], Object.values(state.courses), Object.values(state.documents));
      if (!result.done) {
        if (result.newCourse) state.courses[result.course.id] = result.course;
        result.records.forEach((record) => { state.documents[record.id] = record; });
        state.mailboxDrafts[`${userId}:${id}`] = result.draft;
      }
      return result;
    });
    for (let attempt = 0; attempt < 6; attempt++) {
      const draft = await this.getMailboxDraft(userId, id);
      const connection = draft ? await this.getMailbox(userId, draft.provider) : null;
      const guard = await this.dynamo.get(`USER#${userId}`, "SCHEDULE#IMPORT", { consistent: true });
      const courses = action === "confirm" ? await this.listCourses(userId) : [];
      const documents = (await Promise.all(courses.map((course) => this.listDocuments(userId, course.id)))).flat();
      const result = apply(draft, connection, courses, documents);
      if (result.done) return result;
      const pk = `USER#${userId}`;
      const records = [{ ...draftKey(userId, id), type: "mailboxDraft", data: result.draft, expectedData: draft },
        { ...connectionKey(userId, draft.provider), checkOnly: true, expectedData: connection }];
      if (action === "confirm") records.push({ pk, sk: "SCHEDULE#IMPORT", type: "scheduleImportGuard", data: { version: randomUUID() }, ...(guard ? { expectedData: guard } : { createOnly: true }) });
      if (result.newCourse) records.push({ pk, sk: `COURSE#${result.course.id}`, type: "course", data: result.course, createOnly: true });
      records.push(...result.records.map((record) => ({ pk, sk: `COURSE#${record.courseId}#DOC#${record.id}`, type: "document", data: record, createOnly: true })));
      try { await this.dynamo.transactPut(records); return result; }
      catch (error) { if (!conflict(error)) throw error; }
    }
    throw fail(409, "邮件事项正在更新，请重试。");
  },
  async purgeMailboxDrafts(userId, provider, generation) {
    if (!this.dynamo) return this.local.write((state) => {
      for (const [key, row] of Object.entries(state.mailboxDrafts || {})) if (row.userId === userId && row.provider === provider && row.generation === generation) delete state.mailboxDrafts[key];
    });
    let cursor;
    do {
      const page = await this.dynamo.queryPage(`MAILBOX#${userId}`, { prefix: "DRAFT#", limit: 50, cursor });
      const rows = page.rows.filter((row) => row.provider === provider && row.generation === generation);
      if (rows.length) await this.dynamo.transactPut(rows.map((row) => ({ ...draftKey(userId, row.id), deleteOnly: true })));
      cursor = page.cursor;
    } while (cursor);
  }
};
