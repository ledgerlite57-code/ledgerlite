# Web Rules

- Always show the currency code with money values.
- Avoid float math for money; use cents helpers (toCents/sumCents) for live totals.
- Keep derived totals in cents to prevent drift.
