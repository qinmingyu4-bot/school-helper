# Streamed-answer rendering performance

## Scope and cause

The local working version rebuilt the entire current answer with Markdown and
KaTeX on every requested animation frame. Long mathematical answers repeatedly
compiled completed formulas and replaced their DOM, causing layout work on the
same browser thread used for typing and scrolling.

This change only affects browser presentation. No AI model, routing, reasoning
setting, system prompt, retrieval, context budget, answer length, independent
review or server transport is changed. Every received delta still accumulates in
the conversation. Final completion, errors and cancellation cancel queued visual
updates and immediately display the latest retained answer.

## Implementation

- Formula output is cached in memory by exact TeX and display mode, bounded to
  256 entries and 1,048,576 combined key/output string code units (roughly 2 MiB
  of string payload). Oversized results and rendering failures are not cached.
  Each formula retains fresh macros and the existing untrusted-math protections.
- The entire Markdown source is still parsed. Top-level blocks are rendered with
  the full token array, preserving reference definitions and nested structures.
  Only changed block HTML is parsed into DOM; unchanged blocks remain mounted.
  This is not a shortcut that treats earlier paragraphs as permanently complete.
- A WeakMap holds each mounted reply's last source and block nodes, allowing
  detached replies to be collected. Identical content needs no DOM update.
- Network bursts are coalesced with an 80 ms minimum gap after a streamed paint,
  then synchronized with an animation frame. The final display bypasses that
  delay. Existing active-conversation guards retain page and account isolation.

## Local verification — 2026-11-06

Controlled headless Chrome comparison on the same machine with 4× CPU slowdown:
16,162 characters, 180 distinct display formulas, 100 growing-source updates.
Both variants used the repository's pinned browser Markdown/KaTeX assets and a
600 px scrolling reply container; each measurement included forced scroll layout.
The baseline used the pre-change renderer and whole-answer `innerHTML` replacement.
The updated case used `renderInto`. The 80 ms coalescing benefit was deliberately
excluded so the results compare equal numbers of updates.

| Measurement | Before | After |
| --- | ---: | ---: |
| Total synchronous update time | 11,781 ms | 824 ms |
| 95th-percentile update | 215 ms | 11 ms |
| Slowest update | 276 ms | 44 ms |
| Updates exceeding 50 ms | 81 / 100 | 0 / 100 |
| Final serialized DOM | Identical | Identical |

This is a formula-heavy stress case, not a typical-answer or production latency
claim. Very large single tables, code blocks or formulas can still require a
large individual update. Full-page history mounting, network latency and provider
thinking/review time are separate costs and are not removed by this change.

Focused automated tests compare every prefix of mixed Markdown (including late
reference definitions, nested lists, partial code and math) against the existing
full renderer, verify bounded formula reuse and macro isolation, and retain the
existing HTML/link/image safety tests. Run `node --test tests/markdown.test.js
tests/math.test.js tests/chat-stream.test.js` with project dependencies installed.

All 584 automated regressions pass under UTC, and source/assets/package checks
cover 295 JavaScript files.

Isolated Chrome and WebKit real-page browser checks use a temporary local database and synthetic AI
stream, not production accounts or paid model requests. Checks cover exact final
HTML, complete Chinese/emoji text, unchanged table-node identity, empty/shrinking
answers, typing while streaming, draft retention, navigation, stop-generation and
no delayed repaint after stopping. Mobile layout is inspected at 390 px width.
Actual provider speed and production-device behavior require post-release checks.
