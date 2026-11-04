const crypto = require("node:crypto");
const webpush = require("web-push");
const scheduleImport = require("../public/schedule-import");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const idFor = (endpoint) => crypto.createHash("sha256").update(endpoint).digest("hex");
const LEADS = [0, 5, 15, 30, 60, 1440];
// Only browser push services are permitted: never send requests to user-chosen hosts.
function validateSubscription(value) {
  if (!value || typeof value.endpoint !== "string" || value.endpoint.length > 2048) throw fail(400, "无效的通知订阅。");
  let url;
  try { url = new URL(value.endpoint); } catch { throw fail(400, "无效的通知订阅。"); }
  const host = url.hostname;
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash ||
    !(host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host.endsWith(".push.apple.com") || host === "web.push.apple.com" || host === "wns.windows.com" || host.endsWith(".wns.windows.com"))) throw fail(400, "不支持此通知服务。");
  const { p256dh, auth } = value.keys || {};
  if (typeof p256dh !== "string" || !/^[\w-]+$/.test(p256dh) || Buffer.from(p256dh, "base64url").length !== 65 ||
      typeof auth !== "string" || !/^[\w-]+$/.test(auth) || Buffer.from(auth, "base64url").length !== 16) throw fail(400, "无效的通知密钥。");
  try { crypto.ECDH.convertKey(Buffer.from(p256dh, "base64url"), "prime256v1"); } catch { throw fail(400, "无效的通知密钥。"); }
  return { endpoint: url.href, keys: { p256dh, auth } };
}
function createPushService({ db, listSchedule, env = process.env, now = Date.now, send } = {}) {
  const publicKey = env.WEB_PUSH_PUBLIC_KEY || "", privateKey = env.WEB_PUSH_PRIVATE_KEY || "", subject = env.WEB_PUSH_SUBJECT || "";
  let configured = false;
  try { if (publicKey && privateKey && subject) { webpush.setVapidDetails(subject, publicKey, privateKey); configured = true; } } catch { /* Status remains unavailable without exposing keys. */ }
  const deliver = send || ((subscription, payload, options) => webpush.sendNotification(subscription, payload, { ...options, vapidDetails: { subject, publicKey, privateKey } }));
  let running = null, timer = null, stopped = false;
  const available = () => { if (!configured) throw fail(503, "系统推送尚未配置。"); };
  async function live(row) {
    const [session, user] = await Promise.all([db.getSession(row.tokenHash), db.getUser(row.userId)]);
    return Boolean(session && user && session.userId === row.userId && Number(session.expiresAt) > now() && Number(session.passwordVersion || 0) === Number(user.passwordVersion || 0));
  }
  async function remove(row) { return db.changePushDevice(row.id, (current) => current?.generation === row.generation ? null : undefined); }
  function payload(row, { item, test = false } = {}) {
    const en = row.language === "en";
    return JSON.stringify({ title: test ? en ? "StudyBridge system notification" : "StudyBridge 系统通知" : en ? "StudyBridge schedule reminder" : "StudyBridge 日程提醒", body: test ? en ? "Test notification received. Selected notifications are ready on this device." : "已收到测试通知，此设备可以接收所选的系统通知。" : en ? "A schedule item is starting or due soon. Tap to view." : "有一项日程即将开始或截止，点击查看。", tag: test ? "studybridge-test" : `schedule:${item.id}:${item.startsAt}`, url: test ? "/app?page=schedule" : `/app?page=schedule&scheduleItem=${encodeURIComponent(item.id)}`, userId: row.userId });
  }
  async function subscribe(auth, body) {
    available(); const subscription = validateSubscription(body.subscription), id = idFor(subscription.endpoint);
    const leadMinutes = body.leadMinutes ?? 15;
    if (!LEADS.includes(leadMinutes)) throw fail(400, "请选择有效的提醒时间。");
    for (const key of ["scheduleEnabled", "messagesEnabled"]) if (body[key] !== undefined && typeof body[key] !== "boolean") throw fail(400, "请选择有效的通知类型。");
    const row = await db.changePushDevice(id, (before) => {
      const previous = before?.userId === auth.user.id ? before : null;
      const scheduleEnabled = body.scheduleEnabled ?? previous?.scheduleEnabled ?? true;
      const messagesEnabled = body.messagesEnabled ?? previous?.messagesEnabled ?? false;
      if (!scheduleEnabled && !messagesEnabled) throw fail(400, "请至少选择一种通知，或关闭此设备推送。");
      return { id, subscription, userId: auth.user.id, tokenHash: auth.tokenHash, leadMinutes, scheduleEnabled, messagesEnabled,
        messagesEnabledAt: messagesEnabled ? previous?.messagesEnabled ? previous.messagesEnabledAt : now() : null,
        messageWatermarks: previous?.messageWatermarks || {}, language: body.language === "en" ? "en" : "zh", generation: crypto.randomUUID(),
        enabledAt: previous?.enabledAt ?? now(), sent: previous?.sent || {}, leaseUntil: 0, retryAt: 0, testAfter: before?.testAfter || 0 };
    });
    return { enabled: true, leadMinutes, scheduleEnabled: row.scheduleEnabled, messagesEnabled: row.messagesEnabled };
  }
  async function device(auth, endpoint) {
    if (typeof endpoint !== "string" || endpoint.length > 2048) throw fail(400, "无效的通知订阅。");
    const row = await db.getPushDevice(idFor(endpoint));
    return row?.userId === auth.user.id ? row : null;
  }
  async function status(auth, endpoint) {
    const row = endpoint ? await device(auth, endpoint) : null;
    return { configured, publicKey: configured ? publicKey : "", userId: auth.user.id, enabled: Boolean(row && await live(row)), leadMinutes: row?.leadMinutes ?? 15, scheduleEnabled: row?.scheduleEnabled !== false, messagesEnabled: row?.messagesEnabled === true };
  }
  async function unsubscribe(auth, endpoint) { const row = await device(auth, endpoint); if (row) await remove(row); return { enabled: false }; }
  async function test(auth, endpoint) {
    available(); const row = await device(auth, endpoint);
    if (!row || !await live(row)) throw fail(409, "请先开启此设备的系统推送。");
    const claimed = await db.changePushDevice(row.id, (current) => current?.generation === row.generation && !(current.testAfter > now()) ? { ...current, testAfter: now() + 30000 } : undefined);
    if (!claimed) throw fail(429, "请稍后再发送测试通知。");
    try { await deliver(row.subscription, payload(row, { test: true }), { TTL: 60, urgency: "high", timeout: 10000 }); }
    catch (error) { if ([404, 410].includes(error.statusCode)) await remove(row); throw fail(502, "测试通知发送失败，请重新开启或稍后重试。"); }
    return { accepted: true };
  }
  async function processDevice(row) {
    if (!await live(row)) { await remove(row); return; }
    const stamp = now(), lease = crypto.randomUUID();
    const claimed = await db.changePushDevice(row.id, (current) => current?.generation === row.generation && !(current.leaseUntil > stamp) && !(current.retryAt > stamp) ? { ...current, lease, leaseUntil: stamp + 120000 } : undefined);
    if (!claimed) return;
    try {
      // Read current schedules after acquiring the lease: edits, deletes and completions need no copied jobs.
      const items = claimed.scheduleEnabled !== false ? await listSchedule(row.userId) : [];
      let sent = claimed.sent;
      for (const item of items) {
        let start;
        try { start = Date.parse(scheduleImport.validTime(item.startsAt) && item.timeZone ? scheduleImport.toUtc(item.startsAt, item.timeZone) : item.startsAt); } catch { continue; }
        const due = start - claimed.leadMinutes * 60000;
        const key = idFor(`${item.id}:${item.startsAt}`);
        if (!Number.isFinite(start) || item.completedAt || due > now() || due < Math.max(claimed.enabledAt, now() - 5 * 60000) || sent[key]) continue;
        const current = await db.getPushDevice(row.id);
        if (current?.generation !== row.generation || current.lease !== lease || !await live(current)) break;
        await deliver(row.subscription, payload(row, { item }), { TTL: Math.max(1, Math.min(300, Math.ceil((due + 5 * 60000 - now()) / 1000))), urgency: "high", timeout: 10000 });
        const delivered = { ...sent, [key]: now() };
        const saved = await db.changePushDevice(row.id, (value) => value?.generation === row.generation && value.lease === lease ? { ...value, leaseUntil: now() + 120000, sent: Object.fromEntries(Object.entries(delivered).filter(([, time]) => time > now() - 7 * 86400000).slice(-1000)) } : undefined);
        if (!saved) break;
        sent = saved.sent;
      }
      if (claimed.messagesEnabled) {
        const since = Math.max(claimed.messagesEnabledAt ?? stamp, now() - 5 * 60000);
        for (const item of await db.listPushMessages(row.userId, since)) {
          const created = Date.parse(item.createdAt), key = idFor(`message:${item.id}`);
          const current = await db.getPushDevice(row.id);
          if (current?.generation !== row.generation || current.lease !== lease || !await live(current)) break;
          // Leave time for the visible conversation to acknowledge its incoming message.
          if (!Number.isFinite(created) || created > now() - 3000 || created <= (current.messageWatermarks?.[item.chatId] || 0) || sent[key]) continue;
          const [chat, message] = await Promise.all([db.getClassmate(row.userId, item.chatId), db.getPushMessage(item.chatId, item)]);
          if (!chat || !message || message.readAt || message.senderId === row.userId) continue;
          const en = row.language === "en";
          const data = { type: "classmate-message", title: en ? "StudyBridge new message" : "StudyBridge 同学新消息",
            body: en ? "You have a new classmate message. Tap to view." : "你收到一条同学消息，点击查看。",
            tag: `classmate:${item.chatId}`, url: `/app?page=classmates&classmateChat=${encodeURIComponent(item.chatId)}`, userId: row.userId };
          await deliver(row.subscription, JSON.stringify(data), { TTL: Math.max(1, Math.min(300, Math.ceil((created + 5 * 60000 - now()) / 1000))), urgency: "high", timeout: 10000 });
          const delivered = { ...sent, [key]: now() };
          const saved = await db.changePushDevice(row.id, (value) => value?.generation === row.generation && value.lease === lease ? {
            ...value, leaseUntil: now() + 120000,
            sent: Object.fromEntries(Object.entries(delivered).filter(([, time]) => time > now() - 7 * 86400000).slice(-1000)),
            messageWatermarks: Object.fromEntries(Object.entries({ ...value.messageWatermarks, [item.chatId]: created }).filter(([, time]) => time > now() - 7 * 86400000).slice(-1000))
          } : undefined);
          if (!saved) break;
          sent = saved.sent;
        }
      }
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) await remove(row);
      else {
        await db.changePushDevice(row.id, (current) => current?.generation === row.generation && current.lease === lease ? { ...current, retryAt: now() + 60000 } : undefined);
        console.warn("Schedule push delivery deferred.");
      }
    } finally {
      await db.changePushDevice(row.id, (current) => current?.generation === row.generation && current.lease === lease ? { ...current, leaseUntil: 0 } : undefined);
    }
  }
  async function tick() {
    if (!configured || stopped || running) return running;
    running = (async () => {
      let cursor;
      do {
        const page = await db.listPushDevices(cursor);
        for (const row of page.rows) { if (stopped) return; await processDevice(row); }
        cursor = page.cursor;
      } while (cursor);
    })();
    try { await running; } finally { running = null; }
  }
  return { status, subscribe, unsubscribe, test, tick,
    health: () => ({ configured, workerEnabled: Boolean(timer) && !stopped }),
    start() { if (!configured || timer || env.WEB_PUSH_WORKER_DISABLED === "true") return; stopped = false; const run = () => void tick().catch(() => console.warn("Schedule push check deferred.")); timer = setInterval(run, 30000); timer.unref(); run(); },
    async stop() { stopped = true; clearInterval(timer); timer = null; await running; }
  };
}
module.exports = { createPushService, validateSubscription, idFor };
