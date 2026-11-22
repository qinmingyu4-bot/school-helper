# AI cost accounting and reconciliation

The developer console shows total AI cost for rolling UTC 7/30/90/180/365-day
windows and All. Official project/key-filtered consumption is the primary total
when available; local request prices explain the approximate distribution by
feature/model. Never add these two totals. Historical unallocated cost and the
signed official-minus-local difference remain separate; never invent a user or
feature attribution. The owner accepts approximate attribution, not missing costs.

## Financial meaning and coverage

Credit purchases/card charges are funding, not consumption. Taxes, currency
conversion and balances cannot be inferred from the Costs API. These fields remain
explicitly not connected rather than showing zero. Reconcile cash separately with
OpenAI billing receipts and opening/closing credit balances. A project/key scope
may also include another program sharing that credential.

Local request recording has its own start timestamp. All official history starts
at `OPENAI_COSTS_HISTORY_START` (default 2020-01-01, before the API launch), or an
earlier local start. Live verification on 2026-11-20 confirmed the provider's
one-year lookback (`reporting_lookback_exceeded`, earliest 2025-11-20 UTC). Reads
respect that boundary and persist complete daily snapshots in monthly records.
All combines available provider history with previously archived older days,
replacing overlap rather than adding it twice. Gaps and the actual available start
are explicit. Set the configured start to the verified project creation date to
avoid implying unknown pre-project history. The UI shows both
selected dates and local coverage; it does not imply old local details were recovered.

All generation paths use `createAiCosts.fetch`, including shared calendars,
product help and connectivity checks. A durable pending record precedes dispatch;
request IDs are saved as soon as headers arrive. Prompts, replies, files, secrets
and authorization headers are not retained. Missing/invalid usage, crashes and
network failures remain unknown. Abandoned pending rows are durably marked unknown
after ten minutes on the next report. Known response usage is charged in this
ledger even on an HTTP error or an incomplete/failed result. An explicit supported
4xx rejection without usage is zero; ambiguous failures remain unknown.

Personal weekly allowances stay USD 0.50 / USD 2.00. Failure refunds never erase
the provider expense. Both ledgers share stream completion parsing, including a
last usage line without a newline, failure after usage, and cancellation. A
request with reported usage can therefore be a failed user task and a real cost.
Local prices include cache read/write, long-context text, image/audio and supported
tools. Tools/container reuse and provider adjustments are estimates. Official
spend remains authoritative, and current-day data can lag.

## Quiet protections

Operational warnings appear only in the developer console. Students receive an
ordinary inline inability-to-complete message when an action cannot finish; no
new technical quota/retry/report popups are introduced. Existing account allowance
information remains available.

- Paid calls are deduplicated while in progress using a content hash plus account
  and feature scope. No prompt contents are stored in the admission record.
- Three consecutive failed calls in one scope cool that scope for 15 minutes.
  Creative output-validation failures are recorded independently and refunds are
  idempotent. These controls survive service restarts in local/Dynamo storage.
- `AI_PLATFORM_DAILY_BUDGET_USD` defaults to USD 5 per UTC day. It protects platform
  calls and, separately, each account's gross provider spend across features,
  including failed/refunded calls. This safety budget is distinct from personal
  allowances. Reservations are estimates, not a provider-side hard dollar cap;
  overruns remain fully recorded. Expired uncertain attempts retain their estimate
  in the protective gross-spend counter. The developer panel shows blocked counts,
  cooling sources and platform budget consumption, which can include absorbed failures.
- Shared calendars are never queried on startup or on a timer. Import/explicit
  term matching first reuse a verified applicable semester/academic-year record.
  Explicit campus/faculty scopes share across course sets; unknown scopes remain
  course-specific. Failures keep durable backoff. Explicit revalidation skips the
  successful-check delay but does not override a failure cooldown or active lease.
  Automatic reminders for already saved events remain independent and need no AI.
- Unknown transport/rate/auth errors do not fan out into additional model calls.
  Only an explicit unsupported-tool rejection can fall back once to chat.
- Concurrent developer connectivity checks share one call and cache it for a minute.

Audio admission uses server-parsed file duration (including duration recovery for
WebM recordings), with one second of rounding headroom. Files with unreadable
length stop before a paid call. Image admission considers model, selected quality,
size, prompt bytes and actual reference-image dimensions. Image estimates include
10% headroom: GPT Image 2 uses published per-size examples; 2.6 uses a deliberately
conservative envelope (5x for low, 2x for medium/high relative to those examples),
not a claim to reproduce its exact calculator. Reference estimates use a high-fidelity
pixel envelope. Actual returned usage settles the cost; an estimate is never labeled
an invoice. Calibrate these envelopes from production evidence when available.

## Official connection and storage

Private server configuration only:

- `OPENAI_COSTS_ADMIN_KEY`: organization Admin key with Usage API Read only.
- `OPENAI_COSTS_PROJECT_ID`: required project filter.
- `OPENAI_COSTS_API_KEY_ID`: optional API key identifier, not its secret.
- `OPENAI_COSTS_HISTORY_START`: earliest official history requested by All.

Costs reads follow pagination (up to 180 days per page), coalesce identical
concurrent reads (including shared worker leases), serialize range changes, and persist successful snapshots for
five minutes. A 429 honors Retry-After with at least five minutes of backoff across
all ranges; other failures wait at least one minute. Last successful data remains
available with its original timestamp and a stale label. No partial page total is
published. Changing project/key scope changes the cache identity.

Ledger rows have no TTL in local/Dynamo storage. Small admission/reconciliation
states are stored under `aiCostControl` / `AI_COST_CONTROL`. Unknown requests retain
provider IDs for investigation. Aggregate official differences reconcile total
coverage, not individual unknown calls; store:false responses may be unrecoverable.
At higher volume, roll up/archive detail before any retention change. Dynamo guard
mutations use conditional writes; local storage requires the existing single-server
writer deployment. Do not scale local storage to multiple processes without migration.

Administrator authorization and no-store HTTP responses protect these reports.
Per-user reports exclude official organization figures and platform records.
See [owner decisions](ai-cost-controls-decisions.md). Follow the authorized release
process for deployment; this document alone does not authorize publishing main.

## Retained cost optimizations

Known official HTML/PDF sources are bounded, domain-checked and hashed. Unchanged
sources reuse verified parsing. Unambiguous date extraction uses Luna first;
complex campus/makeup rules or validation failures use Sol with official evidence.
Date/weekday/timezone calculations and deduplication stay in code. Saved material
text and revision-aware indexes reuse relevant passages without changing the study
answer model or dropping source citations. Source failures do not interrupt the
independent saved-reminder worker.

Validation uses simulated providers and sources, with no paid generation. Tests
cover local/Dynamo persistence, competing admissions, restarts, failure refunds,
media preflight, streaming endings, official pagination/backoff and authorization.
Production savings must be measured after deployment; no saving percentage is assumed.

References checked 2026-11-20:
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs

### Task model selection

The configured simple model (Luna by default) handles ordinary study lookups,
definitions and edits. A subject name, words such as “assignment” and “exam,”
or an explicitly supplied passage to translate do not by themselves require
Sol. Worked solutions, proofs, mock exams and ambiguous complex-mode requests
still use the configured complex model.

Natural-language schedule drafts up to the existing input limit, grade
screenshot extraction, grounded study-topic drafts and simple single-slide
edits start on Luna. Validation can trigger at most one Sol retry when a
draft is unusable. Provider transport errors do not trigger a second model
call. A valid schedule clarification is returned for review without a retry.
The same feature attribution records both attempts when a retry is needed.
Practice questions and their verification, multi-slide content work and
official academic-calendar matching keep their established model choices.

Syllabus extraction inspects the original text before dispatch. When weights
and unconditional drops can be verified, a successful Luna draft is applied
without a Sol check. Short text with a complete explicit weight table uses a
faster Luna setting. Native PDF requests use the default reasoning settings.
Clear exceptions such as grade transfers, conflicting
schemes or conditional drops go directly to Sol and manual review. Original
PDF pages are checked for conditions as well as the retained text. Scans with
no verifiable text stay in review. Invalid or unsupported Luna output can
trigger one Sol request, but a provider error or a conflict with existing
saved grades does not trigger another model call.

## 2026-11-21 reconciliation/display correction

Only provider consumption is labeled total. Missing official data displays unavailable, not the old analytics estimate or the incomplete ledger subtotal. Feature amounts are locally priced and remain estimates; daily signed residuals keep the sum equal to the official total for the same UTC coverage. Pre-ledger dates, the first ledger day (mixed coverage) and later dates are separate. Unknown feature tags cannot be assigned to history. Outside-coverage local rows are shown separately. Cached reports without daily detail wait for the next successful provider sync before splitting historical amounts.

New ledger entries retain source, action, trigger and operation identity without prompts or mail content. Recognized feature/model/trigger costs and unknown usage counts are visible. API generation routes not recognized by the ledger fail closed; input-token counting and existing temporary file uploads remain separate preflight operations (document uploads are deleted by the existing workflow).

Read-only production audit on 2026-11-21, since the 1.14.0 formal deployment: no new calendar calls; 19 mailbox calls (USD 0.087272), one grade-planning call (USD 0.016781), one rejected image request (USD 0), and five tiny diagnostic probes (USD 0.000020) at inspection. These records do not prove that every historical call was necessary. Found and fixed: passive admin views invoked paid probes; irrelevant mail had no durable analysis marker and could be charged again on provider replay. Manual diagnostic requests retain a one-minute cache/coalescing; mailbox markers and queue updates commit atomically and are purged on unlink. Failure retry intervals persist and increase to six hours, without discarding queued mail.

Active calendar/reminder timers remain free of model calls. Browser entry HTML is no-store and scripts are bundled by content hash; already-open pre-fix pages require one reload to execute the new code. The UI does not forcibly reload unrelated in-progress work.
