---
id: REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE
title: Backend planning feed for organization calendar and timeline workspace
status: released
implementation_scope: backend
source: user-2026-02-11-org-planning-workspace-backend-gap
---

# Summary
Provide a dedicated backend planning feed for organization upcoming occurrences so planning list/calendar views no longer depend on heavy `GET /job-offers/me` payload derivation.

# Scope
- Add an employer-scoped endpoint for active/upcoming planning occurrences.
- Support planning-focused query parameters for range/view/pagination/sort.
- Return occurrence-level planning fields and request counters needed by the planning workspace.
- Keep existing create/update/decision flows unchanged.
- Update API and adapter docs for the new contract.

# Acceptance Criteria
- Endpoint `GET /job-offers/shifts/active/me` exists for employer role and rejects unauthorized roles.
- Endpoint supports query parameters `from`, `to`, `view` (`list|calendar`), `page`, `pageSize`, and `sort`.
- Response ordering is deterministic with explicit tie-break (`startsAt`, then `occurrenceId`).
- Response includes occurrence-level planning fields: `occurrenceId`, `offerId`, `title`, `location`, `startsAt`, `endsAt`, `status`, and counters `pending`, `booked`, `applicant`.
- Planning output remains occurrence-centric and does not introduce recurring-series semantics.

# Definition of Done
- Backend endpoint is implemented with tests for role access, filtering, and deterministic ordering.
- API and web-adapter docs are updated with endpoint path, query contract, response envelope, and counter semantics.
- Organization planning UI can consume the new feed contract without changing request decision endpoints.
- Requirement traceability is preserved in delivery notes.

# Assumptions
- Planning views can migrate incrementally from `GET /job-offers/me` derivation to the dedicated feed.
- `GET /job-offers/upcoming/context/organisation` remains available for dashboard context.

# Constraints
- Stay within documented scope boundaries; no new recurring shift-series behavior.
- Preserve workspace split between planning (`/{locale}/app/organizations/shifts`) and shift management (`/{locale}/app/organizations/jobs`).
- Preserve deterministic and transparent ordering semantics for planning/upcoming data.
- Follow existing employer role/access guard behavior for organization-scoped endpoints.

# Out of Scope
- Frontend route/navigation redesign.
- Participant shift endpoint changes.
- Request decision workflow endpoint changes.

# References
- `docs/web-shifts-planning-flow.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-jobs-requests-flow.md`
- `docs/scope-boundaries.md`
- `docs/api-reference.md`

# PO Results
- Decision: Requirement is aligned with planning-flow and adapter-contract docs (target contract).
- Decision: No direct contradiction with current scope boundaries was found.
- Decision: Requirement is backend-scoped in split routing mode and ready for architecture handoff.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md`, `/home/sebas/git/agents/requirements/arch/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md`

# Architecture Notes
- Keep this endpoint strictly occurrence-centric for organization planning workspace and do not introduce series-level data or aggregation semantics.
- Reuse existing employer auth/guard pattern; endpoint must be employer-only and preserve role redirect/access behavior already documented for organization scope.
- Keep query semantics stable and explicit (`from`, `to`, `view`, `page`, `pageSize`, `sort`) with deterministic ordering and tie-break (`startsAt`, `occurrenceId`).
- Keep counters as read-model fields (`pending`, `booked`, `applicant`) only; do not change request lifecycle endpoints or booking decision contracts.
- Preserve backward compatibility: existing `GET /job-offers/me` consumers may coexist during migration until FE planning view is switched.

# Dev Plan
1. Add `GET /job-offers/shifts/active/me` in backend organization/employer controller with employer-role guard.
2. Define validated query DTO for `from`, `to`, `view`, `page`, `pageSize`, and `sort`, including defaults and bounds.
3. Implement service/repository query returning occurrence-level planning rows with deterministic order (`startsAt`, then `occurrenceId`) and counter fields.
4. Add integration/service tests for role access, query filtering, deterministic ordering, and response shape.
5. Update API docs (`docs/api-reference.md`) and adapter contract docs (`docs/web-api-adapter-contract.md`) to mark this contract as implemented and canonical for planning feed.
6. Add delivery note on migration coexistence with `GET /job-offers/me` and reference FE handoff requirement for switching planning consumption.

# Architecture Results
- Decision: architecture-ready; requirement matches documented planning target contract and scope boundaries.
- Decision: no unresolved contradictions with docs were found; endpoint remains additive and backward-compatible during migration.
- Decision: added implementation guardrails for occurrence-only semantics, deterministic ordering, and no lifecycle endpoint changes.
Changes: `/home/sebas/git/agents/requirements/arch/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md -> /home/sebas/git/agents/requirements/dev/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md`

# Dev Results
- Implemented employer-only `GET /job-offers/shifts/active/me` with validated query contract (`from`, `to`, `view`, `page`, `pageSize`, `sort`) and deterministic ordering (`startsAt`, tie-break `occurrenceId`).
- Added occurrence-centric planning feed read model with counters (`pending`, `booked`, `applicant`) and no recurring-series semantics.
- Added controller and service tests covering role rejection (missing employer context), query validation/filtering, counter mapping, and deterministic ordering args.
- Updated API and adapter docs to publish the endpoint contract, response envelope, and counter semantics as implemented.
- Validated backend with full app test suite: `248` passing tests.
Changes: `app/src/job-offers/job-offers.controller.ts`, `app/src/job-offers/job-offers.service.ts`, `app/src/job-offers/job-offers.controller.test.ts`, `app/src/job-offers/job-offers.organisation-active-shifts.test.ts`, `docs/api-reference.md`, `docs/web-api-adapter-contract.md`, `/home/sebas/git/agents/requirements/qa/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md`

# QA Results
- Acceptance criteria validation: pass. Employer-only `GET /job-offers/shifts/active/me` is implemented with query parsing for `from`, `to`, `view`, `page`, `pageSize`, and `sort` in controller and guarded by `EmployerGuard`.
- Deterministic ordering and response-shape validation: pass. Service ordering is explicit (`startAt`, tie-break `id` as `occurrenceId`) and response items include `occurrenceId`, `offerId`, `title`, `location`, `startsAt`, `endsAt`, `status`, `pending`, `booked`, `applicant`.
- Occurrence-centric scope validation: pass. Feed maps occurrence-level rows only and does not introduce series semantics or lifecycle endpoint changes.
- Test coverage validation: pass. Controller/service tests include missing-employer rejection, query validation/defaults, range filtering, deterministic ordering args, and counter mapping.
- Mandatory baseline checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint`: pass
- `npm --prefix /home/sebas/git/shift-matching/web run build`: pass
- `npm --prefix /home/sebas/git/shift-matching/app run build`: pass
- `npm --prefix /home/sebas/git/shift-matching/app run test`: pass (248/248)
Changes: `/home/sebas/git/agents/requirements/qa/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md` (status updated, QA results added)

# Security Results
- Decision: pass; endpoint access is enforced by `EmployerGuard`, employer scope is enforced in query (`offer.organisationId`), and response mapping remains occurrence-level without cross-tenant data exposure.
- Validation: controller and service planning-feed behavior reviewed, plus `npm --prefix /home/sebas/git/shift-matching/app run test -- src/job-offers/job-offers.controller.test.ts src/job-offers/job-offers.organisation-active-shifts.test.ts` (pass; full suite executed by script, 248/248 passing).
- Requirement-scoped security fixes: none required.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md -> /home/sebas/git/agents/requirements/ux/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md`

# UX Results
- Decision: pass; no requirement-scoped UX/copy blockers were found for this backend-only planning-feed contract.
- UX validation: terminology and contract wording stay consistent with planning workspace docs (occurrence-centric feed, deterministic ordering, and explicit counter semantics) and do not introduce user-facing copy regressions.
- Requirement-scoped UX/copy fixes: none required.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md -> /home/sebas/git/agents/requirements/deploy/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md`

# Deploy Results
- Decision: pass; requirement is deploy-ready for Coolify check mode and remains backend-scoped without frontend route or navigation changes.
- Coolify/deploy checks: `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass), `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run test` (pass; 248 passed, 0 failed).
- Notes: `web` build still logs existing EN `MISSING_MESSAGE` warnings but exits successfully; no additional backend deploy blockers were found for this requirement.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md -> /home/sebas/git/agents/requirements/released/REQ-BE-ORG-PLANNING-FEED-FOR-CALENDAR-AND-TIMELINE.md`
