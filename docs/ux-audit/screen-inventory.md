# LedgerLite Screen Inventory

Detected user-facing Next.js pages grouped by module.

## public
| Route | Screen File | Audit File |
|-------|-------------|------------|
| `/` | `apps/web/app/page.tsx` | `docs/ux-audit/public/landing-comparison.md` |
| `/invite` | `apps/web/app/invite/page.tsx` | `docs/ux-audit/public/invite-comparison.md` |
| `/login` | `apps/web/app/login/page.tsx` | `docs/ux-audit/public/login-comparison.md` |
| `/signup` | `apps/web/app/signup/page.tsx` | `docs/ux-audit/public/signup-comparison.md` |
| `/verify-email` | `apps/web/app/verify-email/page.tsx` | `docs/ux-audit/public/verify-email-comparison.md` |

## dashboard
| Route | Screen File | Audit File |
|-------|-------------|------------|
| `/dashboard` | `apps/web/app/(protected)/dashboard/page.tsx` | `docs/ux-audit/dashboard/dashboard-comparison.md` |
| `/home` | `apps/web/app/(protected)/home/page.tsx` | `docs/ux-audit/dashboard/home-comparison.md` |

## sales
| Route | Screen File | Audit File |
|-------|-------------|------------|
| `/credit-notes` | `apps/web/app/(protected)/credit-notes/page.tsx` | `docs/ux-audit/sales/credit-notes-comparison.md` |
| `/credit-notes/{id}` | `apps/web/app/(protected)/credit-notes/[id]/page.tsx` | `docs/ux-audit/sales/credit-notes-detail-comparison.md` |
| `/invoices` | `apps/web/app/(protected)/invoices/page.tsx` | `docs/ux-audit/sales/invoices-comparison.md` |
| `/invoices/{id}` | `apps/web/app/(protected)/invoices/[id]/page.tsx` | `docs/ux-audit/sales/invoices-detail-comparison.md` |
| `/payments-received` | `apps/web/app/(protected)/payments-received/page.tsx` | `docs/ux-audit/sales/payments-received-comparison.md` |
| `/payments-received/{id}` | `apps/web/app/(protected)/payments-received/[id]/page.tsx` | `docs/ux-audit/sales/payments-received-detail-comparison.md` |

## purchases
| Route | Screen File | Audit File |
|-------|-------------|------------|
| `/bills` | `apps/web/app/(protected)/bills/page.tsx` | `docs/ux-audit/purchases/bills-comparison.md` |
| `/bills/{id}` | `apps/web/app/(protected)/bills/[id]/page.tsx` | `docs/ux-audit/purchases/bills-detail-comparison.md` |
| `/debit-notes` | `apps/web/app/(protected)/debit-notes/page.tsx` | `docs/ux-audit/purchases/debit-notes-comparison.md` |
| `/debit-notes/{id}` | `apps/web/app/(protected)/debit-notes/[id]/page.tsx` | `docs/ux-audit/purchases/debit-notes-detail-comparison.md` |
| `/purchaseorder` | `apps/web/app/(protected)/purchaseorder/page.tsx` | `docs/ux-audit/purchases/purchaseorder-comparison.md` |
| `/purchaseorder/{id}` | `apps/web/app/(protected)/purchaseorder/[id]/page.tsx` | `docs/ux-audit/purchases/purchaseorder-detail-comparison.md` |
| `/purchaseorder/new` | `apps/web/app/(protected)/purchaseorder/new/page.tsx` | `docs/ux-audit/purchases/purchaseorder-new-comparison.md` |
| `/purchase-orders` | `apps/web/app/(protected)/purchase-orders/page.tsx` | `docs/ux-audit/purchases/purchase-orders-comparison.md` |
| `/purchase-orders/{id}` | `apps/web/app/(protected)/purchase-orders/[id]/page.tsx` | `docs/ux-audit/purchases/purchase-orders-detail-comparison.md` |
| `/vendor-payments` | `apps/web/app/(protected)/vendor-payments/page.tsx` | `docs/ux-audit/purchases/vendor-payments-comparison.md` |
| `/vendor-payments/{id}` | `apps/web/app/(protected)/vendor-payments/[id]/page.tsx` | `docs/ux-audit/purchases/vendor-payments-detail-comparison.md` |

## banking
| Route | Screen File | Audit File |
|-------|-------------|------------|
| `/bank-accounts` | `apps/web/app/(protected)/bank-accounts/page.tsx` | `docs/ux-audit/banking/bank-accounts-comparison.md` |
| `/bank-transactions/import` | `apps/web/app/(protected)/bank-transactions/import/page.tsx` | `docs/ux-audit/banking/bank-transactions-import-comparison.md` |
| `/pdc` | `apps/web/app/(protected)/pdc/page.tsx` | `docs/ux-audit/banking/pdc-comparison.md` |
| `/pdc/{id}` | `apps/web/app/(protected)/pdc/[id]/page.tsx` | `docs/ux-audit/banking/pdc-detail-comparison.md` |
| `/reconciliation` | `apps/web/app/(protected)/reconciliation/page.tsx` | `docs/ux-audit/banking/reconciliation-comparison.md` |
| `/reconciliation/{id}` | `apps/web/app/(protected)/reconciliation/[id]/page.tsx` | `docs/ux-audit/banking/reconciliation-detail-comparison.md` |

## accounting
| Route | Screen File | Audit File |
|-------|-------------|------------|
| `/journals` | `apps/web/app/(protected)/journals/page.tsx` | `docs/ux-audit/accounting/journals-comparison.md` |
| `/journals/{id}` | `apps/web/app/(protected)/journals/[id]/page.tsx` | `docs/ux-audit/accounting/journals-detail-comparison.md` |

## reports
| Route | Screen File | Audit File |
|-------|-------------|------------|
| `/reports` | `apps/web/app/(protected)/reports/page.tsx` | `docs/ux-audit/reports/reports-comparison.md` |
| `/reports/ap-aging` | `apps/web/app/(protected)/reports/ap-aging/page.tsx` | `docs/ux-audit/reports/reports-ap-aging-comparison.md` |
| `/reports/ar-aging` | `apps/web/app/(protected)/reports/ar-aging/page.tsx` | `docs/ux-audit/reports/reports-ar-aging-comparison.md` |
| `/reports/balance-sheet` | `apps/web/app/(protected)/reports/balance-sheet/page.tsx` | `docs/ux-audit/reports/reports-balance-sheet-comparison.md` |
| `/reports/profit-loss` | `apps/web/app/(protected)/reports/profit-loss/page.tsx` | `docs/ux-audit/reports/reports-profit-loss-comparison.md` |
| `/reports/trial-balance` | `apps/web/app/(protected)/reports/trial-balance/page.tsx` | `docs/ux-audit/reports/reports-trial-balance-comparison.md` |
| `/reports/vat-summary` | `apps/web/app/(protected)/reports/vat-summary/page.tsx` | `docs/ux-audit/reports/reports-vat-summary-comparison.md` |

## settings
| Route | Screen File | Audit File |
|-------|-------------|------------|
| `/settings/audit-log` | `apps/web/app/(protected)/settings/audit-log/page.tsx` | `docs/ux-audit/settings/settings-audit-log-comparison.md` |
| `/settings/opening-balances` | `apps/web/app/(protected)/settings/opening-balances/page.tsx` | `docs/ux-audit/settings/settings-opening-balances-comparison.md` |
| `/settings/organization` | `apps/web/app/(protected)/settings/organization/page.tsx` | `docs/ux-audit/settings/settings-organization-comparison.md` |
| `/settings/units-of-measurement` | `apps/web/app/(protected)/settings/units-of-measurement/page.tsx` | `docs/ux-audit/settings/settings-units-of-measurement-comparison.md` |

## platform
| Route | Screen File | Audit File |
|-------|-------------|------------|
| `/platform/orgs` | `apps/web/app/(protected)/platform/orgs/page.tsx` | `docs/ux-audit/platform/platform-orgs-comparison.md` |

## misc
| Route | Screen File | Audit File |
|-------|-------------|------------|
| `/expenses` | `apps/web/app/(protected)/expenses/page.tsx` | `docs/ux-audit/misc/expenses-comparison.md` |
| `/expenses/{id}` | `apps/web/app/(protected)/expenses/[id]/page.tsx` | `docs/ux-audit/misc/expenses-detail-comparison.md` |

