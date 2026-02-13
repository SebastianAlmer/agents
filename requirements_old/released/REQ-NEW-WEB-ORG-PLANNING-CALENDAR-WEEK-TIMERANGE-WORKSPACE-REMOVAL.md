---
id: REQ-NEW-WEB-ORG-PLANNING-CALENDAR-WEEK-TIMERANGE-WORKSPACE-REMOVAL
title: Default organization planning calendar to week view and remove workspace cards
status: released
source: user-2026-02-12-org-shifts-calendar-week-timerange-workspace-removal
implementation_scope: frontend
review_risk: low
review_scope: qa_only
---

# Goal
Make organization planning show week calendar by default when calendar mode is active and remove non-required planning workspace cards for a cleaner layout.

# Scope
- Frontend behavior only in `web/` on `/{locale}/app/organizations/planning` and its compatibility alias.
- Default calendar behavior when `view=calendar` and `calendarView` is absent.
- Focus timing when settings are present and when settings are absent.
- Layout surface for the planning top area where `Arbeitsbereiche` cards are currently shown.

# Task Outline
- Default `calendarView` to `week` when planning calendar view is requested without an explicit `calendarView`.
- Keep calendar timeline full-day with vertical scroll behavior across `00:00` to `24:00`.
- Use planning settings (`calendarDayStart`, `calendarDayEnd`) as initial focus when available.
- Fall back to `08:00` focus when planning settings are missing.
- Remove `Arbeitsbereiche` cards from planning composition.
- Keep top-row actions (`Erstellen`, `Entwuerfe`, `Vorlagen`) and existing `view`, `calendarDate`, locale, and guard behavior.

# Acceptance Criteria
- Opening planning with `view=calendar` and missing `calendarView` defaults to week mode.
- Calendar timeline is vertically scrollable and covers the full `00:00` to `24:00` range.
- Initial focus follows `calendarDayStart`/`calendarDayEnd` when those settings exist.
- Initial focus defaults to `08:00` when settings are unavailable.
- `Arbeitsbereiche` cards are no longer visible in planning screen.

# Out of Scope
- Backend/API/schema work.
- Changes outside organization planning route behaviors.
- New planning business logic or role model changes.

# Constraints
- Keep active implementation in `web/` per frontend migration constraints.
- Maintain route aliases and state semantics from `docs/web-product-structure.md`.
- Implement planning semantics per `docs/web-shifts-planning-flow.md` and quality checks in `docs/web-quality-test-program.md`.

# References
- `docs/web-shifts-planning-flow.md`
- `docs/web-product-structure.md`
- `docs/web-quality-test-program.md`
- `docs/mobile-web-baseline.md`
- `docs/web-governance.md`

# Architecture Notes
- `view=calendar` defaulting to `calendarView=week` must remain a URL/route query contract change, not a persistent preference inversion.
- Preserve existing planning aliases and canonical route behavior; only adjust planning query interpretation and calendar defaults.
- Keep top-row actions and non-calendar controls untouched to avoid scope creep and route-state side effects.
- Remove `Arbeitsbereiche` cards only from the planning composition area; preserve core planning data blocks and filters required by flow.
- Respect full-day `00:00..24:00` scroll contract and planning settings focus precedence as defined in planning flow docs.

# Implementation Guardrails
- Keep date/time normalization deterministic and shared across state sources (query params, settings, defaults) to avoid focus jumps on re-render.
- Ensure missing planning settings always fallback to `08:00` and still allow explicit user change once calendar loads.
- Verify mobile and desktop behavior through existing planning must-flow checks; avoid changing mobile-only code paths.

# Architecture Results
- `web-shifts-planning-flow.md` explicitly defines all requested semantics (`calendarView=week` default, full-day scroll, no `Arbeitsbereiche` card area).
- No unresolved contract conflicts against route/state and quality requirements found.
- Changes: moved to `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-PLANNING-CALENDAR-WEEK-TIMERANGE-WORKSPACE-REMOVAL.md`, set `status` to `dev`, replaced PO Results with Architecture Notes/Guardrails/Results.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Checked the implementation against the planning calendar requirement and required URL/alias semantics; default week mode, full-day scroll range, settings-based focus fallback, and workspace-card removal are now implemented. I also fixed two quick-review regressions around planning alias query preservation and one-time calendar focus initialization so behavior is consistent with profile settings.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).

- Summary: Batch FE/BE validation failed due to a pre-existing frontend lint regression in organization-jobs-page; backend tests passed fully.
- Blocking findings: web lint fails: calling React setState synchronously inside useEffect in web/src/components/jobs/organization-jobs-page.tsx (lines 568 and 661), likely pre-existing but blocks batch pass.

## QA Re-Decision
- Mode: quick follow-up + required checks
- Decision: pass
- Summary: The pre-existing lint blocker has been resolved in the current tree; global FE lint and build succeed, and the feature behavior remains implemented for default `calendarView=week`, full-day scroll focus, and workspace-card removal with alias-safe planning query handling.
- Findings: none
- Changes: no blocking behavior-specific code changes were required for this unblock check; verification relies on current implementation in `web/src/components/jobs/organization-shifts-page.tsx` and global checks (`npm --prefix web run lint`, `npm --prefix web run build`, `npm --prefix app run build`, `npm run test` in `app`) all passing.
