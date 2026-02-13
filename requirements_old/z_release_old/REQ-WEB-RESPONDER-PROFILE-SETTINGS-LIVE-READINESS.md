---
id: REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS
title: Replace responder profile and settings stubs with production-ready live flows
status: released
implementation_scope: frontend
source: user-2026-02-11-responder-prod-readiness-followup
---

# Summary
Bring responder `profile` and `settings` pages in `web/` from stub UI to production-ready API-backed behavior so participant must-flow coverage is complete.

# Scope
- Frontend-only implementation in active track `web/`.
- Participant routes:
  - `/{locale}/app/responders/profile`
  - `/{locale}/app/responders/settings`
- Existing adapter/endpoints only:
  - `apiAdapters.profile.fetchParticipantProfile`
  - `apiAdapters.profile.saveParticipantProfile`
  - `apiAdapters.profile.uploadParticipantAvatar`
  - `apiAdapters.profile.fetchNotificationSettings`
  - `apiAdapters.profile.updateNotificationSettings`
- Keep language-preference readiness presentation aligned with current phase policy.

# Acceptance Criteria
- [ ] Responder profile page renders and edits live participant profile data instead of static defaults.
- [ ] Required participant fields from docs are validated and user feedback is explicit on save success/failure.
- [ ] Avatar upload uses existing profile adapter flow and reflects current avatar state.
- [ ] Responder settings page loads live notification settings and allows persistence of selected notification frequency.
- [ ] Language preference block remains aligned with current phase policy (`de` active, `en` prepared), without regressing existing routing behavior.
- [ ] Both pages implement explicit `loading`, `empty` (where applicable), `error`, and `success/notice` states.
- [ ] Missing/expired session and unauthorized responses follow documented guard behavior.
- [ ] No hardcoded production copy is introduced; message keys are used.

# Definition of Done
- [ ] `web/src/components/profile/responder-profile-page.tsx` is API-backed and save-capable.
- [ ] `web/src/components/settings/responder-settings-page.tsx` is API-backed and save-capable.
- [ ] Participant must-flow in `docs/web-quality-test-program.md` is executable including `profile/settings` steps.
- [ ] QA evidence includes one happy path and one error/auth guard path per page.

# Constraints
- Keep participant role rights, lifecycle invariants, and route model unchanged.
- Keep implementation in `web/` only.
- Keep adapter-layer contract usage; no direct transport calls in page components.
- Keep required participant profile field model and language-readiness policy aligned with `docs/web-profile-settings-flow.md`.
- Keep locale-prefixed guard and redirect behavior aligned with `docs/web-auth-flows.md` and `docs/web-product-structure.md`.
- Keep screen-state handling and message-governance behavior aligned with `docs/web-governance.md` and `docs/web-quality-test-program.md`.

# Out of Scope
- Backend schema or endpoint redesign.
- Organization/admin profile/settings redesign.
- New language enablement decisions beyond existing phase policy.

# Assumptions
- Existing profile/settings adapter endpoints remain available and contract-compatible for profile load/save, avatar upload, and notification settings updates.
- Responder profile/settings work is frontend-only and does not require new backend fields for current phase scope.
- DE remains the active runtime locale while EN remains prepared via existing routing/messages setup.

# References
- `docs/web-profile-settings-flow.md`
- `docs/web-quality-test-program.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-product-structure.md`
- `docs/web-api-adapter-contract.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because required endpoints and adapter contracts are already documented and in scope.
- Decision: Scope is constrained to responder `profile` and `settings` live readiness without backend contract changes.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md`, `/home/sebas/git/agents/requirements/arch/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md`

# Architecture Notes
- Keep responder profile and responder settings boundaries aligned with docs: profile owns participant master data, settings owns notification and language-preference controls.
- Enforce required participant profile field validation deterministically before submit, with explicit inline field/form guidance for correction.
- Keep save-state handling explicit and recoverable (`loading`, success notice, classified error with retry/correction) using adapter error mapping conventions.
- Keep locale readiness behavior unchanged (`de` runtime-active, `en` prepared) and ensure no hardcoded productive copy is introduced.
- Keep auth/session guard behavior and locale-prefixed route handling unchanged from documented rules.

# Dev Plan
1. Audit `responder-profile-page` and `responder-settings-page` state models against required participant fields and settings ownership rules.
2. Implement deterministic client validation for required participant profile fields and map backend validation errors to actionable form states.
3. Implement explicit save-success feedback and post-save state synchronization for profile and notification settings updates.
4. Implement recoverable failure paths (retry and correction guidance) for profile save, avatar upload, and settings save actions.
5. Verify settings page remains limited to notification/language behavior and does not introduce participant master-data editing controls.
6. Validate must-flow and guard-path QA coverage for profile/settings under locale-prefixed routes with message-key-only productive copy.

# Architecture Results
- Decision: Requirement is architecture-ready and aligns with profile/settings flow ownership, adapter contracts, and frontend governance quality gates.
- Decision: `implementation_scope: frontend` remains correct because this is UI state/validation/feedback hardening in existing responder routes.
- Decision: Added guardrails for deterministic validation-feedback behavior and strict profile-vs-settings scope boundaries.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md` -> `/home/sebas/git/agents/requirements/dev/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md`

# Dev Results
- Hardened responder profile save flow with deterministic correction/retry guidance: client validation hints, server validation-to-field mapping (`details.field/reason`), and explicit retry action for retryable save failures.
- Hardened avatar upload failure handling with explicit recovery guidance while keeping existing adapter-based upload and live avatar-state reflection.
- Hardened responder settings save flow with explicit retry/correction guidance for save failures while preserving notification + language-preference scope.
- Preserved documented auth guard behavior (`missing session` and `unauthorized` redirect path) and kept locale readiness policy unchanged (`de` active, `en` prepared).
- Kept productive copy message-key driven and added only localized keys required for new recovery/validation notices.
- Verified frontend checks pass: `npm --prefix web run lint` and `npm --prefix web run build`.
Changes: `web/src/components/profile/responder-profile-page.tsx`, `web/src/components/settings/responder-settings-page.tsx`, `web/messages/en.json`, `web/messages/de.json`

# QA Results
- Decision: pass -> `sec`.
- Requirement and docs validation passed for scoped responder routes/components:
  - `/{locale}/app/responders/profile` -> `web/src/components/profile/responder-profile-page.tsx`
  - `/{locale}/app/responders/settings` -> `web/src/components/settings/responder-settings-page.tsx`
- Profile page evidence:
  - Happy path: live profile load via `apiAdapters.profile.fetchParticipantProfile`, required-field edit/save via `saveParticipantProfile`, success notice, and updated profile/avatar state rendering.
  - Negative/auth path: missing session and unauthorized responses redirect through documented login guard; load error and save error states expose explicit message and deterministic retry/correction guidance.
- Avatar evidence:
  - Happy path: upload uses `apiAdapters.profile.uploadParticipantAvatar` and refreshes rendered avatar from returned profile payload.
  - Negative path: upload failure presents explicit error plus retry/correction hint.
- Settings page evidence:
  - Happy path: notification frequency loads from `fetchNotificationSettings` and persists with `updateNotificationSettings`, with explicit success notice.
  - Negative/auth path: missing session and unauthorized responses follow redirect guard; load error shows retry action; save error shows retry/correction guidance and retry action when retryable.
- Locale readiness alignment fix applied during QA:
  - Found mismatch to phase policy (`de` active, `en` prepared) in `web/src/i18n/routing.ts`.
  - Updated `enabledLocales` to `["de"]` to align runtime language availability and language-preference presentation with binding docs.
- Message governance:
  - No hardcoded productive copy introduced on scoped pages; user-facing copy remains message-key based in `web/messages/en.json` and `web/messages/de.json`.
- Mandatory checks (in order):
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` pass
  - `npm --prefix /home/sebas/git/shift-matching/web run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run test` pass (`267` passed, `0` failed)
Changes: `web/src/i18n/routing.ts`, `/home/sebas/git/agents/requirements/qa/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md` -> `/home/sebas/git/agents/requirements/sec/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md`

# Security Results
- Decision: pass -> `ux`.
- Reviewed binding docs and scoped implementation:
  - `docs/web-profile-settings-flow.md`
  - `docs/web-auth-flows.md`
  - `web/src/components/profile/responder-profile-page.tsx`
  - `web/src/components/settings/responder-settings-page.tsx`
  - `web/src/lib/api/adapters/profile.ts`
  - `web/src/lib/auth/login-redirect.ts`
- Fixed requirement-scoped security/integrity issue in profile save flow:
  - Prevented submit while `loadState` is `loading` or `error` to avoid saving fallback/default payload values after a failed profile fetch.
  - Tightened form disabling to allow edit/save only in `ready` and `empty` states.
- Security verification:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` pass
  - `npm --prefix /home/sebas/git/shift-matching/web run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run test` pass (`269` passed, `0` failed)
Changes: `web/src/components/profile/responder-profile-page.tsx`, `/home/sebas/git/agents/requirements/sec/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md` -> `/home/sebas/git/agents/requirements/ux/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md`

# UX Results
- Decision: pass. Move requirement to `deploy`.
- Reviewed requirement-scoped responder profile/settings UX against binding docs:
  `docs/web-profile-settings-flow.md`, `docs/web-auth-flows.md`,
  `docs/web-governance.md`, `docs/web-quality-test-program.md`,
  and `docs/web-api-adapter-contract.md`.
- Confirmed required participant-field validation, live profile/settings persistence, avatar upload behavior, and explicit loading/empty/error/success state handling remain compliant.
- Requirement-scoped UX/copy fix applied:
  removed raw backend-detail interpolation from responder profile/settings error notices and switched to deterministic message-key failure copy with existing retry/correction guidance.
- Removed now-unused detail interpolation keys in affected responder namespaces to keep active message namespaces aligned with live component usage.
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
Changes: `web/src/components/profile/responder-profile-page.tsx`, `web/src/components/settings/responder-settings-page.tsx`, `web/messages/en.json`, `web/messages/de.json`, `/home/sebas/git/agents/requirements/ux/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md`

# Deploy Results
- Decision: pass. Requirement is deploy-ready for Coolify.
- Verified deploy gates against binding docs `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Mandatory checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass: `269` passed, `0` failed)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass: `QA gate: OK`)
- Coolify readiness for this scope remains valid:
  - build-info generation succeeded for both `web` and `app` artifacts.
  - no additional environment-variable contract was introduced by this requirement scope.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md` -> `/home/sebas/git/agents/requirements/released/REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS.md`
