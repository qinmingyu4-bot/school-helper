const fs = require("fs/promises");
const path = require("path");
const { DynamoStore } = require("./aws-dynamodb");
const { general } = require("../public/chat-spaces");

function now() {
  return new Date().toISOString();
}

function decodeMaterial(manifest, parts) {
  parts.sort((a, b) => a.index - b.index);
  if (parts.length !== manifest.count || parts.some((part, index) => part.index !== index)) throw new Error("Saved material is incomplete. Please upload it again.");
  return JSON.parse(parts.map((part) => part.text).join(""));
}

function authCodeKey(email, purpose) {
  return `${purpose}:${email}`;
}

function inviteRole(invite = {}) {
  const requested = String(invite.role || "").toLowerCase();
  const label = String(invite.label || "");
  return requested === "admin" || requested === "co-admin" || /^\s*\[co-admin\]/i.test(label) ? "admin" : "student";
}

function normalizedSbId(user = {}) {
  return String(user.profile?.sbId || "").trim().toLowerCase();
}

function claimInvite(invite, userId) {
  if (!invite || invite.kind === "passwordReset" || invite.active === false || Number(invite.uses || 0) >= 1 || invite.usedBy?.length) {
    throw Object.assign(new Error("Invitation code is invalid, disabled, or already used."), { statusCode: 403 });
  }
  const { bootstrap, ...record } = invite;
  return { ...record, maxUses: 1, uses: 1, usedBy: [{ userId, usedAt: now() }], updatedAt: now(), createdAt: record.createdAt || now() };
}

function assertUniqueSbId(users, nextUser) {
  const sbId = normalizedSbId(nextUser);
  if (!sbId) return;
  const duplicate = Object.values(users || {}).find((user) => user.id !== nextUser.id && normalizedSbId(user) === sbId);
  if (duplicate) throw new Error("This SB ID is already taken. Please choose another one.");
}

class LocalStore {
  constructor(file) {
    this.file = path.resolve(file || ".data/studybridge.json");
    this.state = null;
    this.pending = Promise.resolve();
  }

  async load() {
    if (this.state) return this.state;
    try {
      const content = await fs.readFile(this.file, "utf8");
      this.state = JSON.parse(content);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = {
        emailIndex: {},
        users: {},
        sessions: {},
        courses: {},
        documents: {},
        messages: {},
        invites: {},
        authCodes: {},
        communityPosts: {},
        classmates: {},
        classmateRequests: {},
        directMessages: {}
      };
    }
    this.state.invites ||= {};
    this.state.authCodes ||= {};
    this.state.communityPosts ||= {};
    this.state.classmates ||= {};
    this.state.classmateRequests ||= {};
    this.state.directMessages ||= {};
    return this.state;
  }

  async save() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporaryFile = `${this.file}.${process.pid}.tmp`;
    try {
      await fs.writeFile(temporaryFile, JSON.stringify(this.state, null, 2), { mode: 0o600 });
      await fs.rename(temporaryFile, this.file);
    } finally {
      await fs.unlink(temporaryFile).catch(() => {});
    }
  }

  async write(mutator) {
    const operation = this.pending.then(async () => {
      await this.load();
      const result = await mutator(this.state);
      await this.save();
      return result;
    });
    // Report this failure to its caller while allowing later writes to proceed.
    this.pending = operation.catch(() => {});
    return operation;
  }

  async read(selector) {
    await this.load();
    return selector(this.state);
  }
}

class StudyBridgeDatabase {
  constructor() {
    this.mode = process.env.STUDYBRIDGE_DB || "local";
    this.local = new LocalStore(process.env.LOCAL_DB_FILE);
    this.dynamo = this.mode === "dynamodb" ? new DynamoStore() : null;
  }

  async findUserByEmail(email) {
    if (this.dynamo) {
      const mapping = await this.dynamo.get(`EMAIL#${email}`, "USER");
      return mapping ? this.getUser(mapping.userId) : null;
    }
    return this.local.read((db) => {
      const userId = db.emailIndex[email];
      return userId ? db.users[userId] : null;
    });
  }

  async findUserBySbId(sbId) {
    const normalized = String(sbId || "").trim().toLowerCase();
    if (!normalized) return null;
    if (this.dynamo) {
      const users = await this.listUsers();
      return users.find((user) => String(user.profile?.sbId || "").trim().toLowerCase() === normalized) || null;
    }
    return this.local.read((db) =>
      Object.values(db.users || {}).find((user) => String(user.profile?.sbId || "").trim().toLowerCase() === normalized) || null
    );
  }

  async getUser(userId) {
    if (this.dynamo) return this.dynamo.get(`USER#${userId}`, "PROFILE");
    return this.local.read((db) => db.users[userId] || null);
  }

  async createUser(user, invite = null) {
    const record = { ...user, createdAt: now(), updatedAt: now(), preferences: user.preferences || {} };
    if (this.dynamo) {
      const users = await this.listUsers();
      assertUniqueSbId(users, record);
      if (invite) {
        const existing = await this.findInviteByCode(invite.code);
        const claimed = claimInvite(existing || (invite.bootstrap ? invite : null), record.id);
        try {
          await this.dynamo.transactPut([
            { pk: `INVITE#${invite.code}`, sk: "META", type: "invite", data: claimed, ...(existing ? { expectedData: existing } : { createOnly: true }) },
            { pk: `USER#${record.id}`, sk: "PROFILE", type: "user", data: record, createOnly: true },
            { pk: `EMAIL#${record.email}`, sk: "USER", type: "email", data: { userId: record.id }, createOnly: true }
          ]);
        } catch (error) {
          if (error.code === "TransactionCanceledException") {
            const inviteConflict = error.cancellationReasons?.[0]?.Code === "ConditionalCheckFailed";
            throw Object.assign(new Error(inviteConflict ? "Invitation code is no longer available." : "Registration conflicted with another request. Please try again."), { statusCode: inviteConflict ? 403 : 409 });
          }
          throw error;
        }
        return record;
      }
      await this.dynamo.put(`USER#${record.id}`, "PROFILE", "user", record);
      await this.dynamo.put(`EMAIL#${record.email}`, "USER", "email", { userId: record.id });
      return record;
    }
    return this.local.write((db) => {
      assertUniqueSbId(db.users, record);
      if (db.emailIndex[record.email]) throw Object.assign(new Error("This email is already registered."), { statusCode: 409 });
      if (invite) {
        const existing = db.invites[invite.id];
        const claimed = claimInvite(existing || (invite.bootstrap ? invite : null), record.id);
        db.invites[invite.id] = claimed;
      }
      db.users[record.id] = record;
      db.emailIndex[record.email] = record.id;
      return record;
    });
  }

  async listUsers() {
    if (this.dynamo) return this.dynamo.scanType("user");
    return this.local.read((db) =>
      Object.values(db.users).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    );
  }

  async getUserStats(userId) {
    if (this.dynamo) {
      const courses = await this.listCourses(userId);
      const perCourse = await Promise.all(
        courses.map(async (course) => {
          const [documents, messages] = await Promise.all([
            this.listDocuments(userId, course.id),
            this.listMessages(userId, course.id, 1000)
          ]);
          return { documents: documents.length, messages: messages.length };
        })
      );
      const generalMessages = await this.listMessages(userId, general.id, 1000);
      return {
        courses: courses.length,
        documents: perCourse.reduce((total, item) => total + item.documents, 0),
        messages: generalMessages.length + perCourse.reduce((total, item) => total + item.messages, 0)
      };
    }
    return this.local.read((db) => ({
      courses: Object.values(db.courses).filter((item) => item.userId === userId).length,
      documents: Object.values(db.documents).filter((item) => item.userId === userId).length,
      messages: Object.values(db.messages).filter((item) => item.userId === userId).length
    }));
  }

  async createInvite(invite) {
    const record = {
      ...invite,
      maxUses: 1,
      role: inviteRole(invite),
      uses: 0,
      active: invite.active !== false,
      createdAt: now(),
      updatedAt: now()
    };
    if (this.dynamo) {
      await this.dynamo.put(`INVITE#${record.code}`, "META", "invite", record);
      return record;
    }
    return this.local.write((db) => {
      db.invites[record.id] = record;
      return record;
    });
  }

  async listInvites() {
    if (this.dynamo) return this.dynamo.scanType("invite");
    return this.local.read((db) =>
      Object.values(db.invites || {}).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    );
  }

  async findInviteByCode(code) {
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return null;
    if (this.dynamo) return this.dynamo.get(`INVITE#${normalized}`, "META");
    return this.local.read((db) => Object.values(db.invites || {}).find((invite) => invite.code === normalized) || null);
  }

  async updateInvite(inviteId, patch) {
    if (this.dynamo) {
      const invites = await this.listInvites();
      const existing = invites.find((invite) => invite.id === inviteId);
      if (!existing) return null;
      const updated = { ...existing, ...patch, maxUses: 1, updatedAt: now() };
      try {
        await this.dynamo.transactPut([{ pk: `INVITE#${updated.code}`, sk: "META", type: "invite", data: updated, expectedData: existing }]);
      } catch (error) {
        if (error.code === "TransactionCanceledException") throw Object.assign(new Error("Invitation changed. Please refresh and try again."), { statusCode: 409 });
        throw error;
      }
      return updated;
    }
    return this.local.write((db) => {
      const existing = db.invites?.[inviteId];
      if (!existing) return null;
      db.invites[inviteId] = { ...existing, ...patch, maxUses: 1, updatedAt: now() };
      return db.invites[inviteId];
    });
  }

  async deleteInvite(inviteId) {
    if (this.dynamo) {
      const existing = (await this.listInvites()).find((invite) => invite.id === inviteId);
      if (!existing || existing.kind === "passwordReset") return null;
      await this.dynamo.delete(`INVITE#${existing.code}`, "META");
      return existing;
    }
    return this.local.write((db) => {
      const existing = db.invites?.[inviteId];
      if (!existing || existing.kind === "passwordReset") return null;
      delete db.invites[inviteId];
      return existing;
    });
  }

  async createAuthCode(record) {
    const next = { ...record, createdAt: record.createdAt || now(), updatedAt: now() };
    if (this.dynamo) return this.dynamo.put(`AUTH#${next.email}`, next.purpose, "authCode", next);
    return this.local.write((db) => {
      db.authCodes ||= {};
      db.authCodes[authCodeKey(next.email, next.purpose)] = next;
      return next;
    });
  }

  async getAuthCode(email, purpose) {
    if (this.dynamo) return this.dynamo.get(`AUTH#${email}`, purpose);
    return this.local.read((db) => db.authCodes?.[authCodeKey(email, purpose)] || null);
  }

  async deleteAuthCode(email, purpose) {
    if (this.dynamo) return this.dynamo.delete(`AUTH#${email}`, purpose);
    return this.local.write((db) => {
      if (db.authCodes) delete db.authCodes[authCodeKey(email, purpose)];
    });
  }

  async updateUser(userId, patch) {
    const existing = await this.getUser(userId);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: now() };
    if (this.dynamo) {
      const users = await this.listUsers();
      assertUniqueSbId(users, updated);
      return this.dynamo.put(`USER#${userId}`, "PROFILE", "user", updated);
    }
    return this.local.write((db) => {
      assertUniqueSbId(db.users, updated);
      db.users[userId] = updated;
      return updated;
    });
  }

  async createSession(session) {
    const record = { ...session, createdAt: now() };
    if (this.dynamo) await this.dynamo.put(`SESSION#${record.tokenHash}`, "META", "session", record);
    else await this.local.write((db) => { db.sessions[record.tokenHash] = record; });
    await this.recordUserActivity(record.userId).catch(() => console.warn("Unable to record login activity."));
    return record;
  }

  async recordUserActivity(userId, timestamp = Date.now()) {
    const record = { userId, lastSeenAt: new Date(timestamp).toISOString() };
    const needsUpdate = (existing) => !Number.isFinite(Date.parse(existing?.lastSeenAt)) || timestamp - Date.parse(existing.lastSeenAt) >= 60000;
    if (this.dynamo) {
      const existing = await this.dynamo.get(`USER#${userId}`, "ACTIVITY");
      if (!needsUpdate(existing)) return existing;
      // Keep presence separate from profiles, and reject stale concurrent heartbeats.
      try {
        await this.dynamo.transactPut([{ pk: `USER#${userId}`, sk: "ACTIVITY", type: "userActivity", data: record,
          ...(existing ? { expectedData: existing } : { createOnly: true }) }]);
      } catch (error) {
        if (error.code !== "TransactionCanceledException" || error.cancellationReasons?.[0]?.Code !== "ConditionalCheckFailed") throw error;
        return this.dynamo.get(`USER#${userId}`, "ACTIVITY");
      }
      return record;
    }
    const existing = await this.local.read((db) => db.userActivity?.[userId]);
    if (!needsUpdate(existing)) return existing;
    return this.local.write((db) => {
      db.userActivity ||= {};
      if (needsUpdate(db.userActivity[userId])) db.userActivity[userId] = record;
      return db.userActivity[userId];
    });
  }

  async listUserActivity() {
    if (this.dynamo) return this.dynamo.scanType("userActivity");
    return this.local.read((db) => Object.values(db.userActivity || {}));
  }

  async getSession(tokenHash) {
    if (this.dynamo) return this.dynamo.get(`SESSION#${tokenHash}`, "META");
    return this.local.read((db) => db.sessions[tokenHash] || null);
  }

  async deleteSession(tokenHash) {
    if (this.dynamo) return this.dynamo.delete(`SESSION#${tokenHash}`, "META");
    return this.local.write((db) => {
      delete db.sessions[tokenHash];
    });
  }

  async listCourses(userId) {
    if (this.dynamo) return (await this.dynamo.query(`USER#${userId}`, "COURSE#")).filter((item) => !item.kind);
    return this.local.read((db) =>
      Object.values(db.courses)
        .filter((course) => course.userId === userId)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    );
  }

  async createCourse(course) {
    const record = { ...course, createdAt: now(), updatedAt: now() };
    if (this.dynamo) return this.dynamo.put(`USER#${record.userId}`, `COURSE#${record.id}`, "course", record);
    return this.local.write((db) => {
      db.courses[record.id] = record;
      return record;
    });
  }

  async getCourse(userId, courseId) {
    if (this.dynamo) return this.dynamo.get(`USER#${userId}`, `COURSE#${courseId}`);
    return this.local.read((db) => {
      const course = db.courses[courseId];
      return course?.userId === userId ? course : null;
    });
  }

  async deleteCourse(userId, courseId) {
    await this.deleteMaterials(userId, courseId);
    if (this.dynamo) {
      const items = await this.dynamo.query(`USER#${userId}`, `COURSE#${courseId}`);
      await Promise.all([
        this.dynamo.delete(`USER#${userId}`, `COURSE#${courseId}`),
        ...items.map((item) => {
          if (item.id === courseId) return null;
          const sk = item.kind === "message" ? `COURSE#${courseId}#MSG#${item.createdAt}#${item.id}` : `COURSE#${courseId}#DOC#${item.id}`;
          return this.dynamo.delete(`USER#${userId}`, sk);
        }).filter(Boolean)
      ]);
      return;
    }
    return this.local.write((db) => {
      delete db.courses[courseId];
      Object.keys(db.documents).forEach((id) => {
        if (db.documents[id].courseId === courseId && db.documents[id].userId === userId) delete db.documents[id];
      });
      Object.keys(db.messages).forEach((id) => {
        if (db.messages[id].courseId === courseId && db.messages[id].userId === userId) delete db.messages[id];
      });
    });
  }

  async listDocuments(userId, courseId) {
    if (this.dynamo) {
      const documents = await this.dynamo.query(`USER#${userId}`, `COURSE#${courseId}#DOC#`);
      return Promise.all(documents.map(async (doc) => doc.materialStored
        ? { ...doc, text: (await this.readMaterial(userId, courseId, `DOC#${doc.id}`)).text }
        : doc));
    }
    return this.local.read((db) =>
      Object.values(db.documents)
        .filter((doc) => doc.userId === userId && doc.courseId === courseId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    );
  }

  async createDocument(document) {
    const record = { ...document, kind: "document", createdAt: now(), updatedAt: now() };
    if (this.dynamo) {
      const stored = await this.documentRecord(record);
      await this.dynamo.put(
        `USER#${record.userId}`,
        `COURSE#${record.courseId}#DOC#${record.id}`,
        "document",
        stored
      );
      return record;
    }
    return this.local.write((db) => {
      db.documents[record.id] = record;
      return record;
    });
  }

  async updateDocument(userId, courseId, documentId, patch) {
    const existing = this.dynamo
      ? await this.dynamo.get(`USER#${userId}`, `COURSE#${courseId}#DOC#${documentId}`)
      : await this.local.read((db) => db.documents[documentId] || null);
    if (!existing || existing.userId !== userId || existing.courseId !== courseId) return null;
    if (existing.materialStored && patch.text === undefined) existing.text = (await this.readMaterial(userId, courseId, `DOC#${documentId}`)).text;
    const updated = { ...existing, ...patch, id: documentId, userId, courseId, kind: "document", updatedAt: now() };
    if (this.dynamo) {
      const stored = await this.documentRecord(updated);
      await this.dynamo.put(
        `USER#${userId}`,
        `COURSE#${courseId}#DOC#${documentId}`,
        "document",
        stored
      );
      return updated;
    }
    return this.local.write((db) => {
      db.documents[documentId] = updated;
      return updated;
    });
  }

  async deleteDocument(userId, courseId, documentId) {
    await this.deleteMaterials(userId, courseId, `DOC#${documentId}#`);
    if (this.dynamo) return this.dynamo.delete(`USER#${userId}`, `COURSE#${courseId}#DOC#${documentId}`);
    return this.local.write((db) => {
      if (db.documents[documentId]?.userId === userId) delete db.documents[documentId];
    });
  }

  async documentRecord(record) {
    if (Buffer.byteLength(record.text || "", "utf8") < 60000) return { ...record, materialStored: false };
    await this.writeMaterial(record.userId, record.courseId, `DOC#${record.id}`, { text: record.text });
    return { ...record, text: "", materialStored: true };
  }

  async writeMaterial(userId, courseId, id, value) {
    if (!this.dynamo) return this.local.write((state) => {
      state.materials ||= {};
      state.materials[`${userId}#${courseId}#${id}`] = { userId, courseId, id, value };
    });
    const serialized = JSON.stringify(value);
    const revision = require("crypto").randomUUID();
    const parts = [];
    // 60k UTF-16 units remain below DynamoDB's item limit even with escaping.
    for (let offset = 0; offset < serialized.length; offset += 60000) parts.push(serialized.slice(offset, offset + 60000));
    for (let index = 0; index < parts.length; index++) {
      const sk = `${id}#PART#${revision}#${String(index).padStart(6, "0")}`;
      await this.dynamo.put(`MATERIAL#${userId}#${courseId}`, sk, "materialPart", { sk, index, text: parts[index] });
    }
    // Publish the manifest only after every part is durable.
    const sk = `${id}#META`;
    await this.dynamo.put(`MATERIAL#${userId}#${courseId}`, sk, "material", { sk, id, revision, count: parts.length });
  }

  async readMaterial(userId, courseId, id) {
    if (!this.dynamo) return this.local.read((state) => state.materials?.[`${userId}#${courseId}#${id}`]?.value || null);
    const pk = `MATERIAL#${userId}#${courseId}`;
    const manifest = await this.dynamo.get(pk, `${id}#META`);
    if (!manifest) throw new Error("Saved material is missing. Please upload it again.");
    const parts = await this.dynamo.query(pk, `${id}#PART#${manifest.revision}#`);
    return decodeMaterial(manifest, parts);
  }

  async saveChatAttachments(userId, courseId, messageId, attachments) {
    if (!attachments.length) return;
    await this.writeMaterial(userId, courseId, `CHAT#${now()}#${messageId}`, attachments);
  }

  async listChatAttachments(userId, courseId) {
    if (!this.dynamo) return this.local.read((state) => Object.values(state.materials || {})
      .filter((item) => item.userId === userId && item.courseId === courseId && item.id.startsWith("CHAT#"))
      .sort((a, b) => a.id.localeCompare(b.id)).flatMap((item) => item.value));
    const rows = await this.dynamo.query(`MATERIAL#${userId}#${courseId}`, "CHAT#");
    const manifests = rows.filter((item) => item.sk.endsWith("#META")).sort((a, b) => a.id.localeCompare(b.id));
    const values = manifests.map((item) => decodeMaterial(item, rows.filter((part) => part.sk.startsWith(`${item.id}#PART#${item.revision}#`))));
    return values.flat();
  }

  async deleteMaterials(userId, courseId, prefix = "") {
    if (this.dynamo) {
      const pk = `MATERIAL#${userId}#${courseId}`;
      const rows = await this.dynamo.query(pk, prefix);
      for (const row of rows) await this.dynamo.delete(pk, row.sk);
      return;
    }
    return this.local.write((state) => {
      for (const [key, item] of Object.entries(state.materials || {})) {
        if (item.userId === userId && item.courseId === courseId && (!prefix || item.id === prefix.replace(/#$/, "") || item.id.startsWith(prefix))) delete state.materials[key];
      }
    });
  }

  async listMessages(userId, courseId, limit = 80) {
    if (this.dynamo) {
      const rows = await this.dynamo.query(`USER#${userId}`, `COURSE#${courseId}#MSG#`);
      return rows.slice(-limit);
    }
    return this.local.read((db) =>
      Object.values(db.messages)
        .filter((message) => message.userId === userId && message.courseId === courseId)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(-limit)
    );
  }

  async listCommunityPosts(channelKey, limit = 80) {
    if (this.dynamo) {
      if (channelKey === "all") {
        return (await this.dynamo.scanType("communityPost"))
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(0, limit);
      }
      const rows = await this.dynamo.query(`COMMUNITY#${channelKey}`, "POST#");
      return rows
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit);
    }
    return this.local.read((db) =>
      Object.values(db.communityPosts || {})
        .filter((post) => channelKey === "all" || (post.channelKey || post.schoolKey) === channelKey)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit)
    );
  }

  async createCommunityPost(post) {
    const record = {
      ...post,
      kind: "communityPost",
      likes: [],
      likeCount: 0,
      createdAt: now(),
      updatedAt: now()
    };
    if (this.dynamo) {
      return this.dynamo.put(
        `COMMUNITY#${record.channelKey || record.schoolKey}`,
        `POST#${record.createdAt}#${record.id}`,
        "communityPost",
        record
      );
    }
    return this.local.write((db) => {
      db.communityPosts ||= {};
      db.communityPosts[record.id] = record;
      return record;
    });
  }

  async toggleCommunityPostLike(channelKey, postId, userId) {
    if (this.dynamo) {
      const posts = await this.listCommunityPosts(channelKey, 500);
      const existing = posts.find((post) => post.id === postId);
      if (!existing) return null;
      const likes = new Set(existing.likes || []);
      if (likes.has(userId)) likes.delete(userId);
      else likes.add(userId);
      const updated = { ...existing, likes: [...likes], likeCount: likes.size, updatedAt: now() };
      await this.dynamo.put(
        `COMMUNITY#${updated.schoolKey}`,
        `POST#${updated.createdAt}#${updated.id}`,
        "communityPost",
        updated
      );
      return updated;
    }
    return this.local.write((db) => {
      db.communityPosts ||= {};
      const existing = db.communityPosts[postId];
      if (!existing || (existing.channelKey || existing.schoolKey) !== channelKey) return null;
      const likes = new Set(existing.likes || []);
      if (likes.has(userId)) likes.delete(userId);
      else likes.add(userId);
      db.communityPosts[postId] = { ...existing, likes: [...likes], likeCount: likes.size, updatedAt: now() };
      return db.communityPosts[postId];
    });
  }

  async listClassmates(userId) {
    if (this.dynamo) {
      const rows = await this.dynamo.scanType("classmate");
      return rows
        .filter((item) => Array.isArray(item.userIds) && item.userIds.includes(userId))
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    }
    return this.local.read((db) =>
      Object.values(db.classmates || {})
        .filter((item) => Array.isArray(item.userIds) && item.userIds.includes(userId))
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    );
  }

  async getClassmate(userId, classmateId) {
    if (this.dynamo) {
      const row = await this.dynamo.get(`CLASSMATE#${classmateId}`, "META");
      return row?.userIds?.includes(userId) ? row : null;
    }
    return this.local.read((db) => {
      const row = db.classmates?.[classmateId];
      return row?.userIds?.includes(userId) ? row : null;
    });
  }

  async findClassmateByUsers(userId, peerId) {
    const [a, b] = [userId, peerId].sort();
    if (this.dynamo) {
      const rows = await this.dynamo.scanType("classmate");
      return rows.find((item) => item.userIds?.[0] === a && item.userIds?.[1] === b) || null;
    }
    return this.local.read((db) =>
      Object.values(db.classmates || {}).find((item) => item.userIds?.[0] === a && item.userIds?.[1] === b) || null
    );
  }

  async createClassmate(connection) {
    const record = {
      ...connection,
      userIds: [...connection.userIds].sort(),
      kind: "classmate",
      createdAt: now(),
      updatedAt: now()
    };
    if (this.dynamo) return this.dynamo.put(`CLASSMATE#${record.id}`, "META", "classmate", record);
    return this.local.write((db) => {
      db.classmates ||= {};
      db.classmates[record.id] = record;
      return record;
    });
  }

  async listClassmateRequests(userId) {
    if (this.dynamo) {
      const rows = await this.dynamo.scanType("classmateRequest");
      return rows
        .filter((item) => item.fromUserId === userId || item.toUserId === userId)
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    }
    return this.local.read((db) =>
      Object.values(db.classmateRequests || {})
        .filter((item) => item.fromUserId === userId || item.toUserId === userId)
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    );
  }

  async findClassmateRequestByUsers(fromUserId, toUserId) {
    if (this.dynamo) {
      const rows = await this.dynamo.scanType("classmateRequest");
      return rows.find((item) => item.fromUserId === fromUserId && item.toUserId === toUserId && (item.status || "pending") === "pending") || null;
    }
    return this.local.read((db) =>
      Object.values(db.classmateRequests || {}).find(
        (item) => item.fromUserId === fromUserId && item.toUserId === toUserId && (item.status || "pending") === "pending"
      ) || null
    );
  }

  async createClassmateRequest(request) {
    const record = { ...request, kind: "classmateRequest", status: request.status || "pending", createdAt: now(), updatedAt: now() };
    if (this.dynamo) return this.dynamo.put(`CLASSMATE_REQUEST#${record.id}`, "META", "classmateRequest", record);
    return this.local.write((db) => {
      db.classmateRequests ||= {};
      db.classmateRequests[record.id] = record;
      return record;
    });
  }

  async getClassmateRequest(userId, requestId) {
    if (this.dynamo) {
      const row = await this.dynamo.get(`CLASSMATE_REQUEST#${requestId}`, "META");
      return row?.fromUserId === userId || row?.toUserId === userId ? row : null;
    }
    return this.local.read((db) => {
      const row = db.classmateRequests?.[requestId];
      return row?.fromUserId === userId || row?.toUserId === userId ? row : null;
    });
  }

  async updateClassmateRequest(requestId, patch) {
    if (this.dynamo) {
      const rows = await this.dynamo.scanType("classmateRequest");
      const existing = rows.find((item) => item.id === requestId);
      if (!existing) return null;
      const updated = { ...existing, ...patch, updatedAt: now() };
      await this.dynamo.put(`CLASSMATE_REQUEST#${updated.id}`, "META", "classmateRequest", updated);
      return updated;
    }
    return this.local.write((db) => {
      const existing = db.classmateRequests?.[requestId];
      if (!existing) return null;
      db.classmateRequests[requestId] = { ...existing, ...patch, updatedAt: now() };
      return db.classmateRequests[requestId];
    });
  }

  async listDirectMessages(chatId, limit = 80) {
    if (this.dynamo) {
      const rows = await this.dynamo.query(`DM#${chatId}`, "MSG#");
      return rows
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(-limit);
    }
    return this.local.read((db) =>
      Object.values(db.directMessages || {})
        .filter((message) => message.chatId === chatId)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(-limit)
    );
  }

  async createDirectMessage(message) {
    const record = { ...message, kind: "directMessage", createdAt: now() };
    if (this.dynamo) {
      return this.dynamo.put(`DM#${record.chatId}`, `MSG#${record.createdAt}#${record.id}`, "directMessage", record);
    }
    return this.local.write((db) => {
      db.directMessages ||= {};
      db.directMessages[record.id] = record;
      return record;
    });
  }

  async markDirectMessagesRead(chatId, userId, messageIds) {
    const ids = new Set(messageIds);
    const readable = (message) => message.chatId === chatId && message.senderId !== userId && ids.has(message.id) && !message.readAt;
    if (this.dynamo) {
      const messages = (await this.listDirectMessages(chatId, Infinity)).filter(readable);
      for (let offset = 0; offset < messages.length; offset += 20) {
        await Promise.all(messages.slice(offset, offset + 20).map((message) =>
          this.dynamo.put(`DM#${chatId}`, `MSG#${message.createdAt}#${message.id}`, "directMessage", { ...message, readAt: now() })
        ));
      }
      return messages.length;
    }
    return this.local.write((db) => {
      let count = 0;
      for (const message of Object.values(db.directMessages || {})) {
        if (!readable(message)) continue;
        message.readAt = now();
        count += 1;
      }
      return count;
    });
  }

  async createMessage(message) {
    const record = { ...message, kind: "message", createdAt: now() };
    if (this.dynamo) {
      return this.dynamo.put(
        `USER#${record.userId}`,
        `COURSE#${record.courseId}#MSG#${record.createdAt}#${record.id}`,
        "message",
        record
      );
    }
    return this.local.write((db) => {
      db.messages[record.id] = record;
      return record;
    });
  }

  async saveCreativeJob(record) {
    if (this.dynamo) return this.dynamo.put(`USER#${record.userId}`, `CREATIVE#${record.id}`, "creativeJob", record);
    return this.local.write((state) => {
      state.creativeJobs ||= {};
      state.creativeJobs[record.id] = record;
      return record;
    });
  }

  async claimCreativeQuota(userId) {
    const timestamp = Date.now();
    const next = (existing) => {
      const timestamps = (existing?.timestamps || []).filter((value) => timestamp - value < 3600000);
      if (timestamps.length >= 10) throw Object.assign(new Error("每小时最多提交 10 个生成任务。"), { statusCode: 429 });
      return { userId, timestamps: [...timestamps, timestamp] };
    };
    if (!this.dynamo) return this.local.write((state) => {
      state.creativeQuota ||= {};
      state.creativeQuota[userId] = next(state.creativeQuota[userId]);
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.dynamo.get(`USER#${userId}`, "CREATIVE_QUOTA");
      const record = next(existing);
      try {
        await this.dynamo.transactPut([{ pk: `USER#${userId}`, sk: "CREATIVE_QUOTA", type: "creativeQuota", data: record, ...(existing ? { expectedData: existing } : { createOnly: true }) }]);
        return;
      } catch (error) {
        if (error.code !== "TransactionCanceledException" || error.cancellationReasons?.[0]?.Code !== "ConditionalCheckFailed") throw error;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }
    throw Object.assign(new Error("生成请求较多，请稍后再试。"), { statusCode: 429 });
  }

  async getCreativeJob(userId, id) {
    if (this.dynamo) return this.dynamo.get(`USER#${userId}`, `CREATIVE#${id}`);
    return this.local.read((state) => {
      const record = state.creativeJobs?.[id];
      return record?.userId === userId ? record : null;
    });
  }

  async listCreativeJobs(userId) {
    const records = this.dynamo ? await this.dynamo.query(`USER#${userId}`, "CREATIVE#")
      : await this.local.read((state) => Object.values(state.creativeJobs || {}).filter((record) => record.userId === userId));
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  }

  async deleteCreativeJob(userId, id) {
    await this.deleteCreativeFiles(userId, id);
    if (this.dynamo) return this.dynamo.delete(`USER#${userId}`, `CREATIVE#${id}`);
    return this.local.write((state) => { if (state.creativeJobs?.[id]?.userId === userId) delete state.creativeJobs[id]; });
  }

  creativeFileDirectory(userId, jobId) {
    if (!/^[\w-]{1,100}$/.test(jobId)) throw new Error("Invalid creative job ID.");
    const owner = require("node:crypto").createHash("sha256").update(String(userId)).digest("hex");
    const root = path.resolve(path.dirname(this.local.file), "creative-files");
    const directory = path.resolve(root, owner, jobId);
    if (!directory.startsWith(root + path.sep)) throw new Error("Invalid creative file path.");
    return directory;
  }

  async saveCreativeFile(userId, jobId, fileId, bytes) {
    if (!/^[\w-]{1,100}$/.test(fileId)) throw new Error("Invalid creative file ID.");
    if (this.dynamo) return this.writeMaterial(userId, "_creative", `${jobId}#${fileId}`, { base64: bytes.toString("base64") });
    const directory = this.creativeFileDirectory(userId, jobId);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(directory, fileId), bytes, { mode: 0o600 });
  }

  async readCreativeFile(userId, jobId, fileId) {
    if (!/^[\w-]{1,100}$/.test(fileId)) throw new Error("Invalid creative file ID.");
    if (this.dynamo) {
      const material = await this.readMaterial(userId, "_creative", `${jobId}#${fileId}`);
      return material?.base64 ? Buffer.from(material.base64, "base64") : null;
    }
    try { return await fs.readFile(path.join(this.creativeFileDirectory(userId, jobId), fileId)); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      const legacy = await this.readMaterial(userId, "_creative", `${jobId}#${fileId}`);
      return legacy?.base64 ? Buffer.from(legacy.base64, "base64") : null;
    }
  }

  async deleteCreativeFiles(userId, jobId) {
    if (this.dynamo) return this.deleteMaterials(userId, "_creative", `${jobId}#`);
    // The resolved directory is checked against the private storage root before removal.
    await fs.rm(this.creativeFileDirectory(userId, jobId), { recursive: true, force: true });
    await this.deleteMaterials(userId, "_creative", `${jobId}#`);
  }
}

module.exports = { StudyBridgeDatabase };
