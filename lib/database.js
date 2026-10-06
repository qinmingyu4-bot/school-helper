const fs = require("fs/promises");
const path = require("path");
const { DynamoStore } = require("./aws-dynamodb");

function now() {
  return new Date().toISOString();
}

function authCodeKey(email, purpose) {
  return `${purpose}:${email}`;
}

function inviteRole(invite = {}) {
  const requested = String(invite.role || "").toLowerCase();
  const label = String(invite.label || "");
  return requested === "admin" || requested === "co-admin" || /^\s*\[co-admin\]/i.test(label) ? "admin" : "student";
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
    } catch {
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
    await fs.writeFile(this.file, JSON.stringify(this.state, null, 2));
  }

  async write(mutator) {
    this.pending = this.pending.then(async () => {
      await this.load();
      const result = await mutator(this.state);
      await this.save();
      return result;
    });
    return this.pending;
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

  async createUser(user) {
    const record = { ...user, createdAt: now(), updatedAt: now(), preferences: user.preferences || {} };
    if (this.dynamo) {
      await this.dynamo.put(`USER#${record.id}`, "PROFILE", "user", record);
      await this.dynamo.put(`EMAIL#${record.email}`, "USER", "email", { userId: record.id });
      return record;
    }
    return this.local.write((db) => {
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
      return {
        courses: courses.length,
        documents: perCourse.reduce((total, item) => total + item.documents, 0),
        messages: perCourse.reduce((total, item) => total + item.messages, 0)
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
      const updated = { ...existing, ...patch, updatedAt: now() };
      await this.dynamo.put(`INVITE#${updated.code}`, "META", "invite", updated);
      return updated;
    }
    return this.local.write((db) => {
      const existing = db.invites?.[inviteId];
      if (!existing) return null;
      db.invites[inviteId] = { ...existing, ...patch, updatedAt: now() };
      return db.invites[inviteId];
    });
  }

  async consumeInvite(inviteId, userId) {
    if (this.dynamo) {
      const invites = await this.listInvites();
      const existing = invites.find((invite) => invite.id === inviteId);
      if (!existing) return null;
      const usedBy = [...(existing.usedBy || []), { userId, usedAt: now() }];
      const updated = { ...existing, uses: Number(existing.uses || 0) + 1, usedBy, updatedAt: now() };
      await this.dynamo.put(`INVITE#${updated.code}`, "META", "invite", updated);
      if (existing.role === "admin") {
        const user = await this.getUser(userId);
        if (user) await this.dynamo.put(`USER#${userId}`, "PROFILE", "user", { ...user, role: "admin", updatedAt: now() });
      }
      return updated;
    }
    return this.local.write((db) => {
      const existing = db.invites?.[inviteId];
      if (!existing) return null;
      existing.uses = Number(existing.uses || 0) + 1;
      existing.usedBy = [...(existing.usedBy || []), { userId, usedAt: now() }];
      existing.updatedAt = now();
      if (existing.role === "admin" && db.users[userId]) {
        db.users[userId] = { ...db.users[userId], role: "admin", updatedAt: now() };
      }
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
    if (this.dynamo) return this.dynamo.put(`USER#${userId}`, "PROFILE", "user", updated);
    return this.local.write((db) => {
      db.users[userId] = updated;
      return updated;
    });
  }

  async createSession(session) {
    const record = { ...session, createdAt: now() };
    if (this.dynamo) return this.dynamo.put(`SESSION#${record.tokenHash}`, "META", "session", record);
    return this.local.write((db) => {
      db.sessions[record.tokenHash] = record;
      return record;
    });
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
    if (this.dynamo) return this.dynamo.query(`USER#${userId}`, "COURSE#");
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
    if (this.dynamo) return this.dynamo.query(`USER#${userId}`, `COURSE#${courseId}#DOC#`);
    return this.local.read((db) =>
      Object.values(db.documents)
        .filter((doc) => doc.userId === userId && doc.courseId === courseId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    );
  }

  async createDocument(document) {
    const record = { ...document, kind: "document", createdAt: now(), updatedAt: now() };
    if (this.dynamo) {
      return this.dynamo.put(
        `USER#${record.userId}`,
        `COURSE#${record.courseId}#DOC#${record.id}`,
        "document",
        record
      );
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
    const updated = { ...existing, ...patch, id: documentId, userId, courseId, kind: "document", updatedAt: now() };
    if (this.dynamo) {
      return this.dynamo.put(
        `USER#${userId}`,
        `COURSE#${courseId}#DOC#${documentId}`,
        "document",
        updated
      );
    }
    return this.local.write((db) => {
      db.documents[documentId] = updated;
      return updated;
    });
  }

  async deleteDocument(userId, courseId, documentId) {
    if (this.dynamo) return this.dynamo.delete(`USER#${userId}`, `COURSE#${courseId}#DOC#${documentId}`);
    return this.local.write((db) => {
      if (db.documents[documentId]?.userId === userId) delete db.documents[documentId];
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
}

module.exports = { StudyBridgeDatabase };
