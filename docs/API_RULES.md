# API Rules

## Every write endpoint must
- Run in prisma.$transaction
- Validate lockDate
- Use idempotency for post/void endpoints
- Write AuditLog
- Return normalized { ok, data|error, requestId }

## Forbidden patterns
- Float math for money
- Mutating posted data
- Direct prisma writes outside the service layer for critical entities
