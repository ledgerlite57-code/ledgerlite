# PR Checklist

- [ ] UI: consistent page header, StatusChip shown near title, formatting uses shared helpers
- [ ] Forms: inline validation present, Post disabled when invalid (especially journals)
- [ ] Reports: balance sheet equation holds and equity is always displayed (including derived net profit)
- [ ] Security: no secrets committed, cookies/config unchanged in prod, default owners gated
- [ ] Performance: no N+1 queries, list pages remain paginated
- [ ] Accessibility: labels and keyboard navigation for filters, color contrast checked
- [ ] i18n readiness (if planned): avoid hard-coded strings where it blocks future localization
- [ ] Tests: required API + UI tests executed and passing
