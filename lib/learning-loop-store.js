"use strict";
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const stateKey = (userId, courseId) => JSON.stringify([userId, courseId]);
const quizKey = (userId, courseId, id) => JSON.stringify([userId, courseId, id]);
const empty = () => ({ version: 0, topics: [], draft: null, recent: [], prompts: true, snoozedUntil: "" });
const copy = (value) => JSON.parse(JSON.stringify(value));

module.exports = {
  async getLearningState(userId, courseId) {
    return (this.dynamo ? await this.dynamo.get(`USER#${userId}`, `COURSE#${courseId}#LEARNING`, { consistent: true })
      : await this.local.read((db) => db.learningStates?.[stateKey(userId, courseId)])) || empty();
  },
  async getLearningQuiz(userId, courseId, id) {
    return this.dynamo ? this.dynamo.get(`USER#${userId}`, `COURSE#${courseId}#QUIZ#${id}`, { consistent: true })
      : this.local.read((db) => db.learningQuizzes?.[quizKey(userId, courseId, id)] || null);
  },
  // A grade, its topic evidence, and completion of its linked calendar task commit together.
  async mutateLearning(userId, courseId, quizId, mutate, sourceGuards = []) {
    const guards = [...new Map(sourceGuards.map((ref) => [ref.documentId, ref])).values()];
    const guard = (documents) => {
      for (let index = 0; index < guards.length; index++) {
        const item = documents[index], ref = guards[index];
        if (!item || item.userId !== userId || item.courseId !== courseId || item.updatedAt !== ref.updatedAt) throw fail(409, "课程资料已更新，请重新整理这个主题的资料出处。");
        if (!item.materialStored && require("./study-index").revision({ name: item.title, text: item.text, sourcePages: item.sourcePages }) !== ref.revision) throw fail(409, "课程资料已更新，请重新整理这个主题的资料出处。");
      }
    };
    const prepare = (previous, quiz, course, document) => {
      if (!course || course.userId !== userId) throw fail(404, "课程不存在。");
      const result = mutate(copy(previous || empty()), copy(quiz), copy(document));
      if (!result) return null;
      result.state = { ...result.state, userId, courseId, kind: "learningState", version: (previous?.version || 0) + 1 };
      if (Buffer.byteLength(JSON.stringify(result.state)) > 240000 || result.quiz && Buffer.byteLength(JSON.stringify(result.quiz)) > 100000) throw fail(400, "学习记录过长，请减少学习主题或题目内容。");
      return result;
    };
    if (!this.dynamo) return this.local.write((db) => {
      guard(guards.map((ref) => db.documents[ref.documentId]));
      const quiz = quizId ? db.learningQuizzes?.[quizKey(userId, courseId, quizId)] || null : null;
      const document = quiz?.taskId ? db.documents[quiz.taskId] || null : null;
      const result = prepare(db.learningStates?.[stateKey(userId, courseId)], quiz, db.courses[courseId], document);
      if (!result) return null;
      db.learningStates ||= {}; db.learningQuizzes ||= {};
      db.learningStates[stateKey(userId, courseId)] = result.state;
      if (result.quiz) db.learningQuizzes[quizKey(userId, courseId, result.quiz.id)] = result.quiz;
      if (result.document && db.documents[result.document.id] && result.document.id !== document?.id) throw fail(409, "这个复习安排已保存，请刷新日程。");
      if (result.document) db.documents[result.document.id] = result.document;
      return result;
    });
    const pk = `USER#${userId}`, stateSk = `COURSE#${courseId}#LEARNING`, quizSk = `COURSE#${courseId}#QUIZ#${quizId}`;
    for (let attempt = 0; attempt < 6; attempt++) {
      const [previous, quiz, course] = await Promise.all([this.dynamo.get(pk, stateSk, { consistent: true }),
        quizId ? this.dynamo.get(pk, quizSk, { consistent: true }) : null,
        this.dynamo.get(pk, `COURSE#${courseId}`, { consistent: true })]);
      const document = quiz?.taskId ? await this.dynamo.get(pk, `COURSE#${courseId}#DOC#${quiz.taskId}`, { consistent: true }) : null;
      const sourceRecords = await Promise.all(guards.map((ref) => this.dynamo.get(pk, `COURSE#${courseId}#DOC#${ref.documentId}`, { consistent: true })));
      guard(sourceRecords);
      const result = prepare(previous, quiz, course, document);
      if (!result) return null;
      const writes = [{ pk, sk: stateSk, type: "learningState", data: result.state, ...(previous ? { expectedData: previous } : { createOnly: true }) },
        { pk, sk: `COURSE#${courseId}`, type: "course", data: course, expectedData: course, checkOnly: true }];
      sourceRecords.forEach((source) => writes.push({ pk, sk: `COURSE#${courseId}#DOC#${source.id}`, type: "document", data: source, expectedData: source, checkOnly: true }));
      if (result.quiz) writes.push({ pk, sk: `COURSE#${courseId}#QUIZ#${result.quiz.id}`, type: "learningQuiz", data: result.quiz, ...(quiz ? { expectedData: quiz } : { createOnly: true }) });
      if (result.document) writes.push({ pk, sk: `COURSE#${courseId}#DOC#${result.document.id}`, type: "document", data: result.document,
        ...(document ? { expectedData: document } : { createOnly: true }) });
      try { await this.dynamo.transactPut(writes); return result; }
      catch (error) { if (!["TransactionCanceledException", "ConditionalCheckFailedException", "TransactionConflictException"].includes(error.code)) throw error; }
    }
    throw fail(409, "学习记录已更新，请刷新后重试。");
  }
};
