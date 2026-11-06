"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const { membershipTier } = require("./membership");
const WEEK = 7 * 86400000;
const LIMITS = { standard: 500000, plus: 2000000 }; // Integer millionths of USD.
const PRICES = { "gpt-6-luna": [0.1, 0.5, 0.01], "gpt-6.1-sol": [2, 10, 0.1] };
const fail = (message, statusCode = 429) => Object.assign(new Error(message), { statusCode, usageError: true });
const exhausted = () => fail("本周 AI 额度不足，请查看剩余额度和恢复时间。充值开放后可升级 Plus。");
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

function cost(model, payload) {
  const usage = payload?.usage;
  if (!usage) return null;
  if (model === "gpt-transcribe") {
    const seconds = usage.seconds ?? payload.duration;
    return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 75) : null;
  }
  if (model === "gpt-image-2") {
    const detail = usage.input_tokens_details;
    if (!detail || !Number.isSafeInteger(usage.output_tokens)) return null;
    return Math.ceil(count(detail.text_tokens) * 2.5 + count(detail.image_tokens) * 4 + count(usage.output_tokens) * 15);
  }
  const rates = PRICES[model];
  const input = usage.input_tokens ?? usage.prompt_tokens, output = usage.output_tokens ?? usage.completion_tokens;
  if (!rates || !Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0) return null;
  const cached = Math.min(input, count(usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens));
  const long = input > 272000;
  let total = ((input - cached) * rates[0] + cached * rates[2]) * (long ? 2 : 1) + output * rates[1] * (long ? 1.5 : 1);
  total += (payload.output || []).filter((item) => item.type === "web_search_call").length * 10000;
  const containers = new Set((payload.output || []).filter((item) => item.type === "code_interpreter_call").map((item) => item.container_id).filter(Boolean));
  total += containers.size * 30000;
  return Math.ceil(total);
}

function createAiUsage({ db, entitlement = async () => null, request = (...args) => fetch(...args), now = Date.now }) {
  const context = new AsyncLocalStorage();
  async function tier(userId) {
    const user = await db.getUser(userId, { consistent: true });
    if (!user) throw fail("Please log in first.", 401);
    return membershipTier({ ...user, paidMembershipExpiresAt: await entitlement(userId) }, now());
  }
  function ledger(value) {
    const state = value || { anchor: now(), periods: {} };
    for (const period of Object.values(state.periods)) {
      for (const [id, hold] of Object.entries(period.holds)) {
        if (hold.until <= now()) { period.used += hold.amount; period.estimated += hold.amount; delete period.holds[id]; }
      }
    }
    const start = state.anchor + Math.floor((now() - state.anchor) / WEEK) * WEEK;
    state.periods[start] ||= { used: 0, estimated: 0, holds: {}, inputTokens: 0, outputTokens: 0 };
    for (const key of Object.keys(state.periods)) if (Number(key) < start - 8 * WEEK && !Object.keys(state.periods[key].holds).length) delete state.periods[key];
    return { state, start, period: state.periods[start] };
  }
  function summary(state, membership) {
    const { start, period } = ledger(state);
    const pending = Object.values(period.holds).reduce((sum, hold) => sum + hold.amount, 0);
    const limit = LIMITS[membership];
    return { tier: membership, currency: "USD", limitUsd: limit / 1e6, usedUsd: period.used / 1e6,
      pendingUsd: pending / 1e6, estimatedUsd: period.estimated / 1e6,
      remainingUsd: Math.max(0, limit - period.used - pending) / 1e6,
      resetsAt: state ? new Date(start + WEEK).toISOString() : null, periodStartedAt: state ? new Date(start).toISOString() : null };
  }
  async function status(userId) {
    const membership = await tier(userId);
    const before = await db.getAiUsage(userId);
    // Viewing the allowance does not start the first week.
    const state = before ? await db.changeAiUsage(userId, (value) => ledger(value).state) : null;
    return { userId, ...summary(state, membership) };
  }
  async function reserve(userId, amount) {
    const membership = await tier(userId), id = randomUUID();
    let start;
    await db.changeAiUsage(userId, (value) => {
      const current = ledger(value); start = current.start;
      const pending = Object.values(current.period.holds).reduce((sum, hold) => sum + hold.amount, 0);
      if (current.period.used + pending + amount > LIMITS[membership]) throw exhausted();
      current.period.holds[id] = { amount, until: now() + 10 * 60000 };
      return current.state;
    });
    return { userId, id, start, amount };
  }
  async function settle(ticket, amount, payload, estimated = false) {
    await db.changeAiUsage(ticket.userId, (state) => {
      const period = state?.periods[ticket.start];
      if (!period?.holds[ticket.id]) return state; // Idempotent across completion/cancellation.
      delete period.holds[ticket.id];
      period.used += Math.max(0, amount);
      if (estimated) period.estimated += Math.max(0, amount);
      period.inputTokens += count(payload?.usage?.input_tokens ?? payload?.usage?.prompt_tokens);
      period.outputTokens += count(payload?.usage?.output_tokens ?? payload?.usage?.completion_tokens);
      return state;
    });
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
    if (!rates && !["gpt-image-2", "gpt-transcribe"].includes(model)) throw fail("当前模型尚未配置额度计费，请联系管理员。", 503);
    const available = Math.floor((await status(userId)).remainingUsd * 1e6);
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
      const inputCost = inputTokens * rates[0] * (long ? 2 : 1) + overhead;
      const outputRate = rates[1] * (long || search ? 1.5 : 1);
      const maxOutput = Math.min(body.max_output_tokens || body.max_completion_tokens || 8192, Math.floor((available - inputCost) / outputRate));
      if (maxOutput < 256) throw exhausted();
      amount = Math.ceil(inputCost + maxOutput * outputRate);
      body[route === "/v1/responses" ? "max_output_tokens" : "max_completion_tokens"] = maxOutput;
      body.service_tier = "default";
      if (body.tools?.length) body.max_tool_calls = 2;
      if (body.stream && route === "/v1/chat/completions") body.stream_options = { include_usage: true };
    } else {
      amount = model === "gpt-image-2" ? 250000 : 45000;
      if (amount > available) throw exhausted();
    }
    const ticket = await reserve(userId, amount);
    let response;
    try { response = await request(url, { ...options, signal, body: form ? body : JSON.stringify(body) }); }
    catch (error) { await settle(ticket, amount, null, true); throw error; }
    if (!response.ok) { await settle(ticket, 0); return response; }
    if (!body.stream) {
      try {
        const text = await response.text(), payload = JSON.parse(text);
        const actual = cost(model, payload);
        await settle(ticket, actual ?? amount, payload, actual === null);
        return new Response(text, { status: response.status, headers: response.headers });
      } catch (error) { await settle(ticket, amount, null, true); throw error; }
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "", payload = null, finished = false;
    async function finish() {
      if (finished) return;
      const actual = cost(model, payload);
      await settle(ticket, actual ?? amount, payload, actual === null);
      finished = true;
    }
    return new Response(new ReadableStream({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) { await finish(); controller.close(); return; }
          buffer += decoder.decode(result.value, { stream: true });
          let newline;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
            if (!line.startsWith("data:") || line === "data: [DONE]") continue;
            const event = JSON.parse(line.slice(5));
            if (event.response?.usage) payload = event.response;
            else if (event.usage) payload = event;
          }
          if (buffer.length > 2 * 1024 * 1024) throw new Error("AI stream packet is too large.");
          controller.enqueue(result.value);
        } catch (error) { await finish(); controller.error(error); }
      },
      async cancel() { await reader.cancel().catch(() => {}); await finish(); }
    }), { status: response.status, headers: response.headers });
  }
  return { context, run: (userId, work) => context.run({ userId }, work), status, reserve, settle, fetch: meteredFetch };
}
module.exports = { createAiUsage, cost, WEEK, LIMITS };
