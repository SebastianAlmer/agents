---
id: REQ-NEW-WEB-ORG-PLANNING-CALENDAR-WEEK-MOBILE-USABILITY
title: Improve mobile usability for organization week calendar planning view
status: released
implementation_scope: frontend
review_risk: low
review_scope: qa_only
source: user-2026-02-12-org-planning-calendar-week-mobile
---

# Goal
Make the organization planning calendar week view reliably usable on mobile without affecting planning scope, routing, or API behavior.

# Scope
- Frontend behavior in active track `web/`.
- Organization planning route: `/{locale}/app/organizations/shifts?view=calendar` and week mode behavior.
- Mobile viewport usability for calendar interaction and event access.

# Task Outline
- Optimize responsive layout and spacing so the week calendar remains readable at mobile baseline sizes.
- Keep primary planning controls and event actions reachable without hover.
- Keep vertical day timeline navigation smooth and deterministic across mobile interaction.
- Keep week navigation behavior deterministic under mobile gestures and route query changes.
- Preserve existing locale routing, role guards, and adapter contract boundaries.

# Acceptance Criteria
- [ ] Week calendar is usable on mobile baseline viewports without horizontal breakage.
- [ ] Event cards are readable and tappable with no clipping or overlap.
- [ ] Time grid and week navigation remain deterministic during mobile interaction.
- [ ] Mobile actions (open details and core planning controls) require no hover-only interaction.
- [ ] Locale-prefixed route behavior and existing auth guards remain unchanged.

# Out of Scope
- Backend/API/model changes.
- New planning semantics or status rules.
- Changes outside `web/` and org planning workspace.

# Constraints
- Keep planning behavior aligned with `docs/web-shifts-planning-flow.md` (`view=list|calendar`).
- Keep responsive and interaction baseline aligned with `docs/mobile-web-baseline.md`, `docs/web-design-system.md`, and `docs/modern-ui.md`.
- Meet flow acceptance expectations from `docs/web-quality-test-program.md` and `docs/web-governance.md`.

# References
- `docs/web-shifts-planning-flow.md`
- `docs/mobile-web-baseline.md`
- `docs/web-design-system.md`
- `docs/modern-ui.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` remains `frontend` in split mode.
- Decision: `review_risk` set to `low` and `review_scope` to `qa_only` for contained UX quality work.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ORG-PLANNING-CALENDAR-WEEK-MOBILE-USABILITY.md`, `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-PLANNING-CALENDAR-WEEK-MOBILE-USABILITY.md`

# Architecture Notes
- Preserve the canonical planning surface contract: `/{locale}/app/organizations/shifts` with `view=list|calendar`.
- Restrict calendar-week mobile fixes to responsive behavior and interaction parity; keep route query semantics (`view`, `scope`, `create`) unchanged.
- Enforce no horizontal overflow and stack/flow adjustments only as required by `docs/mobile-web-baseline.md` and `docs/modern-ui.md`.
- Keep primary planning actions and critical interaction paths touch-accessible and not hover-dependent.
- Keep auth/session/locale routing invariants from `docs/web-auth-flows.md` and `docs/web-product-structure.md` unchanged.

# Architecture Results
- Decision: Ready for DEV; docs align on organization planning route model and mobile baseline scope.
- Decision: `review_risk` remains `low` because change is UI responsiveness only within existing route and contract boundaries.
- Decision: `review_scope` remains `qa_only` since the risk is contained to screen-level mobile usability and does not alter behavior/security.
- Changes: Updated front matter status to `dev`; added Architecture Notes and Architecture Results.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Reviewed the mobile usability updates and they remain within the organization planning calendar page without route, auth, or locale contract changes. Week view swipe navigation and touch-target sizing look consistent with mobile accessibility needs and existing query-based calendar controls.
- Findings: none

# Security Results
- Reviewed implementation files:
  - `web/src/components/jobs/organization-shifts-page.tsx`
  - `web/src/app/[locale]/app/organizations/shifts/page.tsx`
  - `docs/web-shifts-planning-flow.md`
  - `docs/web-auth-flows.md`
  - `docs/web-product-structure.md`
  - `docs/web-governance.md`
- Decision: pass (`ux`)
- Findings: none
Changes: reviewed requirement and implementation in place; no security-related code modifications were required.

## UX Results
- Decision: pass
- Changes: web/src/components/jobs/organization-shifts-page.tsx, web/messages/de.json, web/messages/en.json

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
