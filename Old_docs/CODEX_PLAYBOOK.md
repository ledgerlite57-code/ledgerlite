# LedgerLite – Codex Playbook (v1.0)

This playbook teaches **how to use Codex safely and effectively** on LedgerLite without context drift,
hallucinations, or accounting mistakes.

> **Version:** v1.0  
> **Status:** FROZEN  
> **Audience:** Engineering, Product, QA

---

## 1. What Codex Is (and Is Not)

### Codex IS good at
- Implementing clearly specified behavior
- Translating specs into code
- Following rules when explicitly stated
- Writing repetitive boilerplate safely

### Codex IS NOT good at
- Inferring accounting rules
- Remembering long multi-domain context
- Making architectural decisions mid-stream
- Detecting financial correctness on its own

**Rule:** Codex executes. Humans decide.

---

## 2. The Golden Execution Loop

Every feature must follow this loop:

1. **Plan** – Codex explains what it will build
2. **Build** – Codex writes code
3. **Verify** – Codex lists tests + manual checks
4. **Human Review** – You validate logic
5. **Run Tests**
6. **Fix & Repeat**

Never skip Step 1 or Step 4.

---

## 3. Mandatory Prompt Structure

Every prompt must include:

- Explicit user story ID
- Explicit documents to follow
- Explicit definitions of ambiguous terms
- Explicit output order

### Minimum Safe Prompt Skeleton

```text
Implement <US-ID>.

Follow these documents as source of truth:
- DB_SCHEMA.md
- ARCHITECTURE.md
- DESIGN_SYSTEM.md
- USER_STORIES.md
- MAPPING.md
- TESTING_CHECKLIST.md

Definitions:
- Post = create GL header + lines and mark document POSTED
- Ledger = gl_headers + gl_lines only

Rules:
- Posted data is immutable
- Totals computed server-side
- Idempotency required

Output:
1) Plan
2) Code
3) Tests
4) Manual verification
```

---

## 4. High-Risk Areas (Extra Guardrails Required)

These areas MUST have extra instructions:

### Posting Logic
- Require transaction boundaries
- Require row locks
- Require idempotency
- Require audit logs
- Require unique posting constraint

### Allocations
- Lock target rows FOR UPDATE
- Validate outstanding before allocation
- Re-check after lock

### Reports
- Read-only from ledger
- No derived totals from documents

---

## 5. Vocabulary Control (Critical)

Never assume Codex understands your terminology.

### Always define:
- Post
- Draft vs Posted
- Transaction (DB vs business)
- Document
- Ledger

Bad terminology causes 80% of Codex errors.

---

## 6. Anti-Patterns (DO NOT DO THESE)

❌ “Implement invoices module”  
❌ “Make posting logic”  
❌ “Add reports”  
❌ “Fix accounting issues”  

These cause:
- Missing ledger lines
- No idempotency
- Silent data corruption

---

## 7. Good vs Bad Prompt Example

### ❌ Bad Prompt

> Implement invoice posting.

Why this fails:
- No scope
- No ledger rules
- No DB constraints
- No tests

---

### ✅ Good Prompt

```text
Implement US-SALES-01b (Post Invoice).

Follow:
- DB_SCHEMA.md
- ARCHITECTURE.md
- MAPPING.md
- TESTING_CHECKLIST.md

Requirements:
- Transactional posting
- UNIQUE(orgId, sourceType, sourceId)
- Idempotency-Key support
- Row lock invoice FOR UPDATE
- Balanced GL lines

Output:
Plan → Code → Tests → Manual verification
```

---

## 8. Simulated Bad Codex Response (and Fix)

### ❌ Codex Mistake

- Updates gl_lines on repost
- Calculates totals in frontend
- No idempotency
- No audit logs

### ✅ How You Fix It

Prompt correction:

```text
STOP.
You violated these rules:
- gl_lines are immutable
- Totals must be server-side
- Posting must be idempotent
- Audit logs required

Re-implement using DB_SCHEMA.md and MAPPING.md.
Output PLAN ONLY.
```

Codex will recover correctly.

---

## 9. Session Management Rules

- New domain = new session
- Backend vs frontend = separate sessions
- Reports = separate session from posting logic
- Reset session after large refactor

This prevents context bleeding.

---

## 10. Regression Discipline

Before merging any feature:

- Run TESTING_CHECKLIST.md for that phase
- Verify Trial Balance balances
- Verify audit logs exist
- Verify RBAC blocks invalid access

Never trust “looks correct”.

---

## 11. Codex Role Switching (Advanced)

When reviewing code:

```text
You are now acting as a senior accountant and backend reviewer.
Review the following code for accounting correctness.
Do NOT generate new code unless necessary.
```

This reduces hallucinated fixes.

---

## 12. Golden Rule (Print This)

> If Codex surprises you, your prompt was ambiguous.

Codex errors are **prompt design failures**, not intelligence failures.

---

## 13. Final Recommendation

LedgerLite is a **high-risk financial system**.
Your documentation + this playbook gives you:

- Deterministic generation
- Safe accounting logic
- Minimal rework
- Scalable development

Use Codex as an **implementation engine**, not a decision-maker.

---

This playbook is **authoritative** for LedgerLite v1.0 Codex usage.
