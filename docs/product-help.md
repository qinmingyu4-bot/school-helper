# Product help

The small AI button above the Study composer opens a right-hand dialog. Desktop width is one third of the viewport (minimum 360 px); phones use full width. Escape/Close restores focus; Back to Study focuses the original composer without submitting or replacing its draft. Help history is memory-only and clears on account changes.

`POST /api/product-help` requires a signed-in session and JSON. It accepts `message` (1–1500 characters), optional `history` (at most 12 user/assistant messages, each up to 2000 characters), and `language` (`en` or Chinese default). It returns `reply`, `topic`, and `platformFunded: true`. It does not read course documents, persist study messages, or call personal billing/allowance operations. The server-only `platformFunded` option uses the provider transport directly instead of the personal usage meter; request bodies cannot enable this on other endpoints. Normal request analytics still apply.

The platform's existing OPENAI_API_KEY and fixed `gpt-6-luna` model resolve conversational intent to a reviewed topic in `lib/product-help.js`. Study-chat model configuration does not change this selection; there is no upgrade to a more expensive model. Only reviewed localized guidance is returned, never raw model text. Academic requests route to Study; unknown topics ask for clarification. This intentionally limits coverage to documented product workflows, so extend the catalog when adding features. There are no web searches or model tools. Provider output is capped at 512 completion tokens and timeout is 20 seconds; errors are retryable and do not expose upstream details.

Abuse controls allow one request in flight and 30 requests per account per hour per server process, with a 32 KiB body limit. These are separate from paid usage. Limits reset on process restart and are not shared across instances; use a shared limiter before horizontally scaling this endpoint. The browser stores no help transcript on disk.

Verification: `node --test tests/product-help.test.js tests/product-help-http.test.js`; `npm run check`.
