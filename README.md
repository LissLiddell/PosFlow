# PosFlow

[![CI](https://github.com/LissLiddell/PosFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/LissLiddell/PosFlow/actions/workflows/ci.yml)

**A full-stack point-of-sale and cash-control system for multi-store operations.**

PosFlow connects cash sales, drawer limits, sealed cash bundles, remittances,
operational advances, blind closing, exception approval, and financial oversight
in one auditable workflow. It is designed to demonstrate how business rules—not
just screens—shape a reliable transactional application.

> **Portfolio project.** Mercado Lucerna, its people, products, transactions,
> credentials, and operating rules are fictional. No employer or client source
> code, private data, branding, interface, or proprietary documentation was
> reused.

## The problem

A POS can record a sale while still leaving important operational questions
unanswered:

1. How much physical cash should be inside each drawer?
2. What cash was removed, who sealed it, and where is it now?
3. Which remittance balances belong to physical cash and which belong to network
   settlement?
4. Which operational advances remain unsupported or unreturned?
5. Who can resolve a discrepancy without rewriting the original count?

PosFlow treats those questions as part of the product's core domain. Every cash
impact is linked to a shift and actor, sensitive actions are authorized on the
server, and completed records remain traceable.

## What the demo proves

- Role-based experiences for Administrator, Finance, Supervisor, and Cashier.
- Multi-store register opening with protection against concurrent active shifts.
- Searchable product catalog, cart, cash tender, change, stock validation, and
  atomic sale completion.
- Configurable drawer limits that block the next cash-increasing operation before
  the limit is exceeded.
- Cash bundles counted by denomination, editable only as drafts, and immutable
  after sealing.
- Remittance sending and one-time payout across stores, including fees and a
  separate funding ledger.
- Operational advances that move from authorization to issue, proof, cash return,
  partial settlement, and final settlement.
- Blind cash count, configurable tolerance, review queue, and signed discrepancy
  approval without changing the original count.
- Consolidated finance dashboard with active drawer cash, custody, funding,
  commissions, pending remittances, advance exposure, and recent actors.
- Responsive layouts, keyboard navigation, accessible tabs, progress indicators,
  tables, focus management, and status announcements.
- **92 automated checks:** 85 unit/integration tests and 7 complete browser
  journeys.

## Demo roles

The welcome screen signs in to fictional accounts without requiring registration.
Every account uses the password configured through `DEMO_USER_PASSWORD`; the
browser receives the matching demo-only value through `VITE_DEMO_PASSWORD`.

| Role | Demo identity | Scope |
| --- | --- | --- |
| Administrator | Inés Ortega · `ines@lucerna.demo` | Product and register configuration, supervisor delegation, cash bundles, close exceptions, finance overview, and advances. |
| Finance | Valeria Cruz · `valeria@lucerna.demo` | Consolidated finance overview, advance authorization, and expense proofs. |
| Supervisor | Mateo Santos / Diego Serrano | Store operations plus delegated bundle and close-approval capabilities. |
| Cashier | Luz Navarro / Camila Vega | Own-store and own-shift opening, sales, remittances, advance issue/return, and closing. |

Unavailable actions are not rendered in the interface. The API independently
enforces the same role, store, ownership, and per-register delegation rules.

## Architecture

```text
Vue 3 + Pinia SPA
        |
        | JSON / REST + bearer token
        v
Express 5 API
  ├─ JWT authentication and role/delegation checks
  ├─ Zod request validation
  ├─ transactional domain workflows
  ├─ business/store scoping
  └─ structured errors and audit events
        |
        v
Prisma ORM → PostgreSQL
  ├─ operational records
  ├─ physical-cash ledger
  └─ remittance-funding ledger
```

The browser owns presentation and short-lived interaction state. The API is the
source of truth for authorization, monetary calculations, state transitions,
inventory updates, and persistence. Sensitive workflows execute inside database
transactions; conditional updates protect remittances and advances from duplicate
or stale operations.

Read the [architecture and decisions](docs/architecture.md),
[relational data model](docs/data-model.md), and [REST API reference](docs/api.md)
for implementation detail.

## The two-ledger rule

PosFlow never presents network settlement as drawer cash.

```text
Expected drawer cash
  = opening float
  + cash sales
  + remittance principal and fee received
  - remittance payouts
  - advances issued
  + advance cash returns
  - sealed cash bundles
```

A remittance also writes the principal to a separate funding ledger. Sending
money creates a payable position for the origin store; paying money creates a
receivable position for the destination store. Expense proofs reduce advance
accountability but do not move physical cash.

## Technology

| Layer | Tools |
| --- | --- |
| Frontend | Vue 3, TypeScript, Pinia, Vite |
| Backend | Node.js 20+, Express 5, Zod, JOSE |
| Data | PostgreSQL, Prisma, versioned migrations, deterministic demo seeds |
| Quality | Vitest, Supertest, Playwright, strict TypeScript |

## Local setup

### Requirements

- Node.js 20 or newer
- npm
- PostgreSQL 16 or newer
- PostgreSQL command-line tools on `PATH` when using the Windows setup helper

### Install and initialize

```powershell
npm install
npm run db:setup
npm run db:generate
npm run db:deploy
npm run db:seed
npm run db:seed:stage2
npm run dev
```

Open `http://localhost:5174`. The REST API runs at
`http://localhost:4100/api`; its health endpoint is `/api/health`.

`db:setup` is a Windows development helper. It creates the local `posflow`
role and database, grants the local migration permission, refreshes PostgreSQL
collation metadata when required, and writes `apps/api/.env`. On another
operating system, create the database manually and use `.env.example` as the
configuration template.

> `npm run db:seed` removes existing transactional data for the fictional
> `mercado-lucerna` business before restoring the base demo. Never point this
> command at a database containing data you need to keep.

### Environment variables

| Variable | Purpose | Local default/example |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection and schema | Provider or local connection string |
| `JWT_SECRET` | Signs two-hour access tokens; minimum 32 characters | Generate separately per environment |
| `DEMO_USER_PASSWORD` | Password hashed for the fictional demo identities | Keep outside source control |
| `API_PORT` / `PORT` | API listener (`PORT` takes precedence for hosting providers) | `4100` |
| `WEB_ORIGIN` | Allowed browser origin for CORS | `http://localhost:5174` |
| `VITE_API_URL` | Browser-facing API base URL | `http://localhost:4100/api` |
| `VITE_DEMO_PASSWORD` | Demo-only browser value matching `DEMO_USER_PASSWORD` | Set during the web build |

## Docker

The repository includes independent production images for the API and web app,
plus a local Compose stack with PostgreSQL and an idempotent migration job.

```powershell
Copy-Item .env.docker.example .env.docker
# Replace every placeholder in .env.docker before continuing.
docker compose --env-file .env.docker up --build
```

The containerized web app is available at `http://localhost:8080`; the API
health endpoint is `http://localhost:4100/api/health`. PostgreSQL is exposed on
local port `5433` to avoid colliding with a regular installation on `5432`.

Load fictional portfolio data once the migration job has completed:

```powershell
docker compose --env-file .env.docker run --rm migrate npm run db:seed
docker compose --env-file .env.docker run --rm migrate npm run db:seed:stage2
```

Stop the services without deleting the database volume:

```powershell
docker compose --env-file .env.docker down
```

## Quality checks

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run build
```

The Playwright runner creates and cleans an isolated PostgreSQL schema named
`posflow_e2e`; it does not modify the normal `public` demo schema. Failed browser
journeys retain a screenshot, video, and trace for diagnosis.

GitHub Actions repeats the TypeScript checks, unit/integration suite, production
build, Playwright journeys, and both Docker image builds on every push to
`main` and on every pull request. A failing stage blocks the green quality gate;
the Render connection added during deployment will provide continuous delivery
after this gate is in place.

| Level | Passing checks | Signal |
| --- | ---: | --- |
| API domain and integration | 75 | Money, denominations, sales, stock, roles, shifts, bundles, remittances, advances, finance, and operational combinations |
| Frontend logic | 10 | Money parsing, advance progress, remittance presentation, and funding display |
| Browser E2E | 7 | Four complete business journeys plus three keyboard/responsive journeys |

See [testing and accessibility](docs/testing.md) and the Spanish
[QA matrix](docs/matriz-qa-es.md) for the exact boundaries.

## Repository structure

```text
posflow/
├─ apps/
│  ├─ api/                 # Express API, domain rules, Prisma, migrations, seeds, tests
│  └─ web/                 # Vue SPA, Pinia stores, feature panels, frontend tests
├─ docs/                   # Product, architecture, data, API, testing, and QA notes
├─ e2e/                    # Isolated database fixture and Playwright journeys
├─ scripts/                # Local database, dev runner, and E2E orchestration
├─ package.json            # npm workspaces and project-level commands
└─ .env.example            # Safe local configuration template
```

## Intentional MVP boundaries

The current release focuses on cash operations and integrity. It does not process
real cards, connect to banks or money-transfer providers, issue tax invoices,
control physical POS hardware, operate offline, support multiple currencies, or
replace accounting software. Sales currently accept cash only; product stock is
editable by an administrator, but a complete inventory-adjustment ledger is not
part of this release.

These boundaries are deliberate: the portfolio demonstrates a coherent,
well-tested operational core rather than a wide collection of unfinished modules.

## Documentation

- [Product core and business rules — Spanish](docs/nucleo-producto-es.md)
- [Architecture and technical decisions](docs/architecture.md)
- [Relational data model](docs/data-model.md)
- [REST API reference](docs/api.md)
- [Testing and accessibility](docs/testing.md)
- [Regression and manual QA matrix — Spanish](docs/matriz-qa-es.md)
- [Portfolio captures and demo script](docs/portfolio-demo.md)

## Security baseline and production notes

- Passwords are hashed with bcrypt and access tokens expire after two hours.
- CORS accepts the configured web origin and JSON request bodies are size-limited.
- Every protected query derives the business and optional store boundary from the
  verified token instead of trusting identifiers supplied by the browser.
- Zod validates external input before domain workflows reach Prisma.
- Expected failures use structured error responses; unexpected failures do not
  expose internal details.
- Cash, funding, state, and audit writes are grouped transactionally where one
  partial write would corrupt the business result.

For a real production launch, the demo login and browser-stored bearer token would
be replaced by managed identity or secure `HttpOnly` sessions, with rate limiting,
secret rotation, centralized telemetry, backups, and provider-specific compliance
controls.
