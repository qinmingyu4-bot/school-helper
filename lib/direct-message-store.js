const { randomUUID, createHash } = require("node:crypto");
const { metadata } = require("./direct-message-attachments");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const materialOwner = "_classmates";
const repeat = (saved, fingerprint) => {
  if (saved.fingerprint !== fingerprint) throw fail(409, "这条消息的内容已经变更，请重新发送。");
  return saved.message;
};

module.exports = {
  async sendDirectMessage({ chatId, senderId, content, attachments = [], clientId }) {
    const fingerprint = createHash("sha256").update(JSON.stringify({ content, attachments })).digest("hex");
    const requestKey = clientId ? `REQUEST#${senderId}#${clientId}` : "";
    const localKey = `${chatId}#${requestKey}`;
    const id = `dm_${randomUUID()}`, createdAt = new Date().toISOString();
    const attachmentRef = attachments.length ? `DM#${id}#${randomUUID()}` : "";
    const message = { id, chatId, senderId, content, kind: "directMessage", createdAt,
      ...(attachmentRef ? { attachmentRef, attachments: metadata(chatId, id, attachments) } : {}) };
    const request = { fingerprint, message };
    if (!this.dynamo) return this.local.write((state) => {
      state.directMessageRequests ||= {};
      if (requestKey && state.directMessageRequests[localKey]) return repeat(state.directMessageRequests[localKey], fingerprint);
      if (attachmentRef) {
        state.materials ||= {};
        attachments.forEach((file, index) => {
          const fileRef = `${attachmentRef}#FILE#${index}`;
          state.materials[`${materialOwner}#${chatId}#${fileRef}`] = { userId: materialOwner, courseId: chatId, id: fileRef, value: file };
        });
      }
      state.directMessages ||= {};
      state.directMessages[id] = message;
      if (requestKey) state.directMessageRequests[localKey] = request;
      return message;
    });
    const pk = `DM#${chatId}`;
    if (requestKey) {
      const saved = await this.dynamo.get(pk, requestKey, { consistent: true });
      if (saved) return repeat(saved, fingerprint);
    }
    let publishing = false;
    try {
      // Read a requested image/file independently instead of downloading every
      // attachment in its message for each thumbnail or download.
      for (let index = 0; index < attachments.length; index++) {
        await this.writeMaterial(materialOwner, chatId, `${attachmentRef}#FILE#${index}`, attachments[index], { concurrency: 8 });
      }
      publishing = true;
      await this.dynamo.transactPut([
        { pk, sk: `MSG#${createdAt}#${id}`, type: "directMessage", data: message, createOnly: true },
        { pk, sk: `META#${id}`, type: "directMessageIndex", data: message, createOnly: true },
        ...(requestKey ? [{ pk, sk: requestKey, type: "directMessageRequest", data: request, createOnly: true }] : [])
      ]);
      return message;
    } catch (error) {
      let saved;
      try { saved = await this.dynamo.get(pk, requestKey || `META#${id}`, { consistent: true }); } catch {}
      if (saved) {
        const savedMessage = requestKey ? saved.message : saved;
        if (attachmentRef && savedMessage.id !== id) await this.deleteMaterials(materialOwner, chatId, `${attachmentRef}#`).catch(() => {});
        return requestKey ? repeat(saved, fingerprint) : saved;
      }
      // A dropped database response may follow a successful commit. Preserve its
      // bytes unless publication definitely failed; retries reconcile via clientId.
      const cancelled = ["TransactionCanceledException", "TransactionConflictException", "ValidationException", "AccessDeniedException"].includes(error.code);
      if (attachmentRef && (!publishing || cancelled)) await this.deleteMaterials(materialOwner, chatId, `${attachmentRef}#`).catch(() => {});
      throw error;
    }
  },

  async getDirectMessage(chatId, messageId) {
    if (this.dynamo) return this.dynamo.get(`DM#${chatId}`, `META#${messageId}`, { consistent: true });
    return this.local.read((state) => {
      const message = state.directMessages?.[messageId];
      return message?.chatId === chatId ? message : null;
    });
  },

  async readDirectMessageAttachment(chatId, message, index) {
    if (!message?.attachmentRef || message.chatId !== chatId || !Number.isInteger(index) || !message.attachments?.[index]) return null;
    return this.readMaterial(materialOwner, chatId, `${message.attachmentRef}#FILE#${index}`);
  }
};
