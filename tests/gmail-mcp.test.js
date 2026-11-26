const { test } = require("node:test");
const assert = require("node:assert/strict");
const { configuration, createProviders, startOAuth, verifyOAuth } = require("../lib/mailbox-providers");

const env = {
  APP_BASE_URL: "https://studybridge.ink", MAILBOX_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  GOOGLE_CLIENT_ID: "google-login-client", GOOGLE_CLIENT_SECRET: "google-login-secret",
  GMAIL_MAILBOX_TRANSPORT: "mcp", GMAIL_MCP_CLIENT_ID: "gmail-mcp-client", GMAIL_MCP_CLIENT_SECRET: "gmail-mcp-secret"
};
const receipt = (id, internalDate, labelIds = ["INBOX"]) => ({ id, internalDate: String(Date.parse(internalDate)), labelIds });
const result = (structuredContent) => Response.json({ jsonrpc: "2.0", id: 1, result: { structuredContent } });
const clock = Date.parse("2026-11-26T08:15:00Z");

test("Gmail MCP uses a separate read-only OAuth client and checks the authorized Gmail address", async () => {
  const auth = { user: { id: "alice" }, tokenHash: "session" };
  const start = startOAuth("gmail", auth, "UTC", env);
  const url = new URL(start.url);
  assert.equal(url.searchParams.get("client_id"), env.GMAIL_MCP_CLIENT_ID);
  assert.equal(url.searchParams.get("redirect_uri"), "https://studybridge.ink/api/mailbox/gmail/callback");
  assert.equal(url.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/gmail.readonly");
  assert.equal(url.searchParams.get("access_type"), "offline");
  const cookies = { sb_mailbox_gmail: start.cookie.split(";")[0].split("=")[1] };
  assert.equal(verifyOAuth("gmail", auth, url.searchParams.get("state"), cookies, env).gmailMcpClient, env.GMAIL_MCP_CLIENT_ID);
  assert.throws(() => verifyOAuth("gmail", auth, url.searchParams.get("state"), cookies, { ...env, GMAIL_MCP_CLIENT_ID: "new-client" }), /重新绑定/);
  assert.equal(configuration("gmail", { ...env, GMAIL_MCP_CLIENT_ID: "" }).enabled, false);
  assert.equal(configuration("gmail", { ...env, GMAIL_MCP_CLIENT_ID: env.GOOGLE_CLIENT_ID }).enabled, false);
  assert.equal(configuration("gmail", { ...env, GMAIL_MAILBOX_TRANSPORT: "rest" }).clientId, env.GOOGLE_CLIENT_ID);
  let verified = true;
  const provider = createProviders({ env, request: async (url, options) => {
    if (url === "https://oauth2.googleapis.com/token") {
      assert.equal(options.body.get("client_id"), env.GMAIL_MCP_CLIENT_ID);
      assert.equal(options.body.get("client_secret"), env.GMAIL_MCP_CLIENT_SECRET);
      return Response.json({ access_token: "access", refresh_token: "refresh", scope: "https://www.googleapis.com/auth/gmail.readonly" });
    }
    assert.equal(url, "https://openidconnect.googleapis.com/v1/userinfo");
    assert.equal(options.headers.authorization, "Bearer access");
    return Response.json({ email: "mail@example.test", email_verified: verified });
  } });
  const tokens = await provider.exchange("gmail", "code", "verifier");
  await provider.refresh("gmail", tokens.refreshToken);
  assert.deepEqual(await provider.profile("gmail", tokens.accessToken), { email: "mail@example.test" });
  verified = false;
  await assert.rejects(provider.profile("gmail", tokens.accessToken), /邮箱地址/);
});

test("Gmail MCP keeps paged time windows and reads every inbox message in long threads", async () => {
  const since = "2026-11-26T07:45:00Z", calls = [];
  const inbox = Array.from({ length: 7 }, (_, idx) => receipt(`m${idx}`, `2026-11-26T08:0${idx}:01Z`));
  const notEligible = [
    receipt("sent", "2026-11-26T08:10:00Z", ["SENT", "INBOX"]),
    receipt("archived", "2026-11-26T08:10:00Z", []),
    receipt("too-old", "2026-11-26T07:30:00Z"),
    receipt("boundary", "2026-11-26T08:15:00Z")
  ];
  const provider = createProviders({ env, request: async (url, options) => {
    assert.equal(url, "https://gmailmcp.googleapis.com/mcp/v1self");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.authorization, "Bearer access");
    const { method, params } = JSON.parse(options.body);
    assert.equal(method, "tools/call");
    calls.push(params);
    if (params.name === "get_thread") {
      assert.deepEqual(params.arguments, { threadId: "long", messageFormat: "METADATA_ONLY" });
      return result({ id: "long", messages: [...inbox, ...notEligible] });
    }
    if (params.name === "get_message") {
      assert.deepEqual(params.arguments, { messageId: "m1", messageFormat: "PLAIN_TEXT" });
      const message = { ...inbox[1], date: "2026-11-25T00:00:00Z", subject: "Assignment", sender: "mail@example.test",
        addressDisplayNames: [{ emailAddress: "mail@example.test", displayName: "Professor" }],
        plaintextBody: "Due Friday", htmlBody: "<script>ignored</script>", attachments: [{ filename: "private" }] };
      const data = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(message) }] } });
      return new Response(`event: message\r\ndata: ${data}\r\n\r\n`, { headers: { "content-type": "text/event-stream" } });
    }
    assert.equal(params.name, "search_threads");
    assert.equal(params.arguments.view, "THREAD_VIEW_METADATA_ONLY");
    assert.equal(params.arguments.query, "in:inbox after:2026/11/25 before:2026/11/27");
    return params.arguments.pageToken === "next"
      ? result({ threads: [{ id: "short", messageCount: 1, messages: [receipt("another", "2026-11-26T08:12:00Z")] }] })
      : result({ threads: [{ id: "long", messageCount: 11, messages: inbox.slice(0, 5) }], nextPageToken: "next" });
  } });
  const connection = { provider: "gmail", since, sync: { historyId: "legacy", pageToken: "legacy" } };
  const first = await provider.page(connection, "access", clock);
  assert.deepEqual(first, { ids: inbox.map(row => row.id), sync: { transport: "gmail-mcp", checkpoint: Date.parse(since), upper: clock, pageToken: "next" }, more: true });
  assert.equal(calls[0].arguments.pageToken, undefined);
  const next = await provider.page({ ...connection, sync: first.sync }, "access", clock + 15000);
  assert.deepEqual(next, { ids: ["another"], sync: { transport: "gmail-mcp", checkpoint: clock }, more: false });
  assert.deepEqual(await provider.message("gmail", "m1", "access"), { id: "m1", text: "Due Friday", receivedAt: "2026-11-26T08:01:01.000Z", sender: "Professor <mail@example.test>", subject: "Assignment" });
});

test("Gmail MCP recovers a rejected page token without skipping the current window", async () => {
  const initial = { provider: "gmail", since: "2026-11-26T07:45:00Z", sync: { transport: "gmail-mcp", checkpoint: clock, upper: clock + 30000, pageToken: "stale" } };
  const provider = createProviders({ env, request: async (_url, options) => {
    const { params } = JSON.parse(options.body);
    if (params.arguments.pageToken === "stale") return Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "INVALID_ARGUMENT" } });
    return result({});
  } });
  const retried = await provider.page(initial, "access", clock + 60000);
  assert.deepEqual(retried, { ids: [], sync: { transport: "gmail-mcp", checkpoint: clock, upper: clock + 30000 }, more: true });
  const completed = await provider.page({ ...initial, sync: retried.sync }, "access", clock + 90000);
  assert.equal(completed.sync.checkpoint, clock + 30000);
});

test("Gmail MCP distinguishes absent messages from throttling and endpoint outages", async () => {
  const provider = (makeResponse) => createProviders({ env, request: async () => makeResponse() });
  const absent = provider(() => Response.json({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "NOT_FOUND: removed" }] } }));
  assert.equal(await absent.message("gmail", "gone", "access"), null);
  const outage = provider(() => new Response("", { status: 404 }));
  await assert.rejects(outage.message("gmail", "gone", "access"), /request failed/);
  const throttle = provider(() => new Response("", { status: 429, headers: { "retry-after": "90" } }));
  await assert.rejects(throttle.message("gmail", "queued", "access"), error => error.providerStatus === 429 && error.retryAfter === 90);
  const malformed = provider(() => result({ id: "other", labelIds: ["INBOX"] }));
  await assert.rejects(malformed.message("gmail", "queued", "access"), /invalid response/);
});
