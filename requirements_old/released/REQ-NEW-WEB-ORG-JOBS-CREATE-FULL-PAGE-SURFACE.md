---
id: REQ-NEW-WEB-ORG-JOBS-CREATE-FULL-PAGE-SURFACE
title: Present organization job creation as a dedicated page surface
status: released
implementation_scope: frontend
review_risk: medium
review_scope: qa_ux
source: user-2026-02-12-org-calendar-create-full-page
---

# Goal
Provide a focused organization job-creation experience by showing `jobs?create=1` as a dedicated primary page surface instead of a right-column box.

# Scope
- Frontend behavior in `web/` for organization create entry points.
- In-scope routes and triggers:
  - `/{locale}/app/organizations/jobs?create=1`
  - create entry from `/{locale}/app/organizations/shifts?view=calendar`
  - create entry from organization jobs workspace
- Keep the existing `create=1` route contract unchanged.

# Task Outline
- Replace right-column create-box rendering with a dedicated primary create surface when `create=1` is active.
- Route all in-scope create entry points to the same create surface behavior.
- Preserve existing creation capabilities, validation, and save outcomes.
- Preserve deterministic exit back to organization jobs workspace without `create=1`.
- Keep localization and message-key based copy behavior unchanged.

# Acceptance Criteria
- [ ] `/{locale}/app/organizations/jobs?create=1` renders creation in the primary page area, not as a right-column create box.
- [ ] Create entry from calendar and organization jobs workspace both land on the same create surface behavior.
- [ ] Existing create outcomes remain intact: prefill, validation, save success, and save error handling.
- [ ] User can exit create mode and return to `/{locale}/app/organizations/jobs` without `create=1`.
- [ ] Locale-prefixed routing, guard behavior, and message-key based copy remain unchanged.

# Out of Scope
- Backend, API, or schema changes.
- New create business logic or wizard redesign.
- Route contract changes beyond existing `create=1`.
- Organization jobs list/pipeline behavior when create mode is not active.

# Constraints
- Keep implementation in active frontend track `web/` only.
- Keep organization route and alias behavior aligned with `docs/web-product-structure.md` and `docs/web-shifts-planning-flow.md`.
- Keep job-management and create-flow contract aligned with `docs/web-jobs-requests-flow.md`.
- Keep UX and flow-governance quality baselines aligned with `docs/modern-ui.md`, `docs/web-governance.md`, and `docs/web-quality-test-program.md`.
- Keep auth/session guard behavior aligned with `docs/web-auth-flows.md`.

# References
- `docs/web-product-structure.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-governance.md`
- `docs/web-design-system.md`
- `docs/modern-ui.md`
- `docs/web-quality-test-program.md`
- `docs/web-auth-flows.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is organization create-surface behavior in `web/`.
- Decision: Requirement was reduced to a lean brief focused on outcome, routing safety, and preserved create behavior.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ORG-JOBS-CREATE-FULL-PAGE-SURFACE.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ORG-JOBS-CREATE-FULL-PAGE-SURFACE.md`

# Architecture Notes
- Keep `/{locale}/app/organizations/jobs?create=1` as the canonical create-mode contract and preserve all existing entry points to that contract.
- Limit change scope to presentation surface only; creation rules, validation semantics, and save outcomes must remain behavior-compatible.
- Keep planning vs shift-management boundaries unchanged (`shifts` routes point to `jobs?create=1` for creation).
- Keep auth/role guards and locale-prefixed routing unchanged; no new aliases or redirect behavior.

# Implementation Guardrails
- Maintain one create-mode source of truth (`create=1`) to avoid diverging state between calendar and jobs entry paths.
- Preserve deterministic exit from create mode back to `/{locale}/app/organizations/jobs` without query drift.
- Keep message-key usage and explicit error/success states intact on the new full-page surface.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with jobs/planning route contracts and current create-flow semantics.
- Decision: `review_risk` remains `medium` due to cross-entry create-surface change with regression risk on create workflow continuity.
- Decision: `review_scope` remains `qa_ux` to focus verification on create-mode routing, state continuity, and UX parity.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ORG-JOBS-CREATE-FULL-PAGE-SURFACE.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-JOBS-CREATE-FULL-PAGE-SURFACE.md`

# Dev Results
- Reworked organization jobs create mode in `web/` so `create=1` renders a dedicated primary create surface; jobs workspace search/pipeline/workbench are hidden while create mode is active.
- Updated organization jobs create entry in the page heading to route to the canonical create contract (`/{locale}/app/organizations/jobs?create=1`) instead of a local right-column toggle.
- Added deterministic create-mode exit behavior that routes back to `/{locale}/app/organizations/jobs` without `create=1` from the close action and after successful save.
- Preserved existing create form contract and behavior (template prefill, validation, save success/error paths, and same payload/API usage).
- Validation: `npm --prefix web run lint` passed.
- Validation: `npm --prefix web run build` passed.
Changes: `web/src/components/jobs/organization-jobs-page.tsx`, `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-ORG-JOBS-CREATE-FULL-PAGE-SURFACE.md`

## Review Bundle Results
- Risk: medium
- Scope: frontend
- Roles: QA, UX
- QA: pass - Create mode now uses a dedicated primary jobs page surface via the existing create=1 route contract, with entry/exit behavior and create outcomes validated.
- UX: pass - Organization jobs create mode uses a dedicated full-page surface via create=1 and preserves existing create validation and outcomes.
- Aggregated outcome: deploy

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
