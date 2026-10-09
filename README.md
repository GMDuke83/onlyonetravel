# OnlyOne Luxury Travel / OO Travel

Responsive travel website, customer portal and a first shared Travel Operations workflow.

**Status:** first vertical slice, not the completed agency suite. The existing mobile website and five public languages are preserved. Business data now uses a shared Cloudflare D1 backend. GitHub Pages alone cannot run this platform.

## Run locally

Node 24 or newer:

```sh
npm ci
npm run db:migrate:local
node scripts/bootstrap-owner.js
npx wrangler d1 execute onlyone-travel --local --file=.local/bootstrap-owner.sql
npm run dev:backend
```

Open `http://localhost:8791` (customers) or `http://localhost:8791/operations.html` (staff). Use the personal owner token in `.local/owner-token.txt`. Set local variables in ignored `.dev.vars`; see `.dev.vars.example` / `.env.example`. Never commit tokens. `npm run dev` remains a static design preview only.

## Working flow

Customer enquiry → shared request → staff claim → versioned individual quote → private portal link → customer acceptance → payment request → verified manual/partner receipt → confirmed booking → calendar agenda and tasks → confirmed customer trip.

Prices are absent from public catalogues. Supplier costs/internal notes require server permissions. Ziraat is disabled until the actual hosted-payment integration is verified with the bank. No real bank payment or production deployment has been certified by local tests.

## Checks

```sh
npm run check
npm test
npm run check:functions
npx playwright install chromium
npm run test:browser
```

Browser tests use a fresh local D1 directory per run, port 8791, and the local-only fixture documented in `.github/workflows/platform-checks.yml`. They never reuse another running server. Synthetic screenshots: `docs/screenshots/`.

## Structure

- `public/`: existing customer website and modular `js/operations/` staff interface.
- `functions/_lib/`: security, permissions, requests, payments, catalogue and operations.
- `functions/api/`: shared API and guarded payment callbacks.
- `migrations/`: additive D1 schema, version snapshots, bookings, calendar, tasks and numbering.
- `tests/`: real SQLite/API checks and browser workflows against Pages/D1.

## Decisions and deployment

- [Current system analysis](docs/current-system-analysis.md)
- [Research and sources](docs/research-and-decisions.md)
- [Architecture decision](docs/architecture/adr-001-backend-platform.md)
- [Implementation plan and wireframes](docs/implementation-plan.md)
- [Deployment, migration, backup and limitations](docs/deployment-checklist.md)
- [Milestone evidence](docs/milestone-1.md)
- [Historical design / asset notes](docs/legacy-readme.md)

No automatic messaging, DNS change or production cutover. Staging needs Cloudflare credentials, separate D1 IDs and an HTTPS origin. The full positions editor, PDF/documents, calendar views/integrations, customer merging, password reset/MFA, reports and partner settlement remain subsequent milestones.
