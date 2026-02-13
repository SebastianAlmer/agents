---
id: REQ-NEW-FULLSTACK-REMOVE-SHIFT-SERIES-LEGACY
title: Remove shift-series legacy model and recurring shift types from runtime
status: released
source: user-2026-02-12-shift-series-removal
implementation_scope: fullstack
review_risk: high
review_scope: full
---

# Goal
Align runtime to the single-shift product model by removing shift-series and recurring shift type artifacts from backend and frontend contracts.

# Scope
- Backend DB and API runtime in `app/` and Prisma schema/migrations.
- Frontend contract/types in `web/` where recurring/series values are exposed.
- No auth, route, or role-model changes.

# Task Outline
- Remove legacy recurring shift types from active runtime (`RECURRING_SAME`, `RECURRING_FLEX`) and keep `ShiftType.ONCE` as the only supported value.
- Remove `ShiftSeries` persistence model and all series relations/fields from shift schema entities.
- Remove backend recurring-series branches in create/update/publish/delete paths while preserving single-shift flows.
- Add deterministic migration/backfill and rollback checks for existing recurring data before schema cleanup.
- Remove recurring/series input and mappings from frontend API adapters/types.
- Keep error behavior deterministic for legacy recurring payloads during rollout window.

# Acceptance Criteria
- Legacy recurring artifacts (`ShiftSeries`, recurring shift type values) are absent from active runtime models and contracts.
- Single-shift (`ONCE`) create/update/publish workflows remain stable.
- Recurring payloads are deterministically rejected with documented error behavior.
- Frontend surfaces do not expose recurring shift mode inputs.
- Migration changes execute without non-recurring data loss or role/auth regressions.

# Out of Scope
- New scheduling functionality outside single-shift model.
- Role/permission changes or route/locale contract changes.

# Constraints
- Must follow `docs/scope-boundaries.md` and `docs/data-model-reference.md` where recurring is legacy and active scope is single-shift.
- Migration affects persistent data and therefore requires deterministic rollout controls and rollback readiness.
- Keep request lifecycle and existing booking/request invariants unchanged.

# References
- `docs/scope-boundaries.md`
- `docs/data-model-reference.md`
- `docs/api-reference.md`
- `docs/glossary.md`

# Architecture Notes
- Treat `ONCE` as the only writable shift type in runtime and frontend contracts; reject any `RECURRING_*` request as unsupported input.
- Define deterministic behavior for existing recurring data during rollout: no silent coercion, explicit error code/path/message and one clear compatibility period.
- Require migration sequencing around foreign-key edges (`ShiftOccurrence` -> templates/notifications/audits) before deleting `ShiftSeries` and recurring associations.
- Keep API and DB rollback strategy explicit: snapshot, reversible migration steps, and validation scripts that prove non-recurring data is unchanged post-removal.

# Implementation Guardrails
- Enforce one boundary for backward compatibility: normalize legacy recurring reads/requests at API ingress, but keep persistent contracts and domain types strictly single-shift.
- Remove `ShiftSeries` from the active Prisma model only after data migration jobs have completed and dependency impact report is clean.
- Keep web contract exposure single-surface: no recurring UI controls, no recurring enum paths in generated or shared types.
- Add migration health checks (record counts, referential integrity, sample path validation) before and after cleanup; fail fast if checks regress.

# Risks & Tradeoffs
- Complete removal reduces feature surface but creates intentional breakage for stale recurring clients; document the sunset and remove support in the next release window.
- Schema-level deletion is high rollback cost; only proceed after tested rollback playbook and backup validation.

# Architecture Results
- Decision: Requirement is architecture-ready with explicit migration boundary and rollback controls.
- Decision: `status` moved to `dev`; `review_risk` remains `high`; `review_scope` remains `full`.
- Changes: status updated to `dev`; added Architecture Notes, Implementation Guardrails, Risks & Tradeoffs, and Architecture Results.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Single-shift ONCE-only enforcement is present across backend and web contracts: legacy recurring shift fields/enum values are removed from active Prisma/job-offer flows, and recurring payloads are rejected with deterministic errors. No additional requirement-scoped regression was observed in the changed paths.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
