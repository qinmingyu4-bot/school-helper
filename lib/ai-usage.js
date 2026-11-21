"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const { failedPayload, streamResult } = require("./ai-provider-result");
const { membershipTier } = require("./membership");
const { SOL_MODEL, PREVIOUS_SOL_MODEL } = require("./ai-models");
const WEEK = 7 * 86400000;
const LIMITS = { standard: 500000, plus: 2000000 }; // Integer millionths of USD.
const SOL_PRICES = [2, 10, 0.1];
const PRICES = { "gpt-6-luna": [0.1, 0.5, 0.01], [SOL_MODEL]: SOL_PRICES, [PREVIOUS_SOL_MODEL]: SOL_PRICES };
// USD per million text-input, image-input, and image-output tokens.
const IMAGE_PRICES = new Map([
  ["gpt-image-2", [2.5, 4, 15]],
  ["gpt-image-2.6-sunburst", [5, 8, 30]],
  ["gpt-image-2.6-flare", [5, 8, 30]]
]);
const fail = (message, statusCode = 429) => Object.assign(new Error(message), { statusCode, usageError: true });
const exhausted = () => fail("暂时无法开始新的 AI 请求，请稍后再试。");
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

function cost(model, payload, options = {}) {
  const usage = payload?.usage;
  if (!usage) return null;
  if (model === "gpt-transcribe") {
    const seconds = usage.seconds ?? payload.duration;
    return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 75) : null;
  }
  const imageRates = IMAGE_PRICES.get(model);
  if (imageRates) {
    const detail = usage.input_tokens_details;
    if (!detail || !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0 ||
        !Number.isSafeInteger(detail.text_tokens) || detail.text_tokens < 0 ||
        !Number.isSafeInteger(detail.image_tokens) || detail.image_tokens < 0 ||
        count(detail.cached_tokens) || count(usage.input_cached_tokens) || payload.svg_usage || count(usage.output_tokens_details?.text_tokens)) return null;
    return Math.ceil(count(detail.text_tokens) * imageRates[0] + count(detail.image_tokens) * imageRates[1] + count(usage.output_tokens) * imageRates[2]);
  }
  const rates = PRICES[model];
  const input = usage.input_tokens ?? usage.prompt_tokens, output = usage.output_tokens ?? usage.completion_tokens;
  if (!rates || !Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0) return null;
  const detail = usage.input_tokens_details ?? usage.prompt_tokens_details ?? {};
  for (const value of [detail.cached_tokens, detail.cache_write_tokens,
    detail.cache_write_tokens_details?.ttl_30m_tokens, detail.cache_write_tokens_details?.ttl_12h_tokens]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) return null;
  }
  const cached = count(detail.cached_tokens), writes = count(detail.cache_write_tokens);
  const lifetimes = detail.cache_write_tokens_details;
  const shortWrites = lifetimes ? count(lifetimes.ttl_30m_tokens) : options.cacheTtl === "12h" ? 0 : writes;
  const longWrites = lifetimes ? count(lifetimes.ttl_12h_tokens) : options.cacheTtl === "12h" ? writes : 0;
  if (cached + writes > input || shortWrites + longWrites !== writes) return null;
  if (payload.service_tier && !["default", "standard"].includes(payload.service_tier)) return null;
  const long = input > 272000;
  let total = ((input - cached - writes) * rates[0] + cached * rates[2] + shortWrites * rates[0] * 1.25 + longWrites * rates[0] * 2.5) * (long ? 2 : 1) + output * rates[1] * (long ? 1.5 : 1);
  total += (payload.output || []).filter((item) => item.type === "web_search_call").length * 10000;
  const containers = new Set((payload.output || []).filter((item) => item.type === "code_interpreter_call").map((item) => item.container_id).filter(Boolean));
  total += containers.size * 30000;
  return Math.ceil(total);
}

function createAiUsage({ db, entitlement = async () => null, isUnlimited = () => false, request = (...args) => fetch(...args), now = Date.now, onRequest = () => {} }) {
  const context = new AsyncLocalStorage();
  async function allowance(userId) {
    const user = await db.getUser(userId, { consistent: true });
    if (!user) throw fail("Please log in first.", 401);
    const tier = membershipTier({ ...user, paidMembershipExpiresAt: await entitlement(userId) }, now());
    return { tier, limit: isUnlimited(user) ? Infinity : LIMITS[tier] };
  }
  function ledger(value) {
    const state = value || { anchor: now(), periods: {} };
    for (const period of Object.values(state.periods)) {
      for (const [id, hold] of Object.entries(period.holds)) {
        if (hold.until <= now()) delete period.holds[id]; // Abandoned work is a platform cost, never a user charge.
      }
    }
    const start = state.anchor + Math.floor((now() - state.anchor) / WEEK) * WEEK;
    state.periods[start] ||= { used: 0, estimated: 0, holds: {}, inputTokens: 0, outputTokens: 0 };
    for (const key of Object.keys(state.periods)) if (Number(key) < start - 8 * WEEK && !Object.keys(state.periods[key].holds).length) delete state.periods[key];
    return { state, start, period: state.periods[start] };
  }
  function summary(state, { tier, limit }) {
    const { start, period } = ledger(structuredClone(state));
    const pending = Object.values(period.holds).reduce((sum, hold) => sum + hold.amount, 0);
    const unlimited = limit === Infinity;
    return { tier, currency: "USD", unlimited, limitUsd: unlimited ? null : limit / 1e6, usedUsd: period.used / 1e6,
      pendingUsd: pending / 1e6, estimatedUsd: period.estimated / 1e6,
      remainingUsd: unlimited ? null : Math.max(0, limit - period.used - pending) / 1e6,
      resetsAt: state ? new Date(start + WEEK).toISOString() : null, periodStartedAt: state ? new Date(start).toISOString() : null };
  }
  async function status(userId) {
    const accountAllowance = await allowance(userId);
    const before = await db.getAiUsage(userId);
    // Viewing the allowance does not start the first week.
    const snapshot = before ? ledger(structuredClone(before)).state : null;
    // Ordinary visible-tab polls must not serialize the full local database (or
    // transact in DynamoDB). Only reconcile expiry/rollover, on the latest state
    // inside the existing atomic mutation, so concurrent reservations survive.
    const state = before && JSON.stringify(snapshot) !== JSON.stringify(before)
      ? await db.changeAiUsage(userId, (value) => ledger(value).state) : snapshot;
    return { userId, ...summary(state, accountAllowance) };
  }
  async function reserve(userId, amount) {
    const operationId = context.getStore()?.operationId;
    const { limit } = await allowance(userId), id = randomUUID();
    let start;
    await db.changeAiUsage(userId, (value) => {
      const current = ledger(value); start = current.start;
      const pending = Object.values(current.period.holds).reduce((sum, hold) => sum + hold.amount, 0);
      if (current.period.used + pending + amount > limit) throw exhausted();
      if (operationId && Object.values(current.state.periods).some(period => period.operations?.[operationId]?.refunded)) throw fail("该任务已终止，额度已释放。", 409);
      current.period.holds[id] = { amount, until: now() + 10 * 60000, ...(operationId ? { operationId } : {}) };
      return current.state;
    });
    return { userId, id, start, amount };
  }
  async function settle(ticket, amount, payload, estimated = false) {
    await db.changeAiUsage(ticket.userId, (state) => {
      const period = state?.periods[ticket.start];
      if (!period?.holds[ticket.id]) return state; // Idempotent across completion/cancellation.
      const hold = period.holds[ticket.id];
      delete period.holds[ticket.id];
      if (hold.operationId) {
        const operation = (period.operations ||= {})[hold.operationId] ||= { used: 0, estimated: 0 };
        if (operation.refunded) return state;
        operation.used += Math.max(0, amount);
        if (estimated) operation.estimated += Math.max(0, amount);
      }
      period.used += Math.max(0, amount);
      if (estimated) period.estimated += Math.max(0, amount);
      period.inputTokens += count(payload?.usage?.input_tokens ?? payload?.usage?.prompt_tokens);
      period.outputTokens += count(payload?.usage?.output_tokens ?? payload?.usage?.completion_tokens);
      return state;
    });
  }
  async function refundOperation(userId, operationId) {
    let refunded = 0, released = 0;
    await db.changeAiUsage(userId, (state) => {
      refunded = 0; released = 0; // Conditional Dynamo retries must not accumulate twice.
      if (!state) return state;
      for (const period of Object.values(state.periods)) {
        const operation = (period.operations ||= {})[operationId] ||= { used: 0, estimated: 0 };
        if (!operation.refunded) {
          refunded += operation.used;
          period.used = Math.max(0, period.used - operation.used);
          period.estimated = Math.max(0, period.estimated - operation.estimated);
          operation.refunded = true; operation.refundedAt = now();
        }
        for (const [id, hold] of Object.entries(period.holds)) if (hold.operationId === operationId) {
          released += hold.amount; delete period.holds[id];
        }
      }
      return state;
    });
    return { status: "refunded", refunded, released };
  }
  async function refundCreative(job) {
    if (job.allowanceVersion === 1) return refundOperation(job.userId, job.id);
    // Settled legacy totals have no request/job identity. Do not deduct an
    // assumed refund from unrelated successful requests; an operator must review.
    return { status: "needs_review", refunded: 0, released: 0 };
  }
  async function meteredFetch(url, options = {}) {
    const route = new URL(url).pathname;
    if (options.method !== "POST" || !["/v1/responses", "/v1/chat/completions", "/v1/images/generations", "/v1/images/edits", "/v1/audio/transcriptions", "/v1/videos"].includes(route)) return request(url, options);
    const userId = context.getStore()?.userId;
    if (!userId) throw fail("AI 请求缺少所属账号。", 503);
    const form = options.body instanceof FormData;
    const body = form ? options.body : JSON.parse(options.body);
    const model = form ? body.get("model") : body.model;
    const rates = PRICES[model];
    const imageModel = IMAGE_PRICES.has(model);
    if (!rates && !imageModel && model !== "gpt-transcribe") throw fail("当前模型尚未配置额度计费，请联系管理员。", 503);
    const balance = await status(userId);
    const available = balance.unlimited ? Infinity : Math.floor(balance.remainingUsd * 1e6);
    if (available <= 0) throw exhausted();
    const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(5 * 60000)]);
    let amount;
    if (rates) {
      const input = body.input || body.messages.map((message) => ({ ...message, content: Array.isArray(message.content) ? message.content.map((part) => {
        if (part.type === "file") return { type: "input_file", filename: part.file.filename, file_data: part.file.file_data };
        if (part.type === "image_url") return { type: "input_image", image_url: part.image_url.url, detail: part.image_url.detail || "auto" };
        return { type: "input_text", text: part.text };
      }) : message.content }));
      const counted = await request("https://api.openai.com/v1/responses/input_tokens", { method: "POST", signal, headers: options.headers,
        body: JSON.stringify({ model, input, ...(body.tools ? { tools: body.tools } : {}) }) });
      if (!counted.ok) throw fail("暂时无法估算本次 AI 用量，请稍后重试。", 503);
      const inputTokens = (await counted.json()).input_tokens;
      if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) throw fail("暂时无法估算本次 AI 用量，请稍后重试。", 503);
      const long = inputTokens > 272000;
      // Reserve search context headroom and bound tool calls as well as output.
      const search = body.tools?.some((tool) => tool.type.startsWith("web_search"));
      const code = body.tools?.some((tool) => tool.type === "code_interpreter");
      const overhead = (search ? 20000 + 32000 * rates[0] * 2 : 0) + (code ? 30000 : 0);
      const inputCost = inputTokens * rates[0] * (body.prompt_cache_options?.ttl === "12h" ? 2.5 : 1.25) * (long ? 2 : 1) + overhead;
      const outputRate = rates[1] * (long || search ? 1.5 : 1);
      const maxOutput = Math.min(body.max_output_tokens || body.max_completion_tokens || 8192, Math.floor((available - inputCost) / outputRate));
      if (maxOutput < 256) throw exhausted();
      amount = Math.ceil(inputCost + maxOutput * outputRate);
      body[route === "/v1/responses" ? "max_output_tokens" : "max_completion_tokens"] = maxOutput;
      body.service_tier = "default";
      if (body.tools?.length) body.max_tool_calls = 2;
      if (body.stream && route === "/v1/chat/completions") body.stream_options = { include_usage: true };
    } else {
      amount = await require("./ai-media-estimates").mediaEstimate(model, body, IMAGE_PRICES.get(model));
      if (amount > available) throw exhausted();
    }
    const ticket = await reserve(userId, amount);
    let recorded = false;
    async function finishTicket(value, payload, estimated = false) {
      await settle(ticket, value, payload, estimated);
      if (recorded) return;
      recorded = true;
      onRequest({ userId, amount: value, estimated, reported: Boolean(payload?.usage),
        inputTokens: count(payload?.usage?.input_tokens ?? payload?.usage?.prompt_tokens),
        outputTokens: count(payload?.usage?.output_tokens ?? payload?.usage?.completion_tokens) });
    }
    let response;
    try { response = await request(url, { ...options, signal, body: form ? body : JSON.stringify(body) }, { estimateMicros: amount }); }
    catch (error) { await finishTicket(0); throw error; }
    if (!response.ok) { await finishTicket(0); return response; }
    if (!body.stream) {
      try {
        const text = await response.text(), payload = JSON.parse(text);
        const failed = failedPayload(payload);
        const actual = cost(model, payload, { cacheTtl: body.prompt_cache_options?.ttl });
        await finishTicket(failed ? 0 : actual ?? amount, failed ? null : payload, !failed && actual === null);
        return new Response(text, { status: response.status, headers: response.headers });
      } catch (error) { await finishTicket(0); throw error; }
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "", finished = false;
    const resultState = streamResult();
    async function finish(failed = false) {
      if (finished) return;
      const payload = resultState.payload;
      const actual = cost(model, payload, { cacheTtl: body.prompt_cache_options?.ttl });
      await finishTicket(failed ? 0 : actual ?? amount, failed ? null : payload, !failed && actual === null);
      finished = true;
    }
    const parseLine = line => resultState.line(line);
    return new Response(new ReadableStream({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) { buffer += decoder.decode(); if (buffer.trim()) parseLine(buffer); await finish(resultState.failed); controller.close(); return; }
          buffer += decoder.decode(result.value, { stream: true });
          let newline;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
            parseLine(line);
          }
          if (buffer.length > 2 * 1024 * 1024) throw new Error("AI stream packet is too large.");
          controller.enqueue(result.value);
        } catch (error) { await finish(true); controller.error(error); }
      },
      async cancel() { await reader.cancel().catch(() => {}); await finish(resultState.failed); }
    }), { status: response.status, headers: response.headers });
  }
  return { context, run: (userId, work) => context.run({ userId }, work),
    runOperation: (userId, operationId, work) => context.run({ userId, operationId }, work),
    status, reserve, settle, refundOperation, refundCreative, fetch: meteredFetch };
}
module.exports = { createAiUsage, cost, WEEK, LIMITS };
