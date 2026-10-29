# Mailbox assistant, first release

Mailbox Assistant (邮箱助手) is the sixth student destination, after Tools. It is
removed from the Tools tabs. Legacy `page=email` links open the new destination;
an account that previously selected Tools → Email is redirected there once.
Manual paste, interpretation and reply drafting remain in an expandable section.

Settings → 邮箱授权 manages one Gmail and one Outlook / Microsoft 365 mailbox per
StudyBridge account. The mailbox can differ from the login email. Each connection
requires an explicit checkbox acknowledging inbox access and AI processing, then
the provider's own OAuth consent. Google login retains `openid email profile` and
does not read mail. The mailbox callback returns to Email Assistant with success,
declined or failure feedback. No access/refresh token is returned to the browser.

## Private server setup

Configure these values in the deployment's private environment; never commit an
actual key, client secret, token or mailbox database:

| Variable | Meaning |
| --- | --- |
| `APP_BASE_URL` | Canonical HTTPS origin in production |
| `MAILBOX_ENCRYPTION_KEY` | Stable random 32-byte key, standard base64 encoding |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | Google Web application credentials; omitted values fall back to the existing Google login credentials |
| `GMAIL_REDIRECT_URI` | Optional override, default `${APP_BASE_URL}/api/mailbox/gmail/callback` |
| `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET` | Microsoft Entra Web application credentials |
| `OUTLOOK_REDIRECT_URI` | Optional override, default `${APP_BASE_URL}/api/mailbox/outlook/callback` |
| `MAILBOX_SYNC_INTERVAL_SECONDS` | Default 300 seconds, minimum 60; backlog batches resume after 15 seconds |
| `MAILBOX_SYNC_DISABLED` | `true` disables the scheduled worker; useful for isolated tests |
| `OPENAI_API_KEY` | Existing AI configuration, required for classification/extraction |

Generate the encryption key once using `node -e
"console.log(require('node:crypto').randomBytes(32).toString('base64'))"` in a private
terminal and store it securely. Changing or losing this key requires relinking
existing mailboxes. Keep it with the existing private environment across releases;
the deployment workflow does not generate or replace it. Database backups contain
encrypted credentials and extracted learning content and must stay private.

For Gmail, enable Gmail API, add the mailbox callback to the Web OAuth client
in addition to the login callback, and configure the consent screen/test users.
The mailbox flow requests only `gmail.readonly`, with offline access. For public
production use, complete the Google verification applicable to restricted scopes
and server-side data processing; development/test exceptions do not imply approval
for a public launch. See [scope requirements](https://developers.google.com/workspace/gmail/api/auth/scopes)
and [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

For Outlook, register a Web application supporting accounts in any organizational
directory and personal Microsoft accounts. Add the exact callback and delegated
`User.Read`, `Mail.Read` permissions; the authorization request also asks for
`offline_access`. No application-wide mailbox access is requested. School tenant
policy may require administrator approval despite user consent. See
[Microsoft permissions](https://learn.microsoft.com/en-us/graph/permissions-reference#mailread)
and [tenant consent settings](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent).

Unconfigured providers show an unavailable state in Settings, with no working
authorization button. Production requires HTTPS; local development allows HTTP
callbacks only on localhost/127.0.0.1. Provider consoles must register the exact
local callback used during a real OAuth test. The isolated fixture tests do not
contact real accounts and cannot verify provider registration or public approval.

## Synchronization and review

The server worker runs independently of open browser pages. The initial sync
reads the last seven days of the Inbox. Gmail uses paginated message backfill and
then history checkpoints; Outlook uses per-Inbox paginated delta queries with
immutable IDs. Read/unread status, mailbox contents and provider calendars are
never changed. Other folders and attachments are outside this release. Expired
history/delta state restarts from the most recent seven days; older messages
outside that recovery window can require manual paste/review.

Each connection processes up to three messages per worker batch. Queue progress,
provider cursors and refreshed encrypted tokens persist across restarts. Leases
and conditional writes coordinate multiple server processes in DynamoDB deployments;
local JSON storage uses the existing single-process serialized writer. Pagination covers
jobs without repeatedly scanning the database. Transient failures retry with
backoff; invalid authorization pauses sync until relinking. Manual sync is rate
limited and does not bypass provider backoff. This is periodic synchronization,
not guaranteed instant delivery; larger backlogs take additional batches.

Email text is untrusted model input. No links or attachments are fetched, no
instructions in email can invoke tools, and only validated structured extraction
is accepted. AI sees sender, subject, receipt time and a bounded body, not other
mailboxes or StudyBridge course documents. Relative dates use the mail's receipt
time and the mailbox's saved browser time zone. Summaries, evidence and draft
fields persist; raw full bodies are not persisted. Relevant notices without an
event remain readable cards. Cancellation messages do not create an event;
rescheduling suggestions require reviewing the existing calendar manually.

Inbox cards allow selecting suggested items and editing title, kind, course,
date/time, end time, time zone and location. Missing times are never filled with a
default. Only explicit confirmation writes the selected items into the existing
private planner, including course association, source evidence, UTC conversion
and duplicate checks. The draft resolution and schedule import commit atomically
in local storage or DynamoDB; repeated/concurrent confirmations are safe.
Unselected items in a resolved email are discarded. Reopen the source email for
any additional manual scheduling. The assistant also preserves the existing
manual email interpretation/reply drafting tool.

Disconnecting immediately removes stored credentials, invalidates in-flight writes
and clears the mailbox's extracted records. Already-confirmed schedule items stay
in the planner. It stops StudyBridge access; users can additionally revoke the app
in Google/Microsoft account permissions. A request already sent to the AI provider
before unlinking cannot be recalled, but its late results cannot be saved.

The first release adds schedule items, not new closed-browser push notification
delivery. Reminder behavior after saving follows the existing StudyBridge planner.

## Validation

`tests/mailbox.test.js` covers encrypted OAuth state, PKCE, session/account binding,
read-only scopes, provider pagination, unsafe continuation URLs, MIME/HTML text,
missing dates/times, classification, local/DynamoDB atomic writes, simultaneous
confirmation, account isolation and unlink races. `tests/mailbox-http.test.js`
exercises both complete OAuth flows with a local-only transport fixture, CSRF,
ownership, waiting for confirmation, incomplete-time correction, duplicate retry,
unlink deletion and retention of confirmed calendar entries.
