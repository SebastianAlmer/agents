---
id: REQ-NEW-WEB-NAV-ACTIVE-ITEM-TYPO-CONTRAST
title: Make active menu item text bold and white on green highlight
status: released
source: user-2026-02-12-menu-active-item-bold-white
implementation_scope: frontend
review_risk: low
review_scope: qa_only
---

## Goal
Improve active menu-item readability by enforcing white, bold text whenever a navigation item is in the green active state.

## Scope
- In `web/` menu UI, update styling for active/selected menu entries that already use the green active background.
- Keep menu structure, routes, role visibility, and i18n keys unchanged.
- Apply the active-state style consistently in all shared menu components used by app surfaces.

## Task Outline
- Locate the shared frontend component(s) that render active navigation items.
- Apply a rule so active items with the green active state render text as white and font-weight bold.
- Leave non-active item styling unchanged.
- Verify the same active text treatment is applied across organization/responder/admin contexts that use shared menu components.
- Add/adjust visual checks so active menu styling is covered by QA validation.

## Acceptance Criteria
- Active selected navigation items with green highlight show white text.
- Active selected navigation items with green highlight show bold text.
- Non-active menu entries keep their existing typography and color behavior.
- Shared navigation components show the same active text style across relevant surfaces.
- No regression in existing focus/keyboard navigation behavior is introduced.

## Out of Scope
- Backend, API, or data model changes.
- Menu structure changes, item renames, or route changes.
- Changes in `web_legacy/`.

## Constraints
- Active-state implementation must stay in the active frontend track `web/` per `docs/web-governance.md`.
- Preserve role-based menu visibility and behavior expected by frontend governance.
- Keep existing i18n copy and wording.

## References
- `docs/web-governance.md`

# Architecture Notes
- Keep active-state styling in shared sidebar/navigation primitives so all role surfaces share the same contract.
- Preserve route match logic and visibility rules; only change typography/color tokens for active state.
- Keep non-active menu item treatment unchanged except where active state is explicitly applied.
- Include active icon and text states in one shared styling decision to avoid mismatched visual emphasis.
- Keep existing keyboard/focus behavior intact; treat this as a visual-only contract change.

# Architecture Results
- Decision: Requirement is architecture-ready as a UI-only presentation refinement.
- Decision: `status` moved to `dev`; `review_risk` remains `low`; `review_scope` remains `qa_only`.
- Changes: status updated to `dev`; replaced PO handoff block with Architecture Notes and Architecture Results.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Active sidebar menu items now use explicit white typography emphasis under active highlight via the shared AppSidebar component, which is used by the app shell across surfaces. No obvious regressions were introduced in this change set for typography or route-based active logic.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
