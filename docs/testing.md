# PosFlow testing and accessibility

PosFlow uses layered tests because no single test type gives enough confidence
for a transactional interface.

## Current result

| Layer | Files | Passing checks |
| --- | ---: | ---: |
| API domain + HTTP integration | 8 | 75 |
| Frontend calculation helpers | 4 | 10 |
| Browser end-to-end | 2 | 7 |
| **Total** | **14** | **92** |

The final feature-review run also passed strict TypeScript checks and the Vite
production build. All business journeys use fictional data.

## Commands

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Install the bundled Chromium browser once before the first E2E run:

```powershell
npm run test:e2e:install
```

## API domain and integration coverage

| Test file | Checks | Main signal |
| --- | ---: | --- |
| `cash.test.ts` | 13 | Supported denominations, totals, signed ledger sums, tolerance, and drawer-limit decisions |
| `sales.test.ts` | 10 | Quantity consolidation, tender/change, and inventory decisions |
| `remittances.test.ts` | 4 | Fee boundaries and physical/funding impact |
| `advances.test.ts` | 5 | Outstanding amount, settlement state, over-settlement rejection, and cash direction |
| `finance.test.ts` | 2 | Payable/receivable funding and advance summary |
| `permissions.test.ts` | 5 | Administrator authority and independent supervisor delegations |
| `operationalScenarios.test.ts` | 25 | Combined opening, sale, bundle, remittance, advance, and closing equations |
| `app.test.ts` | 11 | Health, authentication, role rejection, store scope, and critical API mutations |

Pure domain functions make boundary cases fast and explicit. HTTP integration
tests verify that authentication and route behavior use those rules correctly.

## Frontend logic coverage

| Test file | Checks | Main signal |
| --- | ---: | --- |
| `money.test.ts` | 3 | Currency input parsing and formatting |
| `remittances.test.ts` | 2 | Incoming/outgoing presentation and commission labels |
| `advances.test.ts` | 3 | Pending amount, progress, and display states |
| `finance.test.ts` | 2 | Signed funding presentation |

Authoritative monetary decisions remain on the server. Frontend helpers test only
display/input behavior that can independently confuse an operator.

## Browser journeys

The Playwright suite exercises real browser interaction against a compiled API
and frontend:

1. cash sale → role handoff → draft/sealed cash bundle → balanced close;
2. remittance send in Centro → one payout in Roma → duplicate payout rejected →
   both shifts close correctly;
3. Finance authorizes an advance → Cash issues it → Finance proves part → Cash
   receives the remainder → advance settles and shift closes;
4. blind close with shortage → pending review → Supervisor approval → report
   preserves expected, counted, and difference values;
5. mobile keyboard flow → skip link → focused main content → current navigation
   → accessible cart controls → remittance tabs operated with arrow keys;
6. Finance dashboard and advance views at 375 px and 768 px without document
   overflow;
7. Administrator catalog at 320 px with a contained scrollable table and unique
   accessible edit controls.

Failed journeys retain Playwright screenshots, video, and traces. Successful
tests do not leave those artifacts.

## Database isolation

E2E tests derive a second PostgreSQL schema from the configured
`DATABASE_URL`:

```text
public        → local manual demo
posflow_e2e   → automated browser fixture
```

Before each browser test, the fixture deletes only the fictional
`posflow-e2e` business and recreates its stores, registers, identities,
category, and product. The normal demo records in `public` are never selected
for deletion.

The runner:

1. syncs the isolated schema without generating a new Prisma client;
2. compiles the API;
3. builds the frontend with the test API URL;
4. starts both services on dedicated ports;
5. runs one browser worker for deterministic shared-database behavior;
6. stops the services and removes the fixture business.

## Manual regression matrix

The automated suite is complemented by
[`matriz-qa-es.md`](matriz-qa-es.md), which maps each event to drawer cash,
custody, inventory, funding, and advance responsibility.

Manual feature review covered:

- balanced closes with and without bundles;
- shortages and surpluses;
- tolerance boundaries and supervisor delegation;
- pending advances across shifts;
- proof plus cash-return combinations;
- remittance principal, fee, destination, identity, and one-time payout;
- expected-cash explanation after mixed real-world-style sequences;
- role-specific navigation and hidden unauthorized functionality.

One final mixed scenario produced expected cash of MXN 1,509.00, a physical count
of MXN 1,500.00, and an explained discrepancy of **−MXN 9.00**.

## Accessibility review

Implemented and verified:

- Spanish document language and responsive viewport metadata;
- landmark regions and one main content target;
- first-focus skip link;
- logical headings and native form labels;
- fieldsets for related role, store, and permission choices;
- visible keyboard focus, including custom switches;
- current-page state in the role navigation;
- remittance tablist/tab/tabpanel semantics with Left/Right Arrow behavior;
- accessible names that identify repeated product, bundle, and close actions;
- progressbar name/value semantics;
- table captions, column headers, and row headers;
- status and alert announcements for successful and failed operations;
- focus and scroll reset after login, logout, and view changes;
- reduced-motion support;
- improved contrast for compact metadata;
- touch-sized primary controls and isolated table scrolling on narrow screens.

## Responsive breakpoints reviewed

| Width | Purpose |
| ---: | --- |
| 320 px | Minimum supported phone width and administrative catalog containment |
| 375 px | Common phone layout and complete Cashier/Finance journeys |
| 768 px | Tablet finance layout |
| Desktop | Full financial command view and dense operational layout |

The global document must never become wider than its viewport. Dense financial
and product tables may scroll horizontally inside their own labeled containers.

## Current test boundaries

The suite does not claim:

- real payment-provider, bank, remittance-network, email, or hardware integration;
- load, soak, penetration, browser-matrix, or offline testing;
- card and mixed-tender sale journeys;
- refund/void, generic cash adjustment, or inventory-ledger workflows;
- WCAG certification by an independent auditor.

Those require implementation or infrastructure beyond the current MVP. The
existing suite is intentionally deep around the cash-control rules that PosFlow
actually exposes.
