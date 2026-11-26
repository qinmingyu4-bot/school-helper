const ENDPOINT = "https://gmailmcp.googleapis.com/mcp/v1self";
const DAY = 86400000;
const INDEX_OVERLAP = 15 * 60000;
const MAX_WINDOW = 7 * DAY;
const GMAIL_MCP_INTERVAL = 30 * 60000;
const SKIP_LABELS = ["SENT", "DRAFT", "SPAM", "TRASH"];
const pacificDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
const invalidResponse = () => new Error("Gmail MCP returned an invalid response.");
const object = (value) => value && typeof value === "object" && !Array.isArray(value);

function rpcResponse(raw, contentType) {
  if (!contentType.includes("text/event-stream")) return JSON.parse(raw);
  for (const event of raw.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data) continue;
    const value = JSON.parse(data);
    if (value.id === 1) return value;
  }
  throw invalidResponse();
}

function rpcError(error, retryAfter) {
  const status = error?.status || error?.data?.status || error?.code;
  const message = String(error?.message || "");
  const namedStatus = /^(?:Error:\s*)?([A-Z_]+)\b/.exec(message)?.[1];
  const statuses = {
    UNAUTHENTICATED: 401, PERMISSION_DENIED: 403, NOT_FOUND: 404, RESOURCE_EXHAUSTED: 429, INVALID_ARGUMENT: 400,
    401: 401, 403: 403, 404: 404, 429: 429, 400: 400, "-32602": 400
  };
  const providerStatus = statuses[status] || statuses[namedStatus] ||
    (/^(?:Error:\s*)?Requested entity was not found\b/i.test(message) ? 404 : undefined);
  return Object.assign(new Error("Gmail MCP request failed."), { providerStatus, retryAfter });
}

function receiptTime(message) {
  const internal = Number(message.internalDate);
  const timestamp = internal > 0 ? internal : Date.parse(message.date);
  if (!Number.isFinite(new Date(timestamp).getTime())) throw invalidResponse();
  return timestamp;
}

function isInbox(message) {
  const labels = message.labelIds ?? [];
  if (!Array.isArray(labels)) throw invalidResponse();
  return labels.includes("INBOX") && !SKIP_LABELS.some(label => labels.includes(label));
}

function searchDate(timestamp, followingDay = false) {
  const date = pacificDate.format(timestamp);
  const day = followingDay ? new Date(Date.parse(date) + DAY).toISOString().slice(0, 10) : date;
  return day.replaceAll("-", "/");
}

function createGmailMcp({ request }) {
  async function call(accessToken, name, args) {
    const response = await request(ENDPOINT, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })
    });
    const retryAfter = Math.min(86400, Math.max(60, Number(response.headers.get("retry-after")) || 60));
    if (!response.ok) {
      // An HTTP 404 can also mean the service endpoint is unavailable.
      throw rpcError({ code: response.status === 404 ? 502 : response.status }, retryAfter);
    }
    const envelope = rpcResponse(await response.text(), response.headers.get("content-type") || "");
    if (envelope?.id !== 1 || envelope.jsonrpc !== "2.0") throw invalidResponse();
    if (envelope.error) throw rpcError(envelope.error, retryAfter);
    const result = envelope.result;
    if (!object(result)) throw invalidResponse();
    if (result.isError) {
      const error = result.structuredContent?.error || { message: result.content?.[0]?.text };
      throw rpcError(error, retryAfter);
    }
    if (object(result.structuredContent)) return result.structuredContent;
    if (result.content?.length === 1 && result.content[0].type === "text") {
      const data = JSON.parse(result.content[0].text);
      if (object(data)) return data;
    }
    throw invalidResponse();
  }

  async function threadMessages(thread, accessToken) {
    if (typeof thread.id !== "string" || !thread.id) throw invalidResponse();
    const subset = thread.messages ?? [];
    if (!Array.isArray(subset)) throw invalidResponse();
    if (Number.isInteger(thread.messageCount) && thread.messageCount === subset.length) return subset;
    try {
      const full = await call(accessToken, "get_thread", { threadId: thread.id, messageFormat: "METADATA_ONLY" });
      if (full.id !== thread.id || (full.messages !== undefined && !Array.isArray(full.messages))) throw invalidResponse();
      return full.messages || [];
    } catch (error) {
      if (error.providerStatus === 404) return [];
      throw error;
    }
  }

  async function page(connection, accessToken, now) {
    const sync = connection.sync?.transport === "gmail-mcp" ? connection.sync : {};
    const since = Date.parse(connection.since);
    if (!Number.isFinite(since)) throw invalidResponse();
    const checkpoint = sync.checkpoint ?? since;
    const lower = Math.max(since, checkpoint - INDEX_OVERLAP);
    const upper = sync.upper ?? Math.min(now, checkpoint + MAX_WINDOW);
    const committed = { transport: "gmail-mcp", checkpoint };
    if (upper <= checkpoint) return { ids: [], sync: committed, more: false };

    // Hold the boundaries fixed across pages, transient errors and restarts.
    const search = { query: `in:inbox after:${searchDate(lower)} before:${searchDate(upper - 1, true)}`,
      view: "THREAD_VIEW_METADATA_ONLY", pageSize: 10 };
    let data;
    try {
      data = await call(accessToken, "search_threads", sync.pageToken ? { ...search, pageToken: sync.pageToken } : search);
    } catch (error) {
      if (!sync.pageToken || error.providerStatus !== 400) throw error;
      // Restart the same window; the mailbox's existing analysis markers deduplicate it.
      return { ids: [], sync: { ...committed, upper }, more: true };
    }
    if ((data.threads !== undefined && !Array.isArray(data.threads)) ||
        (data.nextPageToken !== undefined && (typeof data.nextPageToken !== "string" || data.nextPageToken.length > 16000)) ||
        (data.nextPageToken && data.nextPageToken === sync.pageToken)) throw invalidResponse();
    const ids = new Set();
    for (const thread of data.threads || []) {
      for (const message of await threadMessages(thread, accessToken)) {
        if (!isInbox(message)) continue;
        const time = receiptTime(message);
        if (time >= lower && time < upper) {
          if (typeof message.id !== "string" || !message.id) throw invalidResponse();
          ids.add(message.id);
        }
      }
    }
    return { ids: [...ids], sync: data.nextPageToken ? { ...committed, upper, pageToken: data.nextPageToken } : { ...committed, checkpoint: upper },
      more: Boolean(data.nextPageToken) || now - upper >= GMAIL_MCP_INTERVAL };
  }

  async function message(id, accessToken) {
    let data;
    try {
      data = await call(accessToken, "get_message", { messageId: id, messageFormat: "PLAIN_TEXT" });
    } catch (error) {
      if (error.providerStatus === 404) return null;
      throw error;
    }
    if (data.id !== id) throw invalidResponse();
    if (!isInbox(data)) return null;
    const displayName = data.addressDisplayNames?.find(entry => entry.emailAddress === data.sender)?.displayName;
    const sender = displayName ? `${displayName} <${data.sender}>` : data.sender;
    return { id, subject: String(data.subject || "").slice(0, 400), sender: String(sender || "").slice(0, 500),
      receivedAt: new Date(receiptTime(data)).toISOString(), text: String(data.plaintextBody || "").slice(0, 16000),
      ...(Number(data.internalDate) > 0 ? {} : { missingInternalDate: true }) };
  }

  return { page, message };
}

module.exports = { createGmailMcp, GMAIL_MCP_INTERVAL };
