# Accounting Invariants

## GL invariants
- sum(debit) = sum(credit)
- debit XOR credit per line
- no negative debit/credit
- one GLHeader per sourceType + sourceId
- posted GL is immutable (no update/delete)

## Document invariants
- Status transitions: DRAFT -> POSTED -> VOID only
- POSTED/VOID not editable
- Payment allocation rules:
  - sum(allocations) == payment total
  - allocations <= outstanding
- lockDate blocks update/post/void

## Currency invariant
- Until multi-currency is implemented, block posting when currency != org.baseCurrency
