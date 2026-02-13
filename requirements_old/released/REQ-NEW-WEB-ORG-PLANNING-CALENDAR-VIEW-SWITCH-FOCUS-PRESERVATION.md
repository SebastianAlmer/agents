---
id: REQ-NEW-WEB-ORG-PLANNING-CALENDAR-VIEW-SWITCH-FOCUS-PRESERVATION
title: Preserve calendar focus when switching week/month in planning
status: released
source: user-2026-02-12-planning-calendar-week-month-focus
implementation_scope: frontend
review_risk: low
review_scope: qa_only
---

## Goal
Keep planning calendar context stable when users switch between week and month views so focus does not jump to the top.

## Scope
- Only organization planning calendar in `web/` on routes under `/{locale}/app/organizations/planning`.
- Preserve current focused date/time context while toggling `calendarView=week` and `calendarView=month`.
- Keep locale routing (`/de`, `/en`) and existing route/query behavior unchanged.
- Do not change backend, data contracts, auth, or menu/feature logic.

## Task Outline
- Validate the current week/month toggle flow in the planning calendar screen.
- Ensure toggling view does not trigger full-page scroll-to-top.
- Preserve scroll and visible anchor around the previously focused date/time region after toggle.
- Verify both directions (`week -> month`, `month -> week`) behave consistently.
- Add/adjust checks for no-focus-loss behavior on locale-aware planning routes.

## Acceptance Criteria
- Switching week to month keeps the user in the same calendar context without top jump.
- Switching month to week keeps the user in the same calendar context without top jump.
- Focused date/time region remains visible after each toggle.
- Behavior is unchanged for `/de/...` and `/en/...` planning routes.
- Existing loading/empty/error states for planning calendar remain intact.

## Out of Scope
- Backend/API changes.
- New planning flows, domain state changes, or route redesign.
- Changes in `web_legacy/`.

## Constraints
- Changes must stay in `web/` per `docs/web-governance.md`.
- Preserve existing localized `/de` and `/en` routing behavior.
- No production copy hardcoding.
- Keep role-based access behavior intact.

## References
- `docs/web-governance.md`
- `docs/architecture.md`
- `docs/scope-boundaries.md`

## Architecture Notes
- Treat view-mode toggles as URL-state transitions on `calendarView` only, with `calendarDate` kept unchanged unless explicitly changed by user navigation.
- Preserve visible context by anchoring scroll/focus to an existing date key (for example selected day bucket) rather than resetting container offset.
- Keep behavior locale-agnostic; only localized messages and labels may vary under `/de` and `/en`.
- Scope to planning route query handling and list rendering; do not alter backend payloads or auth/permission logic.

# Architecture Results
- Decision: Requirement is architecture-ready as a frontend scroll/preservation behavior refinement.
- Decision: `status` moved to `dev`; `review_risk` remains `low`; `review_scope` remains `qa_only`.
- Changes: status updated to `dev`; replaced PO Results with Architecture Notes and Architecture Results.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: The planning calendar view-switch flow keeps `calendarDate` stable for week/month toggles and applies `scroll={false}` on all mode buttons, preventing top-of-page jumps. Week view also restores a focused viewport segment via a deterministic scroll offset so context remains anchored after mode transitions.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
