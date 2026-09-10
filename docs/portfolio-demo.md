# PosFlow portfolio captures and demo

This is the production plan for the public case study, screenshots, and demo
video. It uses only fictional Mercado Lucerna data.

## Story to communicate

PosFlow is not presented as “a POS with many screens.” The story is:

> One operation connects sales, physical cash, custody, remittance funding,
> advance accountability, and closing exceptions without losing the actor or the
> reason behind each amount.

The visual package should prove three things quickly:

1. the interface is usable by distinct roles;
2. the financial rules remain understandable during a mixed shift;
3. the implementation has real architecture, authorization, and automated
   verification behind it.

## Canonical capture scenario

The base and stage-two seeds already provide:

- two fictional stores: Lucerna Roma and Lucerna Centro;
- Administrator, Finance, Supervisor, and Cashier identities;
- a complete product catalog;
- incoming remittance `RM-DEMO2026` for MXN 850.00, identity code `4821`;
- authorized advance `AV-DEMO2026` for MXN 600.00 in Roma.

Build the recording around this deterministic shift:

```text
Opening float                              + $2,000
Sale: Vela cedro $189 + Agua mineral $24   +   $213
Incoming remittance payout                 -   $850
Authorized advance issued                  -   $600
Sealed cash bundle                         -   $500
---------------------------------------------------
Expected drawer cash                       =   $263
Blind physical count                       =   $250
Discrepancy                                =   -$13
```

Finance can record a MXN 450.00 expense proof for the advance before closing.
That leaves MXN 150.00 of accountability but does not change the MXN 263.00
physical drawer amount.

## Data reset warning

The automated capture command uses the isolated PostgreSQL schema
`posflow_portfolio`, so it does not delete the scenarios in the normal local
demo schema:

```powershell
npm run capture:portfolio
```

For a manual recording, the screenshot set must start from predictable demo
data:

```powershell
npm run db:seed
npm run db:seed:stage2
npm run dev
```

> `db:seed` deletes the existing Mercado Lucerna transactional demo history.
> Run it only when the current manual scenarios are no longer needed. This
> command does not belong in a production workflow.

After resetting, do not improvise extra movements before finishing the capture
sequence; otherwise the displayed totals will differ from this document.

## Capture standards

- Desktop source: **1440 × 900**, browser content only.
- Mobile source: **390 × 844**.
- Browser zoom: 100%.
- Hide tabs, bookmarks, notifications, developer tools, password prompts, and
  personal browser chrome.
- Keep the pointer away from headings, totals, and faces.
- Capture PNG source files; export compressed JPG variants only for an uploader
  that requires them.
- Never capture local environment variables, PostgreSQL credentials, terminal
  output, personal tabs, or non-demo data.
- Use the exact filenames below so the README and case-study exports can reuse
  them.

## Screenshot set

### 01 — Role selector

**File:** `docs/screenshots/01-welcome-role-selector.png`  
**Viewport:** 1440 × 900  
**State:** Fresh welcome screen with the four role choices visible.

This is the cover candidate because it establishes the product identity and role
separation without requiring financial context.

### 02 — Cashier point of sale

**File:** `docs/screenshots/02-cashier-sale-and-drawer.png`  
**Viewport:** 1440 × 900  
**Role:** Cashier · Lucerna Roma  
**State:** Open MXN 2,000.00 shift; add Vela cedro and Agua mineral to the cart
but stop before charging.

The frame should show product discovery, cart quantities, cash summary, and
drawer limit at the same time.

### 03 — Remittance payout

**File:** `docs/screenshots/03-remittance-payout.png`  
**Viewport:** 1440 × 900  
**Role:** Cashier · Lucerna Roma  
**State:** Open the Pay remittance tab and show `RM-DEMO2026` as available
before submitting it.

This proves cross-store context, identity validation, and one-time state.

### 04 — Advance accountability

**File:** `docs/screenshots/04-finance-advance-control.png`  
**Viewport:** 1440 × 900  
**Role:** Finance  
**State:** The MXN 600.00 advance has been issued and MXN 450.00 proved, leaving
MXN 150.00 pending.

The frame should contain the status, progress, responsible store, history, and
remaining amount.

### 05 — Sealed cash bundle

**File:** `docs/screenshots/05-supervisor-cash-bundle.png`  
**Viewport:** 1440 × 900  
**Role:** Supervisor · Lucerna Roma  
**State:** A MXN 500.00 bundle is sealed. Keep both denomination controls and the
immutable sealed row visible.

This is the strongest evidence for custody and administrator-delegated
operations.

### 06 — Explained close discrepancy

**File:** `docs/screenshots/06-close-discrepancy-report.png`  
**Viewport:** 1440 × 900  
**Role:** Supervisor after approval  
**State:** Expected MXN 263.00, counted MXN 250.00, difference −MXN 13.00, with
the approval state and ledger explanation visible.

This is the closing proof that the app explains the number instead of merely
showing an error.

### 07 — Consolidated finance

**File:** `docs/screenshots/07-finance-overview.png`  
**Viewport:** 1440 × 900  
**Role:** Finance or Administrator  
**State:** Show controlled cash, custody, funding position, commissions, pending
remittances/advances, store exposure, and recent activity.

This is the primary technical case-study image.

### 08 — Responsive operation

**File:** `docs/screenshots/08-mobile-finance-overview.png`  
**Viewport:** 390 × 844  
**Role:** Finance  
**State:** Top of the finance overview with navigation, headline, refresh state,
and first financial cards.

This proves the dense operational interface adapts instead of simply shrinking.

## Recommended capture order

The order minimizes repeated setup:

1. Reset both seeds and capture **01**.
2. Enter Cashier/Roma and open the shift with MXN 2,000.00.
3. Build the two-product cart and capture **02**; then complete the MXN 213.00
   sale.
4. Open Remittances and capture **03**; then pay `RM-DEMO2026` using `4821`.
5. Open Advances and issue `AV-DEMO2026`.
6. Switch to Finance, register the MXN 450.00 proof, and capture **04**.
7. Switch to Supervisor/Roma, prepare one MXN 500.00 bill, seal it, and capture
   **05**.
8. Switch to Cashier/Roma, count five MXN 50.00 bills, and submit the close.
9. Switch to Supervisor/Roma, approve the −MXN 13.00 exception, and capture
   **06**.
10. Switch to Finance, refresh the overview, and capture **07**.
11. Resize to 390 × 844 and capture **08**.

## Master demo route — 2:00 to 2:30

### Start the isolated recording environment

```powershell
npm run demo:portfolio
```

Open `http://127.0.0.1:5185` when the terminal reports that the environment is
ready. The command resets only the isolated `posflow_portfolio` schema and keeps
both temporary services running until you press `Ctrl+C`.

If a rehearsal changes the numbers, stop the command and run it again to restore
the exact starting state.

### 0:00–0:12 — Product and roles

- Start on the welcome screen.
- Identify the four responsibilities.
- Enter as Cashier in Lucerna Roma.

**Message:** the same operation produces a different safe workspace for each
role.

### 0:12–0:35 — Sale and drawer control

- Show the open shift and cash summary.
- Add Vela cedro and Agua mineral.
- Use the exact amount and complete the sale.
- Pause on the updated expected cash and receipt notification.

**Message:** sale, stock, receipt, physical cash, and audit succeed together.

### 0:35–0:55 — Remittance

- Open Remittances.
- Switch between Send and Pay with the tabs.
- Pay the seeded incoming remittance.
- Point out that the drawer decreases while funding moves in its own book.

**Message:** physical cash and network settlement are related but never mixed.

### 0:55–1:20 — Advance and accountability

- Issue the authorized advance as Cashier.
- Switch to Finance.
- Register a partial proof.
- Show that MXN 150.00 remains accountable and the drawer does not change from a
  document-only proof.

**Message:** every advance remains assigned and explainable until proved or
returned.

### 1:20–1:42 — Custody and delegated authority

- Switch to Supervisor.
- Prepare and seal the MXN 500.00 bundle.
- Show the reduced drawer, increased custody, and immutable state.

**Message:** the system prevents uncontrolled excess cash and records who
removed it.

### 1:42–2:05 — Blind close and exception

- Return to Cashier and enter the MXN 250.00 blind count.
- Submit the close.
- Switch to Supervisor and approve the discrepancy.
- Pause on the report: expected 263, counted 250, difference −13.

**Message:** approval never rewrites the original evidence.

### 2:05–2:25 — Financial command view and technical close

- Open the Finance overview.
- Show physical cash, custody, funding, commissions, advance exposure, stores,
  and actor history.
- End on the technical stack and test count.

**Message:** PosFlow is a full-stack transactional system backed by PostgreSQL,
server-side authorization, concurrency controls, and 92 automated checks.

## English spoken script

> PosFlow is a full-stack point-of-sale and cash-control platform for multi-store
> operations. Each role receives only the workflows it is authorized to use. A
> cashier opens a shift, completes a cash sale, and sees expected drawer cash
> update from an auditable ledger. Remittances move physical cash and network
> funding in separate books, preventing settlement balances from being presented
> as money in the drawer. Finance authorizes and proves operational advances,
> while Cash issues or receives the actual cash. Supervisors can manage sealed
> cash bundles and close exceptions only when an administrator delegates those
> permissions. At closing, the original blind count is preserved: an authorized
> approval explains the discrepancy without rewriting it. The finance view then
> consolidates active cash, custody, funding, commissions, advances, stores, and
> recent actors. PosFlow uses Vue 3, TypeScript, Pinia, Express, Prisma, and
> PostgreSQL. Transactional writes, server-side authorization, concurrency
> controls, responsive accessibility, and ninety-two automated checks protect the
> operational core.

At a calm pace, the script is approximately 90 seconds. Use the additional
clicks and pauses from the master route to produce a two-minute visual demo.

## Spanish rehearsal guide

> PosFlow conecta ventas, efectivo físico, custodia, remesas, anticipos y cierre
> de caja sin perder quién realizó cada movimiento. Cada rol ve solamente las
> funciones que puede operar, pero la autorización también se valida en la API.
> Las remesas utilizan dos libros: uno para el efectivo real del cajón y otro
> para el fondeo pendiente con la red. Los anticipos separan la entrega de dinero,
> la comprobación documental y la devolución de efectivo. Una fajilla sellada
> sale del cajón, entra a custodia y ya no puede editarse. Finalmente, el cierre
> ciego conserva el conteo original; si existe diferencia, una persona autorizada
> puede aprobarla sin alterar la evidencia. Todo está respaldado por Vue,
> TypeScript, Express, PostgreSQL, transacciones, permisos del servidor y 92
> verificaciones automáticas.

## Recording and editing notes

- Record a clean 1080p master at 30 or 60 fps.
- Target 2:00–2:30 for the full case study and cut a 60–90 second trailer from
  the same recording.
- Pause briefly after each state change; do not race the loading or toast text.
- Move the pointer slowly and park it away from totals while speaking.
- Prefer one intentional action per sentence.
- Add short captions for **physical cash**, **funding**, **custody**, and
  **accountability**; those distinctions are the product's advantage.
- Avoid background music that competes with narration.
- Export one high-quality master and create platform-specific copies afterward.
- Verify the current file-size, duration, and aspect-ratio limits in each
  portfolio uploader before export.

## Case-study text structure

Use the same content order on Contra, Upwork, Workana, and the future personal
portfolio:

1. **Problem:** POS records do not automatically explain cash operations.
2. **Solution:** one auditable flow for sales, custody, remittances, advances,
   and closing.
3. **My role:** full-stack product design and implementation.
4. **Hard decisions:** separate ledgers, integer money, atomic workflows,
   immutable evidence, and API authorization.
5. **Result:** responsive demo plus 92 automated checks across domain, API,
   frontend, and browser journeys.
6. **Technology:** Vue 3, TypeScript, Pinia, Express, Prisma, PostgreSQL,
   Vitest, Supertest, and Playwright.

Do not describe fictional business outcomes as real customer metrics. Use
verifiable engineering outcomes such as implemented workflows, rejected invalid
states, automated checks, responsive widths, and traceable records.
