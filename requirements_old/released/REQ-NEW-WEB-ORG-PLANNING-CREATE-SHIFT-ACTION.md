---
id: REQ-NEW-WEB-ORG-PLANNING-CREATE-SHIFT-ACTION
title: Add create-shift action on organization planning page
status: released
source: user-2026-02-12-planning-create-shift-button
implementation_scope: frontend
review_risk: low
review_scope: qa_only
---

## Goal
Expose the existing shift creation flow directly from the organization planning page to reduce navigation steps.

## Scope
- Add a `Schicht erstellen` action to `/{locale}/app/organizations/planning` in `web/`.
- Action must launch the existing organization shift creation flow (no new flow).
- Keep routing, locale behavior, role permissions, and copy-key usage unchanged.
- Keep backend/API/data model behavior unchanged.

## Task Outline
- Locate the shared organization planning page entry points in `web/`.
- Add a visible planning-page action that invokes the existing create-shift path used elsewhere.
- Ensure authorized organization users only can access the action.
- Preserve existing planning page states (loading/empty/error/success).
- Add a lightweight QA check for action visibility and invocation behavior.

## Acceptance Criteria
- The planning page shows a `Schicht erstellen` action for eligible organization users.
- Clicking the action opens the existing create-shift flow used in other org surfaces.
- Existing locale routing (`/de`, `/en`) remains unchanged.
- No duplicate create implementation is introduced.
- No regressions in existing planning-page states.

## Out of Scope
- Backend/API/DB changes.
- New creation workflow design.
- Changes in `web_legacy/`.

## Constraints
- Must be implemented in `web/` according to `docs/web-governance.md`.
- Keep localized routing and role checks intact (`/de`, `/en`, org role access).
- Keep production copy through existing i18n keys, no hardcoded copy.

## References
- `docs/web-governance.md`
- `docs/roles-and-functions.md`
- `docs/scope-boundaries.md`

# Architecture Notes
- Keep the action as a thin entry to the existing `/app/organizations/shift-management?create=1` flow; no duplicate flow logic at planning page level.
- Preserve route contract (`/{locale}/app/organizations/planning`) and keep query behavior stable (no extra mutable params for the create action).
- Gate rendering by existing employer role/session visibility, matching current navigation/access patterns.
- Use existing i18n keys for button label and descriptive copy; avoid introducing product-scope text in planning surface.
- Keep empty/loading/error states and list/calendar behavior unchanged; this change only extends affordance and navigation.

# Architecture Results
- Decision: Requirement is architecture-ready as a low-risk frontend navigation affordance update.
- Decision: `status` moved to `dev`; `review_risk` remains `low`; `review_scope` remains `qa_only`.
- Changes: status updated to `dev`; replaced PO handoff with Architecture Notes and Architecture Results.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Planning page exposes an org-only create action that links directly to the existing shift-management create flow, using localized label and existing session role gating, with no new creation logic introduced.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
