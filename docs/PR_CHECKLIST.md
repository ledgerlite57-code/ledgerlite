# PR Checklist

## UI/UX
- [ ] Page header uses title + StatusChip + primary CTA + secondary actions.
- [ ] Inline validation hints appear where users enter amounts.
- [ ] Empty states, skeletons, and table spacing are consistent with existing patterns.
- [ ] Currency code is shown alongside amounts.

## Accessibility
- [ ] Form inputs have labels and Select triggers have aria-labels.
- [ ] Focus states are visible on interactive controls.

## Error handling
- [ ] API errors surface message + hint via ErrorBanner or toast.
- [ ] Destructive actions show confirmation dialog.

## Tests
- [ ] Unit tests updated or added for new helpers.
- [ ] Playwright coverage updated for critical UX flows.
- [ ] API e2e tests cover new invariants or endpoints.

## Performance
- [ ] Avoid extra round trips in list pages.
- [ ] Derived totals use integer math to prevent float drift.

## Security & data integrity
- [ ] Posted data remains immutable.
- [ ] Idempotency enforced for post/void endpoints.
