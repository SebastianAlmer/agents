---
id: REQ-NEW-WEB-ORG-SHIFTS-CALENDAR-LEGACY-MODULE-PARITY
title: Restore interactive organization planning calendar behavior
status: released
implementation_scope: frontend
review_risk: high
review_scope: qa_ux
source: user-2026-02-12-org-shifts-calendar-legacy-module-parity
---

# Goal
Restore an interactive calendar experience for organization planning so `view=calendar` is usable for production planning and decision flow.

# Scope
- Frontend behavior in active `web/` planning route:
  - `/{locale}/app/organizations/shifts?view=calendar`
- Calendar-mode interaction model on the same route contract (`view=list|calendar`).
- Occurrence action continuity from planning calendar to occurrence detail route.
- Preserve current list-mode behavior when `view=list` is active.

# Task Outline
- Replace grouped-list fallback in `view=calendar` with an interactive calendar planner surface.
- Ensure calendar navigation and period switching support day, week, and month planning usage.
- Map organization occurrences into calendar events with actionable status context.
- Keep event click behavior routing to canonical occurrence detail.
- Preserve loading, empty, and error state clarity in calendar mode.
- Keep locale-prefixed route, role guard, and message-key copy behavior unchanged.

# Acceptance Criteria
- [ ] `/{locale}/app/organizations/shifts?view=calendar` renders an interactive calendar planner, not a grouped day list fallback.
- [ ] Calendar mode supports navigation (`previous`, `today`, `next`) and view switching (`day`, `week`, `month`) with correct visible period updates.
- [ ] Selecting a calendar event opens canonical occurrence detail route with existing deep-link contract.
- [ ] Calendar mode keeps explicit loading, empty, and error states while preserving existing `view=list` behavior.
- [ ] Locale-prefixed routing, auth/role guards, and message-key based copy remain unchanged.

# Out of Scope
- Backend endpoint or schema changes.
- Planning route model redesign beyond existing `view=list|calendar`.
- Participant or admin calendar redesign.
- Any change to request or occurrence status semantics.

# Constraints
- Keep implementation in active frontend track `web/` only; `web_legacy/` stays maintenance-only.
- Keep planning route and alias behavior aligned with `docs/web-shifts-planning-flow.md` and `docs/web-product-structure.md`.
- Keep occurrence-detail routing contract aligned with `docs/web-jobs-requests-flow.md`.
- Keep flow quality and state handling aligned with `docs/web-governance.md` and `docs/web-quality-test-program.md`.
- Keep visual and interaction baseline aligned with `docs/modern-ui.md` and `docs/web-design-system.md`.

# References
- `docs/web-governance.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-product-structure.md`
- `docs/web-design-system.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-quality-test-program.md`
- `docs/modern-ui.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is planning-calendar UI behavior in `web/`.
- Decision: Requirement was reduced to outcome-focused calendar behavior and doc-bound constraints; non-binding module-level detail was removed.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ORG-SHIFTS-CALENDAR-LEGACY-MODULE-PARITY.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ORG-SHIFTS-CALENDAR-LEGACY-MODULE-PARITY.md`

# Architecture Notes
- Keep calendar mode on the existing planning route contract (`/{locale}/app/organizations/shifts?view=calendar`) with no new route model.
- Preserve list-mode behavior and data semantics; calendar mode is an additional presentation, not a separate domain flow.
- Keep occurrence action continuity intact: calendar event selection must resolve to canonical occurrence detail deep link.
- Keep explicit `loading`, `empty`, and `error` states in calendar mode with deterministic recovery behavior.
- Keep role/session guards and locale-prefixed routing unchanged.

# Implementation Guardrails
- Use one shared planning data source for list and calendar views to avoid state divergence.
- Ensure period/view controls update route-state deterministically so browser navigation remains coherent.
- Avoid introducing fallback grouped-list rendering in `view=calendar`; calendar mode must remain interactive once loaded.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with planning route-state and occurrence-detail contracts in docs.
- Decision: `review_risk` remains `high` because this changes a core planning interaction surface with significant regression potential.
- Decision: `review_scope` remains `qa_ux` to focus verification on calendar interaction correctness, route-state continuity, and action parity.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ORG-SHIFTS-CALENDAR-LEGACY-MODULE-PARITY.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-SHIFTS-CALENDAR-LEGACY-MODULE-PARITY.md`

# Dev Results
- Replaced the `view=calendar` grouped-list fallback in `web/src/components/jobs/organization-shifts-page.tsx` with an interactive planner surface that supports day/week/month modes.
- Added deterministic calendar route-state handling in calendar mode via query params (`calendarView`, `calendarDate`) and wired `previous`, `today`, and `next` controls to update the visible period.
- Mapped upcoming organization occurrences into calendar events with status and staffing context and kept event selection routing to the canonical occurrence detail deep-link (`/app/organizations/jobs/{id}?occurrence={occurrenceId}`).
- Preserved existing loading, error, and list-mode behavior; added calendar-period empty-state copy via message keys in `web/messages/de.json` and `web/messages/en.json`.
- Validation: `npm --prefix web run lint` passed.
- Validation: `npm --prefix web run build` passed.
Changes: `web/src/components/jobs/organization-shifts-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-SHIFTS-CALENDAR-LEGACY-MODULE-PARITY.md` -> `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-ORG-SHIFTS-CALENDAR-LEGACY-MODULE-PARITY.md`

## Review Bundle Results
- Risk: high
- Scope: frontend
- Roles: QA, UX
- QA: pass - Calendar mode now provides interactive day/week/month planning with deterministic route-state controls and canonical occurrence deep links. No requirement-scoped regressions were found.
- UX: pass - Organization planning calendar mode is interactive with day/week/month navigation and deterministic period controls on the existing route. Event-to-detail actions and list-mode behavior remain intact.
- Aggregated outcome: deploy

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
