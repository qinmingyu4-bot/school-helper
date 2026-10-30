(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeCommunityEditor = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  function createController({ api, getUser, getDefaults, onChange, onSaved }) {
    let owner = "", draft = null;
    function snapshot() {
      const current = String(getUser()?.id || "");
      if (owner !== current) { owner = current; draft = null; }
      return draft;
    }
    function start(post) {
      snapshot();
      if (!owner || !post.mine) throw new Error("只能编辑自己发布的帖子。");
      if (draft?.saving) return;
      const defaults = getDefaults();
      draft = { id: post.id, topic: post.topic || "", content: post.content || "", anonymous: Boolean(post.anonymous),
        channels: post.channels.map((entry) => entry.type), values: { school: defaults.school || "", major: defaults.major || "" },
        editRevision: post.editRevision || 0, saving: false, error: "" };
      for (const entry of post.channels) if (entry.type !== "all") draft.values[entry.type] = entry.label;
      onChange();
    }
    function set(field, value) {
      const current = snapshot();
      if (current && !current.saving && ["topic", "content", "anonymous", "channels", "values"].includes(field)) current[field] = value;
    }
    function cancel() { if (snapshot()?.saving) return; draft = null; onChange(); }
    async function save() {
      const current = snapshot(), userId = owner;
      if (!current || current.saving || !userId) return;
      const content = current.content.trim(), topic = current.topic.trim();
      const channels = current.channels.map((type) => ({ type, ...(type === "all" ? {} : { value: current.values[type].trim() }) }));
      current.error = "";
      if (content.length < 3 || content.length > 1600 || topic.length > 40 || !channels.length || channels.some((entry) => entry.type !== "all" && (!entry.value || entry.value.length > 90))) {
        current.error = "请选择发布频道并填写名称，正文须为 3–1600 字，主题最多 40 字。"; onChange(); return;
      }
      current.saving = true; onChange();
      const active = () => String(getUser()?.id || "") === userId && draft === current;
      try {
        const result = await api(`/api/community/posts/${encodeURIComponent(current.id)}`, { method: "PATCH", body: {
          topic: topic || "问问题", content, channels, anonymous: current.anonymous, editRevision: current.editRevision
        } });
        if (!active()) return;
        draft = null; onSaved(result.post); onChange();
      } catch (error) { if (active()) current.error = error.message || "保存失败，请重试。你的输入已保留。"; }
      finally { if (active()) { current.saving = false; onChange(); } }
    }
    return { snapshot, start, set, cancel, save };
  }
  return { createController };
});
