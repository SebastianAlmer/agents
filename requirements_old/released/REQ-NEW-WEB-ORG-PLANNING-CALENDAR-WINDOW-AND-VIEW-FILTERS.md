---
id: REQ-NEW-WEB-ORG-PLANNING-CALENDAR-WINDOW-AND-VIEW-FILTERS
title: Refine organization planning with calendar time window and view-specific filters
status: released
source: user-2026-02-12-planning-calendar-window-view-filters
implementation_scope: frontend
review_risk: low
review_scope: qa_only
---

# Goal
Clarify planning behavior by splitting list-only temporal filtering from calendar mode and standardizing planning time window presentation.

# Scope
- Frontend organization planning page in `web/` only.
- Behavior of `view=list|calendar` toggling and associated filter controls.
- No backend, API, routing, or auth/role model changes.

# Task Outline
- Ensure `/{locale}/app/organizations/planning` exposes a list/calendar view switch in a stable header location.
- Keep route query state synchronized on view changes.
- Render calendar mode as a vertical-scroll time area within the required hour window.
- Restrict `Kommende | Vergangene` filters to list mode.
- Hide those filters in calendar mode.
- Preserve loading/empty/error states for both view modes.

# Acceptance Criteria
- Planning supports reliable switching between list and calendar modes.
- View query state (`view=list|calendar`) updates correctly with user selection.
- Calendar mode shows a vertical-scroll time layout within the specified window.
- List-only temporal filters are functional in list mode and not visible in calendar mode.
- No regression in locale route behavior or existing loading/empty/error handling.

# Out of Scope
- Backend/API/data-model changes.
- Domain status logic and lifecycle redesign.
- Non-planning route behavior.

# Constraints
- Keep implementation in active frontend track (`web/`) per architecture.
- Preserve locale routing and guard behavior for organization flows.
- Use message keys for user-facing copy and keep status semantics unchanged.

# References
- `docs/web-governance.md`
- `docs/scope-boundaries.md`
- `docs/roles-and-functions.md`

# Architecture Notes
- Keep view switching and filters in query params only (`view`, `calendarView`, `calendarDate`, `scope`, optional `status`) so forward/back and shareable links remain deterministic.
- Keep calendar rendering and list rendering as the same page state container; only projection changes, not lifecycle or mutation paths.
- Keep list-only `scope` filters hidden in calendar mode; do not request additional API variants or alter backend semantics.
- Preserve locale routing and i18n keys for all user-facing copy, including control labels and empty states.
- Constrain time-window behavior to UI-layer presentation and existing data contracts (`calendarDayStart`/`calendarDayEnd`), without introducing additional time semantics.

# Implementation Guardrails
- Validate query-param transitions are stable under rapid toggles to avoid stale view/state in `next/navigation`.
- Treat unsupported query values as fallback to defaults rather than mutating global state.
- Keep loading/empty/error branches identical across modes except for visual layout changes.

# Architecture Results
- Decision: Requirement is architecture-ready as a frontend state/projection change.
- Decision: `status` moved to `dev`; `review_risk` remains `low`; `review_scope` remains `qa_only`.
- Changes: status updated to `dev`; added Architecture Notes, Implementation Guardrails, and Architecture Results.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: List/calendar view state is driven by the `view` query param with fallback to list, and calendar rendering now uses a scrollable time-window layout while list-only upcoming filters are hidden when in calendar mode.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
