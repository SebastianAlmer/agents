---
id: REQ-NEW-WEB-ORG-JOBS-CREATE-DATETIME-UX-DEFAULTS
title: Organization create datetime defaults and optional compensation/requirements policy
status: released
implementation_scope: fullstack
review_risk: low
review_scope: qa_only
source: user-2026-02-12-org-jobs-create-datetime-ux-defaults
---

# Goal
Define one consistent create/publish policy for `/{locale}/app/organizations/shift-management?create=1` with deterministic datetime defaults and optional `compensation` and `requirements`.

# Scope
- Frontend create flow behavior in `web/`.
- Backend/API validation contract for create/update/publish payload handling of `compensation` and `requirements`.
- Documentation alignment across scope, model, and UAT docs.

# Task Outline
- Set deterministic datetime defaults in create mode:
  - `shiftStart`: today + 7 days, rounded to the next full hour
  - `shiftEnd`: `shiftStart` + 1 hour
- Enforce 5-minute time-step selection in create datetime controls.
- On start-day change, align end-day to the same date while preserving valid ordering.
- Move booking deadline controls (`bookingDeadlineDays`, `bookingDeadlineTime`) to the end of the create form.
- Keep validation feedback explicit on blur and on publish action.
- Make `compensation` and `requirements` optional and non-blocking for publish.
- Align backend/API contract so omitted/empty `compensation` and `requirements` are accepted for create/update/publish flows.

# Acceptance Criteria
- [ ] `/{locale}/app/organizations/shift-management?create=1` applies deterministic datetime defaults and valid range behavior.
- [ ] Datetime inputs use 5-minute granularity.
- [ ] Required-field highlight behavior remains explicit and deterministic for fields that are still required.
- [ ] `compensation` and `requirements` do not block publish when empty or omitted.
- [ ] API/validation behavior is aligned so frontend and backend do not disagree on `compensation`/`requirements` optionality.
- [ ] Locale-prefixed guard behavior and route/query contracts remain deterministic.
- [ ] Binding docs reflect this policy consistently.

# Out of Scope
- Unrelated create-form redesign.
- Route IA redesign outside agreed slug strategy.
- New planning business logic.

# Constraints
- Keep active frontend implementation in `web/`.
- Keep create and planning behavior aligned with `docs/web-shifts-planning-flow.md`, `docs/web-jobs-requests-flow.md`, and `docs/web-product-structure.md`.
- Keep quality evidence aligned with `docs/web-quality-test-program.md` and `docs/web-uat-master.md`.

# References
- `docs/availability-and-participant-spec.md`
- `docs/scope-boundaries.md`
- `docs/data-model-philosophy.md`
- `docs/web-uat-master.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-product-structure.md`

# Architecture Notes
- Treat the `shift-management?create=1` path as the single create entry; keep aliases as compatibility only.
- Keep defaulting and datetime constraints in one form-state boundary so they stay consistent on reload and route-driven re-entry.
- Keep `compensation` and `requirements` optional at both UI validation and API adapter payload stages to avoid publish coupling.
- Keep booking-deadline controls functional but lower-priority in form order so required fields preserve completion flow.
- Preserve locale route and guard behavior from `web-product-structure.md` and `web-governance.md`; no route surface changes.

# Implementation Guardrails
- Preserve existing endpoint map (`POST /job-offers`, `PATCH /job-offers/:id`, `PATCH /job-offers/occurrences/:id/publish`) and do not introduce new publish endpoints.
- Keep deterministic datetime rounding/normalization deterministic and explicit (e.g., `start=next_hour`, `end=start+1h`, 5-minute increments only).
- Ensure status and ordering state updates remain canonical when start-day changes (same-day invariant for initial draft, with validity checks).
- Maintain `ApiResult`-aligned error handling and message-key copy; avoid introducing hardcoded publish-failure UI text.

# Risks & Tradeoffs
- Tightening create defaults can create UX friction for existing editors who expect empty forms; align empty-state messaging and edit-in-place behavior.
- If legacy backend endpoints keep strict validation on blank optional fields, `publish` may remain non-deterministic unless adapter-level mapping normalizes empty values to accepted payload shape.

# Architecture Results
- `shift-management?create=1` flow is compatible with product structure and UAT route requirements; no route contract contradiction found.
- Contract and UI scope is bounded (`web` + existing jobs API surface), so this is ready for implementation handoff.
- Changes: `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-JOBS-CREATE-DATETIME-UX-DEFAULTS.md`, `status` set to `dev`, added `Architecture Notes`, `Implementation Guardrails`, optional `Risks & Tradeoffs`, and `Architecture Results`.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: block
- Summary: Quick review found a functional gap: frontend create defaults and datetime behavior are implemented, but backend create/update validation still requires compensation and requirements, so empty values can still fail publish/create despite UI allowing them.
- Findings: Backend service `app/src/job-offers/job-offers.service.ts` still enforces `Requirements are required` and uses `normalizeRequired` for compensation in `createOffer`/`updateOffer`, causing empty optional fields accepted by UI to be rejected server-side.

## QA Re-Decision
- Mode: quick follow-up + regression test + required checks
- Decision: pass
- Summary: Backend validation is now aligned: create/update series paths accept omitted/empty `compensation` and `requirements` without publish blockers, and the new regression test confirms null/empty persistence semantics. FE/BE required checks (`npm --prefix web run lint`, `npm --prefix web run build`, `npm --prefix app run build`, `npm run test` in `app`) are passing.
- Findings:
  - none
- Changes: `app/src/job-offers/job-offers.service.ts` now uses `normalizeOptional` for compensation in create/update/updateSeries and removed mandatory requirements enforcement; `app/src/job-offers/job-offers.booking-deadline.test.ts` adds `createOffer accepts omitted compensation and requirements`.

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
