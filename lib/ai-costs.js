"use strict";
const { randomUUID } = require("node:crypto");
const { failedPayload, streamResult } = require("./ai-provider-result");
const { cost } = require("./ai-usage");
const DAY = 86400000;
const paths = new Set(["/v1/responses", "/v1/chat/completions", "/v1/images/generations", "/v1/images/edits", "/v1/audio/transcriptions"]);
const count = (n) => Number.isSafeInteger(n) && n >= 0 ? n : 0;

const COST_PERIODS = ["7", "30", "90", "180", "365", "all"];
function costWindow(period, since, time = Date.now()) {
  if (!COST_PERIODS.includes(String(period))) throw Object.assign(new Error("Invalid AI cost period."), { statusCode: 400 });
  const through = new Date(time).toISOString().slice(0, 10);
  const from = period === "all" ? since.slice(0, 10)
    : new Date(Date.parse(through) - (Number(period) - 1) * DAY).toISOString().slice(0, 10);
  return { period: String(period), from, through, since };
}

// Independent of HTTP feature analytics and personal allowances: every provider call
// is persisted BEFORE dispatch. Missing settlements remain visible after a restart.
function createAiCosts({ db, request = (...args) => fetch(...args), now = Date.now, env = process.env }) {
  let since;
  const guard = require("./ai-cost-guard").createCostGuard({ db, now, env });
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
      operationId: attribution.operationId || null, status: "pending", amountMicros: null, estimateMicros: count(attribution.estimateMicros), pricingVersion: "2026-11-20" };
    if (!row.estimateMicros && row.payer === "platform") {
      const rates = row.model === "gpt-6-luna" ? [0.1, 0.5] : [2, 10];
      row.estimateMicros = Math.ceil(JSON.stringify(body).length * rates[0] * 2.5 + (body.max_output_tokens || body.max_completion_tokens || 8192) * rates[1] + (body.tools?.length ? 60000 : 0));
    }
    let fingerprint;
    if (form) {
      const parts = [];
      for (const [key, value] of options.body.entries()) parts.push([key, typeof value === "string" ? value : guard.hash(Buffer.from(await value.arrayBuffer()))]);
      fingerprint = guard.hash(JSON.stringify(parts));
    } else {
      const identity = { ...body }; delete identity.max_output_tokens; delete identity.max_completion_tokens;
      fingerprint = guard.hash(JSON.stringify([target.pathname, identity]));
    }
    await started();
    const completeGuard = await guard.admit(row, fingerprint);
    try { await db.putAiCost(row); } catch (error) { await completeGuard(0, false); throw error; } // Never issue a paid request if its durable trace cannot be saved.
    let finishing;
    function finish(status, payload, response) {
      if (finishing) return finishing;
      finishing = (async () => {
      const amount = payload ? cost(row.model, payload, { cacheTtl: body.prompt_cache_options?.ttl }) : null;
      row.amountMicros = amount ?? (status === "rejected" ? 0 : null);
      row.status = amount !== null ? "calculated" : status === "rejected" ? "rejected" : "unknown";
      row.finishedAt = new Date(now()).toISOString();
      row.httpStatus = response?.status || null;
      row.providerRequestId ||= response?.headers.get("x-request-id")?.slice(0, 150) || null;
      row.providerResponseId = typeof payload?.id === "string" ? payload.id.slice(0,150) : null;
      row.outcome = status === "failed" || status === "rejected" || failedPayload(payload) ? "failed" : "completed";
      const u = payload?.usage || {}, d = u.input_tokens_details || u.prompt_tokens_details || {};
      row.inputTokens = count(u.input_tokens ?? u.prompt_tokens);
      row.outputTokens = count(u.output_tokens ?? u.completion_tokens);
      row.cachedTokens = count(d.cached_tokens);
      row.cacheWriteTokens = count(d.cache_write_tokens);
      row.searchCalls = (payload?.output || []).filter((x) => x.type === "web_search_call").length;
      await completeGuard(row.amountMicros, row.outcome === "failed").catch(() => { storageFailures++; });
      try { await db.putAiCost(row); }
      catch { storageFailures++; console.warn("AI cost settlement could not be saved; durable pending request requires reconciliation."); }
      })();
      return finishing;
    }
    let response;
    try { response = await request(url, options); }
    catch (e) { await finish("unknown"); throw e; }
    row.providerRequestId = response.headers.get("x-request-id")?.slice(0,150) || null;
    if (row.providerRequestId) await db.putAiCost(row).catch(() => { storageFailures++; });
    if (!response.ok) {
      const text = await response.text(); let payload; try { payload = JSON.parse(text); } catch {}
      const rejected = !payload?.usage && [400,401,403,404,413,422,429].includes(response.status);
      await finish(rejected ? "rejected" : "failed", payload, response);
      return new Response(text, {status:response.status,headers:response.headers});
    }
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
    let buffer = "";
    const resultState = streamResult(), parseLine = line => resultState.line(line);
    return new Response(new ReadableStream({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            buffer += decoder.decode(); if (buffer.trim()) parseLine(buffer.trim());
            await finish(resultState.failed ? "failed" : "unknown", resultState.payload, response); controller.close(); return;
          }
          buffer += decoder.decode(next.value, { stream: true });
          let index;
          while ((index = buffer.indexOf("\n")) >= 0) { parseLine(buffer.slice(0, index).trim()); buffer = buffer.slice(index + 1); }
          if (buffer.length > 2 * 1024 * 1024) { throw Error("AI stream packet is too large."); }
          controller.enqueue(next.value);
        } catch (e) { await finish("failed", resultState.payload, response); controller.error(e); }
      },
      async cancel() { await reader.cancel().catch(() => {}); await finish(resultState.failed ? "failed" : "unknown", resultState.payload, response); }
    }), { status: response.status, headers: response.headers });
  }

  // Provider costs are a separate source, never added to calculated request costs.
  // Require an explicit project filter; an organization total may include other apps.
  const official = require("./ai-official-costs").createOfficialCosts({ db, request, now, env }).read;
  async function report(from, through, userId) {
    const first = await started(), days = [];
    for (let day = Math.max(Date.parse(from), Date.parse(first.slice(0, 10))); day <= Date.parse(through); day += DAY) days.push(new Date(day).toISOString().slice(0, 10));
    const rows = (await db.listAiCosts(days)).filter((r) => !userId || r.userId === userId && r.payer === "user");
    for (const row of rows) if (row.status === "pending" && now() - Date.parse(row.startedAt) >= 10 * 60000) await db.markAiCostUnresolved(row);
    const control = !userId ? await db.getAiCostControl(`guard:${new Date(now()).toISOString().slice(0,10)}`) : null;
    const result = { controls: control ? { spentUsd: control.spent / 1e6, budgetUsd: control.budgetMicros / 1e6, blocked: control.blocked, coolingScopes: Object.values(control.failures).filter(f => f.count >= 3 && f.until > now()).length } : null, since: first, calculatedUsd: 0, userUsd: 0, platformUsd: 0, estimatedUsd: 0,
      unknownRequests: 0, pendingRequests: 0, failedUsd: 0, requests: rows.length, storageFailures, sources: [] };
    const sources = new Map();
    for (const r of rows) {
      const key = `${r.source}:${r.model}`, source = sources.get(key) || { source: r.source, model: r.model, requests: 0, calculatedUsd: 0, failedUsd: 0, unknownRequests: 0 };
      source.requests++;
      if (r.amountMicros !== null && r.amountMicros !== undefined) {
        const amount = r.amountMicros;
        if (r.outcome === "failed") { result.failedUsd += amount; source.failedUsd += amount; }
        result.calculatedUsd += amount; result[r.payer === "platform" ? "platformUsd" : "userUsd"] += amount; source.calculatedUsd += amount;
      } else if (r.status === "pending" && now() - Date.parse(r.startedAt) < 10 * 60000) result.pendingRequests++;
      else { result.unknownRequests++; source.unknownRequests++; result.estimatedUsd += (r.estimateMicros || 0) / 1e6; }
      sources.set(key, source);
    }
    result.failedUsd /= 1e6; result.calculatedUsd /= 1e6; result.userUsd /= 1e6; result.platformUsd /= 1e6;
    for (const source of sources.values()) { source.calculatedUsd /= 1e6; source.failedUsd /= 1e6; }
    result.sources = [...sources.values()].sort((a, b) => b.calculatedUsd - a.calculatedUsd);
    if (!userId) {
      result.official = await official(from, through).catch(() => ({ status: "unavailable" }));
      result.unallocatedUsd = result.official.status === "available" ? Math.max(0, result.official.amountUsd - result.calculatedUsd) : null;
      result.differenceUsd = result.official.status === "available" ? result.official.amountUsd - result.calculatedUsd : null;
      result.cash = { status: "not_connected", topupsUsd: null, taxesUsd: null, balanceUsd: null };
    }
    return result;
  }
  async function periodReport(period) {
    const window = costWindow(period, await started(), now());
    if (String(period) === "all" && env.OPENAI_COSTS_ADMIN_KEY && env.OPENAI_COSTS_PROJECT_ID) {
      const configured = env.OPENAI_COSTS_HISTORY_START || "2020-01-01";
      if (/^\d{4}-\d{2}-\d{2}$/.test(configured) && Number.isFinite(Date.parse(configured)) && configured <= window.through)
        window.from = configured < window.from ? configured : window.from;
    }
    return { ...window, aiCosts: await report(window.from, window.through) };
  }
  return { fetch: trackedFetch, report, periodReport, started, failedOperation: guard.failedOperation };
}
module.exports = { createAiCosts, costWindow };
