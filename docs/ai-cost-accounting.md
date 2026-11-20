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

## Implemented cost controls, preserving automatic reminders

Calendar refresh remains automatic. At startup and hourly thereafter the worker
checks durable due times for each configured school/campus/faculty/term. Current
and near-term calendars check official sources every 12 hours; terms starting more
than 90 days away check weekly. An unchanged verified source digest makes no model
request. HTML link targets and PDF file bytes participate in change detection.
Parsed official pages are reused across terms for 15 minutes, with a bounded cache.
No browser visit or manual refresh is needed to run the worker.

Before work starts, a durable claim reserves a 10-minute lease and a six-hour
crash cooldown. DynamoDB uses conditional writes; the local store uses its existing
single-process serialized writer. Failed attempts retry automatically after 6, 12,
then 24 hours for current/near terms, up to seven days for distant terms. Restarts
and concurrent workers cannot bypass the saved retry time. Failures preserve the
last verified calendar. Calendar records remain separate from refresh state in
`calendarRefresh` / DynamoDB `CALENDAR_REFRESH`; an unavailable state store prevents
new paid work. Missing/failed public-page retrieval falls back to verified search;
when no readable digest can be retained after success, revalidation is weekly.

Known official HTML/PDF pages are fetched with HTTPS, university-domain redirect
validation, time/size limits and no account credentials. Bounded, uncomplicated
page text goes to the configured simple model (default Luna), without web tools.
Acceptance requires explicit unambiguous scope, real dates, exact source quotes,
consulted official URLs, a complete teaching/closure structure and matching timezone.
Ambiguity, invalid output, new/unconsulted sources or makeup/substitution rules use
the configured complex model (default Sol) with official search. Provider outages,
authorization failures and rate limits back off instead of causing a second call.
The discovery step allows up to six tool calls and 12,000 output tokens; incomplete
results never replace a good calendar. Both routes enter the platform cost ledger.

Date validation, weekday expansion, timezone conversion and duplicate detection
continue to use `public/schedule-import.js`, without model calls. Existing saved
schedule reminders continue on the independent 30-second push worker, subject to
the user's notification settings. Calendar lookup failures do not stop reminders.
This change does not rewrite previously confirmed personal schedules when the
shared university calendar changes, or create unsolicited notifications.

Saved material text and revision-aware indexes are reused. Identical named uploads
are sent once, while changed versions retain their citations. Focused fallback
retrieval includes matching passages and adjacent context, rather than padding the
prompt with unrelated sources. Indexed retrieval removes identical excerpts.
Broad reviews, fresh uploads, source locations and original PDF/image access remain
available; no learning-answer model is downgraded.

Tests use simulated sources/providers without live charges: local/DynamoDB restart
and concurrent-claim behavior, due times, unchanged/changed sources, malformed dates,
source quotes, campus conflicts, complex-date fallback, bounded HTML/PDF retrieval,
existing automatic pushes, and material/citation/coverage regression tests. Production
savings must be measured from the ledger after deployment; no percentage is assumed.

Official model reference: https://developers.openai.com/api/docs/models/gpt-6-luna

Remaining optional work: platform spending alerts/queues and product-navigation
intent shortcuts. These are not enabled by this change.
