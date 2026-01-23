# Test Checklist

## Core posting flows
- [ ] Invoice create/update/post
- [ ] Bill create/update/post
- [ ] Payment received create/update/post
- [ ] Vendor payment create/update/post
- [ ] Journal create/update/post

## Report correctness
- [ ] Balance sheet equation holds
- [ ] Profit & loss totals align with GL

## Lock date enforcement
- [ ] Updates blocked when doc date <= lockDate
- [ ] Posting blocked when doc date <= lockDate

## Void/reversal
- [ ] Void creates reversal header
- [ ] Idempotent void calls return same result

## Dashboard
- [ ] KPI cards render and refresh
- [ ] Draft counts match list totals

## Invite flow
- [ ] Invite create + accept works

## Items + quick create
- [ ] Item combobox search works
- [ ] Quick create item appears and can be selected

## Saved views
- [ ] Save, apply, and delete views per user/org

## Installer smoke checks (final)
- [ ] Install
- [ ] Open http://localhost:<port>
- [ ] Create org
- [ ] Create + post invoice
- [ ] Verify reports endpoints
