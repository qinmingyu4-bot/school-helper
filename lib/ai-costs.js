"use strict";
const { randomUUID } = require("node:crypto");
const { cost } = require("./ai-usage");
const DAY = 86400000;
const paths = new Set(["/v1/responses", "/v1/chat/completions", "/v1/images/generations", "/v1/images/edits", "/v1/audio/transcriptions"]);
const count = (n) => Number.isSafeInteger(n) && n >= 0 ? n : 0;

// Independent of HTTP feature analytics and personal allowances: every provider call
// is persisted BEFORE dispatch. Missing settlements remain visible after a restart.
function createAiCosts({ db, request = (...args) => fetch(...args), now = Date.now, env = process.env }) {
  let since;
  let storageFailures = 0;
  const started = () => since ||= db.aiCostSince(new Date(now()).toISOString()).catch((e) => { since = null; throw e; });
  async function trackedFetch(url, options = {}, attribution = {}) {
    const target = new URL(url);
    if (target.origin !== "https://api.openai.com" || options.method !== "POST" || !paths.has(target.pathname)) return request(url, options);
    const form = options.body instanceof FormData;
    const body = form ? { model: options.body.get("model") } : JSON.parse(options.body);
    if (!form && ["/v1/responses", "/v1/chat/completions"].includes(target.pathname)) {
      body.service_tier = "default";
      options = { ...options, body: JSON.stringify(body) };
    }
    const row = { id: randomUUID(), startedAt: new Date(now()).toISOString(), endpoint: target.pathname,
      model: String(body.model || "unknown").slice(0, 100), source: attribution.source || "user",
      payer: attribution.payer === "platform" ? "platform" : "user", userId: attribution.userId || null,
      status: "pending", amountMicros: null, estimateMicros: count(attribution.estimateMicros), pricingVersion: "2026-11-20" };
    await started();
    await db.putAiCost(row); // Never issue a paid request if its durable trace cannot be saved.
    let finishing;
    function finish(status, payload, response) {
      if (finishing) return finishing;
      finishing = (async () => {
      const amount = payload ? cost(row.model, payload, { cacheTtl: body.prompt_cache_options?.ttl }) : null;
      row.amountMicros = status === "rejected" ? 0 : amount;
      row.status = amount !== null ? "calculated" : status === "rejected" ? "rejected" : "unknown";
      row.finishedAt = new Date(now()).toISOString();
      row.httpStatus = response?.status || null;
      row.providerRequestId = response?.headers.get("x-request-id")?.slice(0, 150) || null;
      const u = payload?.usage || {}, d = u.input_tokens_details || u.prompt_tokens_details || {};
      row.inputTokens = count(u.input_tokens ?? u.prompt_tokens);
      row.outputTokens = count(u.output_tokens ?? u.completion_tokens);
      row.cachedTokens = count(d.cached_tokens);
      row.cacheWriteTokens = count(d.cache_write_tokens);
      row.searchCalls = (payload?.output || []).filter((x) => x.type === "web_search_call").length;
      try { await db.putAiCost(row); }
      catch { storageFailures++; console.warn("AI cost settlement could not be saved; durable pending request requires reconciliation."); }
      })();
      return finishing;
    }
    let response;
    try { response = await request(url, options); }
    catch (e) { await finish("unknown"); throw e; }
    if (!response.ok) { await finish(response.status >= 400 && response.status < 500 && response.status !== 408 ? "rejected" : "unknown", null, response); return response; }
    if (!body.stream) {
      // Reconstruct only JSON responses; image bytes are carried inside JSON unchanged.
      let text;
      try { text = await response.text(); }
      catch (e) { await finish("unknown", null, response); throw e; }
      let payload;
      try { payload = JSON.parse(text); } catch {}
      await finish("unknown", payload, response);
      return new Response(text, { status: response.status, headers: response.headers });
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "", payload, invalid = false;
    const parseLine = (line) => {
      if (!line.startsWith("data:") || line.slice(5).trim() === "[DONE]") return;
      try {
        const item = JSON.parse(line.slice(5));
        if (item.response?.usage) payload = item.response;
        else if (item.usage) payload = item;
      } catch { invalid = true; }
    };
    return new Response(new ReadableStream({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            buffer += decoder.decode(); if (buffer.trim()) parseLine(buffer.trim());
            await finish("unknown", invalid ? null : payload, response); controller.close(); return;
          }
          buffer += decoder.decode(next.value, { stream: true });
          let index;
          while ((index = buffer.indexOf("\n")) >= 0) { parseLine(buffer.slice(0, index).trim()); buffer = buffer.slice(index + 1); }
          if (buffer.length > 2 * 1024 * 1024) { invalid = true; buffer = ""; }
          controller.enqueue(next.value);
        } catch (e) { await finish("unknown", payload, response); controller.error(e); }
      },
      async cancel() { await reader.cancel().catch(() => {}); await finish("unknown", payload, response); }
    }), { status: response.status, headers: response.headers });
  }

  // Provider costs are a separate source, never added to calculated request costs.
  // Require an explicit project filter; an organization total may include other apps.
  const officialCache = new Map();
  async function official(from, through) {
    if (!env.OPENAI_COSTS_ADMIN_KEY || !env.OPENAI_COSTS_PROJECT_ID) return { status: "not_configured" };
    const key = `${from}:${through}`, cached = officialCache.get(key);
    if (cached && now() - cached.at < 5 * 60000) return cached.value;
    const start = Date.parse(from) / 1000, end = (Date.parse(through) + DAY) / 1000;
    const signal = AbortSignal.timeout(20000);
    let page, total = 0; const items = new Map(), seen = new Set();
    try {
      for (let index = 0; index < 100; index++) {
        const url = new URL("https://api.openai.com/v1/organization/costs");
        for (const [k, v] of Object.entries({ start_time: start, end_time: end, limit: 31, bucket_width: "1d" })) url.searchParams.set(k, String(v));
        url.searchParams.append("project_ids", env.OPENAI_COSTS_PROJECT_ID);
        if (env.OPENAI_COSTS_API_KEY_ID) url.searchParams.append("api_key_ids", env.OPENAI_COSTS_API_KEY_ID);
        url.searchParams.append("group_by", "line_item");
        if (page) url.searchParams.set("page", page);
        const response = await request(url.toString(), { headers: { authorization: `Bearer ${env.OPENAI_COSTS_ADMIN_KEY}` }, signal });
        if (!response.ok) throw new Error("costs-unavailable");
        const data = await response.json();
        if (!Array.isArray(data.data)) throw new Error("costs-invalid");
        for (const bucket of data.data) {
          if (bucket.start_time < start || bucket.start_time >= end || !Array.isArray(bucket.results)) throw new Error("costs-invalid");
          for (const item of bucket.results) {
            if (item.amount?.currency !== "usd" || !Number.isFinite(item.amount.value)) throw new Error("costs-invalid");
            total += item.amount.value;
            const label = String(item.line_item || "other"); items.set(label, (items.get(label) || 0) + item.amount.value);
          }
        }
        if (!data.has_more) {
          const value = { status: "available", amountUsd: total, fetchedAt: new Date(now()).toISOString(),
            projectId: env.OPENAI_COSTS_PROJECT_ID, keyFiltered: Boolean(env.OPENAI_COSTS_API_KEY_ID),
            items: [...items].map(([label, amountUsd]) => ({ label, amountUsd })) };
          officialCache.set(key, { at: now(), value }); return value;
        }
        if (!data.next_page || seen.has(data.next_page)) throw new Error("costs-pagination");
        page = data.next_page; seen.add(page);
      }
      throw new Error("costs-pagination");
    } catch { return { status: "unavailable" }; }
  }
  async function report(from, through, userId) {
    const first = await started(), days = [];
    for (let day = Date.parse(from); day <= Date.parse(through); day += DAY) days.push(new Date(day).toISOString().slice(0, 10));
    const rows = (await db.listAiCosts(days)).filter((r) => !userId || r.userId === userId && r.payer === "user");
    const result = { since: first, calculatedUsd: 0, userUsd: 0, platformUsd: 0, estimatedUsd: 0,
      unknownRequests: 0, pendingRequests: 0, requests: rows.length, storageFailures, sources: [] };
    const sources = new Map();
    for (const r of rows) {
      const key = `${r.source}:${r.model}`, source = sources.get(key) || { source: r.source, model: r.model, requests: 0, calculatedUsd: 0, unknownRequests: 0 };
      source.requests++;
      if (r.amountMicros !== null && r.amountMicros !== undefined) {
        const amount = r.amountMicros / 1e6;
        result.calculatedUsd += amount; result[r.payer === "platform" ? "platformUsd" : "userUsd"] += amount; source.calculatedUsd += amount;
      } else if (r.status === "pending" && now() - Date.parse(r.startedAt) < 10 * 60000) result.pendingRequests++;
      else { result.unknownRequests++; source.unknownRequests++; result.estimatedUsd += (r.estimateMicros || 0) / 1e6; }
      sources.set(key, source);
    }
    result.sources = [...sources.values()].sort((a, b) => b.calculatedUsd - a.calculatedUsd);
    if (!userId) result.official = await official(from, through);
    return result;
  }
  return { fetch: trackedFetch, report, started };
}
module.exports = { createAiCosts };
