# Subscription and payment preparation

Settings → **订阅与账单 / Subscription & billing** provides a monthly test plan,
Stripe-hosted Checkout, a hosted portal for invoices/payment methods, status
refresh, cancellation at period end and resuming renewal. The initial test price
is CAD 19.99/month and is configurable; it is not an approved launch price.
The same panel also prepares WeChat Pay/Alipay monthly and semester passes: one-time
payments with manual renewal, separate from card automatic renewal.

## WeChat Pay and Alipay passes

Passes use Stripe Checkout **payment** mode, not subscription mode. The hosted
page offers `alipay` and `wechat_pay` (web client). A monthly pass adds exactly
30 × 24 hours and a semester pass adds 120 × 24 hours; neither automatically
renews. Initial test amounts are CAD 19.99 and CAD 69.99, respectively. These
are configurable placeholders, not approved launch prices. Keep the wallet
switch off until the intended Stripe test account is configured and verified.

| Additional variable | Test configuration |
| --- | --- |
| `BILLING_WALLET_PASSES_ENABLED` | `false` by default; set exactly `true` to offer wallet test checkout |
| `BILLING_MONTH_PASS_AMOUNT_CENTS` | `1999` by default; integer 100–100000 |
| `BILLING_SEMESTER_PASS_AMOUNT_CENTS` | `6999` by default; integer 100–100000 |
| `STRIPE_MONTH_PASS_PRICE_ID` | Active **one-time** CAD test Price matching the month-pass amount |
| `STRIPE_SEMESTER_PASS_PRICE_ID` | A different active **one-time** CAD test Price matching the semester-pass amount |

All existing test billing configuration below is also required. Missing/invalid
wallet settings disable wallet checkout without disabling card subscriptions.
The two pass Prices and recurring card Price must be distinct. Enable both wallet
methods in the owner-controlled Stripe account; CAD acceptance depends on account
country/capability (Canada is supported in the referenced documentation). Actual
availability still requires the account's eligibility/activation checks. This
implementation does not connect a personal WeChat or Alipay receiving account.
For a future authorized live launch, payments would settle to the configured
merchant's Stripe balance and its linked payout bank account.

The server snapshots each order's Price, amount and duration. It verifies the
current Checkout Session, one line item with quantity one, CAD amount, owner,
metadata, successful PaymentIntent, paid/captured charge and actual wallet type
before recording test validity. A redirect or a notification snapshot alone grants
nothing. A new pass extends from the later of its verified payment timestamp and
the previous pass's expiry, including early renewals. Expired passes display as
expired; there are no automatic payment attempts or renewal jobs.

Private purchase records live atomically in the existing billing row, under the
same account lease/CAS protection in local JSON and DynamoDB. Each payment remains
recorded permanently, so duplicates still cannot add time even after the bounded
webhook-event cache rotates. Deterministic payment-time/order-ID ordering handles
out-of-order delivery. Account membership, invitations, manual Plus, quotas and
administrator permissions remain unchanged in test mode.

Only one unpaid wallet order is allowed per account. Repeated clicks reuse it;
the user can close an open unpaid order before choosing another pass. A processing
payment cannot be closed through this action. A completed unpaid session whose
current PaymentIntent is failed or canceled permits a new purchase; a
still-processing payment remains pending. Session creation uses a durable
idempotency key; a lost response retries the original order, and signed Checkout
or PaymentIntent notifications can recover its Session ID. An unresolved creation
older than its one-hour window fails closed for owner review, instead of silently
creating a second payment. Configuration changes cannot reuse an old price.

Refund notifications re-read current provider state and paginate all refunds for
the payment. Only successful refunds reduce that purchase's duration, pro rata by
refunded amount (rounded down to milliseconds); pending/failed refunds do not.
A full refund removes that purchase's contribution. Later purchases are rebuilt
in payment order, each starting no earlier than its own payment timestamp. Other
purchases and account membership are preserved. No refund is initiated by the app;
refunds must be performed in Stripe. This is test reconciliation, not published
commercial refund terms.

Add these endpoint events alongside the events below:

- `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
- `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded`

Refresh reconciles pending orders and purchases from the preceding 181 days;
individual signed events can reconcile older known purchases. A test account is
limited to 100 retained pass orders, including closed orders, to keep the single
DynamoDB row bounded. Do not silently delete history to reset this limit; a larger
production ledger/queue is a later change. Provider/storage errors return non-2xx
for webhook retry, and expired workers cannot overwrite another worker's state.

Before owner testing, use Stripe's documented wallet **test** authorization pages
for both methods. Verify paid/abandoned/expired flows, signed webhook delivery,
duplicate/reordered events, restart recovery, early manual renewal and successful,
pending and failed refunds in the intended account. Automated tests in this repo
simulate the provider; they do not prove account eligibility, a working real QR
code, wallet app handoff or a completed official Stripe test transaction. No account
credentials were configured, no real payments were enabled, and no deployment
is authorized by this preparation work.

## Closed by default

`BILLING_MODE=disabled` makes payment actions unavailable and never calls Stripe.
This release supports **only disabled and test modes**. `live`, live secret keys,
live API objects and live webhook events are rejected. Setting an environment
variable alone cannot turn this implementation into a live charging service.
No existing access, quota, invitation, manual Plus classification or administrator
permission changes. Test subscription status is deliberately separate from actual
membership, and does not grant paid production access.

## Configure an owner-controlled Stripe test account

Keep credentials in private server configuration; never commit them or send them
in chat. No publishable key is needed for hosted Checkout.

| Variable | Test configuration |
| --- | --- |
| `BILLING_MODE` | `test` |
| `BILLING_PUBLIC_BASE_URL` | Trusted public HTTPS origin, e.g. `https://studybridge.ink`; localhost HTTP is accepted outside production. Do not include a path, credentials, query or fragment. |
| `BILLING_MONTHLY_AMOUNT_CENTS` | `1999` by default; an integer from 100 to 100000 |
| `STRIPE_SECRET_KEY` | A private `sk_test_…` key from the intended test account/sandbox |
| `STRIPE_WEBHOOK_SECRET` | The matching endpoint/listener signing secret `whsec_…` |
| `STRIPE_PLUS_MONTHLY_PRICE_ID` | An active test Price for exactly the configured CAD amount, recurring monthly, quantity one, licensed usage |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Optional test portal configuration `bpc_…`; otherwise the account's default portal configuration |

Create the test product/Price in Stripe. Configure the test Customer Portal for
payment-method updates, invoice history and cancellation at period end. Do not
enable product/price changes, extra subscription items or quantity changes for
this initial single-plan integration. Restart the app after configuration changes.

The official Node SDK is pinned to `stripe@23.1.0` and API version
`2026-10-28.endive`. Configure the webhook endpoint with the same version:
`POST https://<your-host>/api/billing/webhook`.

For local testing, use the Stripe CLI listener with the local server's actual port:

```sh
stripe listen --forward-to http://localhost:3000/api/billing/webhook
```

Use that listener's signing secret locally. A local listener and a Dashboard
endpoint have different secrets. Subscribe to these events:

- `checkout.session.completed`, `checkout.session.expired`
- `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`

## Ownership, persistence and retries

Authenticated JSON actions require the current user ID and a session-bound CSRF
token; when present, Origin must match the configured billing origin. Client-supplied
prices, customer/subscription IDs and redirect URLs are not accepted. The Price
is checked against the server's displayed amount before any Checkout is created.
Customer and Checkout creation use durable idempotency keys. Open Checkout sessions
are reused; an active/incomplete subscription blocks another Checkout. An uncertain
creation response retries the same stored Checkout attempt rather than charging twice.
An open/uncertain attempt is bound to its original Price, displayed amount and
return origin. Changing those settings requires closing the old Checkout attempt
or waiting for its one-hour expiration; it never redirects to a stale price. Do
not change the configured Price while test subscriptions are active. Existing
historical app subscriptions must still match this single-plan configuration;
plan migrations are a later feature rather than silently reinterpreting old bills.

Local JSON transactions and conditional DynamoDB transactions atomically maintain
private `billing` records and reverse customer ownership. A per-account two-minute
lease serializes Checkout, reconciliation and renewal changes across processes;
an expired lease cannot overwrite newer state. Existing profile records are not
rewritten. Billing state is covered by existing private database backups.

Raw request bytes are verified with the SDK's signature check and five-minute
timestamp tolerance before processing. Test events resolve their owner through the
stored customer mapping, not untrusted metadata alone. Accepted events re-read
the current Stripe subscription state rather than applying their possibly stale
snapshot. This protects against duplicate/out-of-order notifications and old
cancellation events arriving after a replacement subscription. The last 64 event
IDs are retained per account; older replayed IDs still reconcile current state.
Multiple active app subscriptions or mismatched Price/currency/quantity fail closed
and require owner review. Provider details/secrets are not sent to the browser.

The webhook returns success only after reconciliation is durable. Provider/storage
failures and concurrent-account operations return a non-success status so Stripe
can retry. Reconciliation is synchronous and bounded for this test foundation;
before a real high-volume launch, consider a durable webhook queue, capacity/rate
limits and operational monitoring. This release does not claim production load
validation, automatic refunds, tax calculation, paid feature gates or usage credits.

Returning from Checkout is not proof of payment. The return opens the billing
panel and refreshes server-verified state. Cancellation schedules the end of the
current period; it does not immediately cancel, charge or refund. The hosted portal
provides the detailed invoices; card numbers and CVC never pass through StudyBridge.

## Verification and remaining external test

Automated fixtures verify the real SDK's signature handling, disabled/live-key
rejection, account/CSRF/origin isolation, Price tampering, concurrent/repeated
Checkout, uncertain-response idempotency, current-provider reconciliation,
payment failure, period-end cancellation/resume, storage rollback and restart.
Client tests reject stale-account/closed-panel responses and unsafe redirects.
They use a simulated Stripe provider, not a successful Stripe account transaction.
The checked production dependency graph passes the high-severity audit threshold;
nine moderate advisories in existing non-Stripe dependencies remain outside this
change and should be reviewed before a real charging launch.

Before enabling test access for the owner, verify the configured test account with
Stripe-hosted Checkout using Stripe's documented test card `4242 4242 4242 4242`,
a future expiry and any three-digit CVC. Confirm the matching Dashboard test
customer, Price, webhook delivery, invoice/payment result, portal, period-end
cancellation, resumption and failed-payment state. Use test clocks for renewal and
end-of-period scenarios. Never use a real card for this test. No Stripe account
credentials were configured as part of this repository change.

Real charging requires separate owner authorization and implementation/review of
live-mode activation, final plans/usage allowances, entitlement reconciliation,
tax/refund terms, privacy disclosures, support processes and real-provider tests.
Keep changes on a task branch; do not deploy or enable fees through `main` yet.

## Official references

- [Stripe Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create)
- [Subscription events](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Webhook signatures, delivery order and retries](https://docs.stripe.com/webhooks)
- [Period-end cancellation](https://docs.stripe.com/billing/subscriptions/cancel)
- [Test cards and test environments](https://docs.stripe.com/testing)
- [WeChat Pay availability, one-time payments and refunds](https://docs.stripe.com/payments/wechat-pay)
- [Alipay availability and one-time payments](https://docs.stripe.com/payments/alipay)
- [Checkout fulfillment and payment verification](https://docs.stripe.com/checkout/fulfillment?ui=full-page)
- [Refund events and states](https://docs.stripe.com/refunds)
