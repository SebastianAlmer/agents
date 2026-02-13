---
id: REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY
title: Align org open-request counts with actionable request inbox data
status: released
implementation_scope: fullstack
source: user-2026-02-11-field-feedback-auth-navigation
---

# Summary
Resolve inconsistencies where the organization dashboard shows open requests but the offer-requests workspace does not expose matching actionable rows. Ensure one coherent request truth between dashboard KPI/worklist counts and inbox rendering.

# Scope
- Organization dashboard open-request KPI/worklist counter semantics.
- Offer-requests workspace list derivation and actionability semantics for pending decisions.
- Shared query/filter contract or deterministic reconciliation strategy between dashboard and inbox views.
- Backend/API alignment for deterministic organization request-inbox retrieval when current derived contract is insufficient.

# Acceptance Criteria
- [ ] Organization dashboard `open requests` count and organization offer-requests inbox count are computed from the same request-state definition (`PENDING` decisions) for the same organization scope.
- [ ] If dashboard reports open requests greater than zero, `/{locale}/app/organizations/offer-requests` shows corresponding actionable rows or explicit reconciliation messaging tied to active filters/time scope.
- [ ] Offer-requests empty state is rendered only when backend data for active filters is empty, not when a mapping/derivation error occurs.
- [ ] Counter/list mismatch paths are prevented by a shared query contract or by explicit reconciliation rules that are deterministic and testable.
- [ ] Organization request decision invariants remain unchanged (`PENDING -> BOOKED|DECLINED`) and no non-actionable states are counted as open decisions.
- [ ] Error handling for dashboard/inbox data failures is explicit and user-safe, with retry/reload action where recoverable.

# Definition of Done
- [ ] Dashboard and offer-requests surfaces use aligned count/list semantics for open organization request decisions.
- [ ] API/adapter contract for organization request-inbox derivation is documented and implemented consistently (existing derived path or dedicated endpoint).
- [ ] QA evidence includes one happy path and one mismatch-prevention/error path covering dashboard-to-inbox navigation and count parity.
- [ ] Regression checks confirm no change to role permissions, request lifecycle transitions, or deterministic ordering behavior.

# Assumptions
- Existing organization dashboard endpoint (`GET /organisations/dashboard/me`) remains in use for KPI/worklist summary.
- Organization request-inbox data is currently derived from `GET /job-offers/me` unless a dedicated endpoint is introduced.
- Dashboard and inbox can share a common "open request" semantic without introducing new OfferRequest status values.

# Constraints
- Keep organization request decision lifecycle unchanged (`PENDING -> BOOKED|DECLINED`) and preserve documented request invariants.
- Keep organization dashboard purpose, KPI/worklist intent, and action mapping aligned with `docs/web-dashboard-flow.md`.
- Keep organization offer-request decision surface on canonical route `/{locale}/app/organizations/offer-requests`.
- Keep deterministic ordering and role-visibility behavior across dashboard and request surfaces.
- Implement in active frontend track `web` and preserve locale-prefixed route behavior with centralized message-key copy.
- If a dedicated organization request-inbox endpoint is introduced, keep it aligned with backlog direction and update API/adapter contract documentation accordingly.

# Out of Scope
- Changes to participant or admin dashboard semantics.
- New request lifecycle states or policy changes for booking/decline decisions.
- Changes to unrelated planning, contracts, or profile flows.
- Ranking/scoring or hidden prioritization logic in dashboard/worklists.

# References
- `docs/web-dashboard-flow.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-api-adapter-contract.md`
- `docs/api-reference.md`
- `docs/web-quality-test-program.md`
- `docs/web-governance.md`
- `docs/scope-boundaries.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `fullstack` in split mode because count/list consistency can require both frontend mapping alignment and backend inbox-contract support.
- Decision: Scope is constrained to dashboard/inbox consistency without changing request lifecycle authority rules.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md`

# Architecture Notes
- Keep one authoritative "open request" semantic for both surfaces: organization-decision `OfferRequestStatus.PENDING` only, excluding non-actionable states.
- Preserve canonical decision surface at `/{locale}/app/organizations/offer-requests`; dashboard open-request actions must resolve there with deterministic parity expectations.
- If inbox remains derived from `GET /job-offers/me`, reconciliation/filter rules must be explicit and testable; if dedicated endpoint is added, align with `BAPI-003` direction and update adapter contract docs.
- Empty-state rendering must distinguish true empty backend results from mapping/derivation failures; mapping failures are error/reconciliation states, not empty.
- Keep request lifecycle invariants and role decision boundaries unchanged (`PENDING -> BOOKED|DECLINED`, no permission expansion).

# Dev Plan
1. Define a shared open-request semantic contract used by dashboard KPI/worklist and offer-requests inbox computations.
2. Audit current dashboard and inbox data paths to identify mismatch sources (filter scope, occurrence expansion, stale aggregation, or mapping drift).
3. Implement deterministic parity logic for count vs inbox rows, including reconciliation messaging when active filters legitimately reduce visible rows.
4. Implement explicit state handling for empty vs derivation/error conditions with recoverable retry/reload behavior.
5. If required for deterministic parity/performance, add dedicated organization request-inbox endpoint and align API/adapter documentation.
6. Validate with QA paths covering happy parity, mismatch-prevention/reconciliation, and recoverable error handling across dashboard-to-inbox navigation.

# Architecture Results
- Decision: Requirement is architecture-ready and aligns with dashboard action mapping, request lifecycle rules, and quality-state expectations.
- Decision: `implementation_scope: fullstack` remains correct because parity can require both frontend semantic alignment and backend inbox-contract support.
- Decision: Added guardrails for authoritative count semantics, empty-vs-error distinction, and deterministic reconciliation behavior.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md` -> `/home/sebas/git/agents/requirements/dev/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md`

# Dev Results
- Updated organization dashboard backend counting so `openRequests` now represents actionable `PENDING` request decisions (sum of pending decisions), while preserving deterministic occurrence worklist ordering.
- Updated organization offer-requests inbox to use explicit `loading|ready|error` state handling with recoverable retry on load failures; empty states now render only on successful empty data.
- Aligned inbox pending-row derivation to actionable scope (`OPEN|HAS_APPLICANTS` and `endAt >= now`) and added deterministic reconciliation messaging for pending rows excluded from decision scope.
- Kept offer-request lifecycle invariants unchanged (`PENDING -> BOOKED|DECLINED`) and existing decision actions unchanged.
- Updated API/adapter/dashboard docs to reflect the shared open-request semantic contract between dashboard KPI and offer-request inbox derivation.
- Validation run:
- `cd app && node --test --require ts-node/register src/organisation-dashboard/organisation-dashboard.service.test.ts src/organisation-dashboard/organisation-dashboard.controller.test.ts` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
Changes: `app/src/organisation-dashboard/organisation-dashboard.service.ts`, `app/src/organisation-dashboard/organisation-dashboard.service.test.ts`, `web/src/components/jobs/organization-offer-requests-page.tsx`, `web/messages/en.json`, `web/messages/de.json`, `docs/web-dashboard-flow.md`, `docs/web-jobs-requests-flow.md`, `docs/web-api-adapter-contract.md`, `docs/api-reference.md`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md`

# QA Results
- Decision: pass -> `sec`.
- Verified shared open-request semantics across dashboard and inbox:
  - Backend dashboard `stats.openRequests` counts actionable `OfferRequestStatus.PENDING` decisions only for `OPEN|HAS_APPLICANTS` occurrences with `endAt >= now` in `app/src/organisation-dashboard/organisation-dashboard.service.ts`.
  - Offer-requests inbox derives actionable pending rows with the same status/time scope in `web/src/components/jobs/organization-offer-requests-page.tsx`.
- Verified explicit state handling:
  - Inbox uses deterministic `loading|ready|error` states with recoverable retry for load failures.
  - Empty pending state is shown only in successful ready state, not on fetch errors.
- QA fix applied (requirement-scoped):
  - Reconciliation message now renders whenever `pendingOutOfScopeCount > 0`, including the case where `pendingRows.length === 0`.
  - This prevents mismatch windows from showing a plain empty state without explicit reconciliation context.
- Verified request decision lifecycle invariants remain unchanged (`PENDING -> BOOKED|DECLINED`) and no permission/role behavior regressions were introduced.
- Verified docs alignment with implemented contract in:
  - `docs/web-dashboard-flow.md`
  - `docs/web-jobs-requests-flow.md`
  - `docs/web-api-adapter-contract.md`
  - `docs/api-reference.md`
- Mandatory checks (in order):
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` pass
  - `npm --prefix /home/sebas/git/shift-matching/web run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run test` pass (`267` passed, `0` failed)
Changes: `web/src/components/jobs/organization-offer-requests-page.tsx`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md` -> `/home/sebas/git/agents/requirements/sec/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md`

# Security Results
- Decision: pass -> `ux`.
- Reviewed security-relevant implementation paths for this requirement:
  - `app/src/organisation-dashboard/organisation-dashboard.service.ts`
  - `app/src/organisation-dashboard/organisation-dashboard.controller.ts`
  - `app/src/job-offers/job-offers.service.ts`
  - `app/src/job-offers/job-offers.controller.ts`
  - `app/src/auth/employer.guard.ts`
  - `web/src/components/jobs/organization-offer-requests-page.tsx`
  - `web/src/lib/api/adapters/jobs.ts`
  - `web/src/lib/api/client.ts`
  - `web/src/lib/api/errors.ts`
- Verified org scoping and authorization remain enforced (`EmployerGuard` + `organisationId` ownership checks) for dashboard and request decision APIs.
- Verified no new request lifecycle bypass paths were introduced; decision invariants remain `PENDING -> BOOKED|DECLINED`.
- Verified UI rendering uses explicit `loading|ready|error` states and does not treat derivation/error paths as empty data.
- Security regression checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` pass
  - `npm --prefix /home/sebas/git/shift-matching/web run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run test` pass (`269` passed, `0` failed)
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md` -> `/home/sebas/git/agents/requirements/ux/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md`

# UX Results
- Decision: pass. Move requirement to `deploy`.
- Verified organization dashboard open-request intent and organization offer-requests inbox rendering remain aligned to actionable pending-decision semantics, with explicit reconciliation text when pending rows are outside actionable scope.
- Verified inbox state handling keeps empty vs error separated (`loading|ready|error`) and retains retry behavior for recoverable failures.
- Requirement-scoped UX/copy fixes applied in offer-requests inbox:
  - replaced raw request status enum tokens in recent-history rows with localized status labels,
  - aligned pending badge terminology to user-facing status copy,
  - removed orphan `pendingLabel` keys after status-label mapping update.
- Validation run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - i18n key coverage check for `organization-offer-requests-page` (pass)
  - JSON validation for `web/messages/de.json` and `web/messages/en.json` (pass)
Changes: `web/src/components/jobs/organization-offer-requests-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/ux/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md` -> `/home/sebas/git/agents/requirements/released/REQ-ORG-REQUEST-INBOX-AND-DASHBOARD-COUNT-CONSISTENCY.md`
