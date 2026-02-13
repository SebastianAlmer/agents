---
id: REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS
title: Add confirmation for profile requests and fix pending/unlocked visibility mapping
status: released
implementation_scope: fullstack
source: user-2026-02-11-field-feedback-auth-navigation
---

# Summary
Prevent accidental profile-request sends by requiring explicit confirmation, and enforce correct post-send visibility mapping so newly sent profile requests remain `PENDING` and do not appear as unlocked profiles.

# Scope
- Organization-side participant browse/request action UX in `web`.
- Profile-request send flow (`POST /profile-requests`) with explicit pre-dispatch confirmation.
- Post-send state handling in organization lists so requested profiles show pending/requested semantics.
- Backend and frontend consistency for unlock invariants tied to OfferRequest rules.

# Acceptance Criteria
- [ ] Triggering profile-request send from organization browse requires explicit confirmation before request dispatch.
- [ ] Cancelling or closing confirmation does not call `POST /profile-requests` and does not create a new profile request row.
- [ ] On successful send, request state is rendered as `PENDING` with mapped pending label semantics, not as unlocked/linked visibility.
- [ ] Creating a `ProfileRequest` does not create or extend participant-data unlock grant; unlock remains bound to first successful `OfferRequest` for the pair.
- [ ] Organization browse visibility after profile-request send remains pre-unlock for unlock-gated fields unless an OfferRequest-based unlock already exists.
- [ ] Error responses on send are explicit and recoverable, with deterministic retry/cancel action behavior.

# Definition of Done
- [ ] Confirmation gate is implemented for profile-request send actions in the active `web` track.
- [ ] Organization pending/requested UI mapping is verified against `ProfileRequestStatus` and unlock rules.
- [ ] Backend/runtime behavior is verified so profile-request creation never mutates unlock grant state.
- [ ] QA evidence covers at least one happy path, one cancel path, and one error path for profile-request send.

# Assumptions
- Existing endpoints remain in use: `POST /profile-requests`, `GET /profile-requests/organisation`, `GET /participants/profile`, and `GET /participants/profile/linked`.
- Existing status model remains unchanged (`PENDING`, `ACCEPTED`, `DECLINED`) for profile requests.
- Existing unlock grant model is present and can be verified against current OfferRequest-based rules.

# Constraints
- Keep role permissions and decision boundaries unchanged: Employer creates profile requests; Participant accepts or declines.
- Keep unlock rule unchanged: only first successful `OfferRequest` creates pair unlock; `ProfileRequest` does not create or extend unlock.
- Keep `ProfileRequestStatus` lifecycle unchanged (`PENDING`, `ACCEPTED`, `DECLINED`).
- Keep implementation in active frontend track `web` with centralized message-key copy and explicit state handling.
- Keep API contract compatibility for existing profile-request and participant-browse endpoints.

# Out of Scope
- Any change to unlock policy source (OfferRequest-based unlock remains authoritative).
- OfferRequest lifecycle changes.
- New profile-request statuses or new profile-request endpoints.
- New role navigation paths or admin flow changes.

# References
- `docs/participant-data-unlock-matrix.md`
- `docs/web-design-system.md`
- `docs/api-reference.md`
- `docs/decision-rights-and-approval-flow.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `fullstack` in split mode because confirmation UX and unlock-rule correctness span frontend behavior and runtime rule enforcement.
- Decision: Scope is constrained to profile-request send confirmation and pending/unlock visibility correctness without changing request lifecycles.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md`

# Architecture Notes
- Treat profile-request send as a critical action in UI: confirmation is required before `POST /profile-requests`, and cancel/close paths must be side-effect free.
- Keep profile-request state rendering bound to documented status semantics (`PENDING`, `ACCEPTED`, `DECLINED`) so newly sent requests remain pending.
- Preserve unlock invariant from docs: only first successful `OfferRequest` creates pair unlock; `ProfileRequest` must never create or extend unlock grant.
- Keep pending vs unlocked visibility computation explicit by combining request-status data with unlock-grant-aware participant browse data, not by inferring unlock from send success.
- Keep productive copy and error/retry/cancel actions message-key driven with explicit UI states per web governance.

# Dev Plan
1. Audit current organization profile-request send flow and identify where dispatch occurs without explicit confirmation.
2. Add confirmation gate interaction and localized message keys for confirm, cancel, success, and error states.
3. Enforce backend/runtime invariant that profile-request creation path cannot write or mutate unlock-grant state.
4. Correct frontend post-send mapping so sent requests render as `PENDING` and unlock-gated fields remain hidden unless pair unlock already exists.
5. Add deterministic recoverable error handling for send failures (retry and cancel/back actions).
6. Validate with QA evidence for happy path, confirmation-cancel path, send-error path, and unlock-vs-pending visibility checks.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with participant unlock matrix, profile-request status semantics, and decision-right boundaries.
- Decision: `implementation_scope: fullstack` remains correct because UI confirmation and runtime unlock invariants must both be enforced.
- Decision: Added architecture guardrails to prevent capability drift where profile-request send is treated as implicit unlock.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md` -> `/home/sebas/git/agents/requirements/dev/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md`

# Dev Results
- Added explicit pre-dispatch confirmation gate for organization profile-request send actions in `web`, including side-effect-free cancel/close behavior.
- Added deterministic send error handling in the confirmation gate with retry and cancel actions; successful send reloads data and renders pending/requested semantics.
- Corrected organization linked-participant backend mapping so `/participants/profile/linked` no longer treats profile-request rows as linked/unlocked pair grants.
- Added backend regression test that verifies `createProfileRequest` persists `PENDING` request state without mutating trusted pair-unlock persistence.
- Updated contract docs to clarify linked visibility remains pair-unlock scoped and profile-request rows remain request-context only.
- Validation run:
- `node --test --require ts-node/register src/participant-profile/participant-profile.service.test.ts src/participant-profile/participant-profile.controller.test.ts` (pass)
- `node --test --require ts-node/register src/profile-requests/profile-requests.filters.test.ts src/profile-requests/profile-requests.service.test.ts` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
Changes: `web/src/components/responders/organization-responders-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `app/src/participant-profile/participant-profile.service.ts`, `app/src/participant-profile/participant-profile.service.test.ts`, `app/src/profile-requests/profile-requests.service.test.ts`, `docs/api-reference.md`, `docs/participant-data-unlock-matrix.md`, `docs/web-api-adapter-contract.md`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md`

# QA Results
- Decision: pass -> `sec`.
- Verified explicit pre-dispatch confirmation gate for profile-request send in `web/src/components/responders/organization-responders-page.tsx`:
  send action opens confirmation first, and only confirm triggers `createProfileRequest`.
- Verified cancel/close paths are side-effect free:
  dialog close, cancel button, and `Escape` only close local confirmation state and do not dispatch `POST /profile-requests`.
- Verified deterministic recoverable send-error handling:
  failed send displays explicit error in the confirmation dialog, with retry submit label and separate cancel action.
- Verified post-send state mapping remains request-context (`PENDING`) and not linked/unlocked:
  request badge/action states use request status map (`PENDING`, `ACCEPTED`, `DECLINED`) and pending label semantics.
- Verified backend unlock invariant:
  `app/src/profile-requests/profile-requests.service.ts` create path persists `ProfileRequestStatus.PENDING` and does not mutate pair unlock grants.
  Regression test `createProfileRequest persists pending request without mutating pair-unlock grants` passes.
- Verified linked visibility source remains pair-unlock scoped:
  `app/src/participant-profile/participant-profile.service.ts` linked query uses trusted pairing or offer-request history, excluding profile-request-only linkage.
  Related service/controller tests for linked-vs-requested visibility behavior pass.
- Verified docs alignment:
  `docs/participant-data-unlock-matrix.md`, `docs/api-reference.md`, and `docs/web-api-adapter-contract.md` state that `ProfileRequest` does not create/extend pair unlock and `/participants/profile/linked` is pair-unlock scoped.
- Mandatory checks (in order):
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` pass
  - `npm --prefix /home/sebas/git/shift-matching/web run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run test` pass (`267` passed, `0` failed)
Changes: `/home/sebas/git/agents/requirements/qa/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md` -> `/home/sebas/git/agents/requirements/sec/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md`

# Security Results
- Reviewed requirement-scoped security behavior in:
  `web/src/components/responders/organization-responders-page.tsx`,
  `app/src/profile-requests/profile-requests.service.ts`,
  `app/src/participant-profile/participant-profile.service.ts`,
  `app/src/participant-profile/participant-profile.controller.ts`,
  and `app/src/profile-requests/profile-requests.controller.ts`.
- Confirmed profile-request send now requires explicit confirmation before dispatch; cancel/close/escape paths are side-effect free and do not call `POST /profile-requests`.
- Confirmed post-send UI state remains request-context (`PENDING`/`ACCEPTED`/`DECLINED`) and does not treat send success as implicit unlock.
- Confirmed linked/unlocked backend query path excludes profile-request-only linkage (`/participants/profile/linked` is pair-unlock scoped via trusted pairing or offer-request history).
- Confirmed profile-request create path persists `PENDING` state and does not mutate trusted pair-unlock grants.
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` passed, `0` failed)
- Decision: pass. Move requirement to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md` -> `/home/sebas/git/agents/requirements/ux/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md`

# UX Results
- Decision: pass. Move requirement to `deploy`.
- Verified confirmation-gated send UX in `web/src/components/responders/organization-responders-page.tsx` is explicit and side-effect free on cancel/close/escape.
- Verified post-send status presentation remains request-context (`pending/accepted/declined`) and does not present profile-request send as linked/unlocked visibility.
- Requirement-scoped UX/copy fixes applied:
  - added disabled visual affordance on "Send profile request" action while send is in flight (`disabled:cursor-not-allowed disabled:opacity-60`),
  - aligned DE profile-request status labels with documented semantics (`Offen`, `Angenommen`, `Abgelehnt`) instead of raw backend enum tokens,
  - refined confirmation unlock hint copy in DE/EN to remove duplicate technical wording and keep user-facing policy guidance clear.
- Validation run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - JSON parse check for `web/messages/de.json` and `web/messages/en.json` (pass)
Changes: `web/src/components/responders/organization-responders-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/ux/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md` -> `/home/sebas/git/agents/requirements/released/REQ-ORG-PROFILE-REQUEST-CONFIRMATION-AND-PENDING-VISIBILITY-CORRECTNESS.md`
