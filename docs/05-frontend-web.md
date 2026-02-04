# 05 - Frontend Web

## Framework and routing strategy

- Framework: Next.js App Router (`apps/web/app`)
- Root layout: `apps/web/app/layout.tsx`
  - loads global styles
  - configures fonts
  - renders toaster and build stamp
- Route groups:
  - Public: `/`, `/login`, `/signup`, `/invite`
  - Protected: `/(protected)/*` with shared authenticated layout

## Layouts, pages, and navigation

## Protected layout

`apps/web/app/(protected)/layout.tsx`:

- wraps pages in `PermissionsProvider`
- redirects to `/login` when unauthenticated
- loads sidebar draft counts from `/orgs/sidebar-counts`
- renders permission-based grouped nav (Overview, Sales, Purchases, Banking, Accounting, Reports, Settings)
- logout calls `/auth/logout` then clears local access token

## Route map

### Main protected pages

- `/home`
- `/dashboard` (org setup + admin tabs)
- `/invoices`, `/payments-received`, `/bills`, `/expenses`, `/vendor-payments`, `/pdc`, `/journals`
- `/bank-accounts`, `/bank-transactions/import`, `/reconciliation`
- `/reports`, `/reports/trial-balance`, `/reports/profit-loss`, `/reports/balance-sheet`, `/reports/ar-aging`, `/reports/ap-aging`, `/reports/vat-summary`
- `/settings/organization`, `/settings/units-of-measurement`, `/settings/audit-log`

### Detail/edit routes

- `/invoices/[id]`, `/payments-received/[id]`, `/bills/[id]`, `/expenses/[id]`, `/vendor-payments/[id]`, `/pdc/[id]`, `/journals/[id]`, `/reconciliation/[id]`

## Forms, tables, and UI patterns

- Form engine: `react-hook-form`
- Validation: shared Zod schemas via custom resolver (`src/lib/zod-resolver.ts`)
- Primary list pages use:
  - `FilterRow` for query/date/status/amount filters
  - `SavedViewsMenu` for per-user saved filters
  - table UI components (`ui-table`)
  - status chips (`ui-status-chip`)
- Document detail pages use editable line-item grid helpers (`ui-line-items-grid`)
- Quick-create item dialog used within transactional pages (`ui-item-quick-create`)
- Sidebar and page action visibility are permission-driven
- Dashboard overview includes onboarding checklist shell (progress summary + step status actions)
- Dashboard users tab includes invite lifecycle table (pending/accepted/expired/revoked + resend/revoke actions)

## State management and data fetching

- No global state library (Redux/Zustand) detected.
- Main state patterns:
  - local `useState`/`useMemo`/`useEffect`
  - context for auth+permissions (`use-permissions.tsx`)
  - feature-local hooks (for example `use-dashboard-state.tsx`)
- `use-dashboard-state.tsx` now also orchestrates onboarding lifecycle calls:
  - `GET /orgs/onboarding`
  - `PATCH /orgs/onboarding/steps/:stepId`
  - `POST /orgs/onboarding/complete`
- API client (`src/lib/api.ts`):
  - central `apiFetch`
  - automatically attaches bearer for protected routes
  - retries once after refresh on 401
  - parses standardized API envelopes

## Auth handling on frontend

- Access token stored in `sessionStorage` (`ledgerlite.accessToken`)
- Refresh token and CSRF token use cookies managed by backend (`/auth` path)
- `ensureAccessToken()` tries existing token first, then `/auth/refresh`
- `PermissionsProvider` calls `/auth/me` to hydrate user/org/permission context
- Login/signup store returned access token and redirect to `/home`

## Styling and component stack

- Tailwind CSS + custom CSS variables in `app/globals.css`
- Radix primitives wrapped in local UI components (`ui-dialog`, `ui-sheet`, `ui-select`, etc.)
- Utility libs: `clsx`, `class-variance-authority`, `tailwind-merge`
- UI mode toggle (`simple` vs `accountant`) persisted in localStorage (`use-ui-mode.ts`)

## Reporting UI behavior

- Dedicated report pages each run form-validated query requests (`/reports/*` endpoints)
- Trial balance page also drills into ledger lines (`/reports/ledger-lines`)
- Reports are gated by `REPORTS_VIEW` permission
