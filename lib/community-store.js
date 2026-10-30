const { setTimeout: delay } = require("node:timers/promises");
const now = () => new Date().toISOString();
const key = (row) => `${row.createdAt}#${row.id}`;
const conflict = (error) => error.code === "TransactionCanceledException" && error.cancellationReasons?.some((reason) => reason.Code === "ConditionalCheckFailed");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const primary = (post) => ({ type: post.channelType || (post.schoolKey ? "school" : "all"), key: post.channelKey || (post.schoolKey ? `school:${post.schoolKey}` : "all"), label: post.channelLabel || post.school || "全部社区" });
function channels(post) {
  if (post.channels) return post.channels;
  const first = primary(post);
  // Existing posts retain their previous visibility in the aggregate feed.
  return first.key === "all" ? [first] : [{ type: "all", key: "all", label: "全部社区" }, first];
}
const inChannel = (post, channel) => channels(post).some((entry) => entry.key === channel || (entry.type === "school" && entry.key === `school:${channel}`));
const postRecord = (post, extra = {}) => ({ pk: `COMMUNITY_POST#${post.id}`, sk: "META", type: "communityPostV2", data: post, ...extra });
function indexRecords(post) {
  return channels(post).flatMap((channel) => [
    { pk: `COMMUNITY_FEED#${channel.key}`, sk: `POST#${key(post)}`, type: "communityFeed", data: { id: post.id, createdAt: post.createdAt, text: `${post.topic || ""}\n${post.content || ""}`.normalize("NFKC").toLowerCase() } },
    ...(channel.type === "all" ? [] : [{ pk: "COMMUNITY_CHANNELS", sk: channel.key, type: "communityChannel", data: channel }])
  ]);
}
async function mapped(rows, fn) {
  const result = [];
  for (let offset = 0; offset < rows.length; offset += 8) result.push(...await Promise.all(rows.slice(offset, offset + 8).map(fn)));
  return result;
}

module.exports = {
  communityPostChannels(post) { return channels(post); },
  // Upgrade legacy records a bounded page at a time. The persistent checkpoint
  // avoids repeated table scans after completion, including across restarts.
  async communityIndexStep() {
    if (!this.dynamo || this.communityIndexDone) return false;
    if (this.communityIndexWork) return this.communityIndexWork;
    this.communityIndexWork = (async () => {
      const checkpoint = await this.dynamo.get("COMMUNITY_INDEX", "V2", { consistent: true });
      if (checkpoint?.complete) { this.communityIndexDone = true; return false; }
      const page = await this.dynamo.scanTypePage("communityPost", checkpoint?.cursor);
      for (const old of page.rows) {
        const post = { ...old, channels: channels(old) };
        // Never resurrect a deleted post or overwrite a concurrent like.
        try { await this.dynamo.transactPut([postRecord(post, { createOnly: true }), ...indexRecords(post)]); }
        catch (error) { if (!conflict(error)) throw error; }
      }
      const next = { cursor: page.cursor, complete: !page.cursor };
      try {
        await this.dynamo.transactPut([{ pk: "COMMUNITY_INDEX", sk: "V2", type: "communityIndex", data: next,
          ...(checkpoint ? { expectedData: checkpoint } : { createOnly: true }) }]);
      } catch (error) { if (!conflict(error)) throw error; }
      this.communityIndexDone = next.complete;
      return !next.complete;
    })();
    try { return await this.communityIndexWork; } finally { this.communityIndexWork = null; }
  },

  async listCommunityChannels() {
    const entries = this.dynamo
      ? (await this.dynamo.queryPage("COMMUNITY_CHANNELS", { limit: 100 })).rows
      : await this.local.read((db) => Object.values(db.communityPosts || {}).filter((post) => !post.deleted).flatMap(channels));
    return { schools: [...new Set(entries.filter((entry) => entry.type === "school").map((entry) => entry.label))].sort(),
      majors: [...new Set(entries.filter((entry) => entry.type === "major").map((entry) => entry.label))].sort() };
  },

  async listCommunityPage(channel, { before = "", search = "", limit = 40 } = {}) {
    limit = Math.min(40, Math.max(1, Number(limit) || 40));
    const term = search.normalize("NFKC").toLowerCase();
    const indexing = await this.communityIndexStep();
    if (!this.dynamo) return this.local.read((db) => {
      const candidates = Object.values(db.communityPosts || {}).filter((post) => !post.deleted && inChannel(post, channel)
        && (!before || `POST#${key(post)}` < before) && `${post.topic || ""}\n${post.content || ""}`.normalize("NFKC").toLowerCase().includes(term))
        .sort((a, b) => key(b).localeCompare(key(a)));
      const posts = candidates.slice(0, limit);
      return { posts, nextBefore: candidates.length > limit ? `POST#${key(posts.at(-1))}` : null, indexing: false };
    });
    // Search evaluates at most 100 feed references per request; no table scan.
    const page = await this.dynamo.queryPage(`COMMUNITY_FEED#${channel}`, { prefix: "POST#", before, limit: 100 });
    const posts = [];
    let consumed = 0;
    while (consumed < page.rows.length && posts.length < limit) {
      const batch = page.rows.slice(consumed, consumed + Math.min(8, limit - posts.length));
      const hydrated = await mapped(batch, (entry) => entry.text.includes(term) ? this.getCommunityPost(entry.id) : null);
      for (let index = 0; index < batch.length; index++) {
        consumed++;
        const post = hydrated[index];
        if (post && inChannel(post, channel) && `${post.topic || ""}\n${post.content || ""}`.normalize("NFKC").toLowerCase().includes(term)) posts.push(post);
      }
    }
    const hasMore = consumed < page.rows.length || Boolean(page.cursor);
    return { posts, nextBefore: hasMore && consumed ? `POST#${key(page.rows[consumed - 1])}` : null, indexing };
  },

  async listCommunityPosts(channel, limit = 40) {
    const selected = channel === "all" || /^(school|major):/.test(channel) ? channel : `school:${channel}`;
    return (await this.listCommunityPage(selected, { limit })).posts;
  },

  async createCommunityPost(post) {
    const record = { ...post, channels: channels(post), kind: "communityPost", likes: [], likeCount: 0, createdAt: now(), updatedAt: now() };
    if (this.dynamo) await this.dynamo.transactPut([postRecord(record, { createOnly: true }), ...indexRecords(record)]);
    else await this.local.write((db) => { db.communityPosts ||= {}; db.communityPosts[record.id] = record; });
    return record;
  },

  async getCommunityPost(id) {
    const post = this.dynamo ? await this.dynamo.get(`COMMUNITY_POST#${id}`, "META", { consistent: true }) : await this.local.read((db) => db.communityPosts?.[id]);
    return post && !post.deleted ? post : null;
  },

  async changeCommunityPost(id, mutate, updateIndexes = false) {
    if (!this.dynamo) {
      let previous;
      return this.local.write((db) => {
        previous = db.communityPosts?.[id];
        if (!previous || previous.deleted) return null;
        const updated = mutate(previous);
        db.communityPosts[id] = updated;
        return updated;
      }, { rollback: (db) => { if (previous) db.communityPosts[id] = previous; } });
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const existing = await this.getCommunityPost(id);
      if (!existing) return null;
      const updated = mutate(existing);
      const records = [postRecord(updated, { expectedData: existing })];
      if (updateIndexes) {
        records.push(...indexRecords(updated));
        const selected = new Set(channels(updated).map((entry) => entry.key));
        records.push(...channels(existing).filter((entry) => !selected.has(entry.key)).map((entry) => ({
          pk: `COMMUNITY_FEED#${entry.key}`, sk: `POST#${key(existing)}`, deleteOnly: true
        })));
      }
      try { await this.dynamo.transactPut(records); return updated; }
      catch (error) { if (!conflict(error)) throw error; await delay(Math.random() * Math.min(100, 4 * 2 ** attempt)); }
    }
    throw fail(409, "讨论正在更新，请重试。");
  },

  async editCommunityPost(id, userId, changes, revision) {
    return this.changeCommunityPost(id, (post) => {
      if (post.userId !== userId) throw fail(403, "只能编辑自己发布的帖子。");
      if (!Number.isSafeInteger(revision) || revision !== (post.editRevision || 0)) throw fail(409, "帖子已在其他页面修改，请重新打开编辑。你的输入已保留。");
      const selected = changes.channels || channels(post);
      return { ...post, ...changes, channels: selected, channelType: selected[0].type, channelKey: selected[0].key,
        channelLabel: selected[0].label, editRevision: revision + 1, editedAt: now(), updatedAt: now() };
    }, true);
  },

  async toggleCommunityPostLike(channel, id, userId, desired) {
    return this.changeCommunityPost(id, (post) => {
      if (!inChannel(post, channel)) throw fail(404, "帖子不在此频道。");
      const likes = new Set(post.likes || []);
      const liked = typeof desired === "boolean" ? desired : !likes.has(userId);
      if (liked) likes.add(userId); else likes.delete(userId);
      return { ...post, likes: [...likes], likeCount: likes.size, updatedAt: now() };
    });
  },

  async deleteCommunityPost(id, userId, admin = false) {
    return this.changeCommunityPost(id, (post) => {
      if (post.userId !== userId && !admin) throw fail(403, "只能删除自己发布的帖子。");
      // Retain a tombstone so legacy indexing and in-flight writes cannot restore it.
      return { id: post.id, createdAt: post.createdAt, deleted: true, updatedAt: now() };
    });
  },

  async createCommunityReply(reply) {
    const record = { ...reply, anonymous: reply.anonymous === true, createdAt: reply.createdAt || now() };
    const replyRecord = { pk: `COMMUNITY_POST#${reply.postId}`, sk: `REPLY#${key(record)}`, type: "communityReply", data: record, createOnly: true };
    const notification = (post) => ({ id: record.id, postId: post.id, replyId: record.id, replyKey: replyRecord.sk, createdAt: record.createdAt, read: false });
    if (!this.dynamo) return this.local.write((db) => {
      const post = db.communityPosts?.[reply.postId];
      if (!post || post.deleted) throw fail(404, "帖子不存在。");
      db.communityReplies ||= {}; db.communityReplies[record.id] = record;
      if (post.userId !== reply.userId) {
        db.communityNotifications ||= {};
        db.communityNotifications[record.id] = { ...notification(post), userId: post.userId };
      }
      return record;
    });
    for (let attempt = 0; attempt < 8; attempt++) {
      const post = await this.getCommunityPost(reply.postId);
      if (!post) throw fail(404, "帖子不存在。");
      const records = [postRecord(post, { expectedData: post, checkOnly: true }), replyRecord];
      if (post.userId !== reply.userId) records.push({ pk: `COMMUNITY_NOTICES#${post.userId}`, sk: `NOTICE#${key(record)}`, type: "communityNotification", data: notification(post), createOnly: true });
      try { await this.dynamo.transactPut(records); return record; } catch (error) { if (!conflict(error)) throw error; }
    }
    throw fail(409, "讨论正在更新，请重试回复。");
  },

  async listCommunityReplies(postId, before = "", limit = 50) {
    if (this.dynamo) {
      const page = await this.dynamo.queryPage(`COMMUNITY_POST#${postId}`, { prefix: "REPLY#", before: before ? `REPLY#${before}` : "", limit });
      const rows = page.rows;
      return { replies: rows.filter((reply) => !reply.deleted).reverse(), nextBefore: page.cursor && rows.length ? key(rows.at(-1)) : null };
    }
    return this.local.read((db) => {
      const matching = Object.values(db.communityReplies || {}).filter((reply) => reply.postId === postId && !reply.deleted && (!before || key(reply) < before)).sort((a, b) => key(b).localeCompare(key(a)));
      const replies = matching.slice(0, limit);
      return { replies: replies.slice().reverse(), nextBefore: matching.length > limit ? key(replies.at(-1)) : null };
    });
  },

  async deleteCommunityReply(postId, id, userId, admin = false, createdAt = "") {
    const remove = (reply) => {
      if (!reply || reply.deleted || reply.postId !== postId) throw fail(404, "回复不存在。");
      if (reply.userId !== userId && !admin) throw fail(403, "只能删除自己的回复。");
      return { id, postId, createdAt: reply.createdAt, deleted: true };
    };
    if (this.dynamo) {
      const timestamp = createdAt || id.split("~")[0];
      if (!Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) throw fail(400, "回复日期无效。");
      const sk = `REPLY#${timestamp}#${id}`;
      const reply = await this.dynamo.get(`COMMUNITY_POST#${postId}`, sk, { consistent: true });
      await this.dynamo.put(`COMMUNITY_POST#${postId}`, sk, "communityReply", remove(reply));
    } else await this.local.write((db) => { db.communityReplies[id] = remove(db.communityReplies?.[id]); });
  },

  async listCommunityNotifications(userId, before = "") {
    const page = this.dynamo ? await this.dynamo.queryPage(`COMMUNITY_NOTICES#${userId}`, { prefix: "NOTICE#", before, limit: 30 }) : await this.local.read((db) => {
      const rows = Object.values(db.communityNotifications || {}).filter((notice) => notice.userId === userId && (!before || `NOTICE#${key(notice)}` < before)).sort((a, b) => key(b).localeCompare(key(a)));
      return { rows: rows.slice(0, 30), cursor: rows.length > 30 };
    });
    const notices = await mapped(page.rows, async (notice) => {
      const post = await this.getCommunityPost(notice.postId);
      if (!post) return null;
      const reply = this.dynamo ? await this.dynamo.get(`COMMUNITY_POST#${notice.postId}`, notice.replyKey) : await this.local.read((db) => db.communityReplies?.[notice.replyId]);
      if (!reply || reply.deleted) return null;
      return { id: notice.id, postId: notice.postId, createdAt: notice.createdAt, read: notice.read, topic: post.topic,
        authorName: reply.anonymous ? "匿名同学" : reply.authorName, content: reply.content };
    });
    return { notifications: notices.filter(Boolean), nextBefore: page.cursor && page.rows.length ? `NOTICE#${key(page.rows.at(-1))}` : null };
  },

  async readCommunityNotification(userId, id) {
    if (this.dynamo) {
      const timestamp = id.split("~")[0];
      const pk = `COMMUNITY_NOTICES#${userId}`, sk = `NOTICE#${timestamp}#${id}`;
      const notice = await this.dynamo.get(pk, sk, { consistent: true });
      if (!notice) throw fail(404, "通知不存在。");
      await this.dynamo.put(pk, sk, "communityNotification", { ...notice, read: true });
      return;
    }
    return this.local.write((db) => {
      const notice = db.communityNotifications?.[id];
      if (!notice || notice.userId !== userId) throw fail(404, "通知不存在。");
      notice.read = true;
    });
  }
};
