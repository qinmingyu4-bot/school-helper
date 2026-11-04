const PK = "SCHEDULE_PUSH";
module.exports = {
  async getPushDevice(id) {
    return this.dynamo ? this.dynamo.get(PK, id, { consistent: true }) : this.local.read((s) => s.pushDevices?.[id] || null);
  },
  async changePushDevice(id, mutate) {
    if (!this.dynamo) return this.local.write((s) => {
      s.pushDevices ||= {};
      const next = mutate(s.pushDevices[id] || null);
      if (next === undefined) return null;
      if (next === null) delete s.pushDevices[id]; else s.pushDevices[id] = next;
      return next || { deleted: true };
    }, { skipSave: (result) => result === null });
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = await this.getPushDevice(id), next = mutate(before);
      if (next === undefined || next === null && !before) return null;
      try {
        await this.dynamo.transactPut([{ pk: PK, sk: id, type: "pushDevice", ...(next === null ? { deleteOnly: true, expectedData: before } : { data: next, ...(before ? { expectedData: before } : { createOnly: true }) }) }]);
        return next || { deleted: true };
      } catch (error) { if (error.code !== "TransactionCanceledException" || attempt === 5) throw error; }
    }
  },
  async getPushMessage(chatId, item) {
    return this.dynamo ? this.dynamo.get(`DM#${chatId}`, `MSG#${item.createdAt}#${item.id}`, { consistent: true }) : this.getDirectMessage(chatId, item.id);
  },
  // Read only recent incoming metadata; attachments and message text never enter push payloads.
  async listPushMessages(userId, since) {
    const chats = await this.listClassmates(userId), result = [];
    if (!this.dynamo) return this.local.read((state) => {
      const ids = new Set(chats.map((chat) => chat.id)), latest = new Map();
      for (const message of Object.values(state.directMessages || {})) {
        const stamp = Date.parse(message.createdAt);
        if (!ids.has(message.chatId) || message.senderId === userId || message.readAt || !(stamp >= since)) continue;
        const before = latest.get(message.chatId);
        if (!before || message.createdAt > before.createdAt || message.createdAt === before.createdAt && message.id > before.id) latest.set(message.chatId, message);
      }
      return [...latest.values()].map(({ id, chatId, createdAt }) => ({ id, chatId, createdAt }));
    });
    for (const chat of chats) {
      let cursor;
      do {
        const page = await this.dynamo.queryPage(`DM#${chat.id}`, { prefix: "MSG#", limit: 25, cursor });
        const latest = page.rows.find((message) => message.senderId !== userId && !message.readAt && Date.parse(message.createdAt) >= since);
        if (latest) { result.push({ id: latest.id, chatId: chat.id, createdAt: latest.createdAt }); break; }
        if (!page.rows.length || Date.parse(page.rows.at(-1).createdAt) < since) break;
        cursor = page.cursor;
      } while (cursor);
    }
    return result;
  },
  async listPushDevices(cursor) {
    if (this.dynamo) return this.dynamo.queryPage(PK, { limit: 25, cursor });
    return this.local.read((s) => {
      const rows = Object.values(s.pushDevices || {}).filter((row) => !cursor || row.id > cursor).sort((a, b) => a.id.localeCompare(b.id));
      return { rows: rows.slice(0, 25), cursor: rows.length > 25 ? rows[24].id : null };
    });
  }
};
