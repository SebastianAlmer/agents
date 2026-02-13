---
id: REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK
title: Ensure organization profile save validation and explicit feedback without settings-scope drift
status: released
implementation_scope: frontend
source: user-2026-02-11-field-feedback-auth-navigation
---

# Summary
Implement deterministic organization profile save validation and explicit save feedback in `web/` while keeping field ownership clear: organization master data on profile, notification/governance/language on settings.

# Scope
- Frontend-only in `web/`.
- In-scope screens:
  - `/{locale}/app/organizations/profile`
  - `/{locale}/app/organizations/settings`
- In-scope behavior:
  - required organization profile field validation and save-state UX
  - explicit success/error feedback and retry paths
  - ownership enforcement between profile and settings surfaces

# Required Organization Profile Field Model (UI validation baseline)
- display name
- legal name
- contact first name
- contact last name
- contact email
- contact phone
- legal address street
- legal address house number
- legal address postal code
- legal address city
- legal address country

# Acceptance Criteria
- [ ] Organization profile form validates required fields deterministically before submit and surfaces field/form-level guidance.
- [ ] Save success is explicitly acknowledged (banner/toast/inline notice) and saved values are reflected in current UI state.
- [ ] Save failures surface actionable feedback with deterministic recovery path (`retry` or clear correction instruction).
- [ ] Organization settings screen remains limited to notification/governance/language blocks and does not become a second editor for organization master data.
- [ ] `location` is treated as derived shell identity from legal-address city and is not independently managed as a conflicting manual field.
- [ ] Legacy organizations with incomplete required fields remain readable, but edit/save enforces completion (Option B).
- [ ] Auth/session guard behavior and locale-prefixed routing remain unchanged.
- [ ] User-facing copy remains message-key driven.

# Definition of Done
- [ ] Organization profile save flow in `web/` implements explicit validation, success feedback, and actionable error recovery states.
- [ ] Organization settings flow remains limited to notification/governance/language and does not expose organization master-data editing controls.
- [ ] QA evidence includes one happy path and one negative/error path for organization profile save, including legacy-incomplete data handling (Option B).
- [ ] Message keys are used for all productive copy touched by this requirement.

# Assumptions
- Backend/profile contract and required organization field model remain available as documented in `docs/web-profile-settings-flow.md` and `docs/web-api-adapter-contract.md`.
- Existing role permissions and route guards remain unchanged while this frontend requirement is implemented.
- Legacy incomplete organization records are still readable via `GET` and write enforcement remains handled by existing backend behavior.

# Constraints
- Keep implementation in `web/` only.
- Keep role rights, lifecycle invariants, and route model unchanged.
- No direct transport calls from page components; keep adapter usage conventions.
- Align with `docs/web-profile-settings-flow.md`, `docs/web-governance.md`, and `docs/web-quality-test-program.md`.

# Out of Scope
- Backend schema/endpoint redesign (tracked separately in backend/data requirements).
- Participant profile/settings changes.
- Registration contract redesign.

# References
- `docs/web-profile-settings-flow.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`
- `docs/web-api-adapter-contract.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is UI validation, feedback, and surface ownership in `web/`.
- Decision: Scope is constrained to organization profile/settings frontend behavior without backend contract redesign.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md`

# Architecture Notes
- Keep ownership boundaries strict: organization master data stays on `/{locale}/app/organizations/profile`; settings remains notification, governance, and language only.
- Enforce the required organization field model from docs at profile-save time with deterministic field-level and form-level validation feedback.
- Keep `location` derived from `legalAddressCity` and do not expose conflicting independent manual location editing.
- Apply Option B compatibility: legacy incomplete records remain readable, but write paths require complete required fields.
- Keep save-state UX explicit (`loading`, success notice, actionable error with retry/correction path) and message-key driven.

# Dev Plan
1. Audit organization profile form state and validation mapping against the required field model from `docs/web-profile-settings-flow.md`.
2. Implement deterministic pre-submit validation and inline field/form guidance for missing or invalid required fields.
3. Implement explicit save success acknowledgment and local state refresh so saved values are visibly consistent after submit.
4. Implement recoverable save-error handling with deterministic retry/correction guidance using adapter error classification.
5. Ensure organization settings screen exposes only notification/governance/language controls and no master-data editors.
6. Validate QA scenarios for happy path, error path, and legacy-incomplete Option B behavior on locale-prefixed routes.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with profile-settings ownership rules, validation policy, and QA/governance expectations.
- Decision: `implementation_scope: frontend` remains correct because this requirement is UI validation/feedback and surface-boundary enforcement only.
- Decision: Added guardrails for derived-location consistency and Option B legacy-read/write-enforcement behavior.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md` -> `/home/sebas/git/agents/requirements/dev/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md`

# Dev Results
- Reworked organization profile editing to include full required organization master-data fields (legal/contact/structured legal address) with deterministic field-level and form-level validation before submit.
- Removed independent profile `location` editing and enforced derived identity behavior from legal-address city while keeping legacy-incomplete records readable and editable (Option B).
- Added explicit save-state feedback: success notice on save, actionable error notice with retry for retryable failures, and correction guidance for validation failures.
- Kept organization settings scope unchanged to notification/governance/language only (no master-data editor added on settings route).
- Updated organization profile adapter typing and message keys used by touched UI copy.
- Verified frontend checks pass: `npm --prefix web run lint` and `npm --prefix web run build`.
Changes: `web/src/components/profile/organization-profile-page.tsx`, `web/src/lib/api/adapters/profile.ts`, `web/messages/en.json`, `web/messages/de.json`

# QA Results
- Decision: pass -> `sec`.
- Verified deterministic required-field validation before submit in `web/src/components/profile/organization-profile-page.tsx` for:
  `displayName`, `legalName`, `contactFirstName`, `contactLastName`, `contactEmail`, `contactPhone`, `legalAddressStreet`, `legalAddressHouseNumber`, `legalAddressPostalCode`, `legalAddressCity`, `legalAddressCountry`.
- Verified explicit save feedback:
  - success notice rendered on save success
  - validation and generic error notices rendered on failure
  - retry action rendered when backend error is retryable.
- Verified Option B behavior:
  legacy-incomplete organization records are readable (`mapProfileToForm` supports null/empty fields), while save path enforces required-field completion via pre-submit validation and server-validation mapping.
- Verified `location` ownership rule:
  no standalone location editor exists; UI shows derived-location hint and derives shell location from legal-address city (`legalAddressCity`), consistent with docs.
- Verified settings-scope boundaries:
  `web/src/components/settings/organization-settings-page.tsx` remains limited to notification frequency, governance rules, and language preference; no organization master-data editor is present.
- Verified user-facing copy remains message-key driven on touched surfaces (`organization-profile`, `organization-settings`).
- Mandatory checks (in order):
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` pass
  - `npm --prefix /home/sebas/git/shift-matching/web run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run test` pass (`267` passed, `0` failed)
Changes: `/home/sebas/git/agents/requirements/qa/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md` -> `/home/sebas/git/agents/requirements/sec/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md`

# Security Results
- Decision: pass -> `ux`.
- Reviewed requirement-scoped security-relevant implementation:
  - `web/src/components/profile/organization-profile-page.tsx`
  - `web/src/components/settings/organization-settings-page.tsx`
  - `web/src/lib/api/adapters/profile.ts`
  - `web/src/lib/auth/organization-identity.ts`
  - `web/src/components/shell/app-session-guard.tsx`
  - `web/src/components/shell/app-header.tsx`
  - `app/src/organisation-profile/organisation-profile.controller.ts`
  - `app/src/organisation-profile/organisation-profile.service.ts`
  - `app/src/organisation-profile/organisation-required-fields.ts`
- Security verification summary:
  - Organization profile save path keeps required-field validation and does not reintroduce independent manual `location` editing.
  - Settings surface remains limited to notification/governance/language controls and does not expose organization master-data editing.
  - Session/identity guard paths for employer profile identity binding remain in place (`accountId` mismatch handling in shell/session guard flow).
  - Error rendering remains React-escaped and adapter-mediated; no new direct transport or unsafe HTML injection paths introduced in requirement scope.
- Regression checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` pass
  - `npm --prefix /home/sebas/git/shift-matching/web run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run test` pass (`269` passed, `0` failed)
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md` -> `/home/sebas/git/agents/requirements/ux/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md`

# UX Results
- Decision: pass. Move requirement to `deploy`.
- Verified requirement behavior against binding docs:
  `docs/web-profile-settings-flow.md`,
  `docs/web-governance.md`,
  `docs/web-quality-test-program.md`,
  and `docs/web-api-adapter-contract.md`.
- Confirmed organization profile flow keeps deterministic required-field validation, explicit success feedback, and actionable error feedback with retry/correction guidance.
- Confirmed settings-surface ownership remains correct: only notification, governance, and language blocks are exposed on `/{locale}/app/organizations/settings`.
- UX/copy fix applied in requirement scope:
  organization settings load/save failures now use deterministic message-key copy with retry hints/actions for retryable failures instead of raw adapter text.
- Added and aligned EN/DE message keys for organization settings failure and retry copy.
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
Changes: `web/src/components/settings/organization-settings-page.tsx`, `web/messages/en.json`, `web/messages/de.json`, `/home/sebas/git/agents/requirements/ux/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md` -> `/home/sebas/git/agents/requirements/released/REQ-ORG-SETTINGS-SAVE-VALIDATION-AND-SUCCESS-FEEDBACK.md`
