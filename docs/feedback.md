# Problem reports

**Report a problem** appears in the signed-in student sidebar. A supported
operation that fails offers **Report this error** and prepopulates its feature,
action and code. Confirm submission to send the optional description. The
server associates the report with the signed-in account and verifies any
request ID against that account’s recent usage records. Network or browser-side
issues can be reported as user observations. Standard validation, allowance
limits, sign-in failures and user cancellations do not send automatic mail.

**Developer console → Problem reports** is administrator-only. Expand a row
to see the affected account, known operation, error code and known diagnostic
category, recent occurrence time, count, browser/OS family, app version,
request duration and request ID where available. The user’s description is
visible here. Operators can resolve or reopen issues, refresh the inbox and
retry failed or unconfigured deliveries. The email link opens the specific
report in the authenticated developer console.

Tracked authenticated operations with server failures (HTTP 5xx or the
equivalent structured streaming error) are recorded automatically, as are
terminal server failures from problem set and file generation jobs. Errors for
the same account, feature, operation and status within a UTC hour share one
report and one email. Ordinary user-submitted feedback is limited to five
reports per rolling 24 hours, with repeat submissions of the same form
deduplicated. This is an app report inbox, so failures that reach neither the
app nor the server cannot be captured automatically.

## Email setup

The existing `SMTP_*` and `MAIL_FROM` settings provide the sender. Set
`FEEDBACK_EMAIL_TO` to one operator mailbox, or omit it to use the first
configured address in `ADMIN_EMAILS` (legacy `ADMIN_EMAIL` also works).
Setting an empty or invalid recipient leaves email disabled and reports visible
in the console. Set `APP_BASE_URL` to the public service URL if it differs from
`https://studybridge.ink`. Verify the recipient with your mail provider if
sending is restricted to verified recipients.

Reports are committed before email dispatch. A worker reads queued
notifications about every ten seconds, at most three per batch. Transient
failures are retried up to three attempts with increasing delays. Incomplete
sends become eligible again after a lease expires. If the process stops between
SMTP acceptance and saving the result, a duplicate notification is possible.
“Email sent” means the configured SMTP service accepted the message. Missing
delivery configuration or final failure leaves the report available for review.

Email includes the affected account, sanitized error metadata and secure
console link. User-supplied descriptions stay in the console. Diagnostics do
not collect request bodies, raw provider messages, exact addresses or IPs for
devices, stack traces, mail, course material, private messages, or credentials.
Reports remain available for 90 days. Local storage prunes them when it writes
reports; DynamoDB rolls them off using the same `expiresAt` table TTL as usage
statistics. The workflow requires no database migration.
