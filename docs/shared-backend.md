# Shared backend (Cloudflare Pages + D1)

## Starting point and architecture

Based on `main` at `7e39fc2` (15 September 2026). The original application is a static,
framework-free SPA (`public/js/app.js`) with a single `onlyone.state.v1` localStorage
object containing requests, offers, statuses, messages, lead forms and the travel
folio. Bookings are requests in accepted/payopen/paid/confirmed states, not a
separate inventory system. The original staff login accepted any name. Existing
Pages Functions signed a browser-supplied payment amount; callbacks redirected
back to a browser which trusted the URL to mark local records paid. Vakif's
callback previously trusted `Rc=0000` without a bank inquiry.

The new source of truth is D1. `requests` contains one versioned JSON aggregate
per journey (contact, enquiry, individual offer, booking status, messages and
append-only payment ledger). This deliberately retains the existing UI data
shape. `request_events` stores every committed version and actor through database
triggers. Conditional version updates prevent lost writes. D1 `batch()` makes
creation plus legacy archive atomic. Separate tables hold sessions, scoped access
grants, hashed access links, payment attempts and rate limits. No card data is
accepted or stored. Monetary validations and bank requests use rounded minor
units, including converted base amounts.

`public/js/backend.js` coordinates the API, 15-second refresh, guest cache/outbox,
conflict reporting, backup import/export and access links. Local preferences and
favorites remain local. Staff data is held in memory rather than saved as a
browser cache. The visual components and travel flow remain in `app.js`; small
access/backup/reconciliation controls are added. New backend controls currently
use English; existing translated views remain unchanged.

## Permissions and business rules

- First visit obtains a random guest session in an HttpOnly, SameSite=Lax cookie
  (Secure on HTTPS; 30-day lifetime). The database stores only its SHA-256 hash.
- Staff sign in with a name and `STAFF_LOGIN_KEY` (random, at least 32 characters).
  Staff use a separate eight-hour HttpOnly cookie, so logout restores the guest
  session on the same device. Rotating the key invalidates existing staff sessions.
  This is a minimum shared-team credential, not individual staff accounts/MFA.
- Staff can see all journeys; guests only their own or explicitly granted ones.
  Request IDs, contact emails and names do not grant access.
- A private journey access link grants access to exactly one journey on another
  device. The token is in the URL fragment, exchanged for a cookie-backed grant,
  and removed from the address bar. Link redemption expires after seven days;
  existing grants last for the recipient session. Treat links as credentials.
  Staff can create them and deliver them through their existing contact channel.
  No email/SMS is sent automatically. Customers should save a link before moving
  devices; staff can issue a replacement after verifying identity independently.
- Guests cannot set offers, prices, internal notes, payments or paid status.
  API responses omit staff notes and offer/ledger internal fields. Every public
  request, including vehicle requests, starts without a price. Only a staff
  offer introduces a price. An accepted offer is required for a bank checkout.
- Changes carry an expected version. A 409 blocks further writes until the user
  exports/reviews the rejected edits and reloads server data. Network outages
  leave guest changes in a persistent outbox. Staff unsaved edits remain only in
  the open tab. No fallback silently reports a locally saved request as delivered.
- Writes require the same Origin and JSON content type. Request bodies are bounded;
  credentials are rate-limited by IP; enquiry creation and access redemption by
  session. Add Cloudflare WAF/rate rules for `/api/*` for public launch abuse control.

## API

All API responses use `Cache-Control: no-store`. Business APIs use session cookies.
Errors are JSON `{ "error": "machine-readable-code" }`; usual statuses are 400,
401, 403, 404, 409 (conflict), 413, 415, 429 and 503.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/v1/health` | D1/schema readiness, no private data |
| `POST /api/v1/session` | `{}` guest bootstrap, or `{name,staffKey}` staff login |
| `GET/DELETE /api/v1/session` | Current identity / logout |
| `GET /api/v1/requests?cursor=ID` | Authorized page of up to 100; follow cursor |
| `POST /api/v1/requests` | `{request,legacy?}`; stable client UUID, idempotent per owner |
| `GET /api/v1/requests/:id` | Authorized journey with `_version` |
| `PUT /api/v1/requests/:id` | `{version,request}` validated role-specific update |
| `POST /api/v1/requests/:id/access-link` | Create seven-day private access link |
| `POST /api/v1/access` | `{token}` redeem link into current session |
| `GET /api/v1/requests/:id/events?after=VERSION` | Staff audit snapshots, up to 100 |
| `GET /api/v1/requests/:id/legacy` | Staff-only untrusted original import |
| `GET /api/v1/requests/:id/payment-attempts` | Staff-only bank attempt records |
| `POST /api/v1/requests/:id/payment-attempts` | Staff reconciliation: `{attemptId,outcome:"paid"|"failed",reference}` |
| `GET /api/pay/ping` | Configured/verified provider capabilities |
| `POST /api/pay/start` | `{provider:"ziraat",oid:requestId,lang}`; client amounts ignored |
| `POST /api/pay/return/ziraat` | Signed, amount/currency/merchant-matched callback |

## Payments and operational reconciliation

A bank attempt has its own unpredictable order ID and server-fixed amount,
currency and optional ledger entry. Only one pending attempt per request is
allowed by a unique database index. Financial edits are locked during checkout;
notes/messages may continue. Callback retries credit the attempt exactly once,
even when a previous delivery saved the ledger but failed to mark the attempt.
Browser query parameters never create ledger entries. Partial payments credit
only their requested amount; the booking becomes paid only at zero balance.

Only Ziraat is enabled. Its existing NestPay ver3 hashing is retained; approval
requires a valid signature, matching stored amount/currency/client/order and
`Response=Approved`, `ProcReturnCode=00`, `mdStatus=1`. Confirm these exact fields
and the strict 3-D setting with the bank using merchant test credentials before
launch. **No live bank transaction has been executed in this implementation.**
Vakif initiation/callback crediting is disabled until a verified server-to-server
transaction inquiry is implemented against the merchant's documentation.

An abandoned bank hand-off must not be retried automatically: the bank could
have taken payment even if the browser never returned. A staff member checks the
bank panel and uses the two reconciliation controls in the request detail. A
bank reference is required and recorded in the audit actor. Mark failed/cancelled
only after confirming no charge occurred; then another attempt may be started.
The stored expiry is operational metadata, not permission to unlock a potentially
charged attempt. Later valid callbacks for an already failed/reconciled attempt
cannot silently overwrite that reconciliation; investigate these with the bank.
Reconciliation and manual refund entries are accounting records; they do not
execute refunds at the bank. Automatic bank inquiry/webhooks and per-user staff
identity are recommended follow-up work.

## Migrating existing browser data

Before changing domains, export the old site's `onlyone.state.v1` data. With the
new UI available on that origin, open My trips → Export local backup. Alternatively
save that localStorage JSON through browser developer tools. localStorage cannot
be read across GitHub Pages and Cloudflare origins.

On first startup, the application copies old requests/leads to
`onlyone.legacy.v1`. My trips → Import local requests sends the records to D1;
Load backup can load an exported array or an old `{requests:[...]}` state object.
The import uses deterministic IDs per session and old ID, so a retry does not
create duplicates within that session. Keep the downloaded original backup;
importing the same records under a new session/origin can create duplicates and
must be reviewed by staff. Imported contact-less historical service records may
need contact details verified outside the system.

Only validated enquiry details become active records. Old offers, paid flags,
messages, internal notes and other original fields are retained in
`legacy_imports`, accessible through the staff legacy download. They are never
trusted as evidence of payment or staff authorization. Staff review the original,
reissue offers and record independently verified payments in the normal folio.
This also prevents a fabricated localStorage record from claiming an existing
server journey or receiving a paid booking. Browser staff flags are discarded.
Invalid records remain in the backup/outbox for correction; no existing server
journey is overwritten by an import.

On GitHub Pages/static-only hosting the catalog and local backup export remain
available, but sending requests and payments is blocked with a clear notice.
The production customer and staff URLs must use the same Cloudflare origin.

## Local development and tests

Requires Node 24+ (the SQL tests use Node's built-in SQLite).

```sh
npm ci
cp .dev.vars.example .dev.vars
# Set a local STAFF_LOGIN_KEY (32+ random characters) in .dev.vars.
npm run db:migrate:local
npm run dev:backend
```

Open `http://localhost:8788`. `npm run dev` remains a static preview with no API.
Local D1 data persists in ignored `.wrangler/state/`; migrations are repeatable.

```sh
npm run check
npm test
npm run check:functions
npx playwright install chromium
# Browser tests: use ONLYONE_TEST_STAFF_KEY matching .dev.vars, or the
# clearly test-only fixture key from tests/browser/shared.spec.cjs locally.
npm run test:browser
npm run stamp
npm run stamp:check
```

The backend tests execute real SQL/migrations against SQLite with a small D1
adapter. Browser tests run actual Pages Functions and local D1 with separate
browser contexts. They do not use a bank network or production database.

## Cloudflare deployment

Use the existing Pages project `onlyone-luxury-travel` and its `functions/` tree.
Official references: [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/),
[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

1. Create separate production and preview D1 databases:
   `npx wrangler d1 create onlyone-travel` and
   `npx wrangler d1 create onlyone-travel-preview`.
2. Replace the zero UUID in `wrangler.jsonc` with the production database UUID.
   Configure `env.preview.d1_databases` with the **preview** UUID. Binding name is
   always `DB`; never connect untrusted feature previews to the production DB.
   The checked-in zero UUID is deliberately only a local development placeholder.
3. Apply `npx wrangler d1 migrations apply DB --remote` for production, and
   `npx wrangler d1 migrations apply DB --remote --env preview` for preview. Check
   the displayed target database before executing. Existing records are retained.
4. Configure these runtime variables/secrets separately in each Pages environment:

   | Name | Kind | Purpose |
   | --- | --- | --- |
   | `DB` | D1 binding | Required shared database |
   | `STAFF_LOGIN_KEY` | Secret | Required random staff login credential, 32+ characters |
   | `SITE_URL` | Variable | Canonical HTTPS origin for bank callback redirects |
   | `ZIRAAT_CLIENT_ID` | Secret/merchant setting | Bank merchant/client ID |
   | `ZIRAAT_STORE_KEY` | Secret | NestPay signing key |
   | `ZIRAAT_GATE_URL` | Variable, optional | Bank-approved test/production gateway |

   Missing bank credentials disable checkout; missing DB fails closed. Do not
   reuse staff credentials in test fixtures or commit `.dev.vars`. Existing Vakif
   secrets are unused while the provider is disabled. Use the bank's confirmed
   test gateway and credentials on preview; do not point preview at live charging.
5. Run checks, stamp the build, then deploy:
   `npx wrangler pages deploy public --project-name=onlyone-luxury-travel --branch=main`.
   Deploy preview using its feature/develop branch and preview bindings. The
   `_routes.json` file routes only `/api/*` through Functions.
6. Verify health, staff login, a real customer enquiry on a second device, offer,
   acceptance, message/status refresh, access-link redemption and staff logout.
   Complete bank sandbox callback/retry/reconciliation tests before enabling live
   payment credentials. Route the production domain to Cloudflare; GitHub Pages
   alone cannot host this API.

The existing Cloudflare workflow still deploys `develop` or a manually selected
branch. Its GitHub environments distinguish `cloudflare-production` (`main`) from
`cloudflare-preview` (other branches). Configure environment-scoped
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_DATABASE_ID`.
The token now also needs D1 edit permissions for migrations. The workflow injects
the selected DB ID into an ephemeral config, applies migrations, checks code and
deploys; runtime staff/bank secrets stay in Pages. Use either this workflow or
Cloudflare Git integration, not both. Protect the production GitHub environment.

## Operations and remaining scope

- Inspect failed payment attempts against the bank panel; never infer payment from
  an end-user URL. Audit snapshots include personal information and financial data.
- Restrict Cloudflare/D1 access, use D1 backups/Time Travel and establish a retention
  policy for requests, audit snapshots and original legacy imports before launch.
- Periodically remove expired rows from `rate_limits`, `sessions` and `access_links`.
  Do not delete payment attempts/audit data without an accounting retention policy.
- Guest sessions expire after 30 days. A new private link from staff restores
  access after identity verification; there is no automated email recovery yet.
- Shared staff credentials allow auditing a supplied staff name, not proving an
  individual identity. Move to named accounts/Cloudflare Access + MFA as the team
  grows. No automatic inventory allocation, supplier booking confirmation,
  notifications, bank refunds or account registration is added here.
- Request aggregates have a 100 KB write limit; audit history grows with changes.
  Split long-lived messaging/ledger tables and add archival policies at higher
  volume. Polling can be replaced by push updates later.
- This branch supplies code and deployment instructions. A remote D1 database,
  runtime secrets and live deployment must be provisioned in the target account.

## Eigene Partner und Leistungen

Die Erweiterung mit Migration `0002_catalog.sql` und dem Mitarbeiterablauf
Partner → Leistung → individuelles Angebot ist in [staff-catalog.md](staff-catalog.md)
beschrieben. Sie benötigt keine zusätzlichen Secrets oder Bindings.
