(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeCommunityReplies = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  function createController({ api, getUser, onChange }) {
    let userId = "";
    let threads = new Map();
    function thread(postId) {
      const current = String(getUser()?.id || "");
      if (current !== userId) { userId = current; threads = new Map(); }
      if (!threads.has(postId)) threads.set(postId, { open: false, loaded: false, loading: false, sending: false, draft: "", anonymous: false, replies: [], nextBefore: null, error: "" });
      return threads.get(postId);
    }
    const active = (owner, postId, value) => String(getUser()?.id || "") === owner && threads.get(postId) === value;
    const merge = (records) => [...new Map(records.map((reply) => [reply.id, reply])).values()]
      .sort((first, second) => `${first.createdAt}#${first.id}`.localeCompare(`${second.createdAt}#${second.id}`));
    async function load(postId, older = false) {
      const value = thread(postId), owner = userId;
      if (!owner || value.loading || value.sending || (older && !value.nextBefore)) return;
      const before = older ? `?before=${encodeURIComponent(value.nextBefore)}` : "";
      value.loading = true;
      value.error = "";
      onChange(postId);
      try {
        const result = await api(`/api/community/posts/${encodeURIComponent(postId)}/replies${before}`);
        if (!active(owner, postId, value)) return;
        value.replies = merge(older ? [...result.replies, ...value.replies] : result.replies);
        value.nextBefore = result.nextBefore;
        value.loaded = true;
      } catch (error) {
        if (active(owner, postId, value)) value.error = error.message || "回复加载失败，请重试。";
      } finally {
        if (active(owner, postId, value)) { value.loading = false; onChange(postId); }
      }
    }
    async function send(postId) {
      const value = thread(postId), owner = userId;
      if (!owner || value.loading || value.sending) return;
      const content = value.draft.trim();
      if (!content || content.length > 1600) { value.error = "回复内容须为 1–1600 字。"; onChange(postId); return; }
      const draft = value.draft;
      value.sending = true;
      value.error = "";
      onChange(postId);
      try {
        const result = await api(`/api/community/posts/${encodeURIComponent(postId)}/replies`, { method: "POST", body: { content, anonymous: value.anonymous } });
        if (!active(owner, postId, value)) return;
        value.replies = merge([...value.replies, result.reply]);
        if (value.draft === draft) value.draft = "";
      } catch (error) {
        if (active(owner, postId, value)) value.error = error.message || "回复发送失败，请重试。";
      } finally {
        if (active(owner, postId, value)) { value.sending = false; onChange(postId); }
      }
    }
    async function remove(postId, replyId) {
      const value = thread(postId), owner = userId;
      if (!owner || value.loading || value.sending) return;
      const reply = value.replies.find((item) => item.id === replyId);
      if (!reply) return;
      value.sending = true; value.error = ""; onChange(postId);
      try {
        await api(`/api/community/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}?createdAt=${encodeURIComponent(reply.createdAt)}`, { method: "DELETE" });
        if (active(owner, postId, value)) value.replies = value.replies.filter((item) => item.id !== replyId);
      } catch (error) { if (active(owner, postId, value)) value.error = error.message || "删除失败，请重试。"; }
      finally { if (active(owner, postId, value)) { value.sending = false; onChange(postId); } }
    }
    return { thread, load, send, remove };
  }
  return { createController };
});
