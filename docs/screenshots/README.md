# PosFlow screenshot manifest

Regenerate the complete deterministic set without touching the normal local
demo schema:

```powershell
npm run capture:portfolio
```

The command uses the isolated PostgreSQL schema `posflow_portfolio`, starts
temporary local services, and overwrites only the eight PNG files listed below.

This directory will contain fictional-data portfolio captures produced from the
canonical scenario in [`portfolio-demo.md`](../portfolio-demo.md).

| File | View | Viewport |
| --- | --- | --- |
| `01-welcome-role-selector.png` | Welcome and four demo roles | 1440 × 900 |
| `02-cashier-sale-and-drawer.png` | Product catalog, cart, and drawer | 1440 × 900 |
| `03-remittance-payout.png` | Available incoming remittance | 1440 × 900 |
| `04-finance-advance-control.png` | Partially settled advance | 1440 × 900 |
| `05-supervisor-cash-bundle.png` | Sealed denomination-counted bundle | 1440 × 900 |
| `06-close-discrepancy-report.png` | Approved −MXN 13.00 close | 1440 × 900 |
| `07-finance-overview.png` | Consolidated financial command view | 1440 × 900 |
| `08-mobile-finance-overview.png` | Responsive finance overview | 390 × 844 |

Source captures should contain no browser chrome, personal data, environment
variables, database credentials, terminals, or developer tools.
