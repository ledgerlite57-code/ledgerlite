# UI Design Guide v1

## Page Header standard
- Title + StatusChip + primary CTA + secondary actions menu.
- Subtext shows customer/vendor, currency, last saved, and document number where available.

## StatusChip rules
- Always display Draft/Posted/Void with tooltip for editability rules.
- Use consistent colors across list + detail pages.

## Form layout
- Basic section first, advanced section collapsible.
- Inline validation hints under fields, not only in toasts.
- Show currency code alongside totals.

## Advanced section pattern
- Collapsible panel labeled "Advanced".
- Place account overrides, currency/exchange rate, references, and tax overrides here.

## Combobox pattern
- Use searchable dropdowns for large datasets (customers, vendors, items, accounts).
- Provide quick-create when user cannot find an item.

## Empty states + skeletons
- Empty state must answer: what this is, why it is empty, and next action.
- Use consistent skeleton rows for table loads.

## Buttons + dialogs
- Primary CTA on the right of the header.
- Destructive actions require confirmation dialog with clear impact text.

## Simple vs Accountant mode
- Simple (default): hide advanced fields, use business-friendly labels.
- Accountant: expand advanced section by default and show technical labels.
