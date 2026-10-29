const crypto = require("node:crypto");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH = "https://graph.microsoft.com/v1.0/me";
const scopes = { gmail: "https://www.googleapis.com/auth/gmail.readonly", outlook: "offline_access User.Read Mail.Read" };
const providers = ["gmail", "outlook"];
function keyFrom(env) {
  const value = String(env.MAILBOX_ENCRYPTION_KEY || "");
  const key = Buffer.from(value, "base64");
  return key.length === 32 && key.toString("base64") === value ? key : null;
}
function configuration(provider, env = process.env) {
  if (!providers.includes(provider)) throw fail(404, "不支持的邮箱类型。");
  const prefix = provider === "gmail" ? "GMAIL" : "OUTLOOK";
  const clientId = env[`${prefix}_CLIENT_ID`] || (provider === "gmail" ? env.GOOGLE_CLIENT_ID : "");
  const clientSecret = env[`${prefix}_CLIENT_SECRET`] || (provider === "gmail" ? env.GOOGLE_CLIENT_SECRET : "");
  const base = String(env.APP_BASE_URL || "").replace(/\/+$/, "");
  const redirectUri = env[`${prefix}_REDIRECT_URI`] || (base ? `${base}/api/mailbox/${provider}/callback` : "");
  let validRedirect = false;
  try { const url = new URL(redirectUri); validRedirect = url.protocol === "https:" || (env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)); } catch {}
  return { clientId, clientSecret, redirectUri, enabled: Boolean(clientId && clientSecret && validRedirect && keyFrom(env)),
    authorize: provider === "gmail" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: provider === "gmail" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token" };
}
function seal(value, env = process.env) {
  const key = keyFrom(env);
  if (!key) throw fail(503, "邮箱连接尚未配置，请联系管理员。");
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url");
}
function unseal(value, env = process.env) {
  const key = keyFrom(env);
  if (!key) throw fail(503, "邮箱连接尚未配置，请联系管理员。");
  const bytes = Buffer.from(value, "base64url"), decipher = crypto.createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
}
const cookieName = (provider, env) => `${env.NODE_ENV === "production" ? "__Host-" : ""}sb_mailbox_${provider}`;
function oauthCookie(provider, value, env = process.env) {
  return `${cookieName(provider, env)}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${value ? 600 : 0}${env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
function startOAuth(provider, auth, timeZone, env = process.env, now = Date.now()) {
  const config = configuration(provider, env);
  if (!config.enabled) throw fail(503, "此邮箱的授权接入尚未配置，请联系管理员。");
  try { new Intl.DateTimeFormat("en", { timeZone }).format(); } catch { throw fail(400, "请选择有效的邮箱时区。"); }
  const state = crypto.randomBytes(32).toString("base64url"), verifier = crypto.randomBytes(32).toString("base64url");
  const url = new URL(config.authorize);
  for (const [name, value] of Object.entries({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: scopes[provider], state,
    code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", prompt: provider === "gmail" ? "consent select_account" : "select_account",
    ...(provider === "gmail" ? { access_type: "offline" } : { response_mode: "query" }) })) url.searchParams.set(name, value);
  return { url: url.toString(), cookie: oauthCookie(provider, seal({ provider, state, verifier, userId: auth.user.id, session: auth.tokenHash, mailboxGeneration: auth.mailboxGeneration ?? null, timeZone, now }, env), env) };
}
function verifyOAuth(provider, auth, state, cookies, env = process.env, now = Date.now()) {
  try {
    const value = unseal(cookies[cookieName(provider, env)], env);
    if (!state || value.provider !== provider || value.state !== state || value.userId !== auth.user.id || value.session !== auth.tokenHash || now - value.now > 600000 || value.now > now + 30000) throw new Error();
    return value;
  } catch { throw fail(400, "邮箱授权已过期或登录账号已改变，请在设置中重新绑定。"); }
}
function createProviders({ env = process.env, request = fetch } = {}) {
  async function json(url, options = {}) {
    const response = await request(url, { ...options, redirect: "error", signal: AbortSignal.timeout(30000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(response.status === 401 || response.status === 403 || data.error === "invalid_grant" ? "邮箱授权已失效或被学校限制，请重新绑定或联系学校管理员。" : "邮箱同步暂时失败，稍后会自动重试。"),
      { providerStatus: data.error === "invalid_grant" ? 401 : response.status, retryAfter: Math.min(3600, Math.max(60, Number(response.headers.get("retry-after")) || 60)) });
    return data;
  }
  async function token(provider, values) {
    const config = configuration(provider, env);
    const data = await json(config.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...values }) });
    if (!data.access_token) throw fail(502, "邮箱服务未返回授权凭据。");
    if (data.scope && !(provider === "gmail" ? data.scope.split(" ").includes(scopes.gmail) : data.scope.split(" ").some((scope) => /(?:^|\/)Mail\.Read$/i.test(scope)))) throw Object.assign(fail(403, "请允许读取邮件后重新绑定。"), { providerStatus: 403 });
    return { accessToken: data.access_token, refreshToken: data.refresh_token || "", expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  }
  function safeGraphLink(value) {
    const url = new URL(value);
    if (url.origin !== "https://graph.microsoft.com" || !url.pathname.startsWith("/v1.0/me/mailFolders/") || !url.pathname.endsWith("/messages/delta") || url.username || url.password || value.length > 16000) throw fail(502, "邮箱同步地址无效。");
    return url.toString();
  }
  const get = (url, accessToken, headers = {}) => json(url, { headers: { authorization: `Bearer ${accessToken}`, ...headers } });
  return {
    exchange: (provider, code, verifier) => token(provider, { code, code_verifier: verifier, redirect_uri: configuration(provider, env).redirectUri, grant_type: "authorization_code" }),
    refresh: (provider, refreshToken) => token(provider, { refresh_token: refreshToken, grant_type: "refresh_token", ...(provider === "outlook" ? { scope: scopes.outlook } : {}) }),
    async profile(provider, accessToken) {
      const profile = await get(provider === "gmail" ? `${GMAIL}/profile` : `${GRAPH}?$select=id,mail,userPrincipalName`, accessToken);
      const email = provider === "gmail" ? profile.emailAddress : profile.mail || profile.userPrincipalName;
      if (!email || email.length > 320) throw fail(502, "无法读取绑定邮箱地址。");
      return { email, historyId: profile.historyId };
    },
    async page(connection, accessToken) {
      const sync = connection.sync || {};
      if (connection.provider === "gmail") {
        if (sync.historyId) {
          const url = new URL(`${GMAIL}/history`);
          url.search = new URLSearchParams({ startHistoryId: sync.historyId, historyTypes: "messageAdded", maxResults: "10", ...(sync.pageToken ? { pageToken: sync.pageToken } : {}) });
          const page = await get(url, accessToken);
          const ids = [...new Set((page.history || []).flatMap((entry) => (entry.messagesAdded || []).map(({ message }) => message.id)))];
          return { ids, sync: { ...sync, pageToken: page.nextPageToken || "", ...(page.nextPageToken ? {} : { historyId: page.historyId }) }, more: Boolean(page.nextPageToken) };
        }
        const historyId = sync.initialHistoryId || (await get(`${GMAIL}/profile`, accessToken)).historyId;
        const url = new URL(`${GMAIL}/messages`);
        url.search = new URLSearchParams({ labelIds: "INBOX", q: `after:${Math.floor(new Date(connection.since).getTime() / 1000)}`, maxResults: "20", ...(sync.pageToken ? { pageToken: sync.pageToken } : {}) });
        const page = await get(url, accessToken);
        return { ids: (page.messages || []).map((message) => message.id), sync: page.nextPageToken ? { initialHistoryId: historyId, pageToken: page.nextPageToken } : { historyId }, more: Boolean(page.nextPageToken) };
      }
      const url = new URL(`${GRAPH}/mailFolders/inbox/messages/delta`);
      url.search = new URLSearchParams({ "$select": "id", "$top": "20", "$filter": `receivedDateTime ge ${connection.since}` });
      const page = await get(sync.link ? safeGraphLink(sync.link) : url, accessToken, { Prefer: 'IdType="ImmutableId"' });
      const link = page["@odata.nextLink"] || page["@odata.deltaLink"];
      if (!link) throw fail(502, "邮箱服务未返回同步进度。");
      return { ids: [...new Set((page.value || []).filter((row) => !row["@removed"]).map((row) => row.id))], sync: { link: safeGraphLink(link) }, more: Boolean(page["@odata.nextLink"]) };
    },
    async message(provider, id, accessToken) {
      let message;
      try { message = await get(provider === "gmail" ? `${GMAIL}/messages/${encodeURIComponent(id)}?format=full` : `${GRAPH}/messages/${encodeURIComponent(id)}?$select=id,subject,from,receivedDateTime,body,webLink`, accessToken, provider === "outlook" ? { Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"' } : {}); }
      catch (error) { if (error.providerStatus === 404) return null; throw error; }
      if (provider === "outlook") return { id, subject: String(message.subject || "").slice(0, 400), sender: `${message.from?.emailAddress?.name || ""} <${message.from?.emailAddress?.address || ""}>`.slice(0, 500), receivedAt: message.receivedDateTime,
        text: (message.body?.contentType?.toLowerCase() === "html" ? plainHtml(message.body.content) : String(message.body?.content || "")).slice(0, 16000), link: safeMailLink(message.webLink, provider) };
      if (!(message.labelIds || []).includes("INBOX") || (message.labelIds || []).some((label) => ["SENT", "DRAFT", "SPAM", "TRASH"].includes(label))) return null;
      const header = (name) => String((message.payload?.headers || []).find((entry) => entry.name.toLowerCase() === name)?.value || "");
      return { id, subject: header("subject").slice(0, 400), sender: header("from").slice(0, 500), receivedAt: new Date(Number(message.internalDate)).toISOString(),
        text: mimeText(message.payload).slice(0, 16000), link: `https://mail.google.com/mail/u/#all/${encodeURIComponent(id)}` };
    }
  };
}
function safeMailLink(value, provider) {
  try { const url = new URL(value); if (url.protocol === "https:" && !url.username && !url.password && (provider === "gmail" ? url.hostname === "mail.google.com" : ["outlook.office.com", "outlook.office365.com", "outlook.live.com"].includes(url.hostname))) return url.toString(); } catch {}
  return "";
}
function plainHtml(value) {
  return String(value || "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : " ").replace(/\s+/g, " ");
}
function mimeText(part) {
  if (!part || part.filename || part.body?.attachmentId) return "";
  if (part.mimeType === "text/plain") return Buffer.from(part.body?.data || "", "base64url").toString("utf8");
  if (part.mimeType === "text/html") return plainHtml(Buffer.from(part.body?.data || "", "base64url").toString("utf8"));
  const parts = part.parts || [], plain = parts.filter((item) => item.mimeType === "text/plain");
  return (plain.length ? plain : parts).map(mimeText).join("\n");
}
module.exports = { providers, configuration, seal, unseal, startOAuth, verifyOAuth, oauthCookie, createProviders, safeMailLink, mimeText, plainHtml };
