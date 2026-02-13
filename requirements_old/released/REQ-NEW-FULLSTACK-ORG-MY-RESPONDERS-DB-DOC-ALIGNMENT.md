---
id: REQ-NEW-FULLSTACK-ORG-MY-RESPONDERS-DB-DOC-ALIGNMENT
title: Align org my-responders DB behavior and documentation
status: released
source: user-2026-02-12-org-my-responders-db-doc-clarification
implementation_scope: fullstack
review_risk: medium
review_scope: qa_ux
---

# Goal
Align organization responder views (`Meine Einsatzkräfte` and `Einsatzkräfte suchen`) with current data model behavior, persistence scope, and documentation so implementation is consistent and auditable.

# Scope
- Backend service logic for responder aggregates and contract indicators used by organization pages.
- API contract wording for responder list/filtering behavior and payload expectations.
- Documentation updates for terminology, role wording, and derived data interpretation.

# Task Outline
- Confirm that responder list and related aggregates can be delivered via existing entities (`OfferRequest`, `ShiftOccurrence`, `JobOffer`, `Contract`) without schema expansion.
- Define the required derived fields for `Meine Einsatzkräfte` (e.g., booking metadata, active-contract marker) and tie each to current runtime behavior.
- Validate query performance for organization-scoped aggregate/filter paths and gate index additions on measured need.
- Keep contract activity semantics unchanged and document the active-rule explicitly.
- Update documentation so it reflects implemented behavior, including:
  - API contract for responder aggregation/filtering
  - employer capabilities for search vs managed responders
  - data-model wording for derived responder aggregates

# Acceptance Criteria
- No new business tables, enums, or lifecycle states are introduced for this responder flow.
- Documented responder behavior references only existing runtime entities and relationships.
- Aggregate query performance is tested on representative data before production-facing rollout.
- Additional indexes are only added when performance validation shows sustained benefit.
- Docs updates are complete and use existing terminology without introducing forbidden concepts.

# Out of Scope
- Changing contract lifecycle model or Offer/Request state transitions.
- Introducing new scoring, ranking, or ranking-like ranking visibility.
- Adding role capabilities outside Employer/Participant boundaries.

# Constraints
- `Shift` is the product domain term; avoid `Job`/`Offer` in user-facing context.
- Employer permissions remain defined by current role functions.
- Data model and documentation should remain aligned with runtime behavior; no speculative flows.

# References
- `docs/data-model-reference.md`
- `docs/api-reference.md`
- `docs/roles-and-functions.md`
- `docs/scope-boundaries.md`
- `docs/glossary.md`

## Architecture Notes
- Keep aggregation to existing entities only (`OfferRequest`, `ShiftOccurrence`, `Contract`, `ParticipantProfile`, `OrganisationProfile`); no schema additions in this flow.
- Define responder payload fields as deterministic derivations from runtime state, not UI-only heuristics.
- Contract activity marker for `activeContract` must follow the same effective rule currently used when deciding whether a new contract is generated on booking.
- Update API and docs with legacy-runtime endpoint terminology where still needed, while keeping UI wording in product terms.
- Keep docs updates in one pass with implementation to prevent API/model drift.

## Implementation Guardrails
- Place organization-responder aggregate queries behind one service boundary so `Meine Einsatzkräfte` and `Einsatzkräfte suchen` consume the same API contract response.
- Filter semantics should be explicit in API and docs: scope by current employer + `BOOKED` minimum, plus `contractStatus` options.
- Performance validation must include aggregate workload before adding new indexes; avoid speculative migrations.

## Risks & Tradeoffs
- A single shared aggregate endpoint reduces inconsistency risk but may require careful pagination/index strategy as payload shape changes.

## Architecture Results
- No blocking conflicts with documented role boundaries, scope, or web governance constraints.
- No conflicts detected with entity model references in `docs/data-model-reference.md`.
- Changes: moved requirement to implementation-ready with explicit fullstack contract boundaries, deterministic aggregate definitions, and docs-sync requirements.

## PO Results
- Decision: no direct docs contradiction found; requirement is implementation-ready as a fullstack task.
- Decision: set `status=dev`, keep fullstack scope, and keep risk medium with focused QA review.

Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-FULLSTACK-ORG-MY-RESPONDERS-DB-DOC-ALIGNMENT.md -> /home/sebas/git/agents/requirements/dev/REQ-NEW-FULLSTACK-ORG-MY-RESPONDERS-DB-DOC-ALIGNMENT.md`

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Backend adds new employer endpoint and service path for `GET /participants/profile/my-responders` using existing entities only, with deterministic booking aggregates and active-contract filtering documented in API and data-model docs. Frontend consumes this contract via `OrganizationLinkedParticipantsPage`, and no schema changes or enum/state additions were introduced for this flow.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
