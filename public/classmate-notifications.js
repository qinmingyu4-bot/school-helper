(function (scope, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else scope.StudyBridgeClassmateNotifications = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  function create({ getUserId, enabled, hidden, request, onChange, onEvent,
    onToast = () => {}, shouldNotify = () => true,
    delay = setTimeout, cancelDelay = clearTimeout,
    openStream = () => typeof EventSource === "undefined" ? null : new EventSource("/api/classmates/events"),
    schedule = (callback) => setInterval(callback, 15000), cancel = clearInterval }) {
    let actor = null, blocked = null, generation = 0, revision = 0, unread = false;
    let stream = null, timer = null, pending = null, queued = false;
    let toast = null, toastTimer = null;
    const seenMessages = new Set();
    const currentActor = () => enabled() ? getUserId() || null : null;
    function dismissToast() {
      if (toastTimer !== null) cancelDelay(toastTimer);
      toastTimer = null;
      if (!toast) return;
      toast = null;
      onToast(null);
    }
    function reconcileToast() {
      if (toast && (actor !== currentActor() || hidden() || !shouldNotify(toast))) dismissToast();
    }
    function incoming(event) {
      let message;
      try { message = JSON.parse(event?.data); } catch { return; }
      if (message?.type !== "message" || typeof message.messageId !== "string" || !message.messageId
        || typeof message.chatId !== "string" || !message.chatId || typeof message.senderId !== "string"
        || !message.senderId || message.senderId === actor || seenMessages.has(message.messageId)) return;
      seenMessages.add(message.messageId);
      if (seenMessages.size > 512) seenMessages.delete(seenMessages.values().next().value);
      if (hidden() || !shouldNotify(message)) return;
      dismissToast();
      toast = { chatId: message.chatId, messageId: message.messageId };
      onToast(toast);
      toastTimer = delay(dismissToast, 10000);
    }
    function publish(value) {
      if (unread === value) return;
      unread = value;
      onChange(value);
    }
    function stop() {
      generation++;
      dismissToast(); seenMessages.clear();
      stream?.close(); stream = null;
      if (timer !== null) cancel(timer);
      timer = null; actor = null; pending = null; queued = false;
      publish(false);
    }
    async function refresh() {
      if (!actor || actor !== currentActor() || hidden()) return;
      const serial = ++revision;
      if (pending) { queued = true; return; }
      const userId = actor, epoch = generation, task = {};
      pending = task; queued = false;
      const current = () => actor === userId && currentActor() === userId && generation === epoch;
      try {
        const result = await request();
        // A newer event/read acknowledgement supersedes an in-flight snapshot.
        if (current() && serial === revision && typeof result?.hasUnread === "boolean") publish(result.hasUnread);
      } catch (error) {
        if (current() && error.status === 401) { blocked = userId; stop(); }
        // Keep the last known indicator on transient failures; the poll retries.
      } finally {
        if (pending === task) {
          pending = null;
          if (queued) { queued = false; void refresh(); }
        }
      }
    }
    function sync() {
      const next = currentActor();
      if (next === actor || (next && next === blocked)) return;
      stop();
      if (!next) return;
      blocked = null; actor = next;
      const epoch = generation;
      const active = () => actor === next && currentActor() === next && generation === epoch;
      try {
        stream = openStream();
        stream?.addEventListener("open", () => { if (active()) { void refresh(); onEvent(); } });
        stream?.addEventListener("classmates", (event) => {
          if (!active()) return;
          incoming(event);
          void refresh(); onEvent();
        });
      } catch { /* Polling remains available when streaming cannot start. */ }
      timer = schedule(() => void refresh());
      void refresh();
    }
    return { sync, refresh, stop, dismissToast, reconcileToast, currentToast: () => toast,
      hasUnread: () => actor === currentActor() && unread };
  }
  return { create };
});
