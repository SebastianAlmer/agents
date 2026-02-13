---
id: REQ-NEW-BE-SHIFT-DOMAIN-STATUS-AND-PROFILANFRAGE-ALIGNMENT
title: Align backend domain terms, shift status semantics, and profile-request intent handling
status: to-clarify
source: user-2026-02-12-shift-domain-clarification
implementation_scope: backend
review_risk: medium
review_scope: qa_only
---

# Goal
Make backend/domain behavior consistent with shift-first terminology and deterministic shift/request state semantics while preserving backward-compatible runtime API paths.

# Scope
- Backend service and persistence behavior in `app/` for shift lifecycle, shift applications, and profile requests.
- No frontend behavior changes.
- No authorization model changes.

# Task Outline
- Keep `job-offers` endpoint names and role guards intact while using canonical internal terminology (`ShiftOccurrence`, `OfferRequest`, `ProfileRequest`) in behavior and docs.
- Confirm/correct shift status derivation to the bounded set:
  - `OPEN`, `HAS_APPLICANTS`, `ASSIGNED`, `CLOSED_EMPTY`, `WITHDRAWN`, `CANCELED`.
- Keep `OfferRequest` status handling aligned (`PENDING`, `BOOKED`, `DECLINED`, `WITHDRAWN`, `CANCELED`) with existing transition safety.
- Preserve single-booking invariant per occurrence and deterministic decline behavior for sibling requests.
- Validate profile-request handling supports both profile visibility requests and optional targeted requests in shift context per documented domain intent.
- Add/adjust persistence constraints and migration-safe changes only where required to support the deterministic state behavior.

# Acceptance Criteria
- Shift/application state transitions are deterministic and conform to the status semantics defined in `data-model-reference.md` and `scope-boundaries.md`.
- `ASSIGNED` cannot co-exist with pending active sibling requests; single-booking and deterministic auto-decline behavior remain enforced.
- Backward-compatible `/job-offers/*` endpoints continue to function unchanged for current callers.
- Profile requests continue to be a separate flow from shift applications and support visibility/targeted usage without breaking existing profile-request endpoints.
- `CLOSED_EMPTY` is applied consistently for unfilled closed/expired shifts and does not overlap with `ASSIGNED`.

# Out of Scope
- Frontend route or UI copy changes.
- New business domain (e.g., assignment/subscription or recurring-shift product expansion).
- Changes to auth/role permission models.

# Constraints
- Canonical domain is shifts, with `JobOffer`/`OfferRequest` treated as technical legacy terms.
- Schichtserien/Recurring-Laufzeitartefakte are out of active scope and only legacy.
- Keep deterministic behavior and explicit error handling for critical flows per `docs/architecture.md` and `docs/codex-instruction.md`.
- API naming compatibility for existing role routes must stay stable during rollout.

# References
- `docs/data-model-reference.md`
- `docs/scope-boundaries.md`
- `docs/glossary.md`
- `docs/roles-and-functions.md`
- `docs/architecture.md`

# Architecture Notes
- Enforce domain state naming consistently in runtime behavior while preserving API-facing legacy paths and role contracts (`docs/codex-instruction.md` priority order).
- Keep status semantics aligned to `data-model-reference.md` canonical enums to prevent drift between persistence, service logic, and UI mapping.
- Preserve strict separation of `OfferRequest` (shift booking flow) and `ProfileRequest` (visibility/request flow), with optional `ProfileRequest.occurrenceId` kept as context only.
- Maintain existing transition invariants (`ASSIGNED`/auto-decline and one booking per occurrence) as hard constraints in state mutation logic.
- Keep compatibility as a primary requirement: legacy `/job-offers/*` callers must receive stable payload shapes and error behavior.

# Risks & Tradeoffs
- Adding migration-safe constraints improves consistency but can temporarily block legacy test fixtures if backward-incompatible seed data exists.

# Implementation Guardrails
- Scope persistence/migration changes to additive or conservative updates that can be rolled back without breaking existing endpoint contracts.
- If migration-safe constraints are added, make them idempotent and covered by deterministic migration/test scripts before rollout.
- Keep profile-request API compatibility by treating `occurrenceId` as optional input; existing `profileId`-only callers must remain valid.
- Validate transitions through existing transition checks and explicit fail-fast error handling to avoid silent state corrections.

# Architecture Results
- No blocking documentation conflict found; requirement maps directly to `data-model-reference.md` + `scope-boundaries.md` invariants.
- Scope stays backend-only state semantics and terminology alignment, with unchanged public endpoint set.
- Changes: moved `/home/sebas/git/agents/requirements/selected/REQ-NEW-BE-SHIFT-DOMAIN-STATUS-AND-PROFILANFRAGE-ALIGNMENT.md` to `/home/sebas/git/agents/requirements/dev/REQ-NEW-BE-SHIFT-DOMAIN-STATUS-AND-PROFILANFRAGE-ALIGNMENT.md`, set `status: dev`, and clarified optional `occurrenceId` compatibility.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: clarified
- Summary: Previous documentation mismatch on cancellation spelling and recurring-shift enum references has been resolved in docs; requirement is now implementation-ready.
- Findings: No remaining docs conflict for canonical lifecycle status naming (`CANCELED`).

## ReqEng Results
- Clarification resolved: canonical cancellation status spelling in docs is now `CANCELED` (single term).
- Clarification resolved: recurring-shift enum references were removed from active data-model lifecycle docs.
- Backend scope remains valid with unchanged `/job-offers/*` compatibility.
- Requirement was clear and intended for implementation, therefore it was routed to `selected` before architecture review.

Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-BE-SHIFT-DOMAIN-STATUS-AND-PROFILANFRAGE-ALIGNMENT.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-BE-SHIFT-DOMAIN-STATUS-AND-PROFILANFRAGE-ALIGNMENT.md`
