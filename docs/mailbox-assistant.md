# Mailbox assistant

Mailbox Assistant (邮箱助手) is the sixth student destination, after Tools. It is
removed from the Tools tabs. Legacy `page=email` links open the new destination;
an account that previously selected Tools → Email is redirected there once.
The workspace lists **学习通知** first and opens it by default for reviewing
extracted notices and confirming calendar additions. **邮件解读与回复** follows,
with the received email and reply intent beside a permanently visible draft panel
on desktop (stacked on phones). Switching views preserves typed mail, intent,
selected tone,
generated replies and edits to notice items. A successful OAuth return opens the
learning notices view. A compact status strip shows Gmail/Outlook connection
state and connected addresses. Clicking anywhere in the strip, or activating it
with Enter/Space, opens Settings → 邮箱授权; binding/rebinding/unlinking happens there.
Notification refresh and synchronization controls belong to the learning view.

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
the normal deployment workflow does not generate or replace it. Database backups contain
encrypted credentials and extracted learning content and must stay private.

The manually dispatched **Configure real mailbox authorization** GitHub Actions
workflow activates `gmail`, `outlook`, or `both` on the currently deployed `main`
revision, using the existing Lightsail SSH secrets. Finish provider-console setup
first, then run this workflow after the matching normal deployment succeeds.
Gmail reuses the existing private Google credentials unless a complete
`GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` secret pair is supplied. Outlook uses the
encrypted repository secrets `OUTLOOK_CLIENT_ID` / `OUTLOOK_CLIENT_SECRET` (or a
complete existing server configuration). Never put credentials in workflow inputs.

`aws/configure-mailboxes.py` accepts only selected provider credentials over SSH
stdin, creates a 32-byte encryption key only when absent, and refuses an invalid
or conflicting existing key. It saves a private configuration backup before an
atomic update, validates health, storage mode, OAuth callbacks, read-only scopes,
PKCE, encrypted browser state and existing Google login, and restores the previous
configuration if activation fails. Activation enables the scheduled worker;
repeated runs keep the same key. It does not
authorize a user's inbox: each user still binds through Settings and provider
consent. Provider registration/consent and an actual mailbox sync require separate
live validation; passing server configuration checks alone does not prove them.

### Production test configuration (2026-10-28)

Both Gmail and Outlook are configured on the `1.2.0` production deployment, and
Settings exposes both binding controls. Gmail remains in Google testing mode with
the owner's test user registered. Outlook uses a Web application supporting both
organizational and personal Microsoft accounts, with only delegated `Mail.Read`,
`User.Read` and `offline_access` configured. Each mailbox still requires the user's
own consent in Settings and at the provider; no inbox was linked by configuration
activation. School tenant policy can require administrator approval.

The initial Outlook application credential expires on **2027-04-26**. Renew it
before expiry: create a replacement in the same app, update the private
`OUTLOOK_CLIENT_SECRET` repository secret, and rerun the activation workflow with
`outlook` selected. Retain the app's client ID, callback and mailbox encryption key.
Validate a real mailbox sync before retiring the old credential. Never put either
credential value into documentation, source control, screenshots or workflow inputs.

Live activation checks cover private configuration backups, the exact callbacks,
read-only scopes, PKCE/encrypted browser state, service health, existing Google
login and both Settings controls. All 23 pre-existing course/document/conversation,
schedule, profile and preference fingerprints matched after activation. Actual
provider consent, token exchange and mailbox synchronization await the user's
first real binding test.

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
