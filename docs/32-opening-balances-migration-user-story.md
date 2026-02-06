# 32 - Opening Balances Migration User Story

## UX-P1-OB-01 - Opening balances migration wizard
**As a** user migrating from another accounting system,
**I want** a guided opening-balance workflow,
**So that** I can start in LedgerLite with accurate balances.

**Acceptance Criteria**
- A dedicated Opening Balances flow exists under Settings.
- User selects an Opening Balance Date (cut-over date).
- User can enter opening balances for Chart of Accounts (non-AR/AP accounts).
- User can enter opening balances for Bank/Cash accounts.
- User can enter opening inventory (qty + unit cost).
- System creates a single Opening Balance Journal and posts it.
- If debits do not equal credits, system posts the difference to an Opening Balance Adjustment account.
- Trial Balance matches the old system as of the cut-over date.

**Tasks (in order)**
1. **Backend**: Add an Opening Balance service that builds a balanced journal.
2. **Backend**: Add an endpoint to preview the journal before posting.
3. **Frontend**: Add a wizard UI (date -> accounts -> inventory -> review -> post).
4. **Reports**: Confirm TB/B/S reflect opening balances on/after cut-over date.
5. **Tests**: Add e2e test for balanced opening journal creation.

**Backend impact**: New endpoints + posting logic.

**Notes**
- AR/AP balances should be migrated via opening invoices/bills to preserve aging (separate user story).
