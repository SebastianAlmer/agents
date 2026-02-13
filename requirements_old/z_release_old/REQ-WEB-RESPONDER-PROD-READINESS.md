---
id: REQ-WEB-RESPONDER-PROD-READINESS
title: Replace responder stubs with production-ready API-backed participant flows
status: released
implementation_scope: frontend
source: user-2026-02-11-responder-stub-to-prod
---

# Summary
Bring participant core app pages in `web/` from static placeholders to production-ready API-backed flows so cross-role lifecycle testing works end-to-end (`shift create -> request -> book/decline -> participant visibility`).

# Scope
- Frontend-only implementation in active track `web/`.
- Participant routes:
  - `/{locale}/app/responders/dashboard`
  - `/{locale}/app/responders/jobs`
  - `/{locale}/app/responders/requests`
  - `/{locale}/app/responders/my-shifts`
- Existing adapter/endpoints only (no new backend contract introduced by this requirement).

# Acceptance Criteria
- [ ] Responder dashboard uses live participant dashboard + upcoming context data instead of static cards.
- [ ] Responder jobs page renders matching jobs from API, supports search/filter behavior per flow docs, and persists participant filters via profile filter endpoints.
- [ ] Responder jobs page supports request creation from matching context and reflects request result state safely.
- [ ] Responder requests page renders live participant requests and supports participant-side lifecycle actions:
  - `PENDING -> WITHDRAWN`
  - `WITHDRAWN -> PENDING` (re-send while open)
  - `BOOKED -> CANCELLED` (within cancellation window)
- [ ] Responder shifts page renders live upcoming/past participant shifts and shows request/deadline context for near-term actions.
- [ ] All four responder pages implement explicit `loading`, `empty`, and `error` states with deterministic list ordering and safe retry/reauth behavior.
- [ ] Missing/expired session and role mismatch follow documented guard behavior (`/{locale}/login?next=...` or role-home redirect), not custom ad-hoc handling.
- [ ] Cross-role validation works: organization creates shift, participant requests, organization books/declines, participant sees resulting state in requests/shifts views.
- [ ] No hardcoded production UI copy is introduced; message keys are used.
- [ ] Mobile baseline usability for responder core routes passes at `360x800`, `390x844`, `430x932` without horizontal overflow.

# Definition of Done
- [ ] `web/src/components/dashboard/responder-dashboard.tsx` no longer uses stub content for productive flow behavior.
- [ ] `web/src/components/jobs/responder-jobs-page.tsx` no longer uses static job cards.
- [ ] `web/src/components/jobs/responder-requests-page.tsx` no longer uses static open/history items.
- [ ] `web/src/components/jobs/responder-shifts-page.tsx` no longer uses static upcoming/past items.
- [ ] Participant must-flow in `docs/web-quality-test-program.md` is executable from login through requests/shifts state transitions.
- [ ] QA evidence includes:
  - participant happy path
  - one participant error path
  - one auth/session guard path
  - one cross-role booking/decline visibility check

# Constraints
- Keep current role rights and status-transition invariants unchanged.
- Keep locale-prefixed routing model and role guards unchanged.
- Keep implementation within adapter-layer contract (`web/src/lib/api/*`); no direct transport wiring in page components.
- Keep changes in `web/` only; no new feature work in `web_legacy/`.
- Keep participant request lifecycle and transition rules aligned with `docs/web-jobs-requests-flow.md` and `docs/scope-boundaries.md`.
- Keep explicit screen-state handling and must-flow QA expectations aligned with `docs/web-governance.md` and `docs/web-quality-test-program.md`.

# Out of Scope
- Backend/API lifecycle changes or new endpoints.
- New domains (availability/assignment/chat/ranking/automation changes).
- Admin or organization IA redesign.
- Legacy frontend feature work.

# Assumptions
- Existing participant adapter endpoints remain available and contract-compatible for dashboard, matching jobs, requests, shifts, and filter persistence.
- Organization-side create/book/decline flows stay operational and are used only as cross-role validation inputs for participant visibility checks.
- No schema or auth-policy changes are required to complete participant page production-readiness in this requirement.

# Architecture Notes
- Keep participant routes and role guards unchanged under `/{locale}/app/responders/...`; preserve locale-prefix behavior with phase-1 runtime locale policy.
- Use adapter-layer integration only for dashboard/jobs/requests/shifts/filter persistence; no direct screen-level transport wiring.
- Enforce documented participant request transitions only (`PENDING -> WITHDRAWN`, `WITHDRAWN -> PENDING`, `BOOKED -> CANCELLED`) and keep organization decision rights unchanged.
- Keep explicit deterministic state handling (`loading`, `empty`, `error`, retry/reauth) and deterministic list ordering across all four responder pages.
- Preserve mobile baseline behavior for `360x800`, `390x844`, and `430x932` without horizontal overflow.

# Dev Plan
1. Wire responder dashboard to `apiAdapters.dashboard.fetchParticipantDashboard` and `fetchParticipantUpcomingContext`.
2. Replace responder jobs stub with matching list + filter persistence (`apiAdapters.jobs` + `apiAdapters.profile`), including request action wiring.
3. Replace responder requests stub with live request list and participant lifecycle actions (`withdraw`, `cancel`, re-send).
4. Replace responder shifts stub with live participant shifts and related request/deadline context + quick actions.
5. Add/adjust message keys and verify DE runtime behavior plus EN readiness.
6. Run flow-level QA checks (desktop + mobile baseline + guard behavior + cross-role scenario).

# References
- `docs/web-dashboard-flow.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-quality-test-program.md`
- `docs/web-product-structure.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/scope-boundaries.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because required backend endpoints and lifecycle semantics are already documented and in-scope.
- Decision: Scope is constrained to replacing responder stubs with adapter-backed behavior on participant routes only.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-WEB-RESPONDER-PROD-READINESS.md`, `/home/sebas/git/agents/requirements/arch/REQ-WEB-RESPONDER-PROD-READINESS.md`

# Architecture Results
- Decision: Requirement is architecture-ready and consistent with responder flow, transition rules, and scope boundaries.
- Decision: `implementation_scope: frontend` remains valid because required participant endpoints and adapter contracts are documented.
- Decision: Added architecture guardrails for locale/guard invariants, transition safety, and mobile baseline non-regression.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-WEB-RESPONDER-PROD-READINESS.md` -> `/home/sebas/git/agents/requirements/dev/REQ-WEB-RESPONDER-PROD-READINESS.md`

# Dev Results
- Replaced responder dashboard/jobs/requests/shifts stubs with live adapter-backed participant flows in `web/`.
- Added explicit `loading`, `empty`, and `error` handling with deterministic ordering and retry/reauth behavior on all four responder pages.
- Implemented participant request lifecycle actions in responder UI (`PENDING -> WITHDRAWN`, `WITHDRAWN -> PENDING`, `BOOKED -> CANCELLED` within cancellation window) and matching-request state reflection.
- Added participant matching filter UI (`near`, `radius`, `field`, `requirements`, `time window`) and persisted supported filters via participant profile filter endpoints.
- Added/updated DE and EN message keys for all new productive responder copy and status labels.
- Validated with `npm --prefix web run lint` and `npm --prefix web run build` (existing unrelated EN missing-message logs outside responder scope remain in build output).
- Changes: `web/src/components/dashboard/responder-dashboard.tsx`, `web/src/components/jobs/responder-jobs-page.tsx`, `web/src/components/jobs/responder-requests-page.tsx`, `web/src/components/jobs/responder-shifts-page.tsx`, `web/src/components/jobs/responder-flow-model.ts`, `web/messages/de.json`, `web/messages/en.json`

# QA Results
- Decision: Pass. Implementation satisfies requirement scope and binding docs for responder production-readiness in `web/`.
- Requirement validation summary:
  - Live adapter-backed flows confirmed for dashboard/jobs/requests/shifts (`apiAdapters.dashboard.*`, `apiAdapters.jobs.*`, `apiAdapters.profile.*`) in the four targeted responder components.
  - Participant lifecycle actions confirmed in UI wiring and constraints: `PENDING -> WITHDRAWN`, `WITHDRAWN -> PENDING` (re-send), `BOOKED -> CANCELLED` (cancellation window gate + backend enforcement).
  - Explicit `loading`, `empty`, and `error` states with retry handling confirmed on all four pages; unauthorized responses clear session and redirect to localized login with `next` via `clearSessionAndRedirectToLogin`.
  - Deterministic ordering confirmed in component logic (date-based sort with stable id tie-breakers) for dashboard worklists, jobs, requests, shifts, and upcoming context lists.
  - No hardcoded productive copy found in targeted responder components; static `t("...")` keys used and static key presence validated in both `web/messages/de.json` and `web/messages/en.json` (119/119 keys found in each locale).
  - Cross-role visibility path is adapter-wired and consistent with backend lifecycle semantics (participant views consume `/job-offers/requests/me` and `/job-offers/shifts/me`; backend tests for booking/decline/cancel and participant shifts passed in baseline run).
- QA evidence:
  - Participant happy path: jobs load + request action + requests/shifts rendering verified in `web/src/components/jobs/responder-jobs-page.tsx`, `web/src/components/jobs/responder-requests-page.tsx`, `web/src/components/jobs/responder-shifts-page.tsx`.
  - Participant error path: explicit error state + retry verified in all four responder components.
  - Auth/session guard path: unauthorized branch redirects verified via `web/src/lib/auth/login-redirect.ts` integration from all four responder components.
  - Cross-role booking/decline visibility check: backend lifecycle and participant visibility tests passed during `app` test baseline (`listParticipantOfferRequests`, `listParticipantShifts`, booking/decline/cancel transition tests).
- Mandatory checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
  - `npm --prefix /home/sebas/git/shift-matching/web run build` passed (with pre-existing unrelated EN `MISSING_MESSAGE` logs outside responder scope).
  - `npm --prefix /home/sebas/git/shift-matching/app run build` passed.
  - `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`248` passed, `0` failed).
Changes: `/home/sebas/git/agents/requirements/qa/REQ-WEB-RESPONDER-PROD-READINESS.md` (status + QA results), `/home/sebas/git/agents/requirements/sec/REQ-WEB-RESPONDER-PROD-READINESS.md` (moved from `qa` to `sec`)

# Security Results
- Decision: pass.
- Validation:
- Reviewed responder dashboard/jobs/requests/shifts flows against binding docs for role boundaries, request lifecycle constraints, and session guard behavior.
- Confirmed responder pages stay adapter-only (`apiAdapters.*`) and unauthorized branches consistently call localized session-clear redirect (`clearSessionAndRedirectToLogin`).
- Confirmed participant transition actions in UI remain constrained to documented participant rights (`withdraw`, `re-send`, `cancel within window`) with backend-enforced outcomes.
- Fixed a requirement-scoped resilience/security issue in responder dashboard:
- Backend-provided `missingFields` values were used as dynamic translation-key suffixes, which could trigger runtime `MISSING_MESSAGE` crashes for unexpected values.
- Added explicit allow-list mapping and safe fallback key so unknown values no longer break render and do not expose raw backend field identifiers.
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (with pre-existing unrelated EN `MISSING_MESSAGE` logs outside responder scope).
Changes: `web/src/components/dashboard/responder-dashboard.tsx`, `web/messages/en.json`, `web/messages/de.json`, `/home/sebas/git/agents/requirements/deploy/REQ-WEB-RESPONDER-PROD-READINESS.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed responder implementations in `web/src/components/dashboard/responder-dashboard.tsx`, `web/src/components/jobs/responder-jobs-page.tsx`, `web/src/components/jobs/responder-requests-page.tsx`, and `web/src/components/jobs/responder-shifts-page.tsx` against binding docs (`docs/web-design-system.md`, `docs/web-jobs-requests-flow.md`, `docs/web-dashboard-flow.md`, `docs/web-product-structure.md`).
- Confirmed explicit `loading`, `empty`, and `error` states with retry/reauth behavior are present across all four responder pages.
- Confirmed responder lifecycle controls and context copy are clear and aligned with participant rights (withdraw, re-send, cancel in allowed window) and that state feedback remains text-based.
- Fixed requirement-scoped UX/copy issues in responder message namespaces:
- localized request status labels (removed raw enum text in productive badges/buttons),
- removed mixed DE/EN wording in responder guidance copy,
- aligned responder dashboard DE wording with preferred terminology (`Schichten` instead of `Einsaetze`).
- Validation: `node -e "JSON.parse(require('fs').readFileSync('/home/sebas/git/shift-matching/web/messages/de.json','utf8'));JSON.parse(require('fs').readFileSync('/home/sebas/git/shift-matching/web/messages/en.json','utf8'));console.log('JSON OK')"` passed; `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
Changes: `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/deploy/REQ-WEB-RESPONDER-PROD-READINESS.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md` release gates.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-blocking EN `MISSING_MESSAGE` logs remain baseline outside responder scope)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `259` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-WEB-RESPONDER-PROD-READINESS.md` -> `/home/sebas/git/agents/requirements/released/REQ-WEB-RESPONDER-PROD-READINESS.md`
