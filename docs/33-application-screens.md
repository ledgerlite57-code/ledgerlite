# 33 - Application Screens

This is the current list of screen routes in the web app, based on `apps/web/app/**/page.tsx`.

**Public (unauthenticated)**
- `/` (Landing)
- `/login`
- `/signup`
- `/invite`
- `/verify-email`

**Authenticated (protected)**
- `/home`
- `/dashboard`
- `/bank-accounts`
- `/bank-transactions/import`
- `/bills`
- `/bills/:id`
- `/credit-notes`
- `/credit-notes/:id`
- `/debit-notes`
- `/debit-notes/:id`
- `/expenses`
- `/expenses/:id`
- `/invoices`
- `/invoices/:id`
- `/journals`
- `/journals/:id`
- `/payments-received`
- `/payments-received/:id`
- `/pdc`
- `/pdc/:id`
- `/reconciliation`
- `/reconciliation/:id`
- `/vendor-payments`
- `/vendor-payments/:id`
- `/platform/orgs` (internal/admin)

**Reports**
- `/reports`
- `/reports/ap-aging`
- `/reports/ar-aging`
- `/reports/balance-sheet`
- `/reports/profit-loss`
- `/reports/trial-balance`
- `/reports/vat-summary`

**Settings**
- `/settings/organization`
- `/settings/opening-balances`
- `/settings/units-of-measurement`
- `/settings/audit-log`

**Dashboard tabs (within `/dashboard?tab=...`)**
- `overview`
- `accounts` (Chart of Accounts)
- `customers`
- `vendors`
- `items`
- `taxes`
- `users`