# Weekly AI allowance

Release 1.2.13 implements standard US$0.50/week and effective Plus
US$2.00/week. The agreed month-pass price is C$19.99 for 30 days. The allowance is
an internal AI cost budget, denominated in USD. It has no cash redemption value.

The first reserved provider request anchors the account's seven-day cycle.
Viewing the balance does not start the clock. Old accounts initialize lazily.
Each reset replaces the previous allowance without rollover. Upgrade, manual
membership changes, paid expiry and refunds retain the anchor and spending.
A valid paid entitlement uses the existing membership overlay. Test payments
continue to leave real membership unchanged. Invitation/manual Plus also receives
the Plus allowance. Administrator permissions do not bypass metering.

## Accounting

`lib/ai-usage.js` uses integer millionths of USD. `AI_USAGE` records live under
`USER#<id>` in DynamoDB, with conditional transactions, or in the private local
`aiUsage` map through the existing serialized atomic writer. Provider requests
reserve allowance before execution and settle once. Reservations protect against
concurrent tabs and workers. A completion across a reset is attributed to its
original cycle. Eight historical weekly summaries are retained, including token
totals and estimated spending, without prompts or document content.

Text requests first use `/v1/responses/input_tokens` to count full input, including
files and visuals. Unavailable estimates block generation without charging. The
service reserves uncached input, bounded output and tool headroom. Output is capped
at 8,192 tokens by default, or the existing 16,000 document limit, and reduced to
fit available allowance. Requests needing fewer than 256 possible output tokens
are rejected. Tool calls are capped at two. Web requests reserve two searches and
32K additional context tokens, priced with long-context headroom. Code interpreter
reserves one 1 GB container. Audio reserves its server-measured duration plus
rounding headroom; images reserve model/quality/size, prompt and reference-image
estimates. See [cost controls](ai-cost-accounting.md) for estimation limits.

Successful responses use provider-reported input, cached input and output totals.
Reported output already includes reasoning tokens. Responses web searches and
unique interpreter containers are included. Image input modalities and image
output, and transcription seconds, have separate rates. Streaming Chat Completions
requests include usage and consume the trailing usage chunk after `finish_reason`.
Quota errors propagate without provider fallback. Background problem-set work
pauses in a retryable failed state with its completed answers retained.

Known unsuccessful HTTP provider responses, transport failures, invalid JSON and
incomplete/error streams release their reservation; these platform failures do
not consume user allowance. Abandoned holds expire after ten minutes without
becoming estimated spending. Provider calls remain bounded to five minutes.
Successful responses with missing usage retain the estimate policy. Streams
canceled before completion release their personal reservation; the provider invoice is independent of the user's allowance.

New creative jobs carry a server-assigned accounting version and operation ID.
Each reservation and settled amount is associated with that job in its original
weekly period. If generation fails (including timeout, restart, output validation
or persistence failure before delivery), its settled amount and pending holds are
refunded by an atomic per-user ledger mutation. Refund markers survive restart,
prevent duplicate refunds and reject late settlements/new reservations for that
operation. Actual token counters remain as operational telemetry. A refund of an
old week does not increase the current week's limit. Successful jobs and unrelated
requests are never refunded by this path. Explicit creative cancellation retains
its existing completed-request accounting.

`GET /api/me/ai-usage` reconciles orphaned/failed creative jobs before reporting the
balance. Failed refunds are retried on a later read; the job only displays a
confirmed refund after the durable ledger change. Current pending holds from older
versions also expire without charging. Already-settled legacy estimates have no
job identity; old restart-failed jobs are marked `needs_review`, without assuming
that all estimated user spending came from that task. Historical compensation
requires an operator decision and cannot be inferred from the percentage alone.
There is no cash refund or administrative adjustment UI in this change.
Actual usage can exceed a reservation, especially for tool-created context or
image inputs. The excess is recorded and blocks subsequent requests once the
weekly allowance is exhausted. These limits are admission budgets rather than a
guaranteed exact ceiling on the provider invoice.

## Included operations and prices

Account requests include Study and free chat, problem-set planning, answer
batches and independent answer/quiz review, course search expansion, learning tools, Office assistance, generated
documents and images, schedule parsing/transcription, and mailbox analysis.
Shared public academic-calendar lookups and operator health probes are outside
account allowances. Video production is permanently unsupported and has no quota price.
Storage, hosting and payment processing are outside this AI allowance.

Rates verified on 2026-11-06 from the
[OpenAI pricing page](https://developers.openai.com/api/docs/pricing),
[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), and
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
Text rates below are USD per million tokens under Standard processing.

| Model | Input | Output | Cached input |
| --- | ---: | ---: | ---: |
| gpt-6-luna | 0.10 | 0.50 | 0.01 |
| gpt-6.1-sol | 2.00 | 10.00 | 0.10 |

Inputs over 272K tokens use 2× input/cache rates and 1.5× output rates.
Text requests explicitly select Standard processing. GPT Image 2.6 Sunburst
and Flare use US$5/million text input, US$8/million image input and US$30/million
image output tokens, verified on 2026-11-11 from the OpenAI pricing page.
`gpt-transcribe` uses US$0.0045/minute. Search calls cost US$0.01 each and
1 GB interpreter containers US$0.03 each. Unknown models fail closed until their
price and accounting are added and verified. Account-specific regional surcharges
and tax need separate reconciliation before commercial rollout.

## Interface and payment gates

`GET /api/me/ai-usage` requires a current session and returns private, no-store
account-scoped balances. A collapsed-by-default allowance row in the desktop
sidebar and mobile main menu shows the remaining percentage. Expanding it reveals
the browser-local reset time and existing actions within navigation; it
does not resize the chat or composer. The current account’s expanded state survives
in-app navigation and resets on account changes. Keyboard users can toggle the
summary or press Escape inside the details to collapse and return focus. Settings
also retains its full allowance page. Manual refresh shows pressed/loading feedback and a brief success checkmark even when the balance is unchanged; failures show a retry action. The button keeps a stable width, honors reduced motion and shares any in-flight status request. Background refreshes do not trigger the manual confirmation. Visible tabs refresh every 15 seconds and after mutations or chat
completion. Account switches discard old responses. Pending allowance is identified
separately from settled spending. User-facing allowance panels and account-tier
copy omit dollar budgets; they show the remaining percentage and reset time.
Internal accounting remains in USD. The upgrade action opens Subscription & billing,
where membership pricing is still shown before purchase.

The upgrade button follows Alipay's existing account-specific eligibility and
requires real-charge mode. It opens the existing billing screen for review and
consent. A checkout redirect never grants allowance. Verified payment entitlements
raise the limit on the next status/admission check. Closed or test-only payment
configuration displays the availability explanation instead of a purchase action.
This release does not change payment activation settings.

## Cache-write accounting update

Cache writes now use separate 30-minute (1.25× input) and 12-hour (2.5× input)
rates, subtracting writes from ordinary input to avoid double counting.
Reservations include cache-write headroom. Operational cost reporting now uses
a separate durable ledger that also includes platform-funded calls; see
[AI cost accounting](ai-cost-accounting.md). Personal allowance limits are unchanged.
