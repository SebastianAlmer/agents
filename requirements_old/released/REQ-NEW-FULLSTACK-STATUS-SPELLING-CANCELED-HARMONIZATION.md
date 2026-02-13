---
id: REQ-NEW-FULLSTACK-STATUS-SPELLING-CANCELED-HARMONIZATION
title: Harmonize cancelled status spelling across runtime contracts
status: released
source: user-2026-02-12-status-spelling-harmonization
implementation_scope: fullstack
review_risk: high
review_scope: full
---

# Goal
Use one canonical cancellation spelling (`CANCELED`) for OfferRequest and ShiftOccurrence status contracts in runtime and frontend surfaces.

# Scope
- Backend DB schema, migration, and status transition/serialization behavior in `app/`.
- API responses and status handling in `app/src`.
- Frontend status mapping and state handling in `web/src`.
- No changes to auth, routing, or role/permission model.

# Task Outline
- Define and enforce canonical cancellation status as `CANCELED` for active runtime status contracts.
- Migrate existing data and enums from `CANCELLED` to `CANCELED` without losing status history.
- Keep controlled backward compatibility for incoming legacy `CANCELLED` values during rollout window.
- Update deterministic status transitions and serialization to emit canonical `CANCELED`.
- Align frontend status typing/mapping and badges to canonical spelling.
- Remove temporary compatibility handling only after migration stability is confirmed.

# Acceptance Criteria
- Canonical runtime contracts expose only `CANCELED` after migration completion for relevant status states.
- Existing records with legacy spelling are migrated safely and remain semantically correct.
- Backend validation and transition logic do not accept mixed spelling in stable operation.
- Frontend status handling in `web/` and public/API responses use canonical spelling consistently.
- Behavior remains deterministic with no regression in lifecycle handling.

# Out of Scope
- New request status states or lifecycle redesign.
- Changes outside status transition/canonicalization mechanics.
- Scope expansion beyond OfferRequest/ShiftOccurrence status contracts.

# Constraints
- `OfferRequest` and shift-occasion statuses are scoped by `docs/data-model-reference.md` and `docs/scope-boundaries.md`.
- Data migration must preserve role- and workflow-critical audit semantics.
- API and docs must remain backward-compatible during rollout while converging on canonical spelling.

# References
- `docs/data-model-reference.md`
- `docs/scope-boundaries.md`
- `docs/api-reference.md`

# Architecture Notes
- Keep `CANCELED` as canonical write/read contract for OfferRequest and ShiftOccurrence at runtime, API adapter boundaries, and frontend-facing status typing.
- Preserve backward compatibility at the service edge only: normalize inbound legacy `CANCELLED` values once during migration window, then persist/store only `CANCELED`.
- Make migration idempotent and transactional per batch to avoid partial writes across status history tables and active request/shift references.
- Gate compatibility behavior with one explicit configuration flag + sunset date so removal is controlled and reviewable.
- Keep contract docs (`data-model-reference`, `api-reference`) aligned with canonical spelling after implementation.

# Implementation Guardrails
- Do not introduce compatibility behavior in persistence layers; enforce normalization at API/service boundaries and map everything to a single domain status enum internally.
- Update validation and transition logic to treat mixed spellings as invalid once migration window closes, with explicit errors for unknown status strings.
- Preserve audit/status history semantics by backfilling historical rows in the same transaction domain as current status fields.
- Update both request and occurrence payload contracts in `web/` and any shared API adapters in the same release.

# Risks & Tradeoffs
- Keeping dual-read support reduces release-risk but increases stale-client ambiguity until compatibility is removed.
- Longer migration windows reduce rollback urgency but increase the chance of inconsistent legacy payloads in logs and diagnostics.

# Architecture Results
- Decision: Requirement is architecture-ready after boundary and migration constraints are explicit.
- Decision: `status` is moved to `dev`; `review_risk` stays `high`; `review_scope` stays `full` for backend/frontend/docs compatibility.
- Changes: status updated to `qa`; added Architecture Notes, Implementation Guardrails, Risks & Tradeoffs, and Architecture Results to support controlled migration.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Backend and web status handling are aligned to canonical `CANCELED` for active flows, with explicit legacy `CANCELLED` normalization gated by compatibility env window in service input and a migration to backfill existing rows. Updated authoritative data-model doc to reflect canonical OfferRequest spelling.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
