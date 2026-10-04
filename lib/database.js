const fs = require("fs/promises");
const path = require("path");
const { DynamoStore } = require("./aws-dynamodb");

function now() {
  return new Date().toISOString();
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
        messages: {}
      };
    }
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
      await this.dynamo.delete(`USER#${userId}`, `COURSE#${courseId}`);
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
