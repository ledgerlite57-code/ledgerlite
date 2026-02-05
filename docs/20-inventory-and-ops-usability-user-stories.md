# 20 - Inventory and Operations Usability User Stories

## Purpose

Capture product and UX stories for item setup, transaction entry usability, and organization settings simplification.

Implementation task breakdown:
- `docs/21-inventory-and-ops-usability-implementation-tasks.md`

---

## Epic 1: Item Setup and Inventory Defaults

### Goal

Reduce manual data entry errors in item creation and keep quantity/value behavior consistent across units of measure.

### User Story 1.1 - Auto-generate SKU when creating items

As a user creating an item,  
I want SKU to auto-generate when left blank,  
So that I can save items faster without manual code typing.

#### Acceptance Criteria

- When SKU is blank, system generates SKU automatically.
- Generated SKU is unique per organization.
- User can still manually override SKU before save.
- SKU format is consistent and sortable (example: `ITM-000123`).

### User Story 1.2 - Reorder point follows selected unit of measure

As an inventory user,  
I want reorder point to be entered in the unit I selected,  
So that thresholds match how I operate the item.

#### Acceptance Criteria

- Reorder point input label clearly shows active UOM.
- System stores normalized value in base unit internally.
- UI shows reorder point back in selected/display unit.
- Conversion rules follow the item UOM conversion map.

### User Story 1.3 - Opening quantity uses selected unit and opening value can auto-calculate

As a user creating opening stock,  
I want opening quantity to align with selected UOM and opening value to be calculated when possible,  
So that setup is faster and less error-prone.

#### Acceptance Criteria

- Opening quantity is captured in selected UOM.
- Quantity is normalized to base unit for storage.
- If quantity and unit cost are provided, opening value auto-calculates.
- If quantity and opening value are provided, unit cost auto-calculates.
- User can manually override computed value before save.

---

## Epic 2: Transaction Entry Usability

### Goal

Improve speed and clarity for everyday accounting entries, especially for non-accountant users.

### User Story 2.1 - Wider line-item search selector

As a billing user,  
I want a wider line-item search box,  
So that I can read long item names/SKUs without truncation.

#### Acceptance Criteria

- Line-item combobox width is increased on desktop.
- Mobile layout remains full-width and usable.
- Search result rows can show item name + SKU cleanly.

### User Story 2.2 - Expense paid-from account options are practical

As a user recording expenses,  
I want the paid-from dropdown to include all valid payment accounts,  
So that I can post from bank, cash, or other allowed payment accounts.

#### Acceptance Criteria

- Paid-from includes allowed payment account types (not only operating bank).
- Default selection can remain operating bank if present.
- Inactive/blocked accounts are excluded.

### User Story 2.3 - Journal entry mode for non-accountants

As a common business user,  
I want journal entry labels that are easier than debit/credit jargon,  
So that I can enter basic adjustments confidently.

#### Acceptance Criteria

- Journal UI has a user-friendly mode with plain-language labels.
- Debit/Credit terminology remains available in advanced/accountant mode.
- Helper hints explain effect based on selected account type.
- Validation still enforces balanced entries.

---

## Epic 3: Organization Settings with Progressive Completion

### Goal

Make organization setup lightweight so users can start quickly and complete full details later.

### User Story 3.1 - Only critical organization fields are mandatory

As a new organization admin,  
I want only the most important fields required upfront,  
So that I can complete setup quickly and continue using the app.

#### Acceptance Criteria

- Mandatory fields are limited to critical setup data.
- Non-critical fields become optional.
- Validation messages clearly distinguish required vs optional.

### User Story 3.2 - Allow save-and-complete-later flow

As an organization admin,  
I want to save settings with partial data,  
So that I can return later to finish complete profile details.

#### Acceptance Criteria

- Partial saves are allowed.
- Completion indicator shows setup completeness state.
- Missing optional fields do not block core app usage.

---

## Non-Functional Requirements

- Mobile/desktop responsive behavior must remain intact.
- UOM conversion logic must be deterministic and test-covered.
- Auto-generated SKU must be collision-safe under concurrent creates.
- Usability improvements must not weaken accounting integrity checks.

