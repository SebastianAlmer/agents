---
id: REQ-NEW-WEB-ORG-JOB-DETAIL-STATUS-ACTIONS-ONLY
title: Keep organization job detail sidebar focused on status and actions
status: released
implementation_scope: frontend
review_risk: medium
review_scope: qa_ux
source: user-2026-02-12-org-job-detail-status-actions-only
---

# Goal
Simplify organization occurrence detail so the right sidebar focuses on status and actions, reducing duplicate context blocks while preserving decision-critical controls.

# Scope
- Organization occurrence detail route in `web/`:
  - `/{locale}/app/organizations/jobs/{id}?occurrence={occurrenceId}`
- Sidebar content model on this route:
  - remove separate shift-dates card
  - keep one status-and-actions sidebar surface
- Preserve existing occurrence action behavior and deep-link usage.

# Task Outline
- Remove the separate shift-dates sidebar card from organization job detail.
- Keep a single sidebar card for occurrence status and available actions.
- Remove redundant top summary text from sidebar status/actions area.
- Preserve existing publish, withdraw, and delete behavior including disabled and error states.
- Keep message-key based copy and locale-prefixed route behavior unchanged.

# Acceptance Criteria
- [x] Organization occurrence detail renders no separate shift-dates sidebar card.
- [x] Sidebar shows status and action controls only, without a duplicated title/date/time/location summary block.
- [x] Publish, withdraw, and delete actions keep current behavior, including disabled and error states.
- [x] Occurrence deep-link behavior via `?occurrence={occurrenceId}` and locale-prefixed routing remains unchanged.
- [x] Productive copy stays message-key based with no hardcoded UI copy.

# Out of Scope
- Edit form redesign in the main content area.
- New occurrence navigation or switching UX beyond current deep-link model.
- Request lifecycle or status-semantics changes.
- Backend, API, or schema changes.

# Constraints
- Keep implementation in active frontend track `web/` only.
- Keep canonical occurrence-detail route and deep-link model aligned with `docs/web-jobs-requests-flow.md`.
- Keep planning/workspace split aligned with `docs/web-shifts-planning-flow.md`.
- Keep route, guard, and locale-prefix behavior aligned with `docs/web-product-structure.md` and `docs/web-auth-flows.md`.
- Keep copy/state governance aligned with `docs/web-governance.md` and `docs/web-quality-test-program.md`.

# References
- `docs/web-jobs-requests-flow.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-product-structure.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`
- `docs/modern-ui.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is organization job-detail UI behavior only.
- Decision: Requirement was compressed into a lean outcome brief focused on sidebar simplification and behavior safety.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ORG-JOB-DETAIL-STATUS-ACTIONS-ONLY.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ORG-JOB-DETAIL-STATUS-ACTIONS-ONLY.md`

# Architecture Notes
- Keep canonical occurrence detail contract unchanged: `/{locale}/app/organizations/jobs/{id}?occurrence={occurrenceId}` remains the single deep-link entry.
- Preserve organization action semantics on this route (publish, withdraw, delete), including current disabled/error handling.
- Limit simplification to sidebar information density; do not alter decision/status semantics or action availability rules.
- Keep copy message-key based and locale-prefixed guard behavior unchanged.

# Implementation Guardrails
- Remove only redundant sidebar summary content; avoid deleting data needed by action safety states.
- Keep deterministic active occurrence resolution from `occurrence` query parameter.
- Verify no new dead-end state appears when action controls are disabled or fail.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with jobs/planning route contracts and action invariants.
- Decision: `review_risk` remains `medium` because sidebar simplification touches critical occurrence actions and their state context.
- Decision: `review_scope` remains `qa_ux` to focus review on action-state safety and sidebar behavior regression.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ORG-JOB-DETAIL-STATUS-ACTIONS-ONLY.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-JOB-DETAIL-STATUS-ACTIONS-ONLY.md`

# Dev Results
- Verified `web/src/components/jobs/organization-job-detail-page.tsx` already renders a single right-sidebar `SurfaceCard` with status and action controls only; no separate shift-dates sidebar card or duplicate summary block is present.
- Confirmed publish, withdraw, and delete handlers, including disabled/error states and delete-confirmation flow, remain unchanged in the existing implementation.
- Confirmed canonical deep-link handling remains deterministic via `searchParams.get("occurrence")` and locale-prefixed organization job detail routing.
- Checks run: `npm --prefix /home/sebas/git/shift-matching/web run lint` (passed), `npm --prefix /home/sebas/git/shift-matching/web run build` (passed).
Changes: `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-JOB-DETAIL-STATUS-ACTIONS-ONLY.md` -> `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-ORG-JOB-DETAIL-STATUS-ACTIONS-ONLY.md`

## Review Bundle Results
- Risk: medium
- Scope: frontend
- Roles: QA, UX
- QA: pass - Organization job-detail sidebar remains status/actions-only with no duplicate summary card, while publish/withdraw/delete behavior and deep-link routing remain intact; relevant web checks passed.
- UX: pass - Organization job detail sidebar is status-and-actions only and keeps existing action-state behavior with message-key copy.
- Aggregated outcome: deploy

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
