# AI cost accounting and reconciliation

The developer console has a dedicated **Total AI cost** section with independent
last 7/30/90/180/365 days and **All** filters. These are rolling UTC dates including
today, rather than calendar-month boundaries. **All** starts on the recorded
collection-start date; unavailable historical costs are not invented. Total cost
is the sum of user and platform calculated costs; pending/unknown estimates remain
separate. Activity statistics retain their independent 7/30-day controls.

The developer overview and per-user summary show **recorded AI cost**, calculated
from returned provider usage, independently of foreground activity analytics. Expand
**AI cost details and reconciliation** for user/platform totals, source/model groups,
unknown and pending requests, collection start, and optional official spend.

## Coverage and meaning

All production generation paths use `createAiCosts.fetch`: personal calls through
`aiUsage`, shared academic calendars, product help and health checks. Personal quota
limits remain US$0.50/US$2.00 per seven-day period; platform costs are recorded without
charging a student's quota. This change does not remove features or change the
calendar's model/refresh schedule. Source metadata is allowlisted server-side;
prompts, replies, file contents, authorization headers and secrets are never stored.

A request is durably recorded before dispatch. If the initial write fails, no paid
call is made. A settlement write failure leaves a pending record rather than silently
losing a charge. Cancellation, transport failures, missing/invalid usage, unsupported
prices and abandoned requests are **unknown**, not zero. Active pending requests
become unresolved after ten minutes. Reserved estimates (when available) are shown
separately and are not added to calculated totals. An explicit 4xx rejection other
than 408 is recorded as zero; 5xx and timeouts remain unknown. Streaming accounting
reads the trailing usage event, including a last line without a newline, and handles
cancellation idempotently. Completed provider work is recorded even when downstream
calendar validation rejects the result.

The user allowance and operational ledger share the same price function. Text
input excludes cache reads and writes before pricing ordinary input; 30-minute writes
cost 1.25× input and 12-hour writes cost 2.5× input. Lifetime components are mutually
exclusive. Legacy completions without lifetime breakdown use the request's lifetime
(default 30 minutes). Long-context rates, output/reasoning, searches and supported
containers are included. Reservation headroom includes cache-write pricing.
Text transports request Standard service. Unknown tiers/pricing require reconciliation.
Do not interpret this calculated amount as an exact provider invoice: rounding,
provider adjustments, image cache discounts not exposed in response usage, tool
container reuse, storage and other applications can differ. Official spend is the
financial reference; no UI claims an unknown amount is final.

## Optional official billing connection

Configure only on the server, never in source or browser fields:

- `OPENAI_COSTS_ADMIN_KEY`: organization Admin API credential with access to Costs.
- `OPENAI_COSTS_PROJECT_ID`: required explicit project scope, e.g. a dedicated
  StudyBridge project. An organization-wide total is never silently substituted.
- `OPENAI_COSTS_API_KEY_ID`: optional key **identifier**, not a secret API key, to
  exclude other callers within a shared project.

No credential is created or enabled by this change. Without the first two settings,
the UI says **Official billing not connected**, not $0. Errors say unavailable.
The read-only Costs API is queried in UTC day buckets for the selected
window (including the extended cost ranges), follows pagination in up to 180-day
pages, and caches successful reads for five minutes. It shows
its project/key scope, retrieval time and line items. Current-day values may lag.
Official totals are shown alongside local costs, never added to them. They can
include historical spending from before local collection and other programs using
the same project/key. Credit purchases, taxes and bank conversions are separate.

## Storage, access and rollout

The same administrator-only/no-store routes protect this information. Per-user
reports filter out platform costs and never expose official organization data.
Local storage uses `aiCosts[UTC day][random request id]` and `aiCostSince`. DynamoDB
uses `AI_COST#YYYY-MM-DD` partitions and request IDs, a separate start record, and
no expiration. AI cost records are retained indefinitely in both stores to support
yearly and all-time totals; they are independent of the 35-day activity retention.
The earlier unreleased 90-day cost-retention design is removed. At higher volume,
archive request detail only after durable daily cost rollups are implemented; never
discard cost history to reduce storage. Existing backups include these additive fields.

Deploy this task branch through the normal owner-authorized release process. No
historical request costs are fabricated and no prior user allowance is recalculated.
Rollback code while retaining the added data. New data collected after rollback
will again be incomplete, so show the coverage interval when reconciling.

Validation uses simulated providers only (no live charges), including local and
DynamoDB persistence, mixed cache lifetimes, interrupted streams, write failures,
provider pagination/errors and admin authorization.

References checked 2026-11-20:
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs

## Cost reduction options, preserving functionality

These are proposals, not silently enabled by the accounting patch:

| Priority | Task | Proposed handling | Quality guard |
| --- | --- | --- | --- |
| 1 | Shared calendar refresh | Persist last attempt, success and next retry; refresh due records on a schedule, not every deploy; reuse the last verified calendar | Expiry checks, official source dates and manual refresh remain |
| 1 | Invalid/unpublished future terms | Durable retry backoff per school/campus/term; do not repeatedly search missing next-year calendars | Show last verified coverage; retain retry and manual entry |
| 2 | Dates, weekday expansion, timezone, duplicate detection | Deterministic code; zero model calls | Existing calendar validation and tests |
| 2 | Extract dates from a known official page | Luna for bounded structured extraction, then schema/date/source validation | Escalate to Sol only on ambiguity or failed validation |
| 2 | Discover changed official pages, resolve make-up days and conflicting campuses | Sol + bounded search, with cached evidence | Require verified official URLs; never guess missing dates |
| 2 | Parse short schedule text or simple event edits | Luna + structured schema and confirmation | Keep manual correction and Sol fallback for ambiguous instructions |
| 3 | Complex syllabi, exam solutions, multi-step reasoning | Retain Sol; narrow retrieved context and reuse extraction | Compare outputs on representative cases before changing routing |
| 3 | Product navigation help | Rules for exact known navigation intents, Luna for ambiguous intent | Preserve curated responses and study-question routing |
| 3 | Global platform spending | Separate platform budget/alerts and queue non-urgent refreshes | Never silently disable user learning; expose delay/retry state |

Measure search counts, cache writes, repeated failures and per-source cost before
and after each step. Evaluate simple-model extraction on real calendar formats with
unchanged source/schema validation before enabling fallback routing in production.
