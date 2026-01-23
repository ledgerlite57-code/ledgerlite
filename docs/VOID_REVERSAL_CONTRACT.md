# Void & Reversal Contract

## Void semantics
- Create a reversal GL header that swaps debit/credit for every original line.
- Link the reversal to the original header (reversedByHeaderId) and preserve the original header.
- Update the source document status to VOID and set voidedAt.
- Never delete GL headers/lines or source documents.

## Idempotency expectations
- Void endpoints are idempotent per source document.
- Repeated calls return the same reversal header and VOID status.
- Use idempotency keys to guarantee repeatable responses.

## LockDate policy for void
- Void is blocked when the posting date is on or before lockDate.
- Reversal posting date must be after lockDate.
