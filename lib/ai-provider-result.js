"use strict";
// Both financial ledgers consume the same completion semantics. Usage can arrive
// before failure or after the last content chunk, and remains a provider expense.
function failedPayload(payload) {
  return !payload || Boolean(payload.error) || ["failed", "cancelled", "incomplete"].includes(payload.status)
    || Boolean(payload.choices?.some(c => c.finish_reason && !["stop", "tool_calls"].includes(c.finish_reason)));
}
function streamResult() {
  let payload = null, complete = false, failed = false;
  return {
    line(line) {
      line = line.trim();
      if (line === 'data: [DONE]') { complete = true; return; }
      if (!line.startsWith('data:')) return;
      try {
        const item = JSON.parse(line.slice(5));
        if (item.type === 'response.completed' || item.choices?.some(c => ['stop', 'tool_calls'].includes(c.finish_reason))) complete = true;
        if (item.error || ['response.failed', 'response.incomplete', 'response.cancelled', 'error'].includes(item.type) || failedPayload(item.response || item)) failed = true;
        if (item.response?.usage) payload = item.response;
        else if (item.usage) payload = item;
      } catch { failed = true; }
    },
    get payload() { return payload; },
    get failed() { return failed || !complete; }
  };
}
module.exports = { failedPayload, streamResult };
