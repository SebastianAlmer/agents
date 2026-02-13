---
id: REQ-NEW-WEB-ORG-SHIFTMGMT-TEMPLATES-DRAFTS
title: Add templates and drafts area under shift management for organizations
status: released
source: user-2026-02-12-org-shiftmgmt-templates-drafts
implementation_scope: frontend
review_risk: low
review_scope: qa_only
---

## Goal
Expose a shift-management area in organization planning where templates and drafts can be accessed from one `Vorlagen / Entwuerfe` entry.

## Scope
- Organization navigation in `web/` should include a `Vorlagen / Entwuerfe` area under shift management.
- Reuse existing organization shift-management flows for listing and opening templates/drafts.
- Ensure the save-as-draft behavior in shift creation is preserved and surfaced in that area.
- Keep route structure, locale handling (`/de`, `/en`), role permissions, and backend/API contracts unchanged.

## Task Outline
- Update organization menu/navigation in `web/` to include `Vorlagen / Entwuerfe` under `Schichtmanagement`.
- Wire the new entry to the templates/drafts view surface.
- Confirm the template list and draft list behavior is usable from this entry point.
- Validate whether `Als Entwurf speichern` exists in the create flow; if missing, expose/save draft using the existing create flow mechanism.
- Verify no regressions in loading/empty/error behavior for the new area.

## Acceptance Criteria
- The organization menu shows `Vorlagen / Entwuerfe` under shift management.
- The entry opens a frontend area for templates and draft handling.
- Draft saves from the existing create flow are visible in the drafts area.
- Existing shift creation and publish flow remain functional and unchanged in behavior.
- Functionality behaves correctly on both `/de` and `/en` routes.

## Out of Scope
- Backend/API/DB redesign or contract changes.
- New permissions model or role-definition changes.
- Changes outside `web/` and `web_legacy/` maintenance paths.

## Constraints
- Implement in `web/` per `docs/web-governance.md`.
- Keep role and permission behavior unchanged (`Employer` access expectations).
- Keep i18n keys for user-facing text; do not hardcode production copy.
- Align terminology with shift management concepts (`Schicht`), not jobs.

## References
- `docs/web-governance.md`
- `docs/glossary.md`
- `docs/roles-and-functions.md`
- `docs/scope-boundaries.md`

# Architecture Notes
- Keep `Schichtmanagement` as the existing route group (`/app/organizations/shift-management`) and expose `scope=drafts|templates` as view state, not new route semantics.
- Preserve existing template/draft storage and lifecycle contracts from the current shift-management flows; this is a navigation surface change only.
- Maintain employer-only visibility through existing nav-role resolution; do not widen access beyond `EMPLOYER` surfaces.
- Keep create/save-draft logic unchanged by reusing existing create/edit flow paths and payload contracts.
- Keep locale behavior unchanged; only labels and nav copy remain through existing i18n keys.

# Implementation Guardrails
- Verify routing behavior is deterministic for deep links and back/forward navigation when switching to templates/drafts.
- Keep planning page states (`loading/empty/error`) unchanged except for added entry visibility and query-based scope.
- Ensure the feature remains in `web/` navigation and does not require `web_legacy` edits.

# Architecture Results
- Decision: Requirement is architecture-ready for frontend navigation/menu work with low risk.
- Decision: `status` moved to `dev`; `review_risk` remains `low`; `review_scope` remains `qa_only`.
- Changes: status updated to `dev`; replaced PO handoff section with Architecture Notes, Implementation Guardrails, and Architecture Results.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Navigation now opens the templates/drafts surface via `/app/organizations/shift-management?scope=...` and the shift-management route now routes `scope=drafts`/`scope=templates` into `OrganizationShiftsPage`, so templates and drafts are actually rendered from the existing planning surface.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
