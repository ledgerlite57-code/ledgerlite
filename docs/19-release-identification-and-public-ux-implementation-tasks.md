# 19 - Release Identification & Public UX Implementation Tasks

## Purpose

Convert `docs/18-release-identification-and-public-ux-user-stories.md` into implementation-ready tasks with IDs, effort, and priority.

## Board status definitions

- `Backlog`: defined but not implementation-ready
- `Ready`: acceptance + dependencies clear
- `In Progress`: actively being implemented
- `Review`: PR opened / waiting review
- `Done`: merged and validated
- `Blocked`: waiting dependency

---

## Story-to-task breakdown

## US-RUX-001 - Footer version visibility (Story 1.1)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `RUX-V001-T01` | Define canonical version source (`NEXT_PUBLIC_APP_VERSION` with git-sha fallback) | Fullstack | 0.5d | P0 | None | `apps/web/src/lib/ui-build-stamp.tsx`, deploy docs | Backlog |
| `RUX-V001-T02` | Add footer version block on authenticated shell | Frontend | 0.75d | P0 | T01 | app shell/layout + dashboard footer components | Backlog |
| `RUX-V001-T03` | Ensure footer is visible across dashboard and all authenticated pages | Frontend | 0.5d | P0 | T02 | `apps/web/app/(protected)/*` layout wrappers | Backlog |
| `RUX-V001-T04` | Add regression checks for version render and non-editability | QA/Frontend | 0.5d | P1 | T03 | web tests/e2e | Backlog |

## US-RUX-002 - Environment indicator in footer (Story 1.2)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `RUX-E002-T01` | Define env label mapping and color tokens (`DEV` blue, `STAGE` orange, `PROD` green) | Frontend | 0.5d | P0 | None | shared badge/style utilities | Backlog |
| `RUX-E002-T02` | Render environment badge next to version in footer | Frontend | 0.5d | P0 | T01 | footer component(s) | Backlog |
| `RUX-E002-T03` | Source environment from config/runtime (no manual UI editing) | Fullstack | 0.5d | P0 | T02 | web env config + deploy docs | Backlog |
| `RUX-E002-T04` | Add tests for env label and color mapping | QA/Frontend | 0.5d | P1 | T03 | unit/e2e tests | Backlog |

## US-RUX-003 - Non-production safety awareness (Story 1.3, optional)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `RUX-S003-T01` | Add `NON_PROD_SAFETY_BANNER_ENABLED` env flag | Fullstack | 0.25d | P1 | None | env examples + web env parser | Backlog |
| `RUX-S003-T02` | Implement subtle DEV/STAGE safety badge/banner in protected shell | Frontend | 0.75d | P1 | T01 | protected layout/components | Backlog |
| `RUX-S003-T03` | Keep PROD clean with no extra warning chrome | Frontend | 0.25d | P1 | T02 | conditional UI logic | Backlog |

## US-RUX-004 - Landing page clarity and structure (Story 2.1)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `RUX-L004-T01` | Finalize plain-language landing page copy (hero, value, audience, CTA) | Product/Frontend | 0.5d | P0 | None | `apps/web/app/page.tsx` | Backlog |
| `RUX-L004-T02` | Build responsive sections: hero, benefits, audience, CTA | Frontend | 1.25d | P0 | T01 | `apps/web/app/page.tsx`, `apps/web/app/globals.css` | Backlog |
| `RUX-L004-T03` | Wire CTA buttons to signup/login paths | Frontend | 0.25d | P0 | T02 | `apps/web/app/page.tsx` | Backlog |
| `RUX-L004-T04` | Add metadata/SEO basics (title/description/open graph) | Frontend | 0.5d | P1 | T02 | app metadata config | Backlog |

## US-RUX-005 - Feature explanations in simple language (Story 2.2)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `RUX-F005-T01` | Create feature card grid (icon, title, one-line explanation) | Frontend | 0.75d | P0 | L004-T02 | landing page components | Backlog |
| `RUX-F005-T02` | Curate feature copy in non-technical language | Product/Frontend | 0.5d | P0 | T01 | landing copy constants/content | Backlog |
| `RUX-F005-T03` | Structure content for future localization | Frontend | 0.5d | P1 | T02 | text constants/resources | Backlog |

## US-RUX-006 - Trust-oriented visual quality (Story 2.3)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `RUX-D006-T01` | Apply consistent visual tokens (palette, type scale, spacing) for public pages | Frontend | 0.75d | P0 | L004-T02 | `apps/web/app/globals.css` | Backlog |
| `RUX-D006-T02` | Mobile/tablet polish and readable spacing pass | Frontend | 0.5d | P0 | T01 | responsive css/layout | Backlog |
| `RUX-D006-T03` | Accessibility pass (contrast/focus order) | QA/Frontend | 0.75d | P1 | T02 | accessibility test checks | Backlog |

## US-RUX-007 - Signup page usability improvements (Story 3.1)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `RUX-SU007-T01` | Keep signup form minimal (required fields only) | Frontend | 0.5d | P0 | None | `apps/web/app/signup/page.tsx` | Backlog |
| `RUX-SU007-T02` | Improve validation copy and inline field hints | Frontend | 0.5d | P0 | T01 | signup form components/state | Backlog |
| `RUX-SU007-T03` | Align signup visual design with landing page style system | Frontend | 0.75d | P0 | L004-T02,D006-T01 | signup + global styles | Backlog |
| `RUX-SU007-T04` | Add signup happy-path + validation regression tests | QA/Frontend | 0.75d | P1 | T02,T03 | web e2e tests | Backlog |

## US-RUX-008 - Signup helper text and trust signals (Story 3.2)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `RUX-SU008-T01` | Add helper text ("add company details later", "no credit card required") | Frontend | 0.25d | P0 | SU007-T01 | signup UI copy | Backlog |
| `RUX-SU008-T02` | Add privacy/security note near submit CTA | Frontend | 0.25d | P1 | T01 | signup footer area | Backlog |
| `RUX-SU008-T03` | Add post-signup expectation text (next steps) | Frontend | 0.25d | P1 | T01 | signup success flow/copy | Backlog |

## US-RUX-009 - Signup CTA clarity (Story 3.3)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `RUX-SU009-T01` | Set primary CTA label to "Create Free Account" | Frontend | 0.25d | P0 | SU007-T01 | signup form button | Backlog |
| `RUX-SU009-T02` | Add secondary nav "Already have an account? Sign in" | Frontend | 0.25d | P0 | SU007-T01 | signup page links | Backlog |
| `RUX-SU009-T03` | Ensure CTA prominence and keyboard/tab flow usability | QA/Frontend | 0.5d | P1 | T01,T02 | style + e2e checks | Backlog |

---

## Cross-story implementation tasks

| Task ID | Task | Lane | Est. | Priority | Depends On | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| `RUX-X-T01` | Add/update docs for version/env display behavior and env vars | Fullstack | 0.5d | P0 | V001,E002 | Backlog |
| `RUX-X-T02` | Add smoke checks for footer metadata and public/signup route render | QA | 0.75d | P1 | L004,SU007 | Backlog |
| `RUX-X-T03` | Add release note template entry for version/environment display changes | Product/Engineering | 0.25d | P2 | X-T01 | Backlog |

## Suggested delivery order

1. `US-RUX-001`, `US-RUX-002` (version + environment visibility)
2. `US-RUX-004`, `US-RUX-005`, `US-RUX-006` (landing page)
3. `US-RUX-007`, `US-RUX-008`, `US-RUX-009` (signup conversion polish)
4. `US-RUX-003` optional non-prod safety banner

## Estimated effort summary

- P0 core scope: ~8.5 engineer-days
- P1 polish/quality scope: ~6.0 engineer-days
- P2 docs process add-on: ~0.25 engineer-days
- Total backlog estimate: ~14.75 engineer-days

