(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgePush = factory();
})(globalThis, function () {
  "use strict";
  function capability(win) {
    if (!win.isSecureContext) return "系统通知需要安全连接（HTTPS）。";
    if (!("serviceWorker" in win.navigator) || !("PushManager" in win) || !("Notification" in win)) return "当前浏览器暂不支持网页系统推送。";
    if (win.Notification.permission === "denied") return "通知权限已关闭，请在浏览器或系统设置中允许通知后重试。";
    return "";
  }
  function keyBytes(value) { return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)); }
  function createPanel({ root, api, getUser, win = window, ui = win.StudyBridgeI18n }) {
    let disposed = false, busy = false, info = null, subscription = null;
    const owner = getUser()?.id;
    const active = () => !disposed && owner && getUser()?.id === owner;
    const node = (name) => root.querySelector(`[data-push-${name}]`);
    const tell = (text) => { if (active()) node("status").textContent = ui.text(text); };
    function controls() {
      const reason = capability(win);
      node("enable").disabled = busy || Boolean(reason) || !info?.configured;
      node("disable").disabled = busy || !info?.enabled;
      node("test").disabled = busy || !info?.enabled || Boolean(reason);
      node("lead").disabled = busy || !info?.configured || !node("schedule").checked;
      node("schedule").disabled = busy || !info?.configured;
      node("messages").disabled = busy || !info?.configured;
      node("enable").textContent = ui.text(info?.enabled ? "保存通知设置" : "开启系统推送");
    }
    async function read() {
      const registration = "serviceWorker" in win.navigator ? await win.navigator.serviceWorker.getRegistration("/") : null;
      subscription = await registration?.pushManager?.getSubscription() || null;
      const result = await api(`/api/push${subscription ? `?endpoint=${encodeURIComponent(subscription.endpoint)}` : ""}`);
      if (!active()) return;
      info = result; node("lead").value = String(info.leadMinutes);
      node("schedule").checked = info.scheduleEnabled !== false; node("messages").checked = info.messagesEnabled === true;
      tell(capability(win) || (!info.configured ? "系统推送尚未配置。" : info.enabled ? "此设备已开启系统推送，网页关闭后也可接收；通知显示受网络与系统设置影响。" : "此设备尚未开启系统推送。"));
      controls();
    }
    async function mutate(path, body, method = "POST") {
      if (!active() || info?.userId !== owner) throw new Error(ui.text("登录状态已变更，请重新打开设置。"));
      return api(path, { method, headers: { "x-csrf-token": info.csrfToken }, body: { ...body, userId: owner } });
    }
    async function action(kind) {
      if (busy || !active()) return;
      busy = true; controls();
      try {
        if (kind === "enable") {
          if (!node("schedule").checked && !node("messages").checked) throw new Error(ui.text("请至少选择一种通知，或关闭此设备推送。"));
          // Request immediately in the click handler, before network work loses user activation.
          const permission = await win.Notification.requestPermission();
          if (permission !== "granted") throw new Error(ui.text("通知权限未开启，可以稍后重试。"));
          const registration = await win.navigator.serviceWorker.register("/push-worker.js", { scope: "/", updateViaCache: "none" });
          await win.navigator.serviceWorker.ready;
          subscription = await registration.pushManager.getSubscription();
          if (subscription && subscription.options.applicationServerKey && Array.from(new Uint8Array(subscription.options.applicationServerKey)).join() !== Array.from(keyBytes(info.publicKey)).join()) {
            await subscription.unsubscribe(); subscription = null;
          }
          subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.publicKey) });
          if (!active()) { await subscription.unsubscribe(); return; }
          await mutate("/api/push", { subscription: subscription.toJSON(), leadMinutes: Number(node("lead").value), scheduleEnabled: node("schedule").checked, messagesEnabled: node("messages").checked, language: ui.getLanguage() });
          await read();
        } else if (kind === "disable") {
          await mutate("/api/push", { endpoint: subscription.endpoint }, "DELETE");
          await subscription.unsubscribe(); subscription = null;
          await read(); tell("此设备的系统推送已关闭。");
        } else {
          await mutate("/api/push/test", { endpoint: subscription.endpoint });
          tell("测试通知已交给系统，请查看通知中心；实际显示取决于系统设置。");
        }
      } catch (error) { tell(error.message || "操作失败，请重试。"); }
      finally { busy = false; if (active()) controls(); }
    }
    node("schedule").addEventListener("change", controls);
    for (const name of ["enable", "disable", "test"]) node(name).addEventListener("click", () => void action(name));
    const unsubscribe = ui.subscribe(() => { if (active()) { controls(); void activate(); } });
    async function activate() { if (busy || !active()) return; busy = true; controls(); try { await read(); } catch (error) { tell(error.message || "读取失败，请重试。"); } finally { busy = false; if (active()) controls(); } }
    controls();
    return { activate, dispose() { disposed = true; unsubscribe(); } };
  }
  return { capability, createPanel };
});
