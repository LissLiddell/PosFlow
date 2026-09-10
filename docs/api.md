# PosFlow REST API

The API uses JSON over HTTP. Local base URL:

```text
http://localhost:4100/api
```

All endpoints except login and health require:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

The signed access token expires after two hours and carries the user identifier,
business identifier, optional store identifier, and role. Business/store scope is
never accepted as a trusted request-body field.

## Response and error conventions

Successful responses wrap the requested resource, such as `{ "shift": ... }`,
`{ "products": [...] }`, or `{ "report": ... }`.

Expected failures share this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisa los datos obligatorios.",
    "details": {}
  }
}
```

| Status | Meaning |
| ---: | --- |
| `200` | Successful read/update/action |
| `201` | Resource created |
| `202` | Close accepted but waiting for exception approval |
| `400` | Malformed route or query identifier |
| `401` | Missing, invalid, or expired session |
| `403` | Role, store, ownership, or delegation rejected |
| `404` | Resource not found inside the authenticated scope |
| `409` | Current business state conflicts with the requested action |
| `422` | Request shape or domain value is invalid |

## Public endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Returns API health and service name. |
| `POST` | `/auth/login` | Validates email/password and returns a token plus the user profile. |

### Login

```http
POST /api/auth/login
```

```json
{
  "email": "luz@lucerna.demo",
  "password": "<configured-demo-password>"
}
```

## Session and catalog

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/auth/me` | Authenticated | Restores the current active user. |
| `GET` | `/catalog/registers` | Authenticated | Lists active registers scoped to the user's business/store and includes any active shift. |
| `GET` | `/catalog/products` | Authenticated | Lists products; non-admin roles receive active products only. |
| `GET` | `/catalog/categories` | Administrator | Lists product categories. |
| `POST` | `/catalog/products` | Administrator | Creates a product after category and SKU validation. |
| `PATCH` | `/catalog/products/:id` | Administrator | Replaces the editable product fields. |

Product create/update body:

```json
{
  "categoryId": "7a467764-8fd4-4e0d-b86f-a3b765571f41",
  "sku": "HOG-003",
  "name": "Difusor de cedro",
  "priceCents": 21900,
  "stockQuantity": 15,
  "active": true
}
```

The SKU is normalized to uppercase. Duplicate SKUs return
`SKU_ALREADY_EXISTS`.

## Register settings

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/settings/registers` | Administrator | Lists all registers, including inactive ones and store data. |
| `PATCH` | `/settings/registers/:id` | Administrator | Updates cash limit, close tolerance, supervisor delegations, and active state. |

```json
{
  "cashLimitCents": 500000,
  "closingToleranceCents": 100,
  "supervisorCanManageBundles": true,
  "supervisorCanApproveClosures": true,
  "active": true
}
```

The change produces a `register.controls_updated` audit event.

## Shifts and reconciliation

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/shifts/current` | Authenticated | Returns the active scoped shift and derives expected cash from its ledger. |
| `GET` | `/shifts/pending-review` | Administrator or delegated Supervisor | Lists pending close discrepancies inside the allowed scope. |
| `POST` | `/shifts/open` | Cashier or Supervisor | Opens an active register and records the opening cash entry. |
| `POST` | `/shifts/:id/close` | Shift Cashier or Supervisor | Persists the blind denomination count and closes or queues review. |
| `POST` | `/shifts/:id/approve-close` | Administrator or delegated Supervisor | Approves a pending discrepancy without changing the submitted count. |
| `GET` | `/reports/shifts/:id/reconciliation` | Authenticated and scoped | Returns shift summary, ledger, sales, bundles, and closing count. |

Open body:

```json
{
  "registerId": "a2665357-05c5-4552-a7a2-89d82b6f8c44",
  "openingFloatCents": 100000
}
```

Close body:

```json
{
  "lines": [
    { "denominationCents": 100000, "quantity": 1 },
    { "denominationCents": 50000, "quantity": 1 }
  ]
}
```

If `abs(counted - expected)` exceeds the register tolerance, the close returns
`202`, sets `requiresApproval: true`, and leaves the shift in
`PENDING_REVIEW`.

## Sales

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/sales` | Cashier or Supervisor with an authorized open shift | Completes a cash sale atomically. |

```json
{
  "shiftId": "891cb418-bcb6-44d3-91cb-b7587ee01d20",
  "items": [
    {
      "productId": "b5502593-e5aa-414c-916b-bce83f33bc2d",
      "quantity": 2
    }
  ],
  "cashReceivedCents": 50000
}
```

The server consolidates duplicate product lines, loads current product prices,
checks tender and stock, projects the drawer limit, decrements inventory,
increments the receipt sequence, and creates the sale, item snapshots, payment,
ledger entry, and audit event inside a serializable transaction.

Typical conflicts:

- `CASH_LIMIT_REACHED`
- `INSUFFICIENT_STOCK`
- `PRODUCT_NOT_AVAILABLE`
- `INSUFFICIENT_TENDER`

## Cash bundles

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/cash-bundles?shiftId=:id` | Administrator or delegated Supervisor | Lists bundles for the scoped shift. |
| `POST` | `/cash-bundles` | Administrator or delegated Supervisor | Creates a denomination-counted draft. |
| `PATCH` | `/cash-bundles/:id` | Administrator or delegated Supervisor | Replaces lines while the bundle is a draft. |
| `POST` | `/cash-bundles/:id/seal` | Administrator or delegated Supervisor | Seals the bundle and removes its amount from expected drawer cash. |

Create body:

```json
{
  "shiftId": "891cb418-bcb6-44d3-91cb-b7587ee01d20",
  "lines": [
    { "denominationCents": 50000, "quantity": 2 }
  ]
}
```

Sealing validates that the shift is open and the bundle does not exceed expected
drawer cash. Bundle status, negative ledger entry, and audit event commit
together. A sealed bundle returns `BUNDLE_IMMUTABLE` if edited.

## Remittances

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/remittances/destinations` | Authenticated | Lists valid destination stores. |
| `GET` | `/remittances` | Authenticated | Lists recent remittances scoped to the business/store. |
| `POST` | `/remittances/send` | Cashier or Supervisor | Receives principal plus fee and makes the remittance available. |
| `POST` | `/remittances/:reference/pay` | Cashier or Supervisor | Validates and pays an available remittance once at its destination. |

Send body:

```json
{
  "shiftId": "891cb418-bcb6-44d3-91cb-b7587ee01d20",
  "destinationStoreId": "3ce3c9f2-8e79-4129-b5be-7781796c0db2",
  "senderName": "Ana Remitente",
  "senderPhone": "+52 55 0101 2026",
  "beneficiaryName": "Beto Beneficiario",
  "beneficiaryDocumentCode": "4321",
  "amountCents": 40000
}
```

Payout body:

```json
{
  "shiftId": "4d216eab-4de4-466f-82ad-05ea8ee9c3d1",
  "beneficiaryDocumentCode": "4321"
}
```

The current fee rule is 3% of principal with a minimum of MXN 20.00. Principal
must be between MXN 100.00 and MXN 20,000.00. Sending writes positive physical
cash and negative origin funding; payout writes negative physical cash and
positive destination funding.

Payout uses a conditional status update. Once one request changes
`AVAILABLE → PAID`, a repeated or concurrent payout is rejected.

## Operational advances

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/advances/stores` | Authenticated | Lists business stores for authorization. |
| `GET` | `/advances` | Authenticated | Lists advances scoped to the business/store. |
| `POST` | `/advances` | Finance or Administrator | Authorizes an advance with no immediate cash impact. |
| `POST` | `/advances/:id/issue` | Cashier or Supervisor | Delivers authorized cash from an open shift. |
| `POST` | `/advances/:id/proof` | Finance or Administrator | Adds an expense proof without changing drawer cash. |
| `POST` | `/advances/:id/return` | Cashier or Supervisor | Receives unused cash into an open shift. |

Authorize body:

```json
{
  "storeId": "37d05c7f-07bb-4a66-82bb-e76477d67ea1",
  "recipientType": "EMPLOYEE",
  "recipientName": "Mariana López",
  "purpose": "Compra urgente de insumos",
  "amountCents": 60000,
  "dueDate": "2026-09-16"
}
```

Issue body:

```json
{
  "shiftId": "891cb418-bcb6-44d3-91cb-b7587ee01d20"
}
```

Proof body:

```json
{
  "amountCents": 45000,
  "description": "Factura de insumos F-448748"
}
```

Cash return body:

```json
{
  "shiftId": "891cb418-bcb6-44d3-91cb-b7587ee01d20",
  "amountCents": 15000,
  "description": "Efectivo no utilizado"
}
```

Proof plus returned cash cannot exceed the issued amount. Parent totals and the
new settlement row commit under an optimistic `version` check. Cash returns
also respect the register drawer limit.

## Finance overview

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/finance/overview` | Finance or Administrator | Consolidates physical cash, custody, funding, commissions, remittances, advances, pending closes, stores, and activity. |

The overview reads independent datasets in parallel and returns:

- active cash derived from open/pending shift ledgers;
- sealed or in-custody bundle cash;
- total controlled physical cash;
- payable/receivable funding position;
- commission and pending-remittance totals;
- authorized, outstanding, overdue, and settled advance metrics;
- pending close count;
- per-store exposure;
- the latest mixed activity with actor and role.

Funding is never added to the controlled physical-cash total.
