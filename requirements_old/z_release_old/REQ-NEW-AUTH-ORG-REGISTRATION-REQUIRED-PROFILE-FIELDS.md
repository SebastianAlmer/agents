---
id: REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS
title: Collect and persist required organization profile fields in single-step organization registration
status: released
implementation_scope: fullstack
source: user-2026-02-12-org-profile-fields-registration-followup
---

# Summary
Make organization registration collect and persist the complete required organization profile model in a single-step flow with strict validation and transactional persistence.

# Scope
- Frontend registration route and payload handling in `web/`.
- Auth registration contract and persistence behavior in `app/`.
- Mapping from registration payload to `AuthAccount` + `OrganisationProfile`.

# Organization Registration Decisions (fixed)
- Canonical route: `/{locale}/organizations/register`.
- Endpoint: `POST /auth/employer/register` (plus accepted role aliases `organisation`/`organization`).
- Contract mode: single-step payload (credentials + required organization profile fields).
- Persistence mode: transactional all-or-nothing for account and organization profile creation.
- `location` handling: derived from `legalAddressCity`, not an independent registration input.
- Validation mode: strict server-side required-field validation with deterministic error mapping.

# Required Organization Field Model (registration payload)
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
- [ ] Registration schema and payload shape are explicitly documented for organization role.
- [ ] Frontend registration flow submits credentials and required organization profile fields in one request.
- [ ] Backend validates required organization fields strictly and returns deterministic validation errors.
- [ ] Account and organization profile are created atomically (no partial account/profile persistence on failure).
- [ ] Persisted organization profile data from registration is available in subsequent org profile reads.
- [ ] Existing org accounts created under previous minimal contract remain valid and unaffected.
- [ ] Locale-prefixed auth routing and session invariants remain unchanged.

# Definition of Done
- [ ] `/{locale}/organizations/register` and `POST /auth/employer/register` run with a single-step required-field payload aligned to docs.
- [ ] Backend validation and transactional persistence behavior are implemented and verified for account plus organization profile creation.
- [ ] QA evidence includes one happy path and one validation-error path for organization registration.
- [ ] Docs and requirement references stay aligned for registration, profile model, and API contract coverage.

# Assumptions
- Existing endpoint path and accepted role aliases (`employer`, `organisation`, `organization`) remain valid.
- Required organization profile field model in `docs/web-profile-settings-flow.md` remains authoritative for registration payload.
- Existing organizations created before this contract expansion keep read and login behavior unchanged.

# Constraints
- Keep existing auth methods and role model unchanged.
- Keep participant registration model unchanged.
- Keep message-governance and locale-routing behavior unchanged.
- Keep registration contract aligned with `docs/web-auth-flows.md`, `docs/web-api-adapter-contract.md`, and `docs/api-reference.md`.
- Keep `location` derived from `legalAddressCity` and not as an independent registration input.

# Out of Scope
- Admin account-creation redesign.
- Participant registration expansion.
- New roles or auth channels.

# References
- `docs/web-auth-flows.md`
- `docs/web-profile-settings-flow.md`
- `docs/web-api-adapter-contract.md`
- `docs/api-reference.md`
- `docs/data-model-reference.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `fullstack` in split mode because registration contract, backend persistence, and frontend registration flow must stay aligned.
- Decision: Scope is constrained to registration payload/validation/persistence correctness without changing auth methods or role model.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md`

# Architecture Notes
- Keep organization registration and organization profile save on one shared required-field model to prevent create vs update drift.
- Keep registration persistence transactional all-or-nothing across `AuthAccount` and `OrganisationProfile`; no partial writes on validation or storage failure.
- Keep `location` derived from `legalAddressCity` only; do not introduce independent `location` input in registration payload.
- Preserve legacy-read compatibility: existing incomplete organization records remain readable, while write paths enforce completion (Option B).
- Keep deterministic validation error shape (`code`, `message`, `details`) so FE adapters can map field-level failures consistently.

# Dev Plan
1. Define canonical registration/profile DTO and validation schema for the required organization fields and reuse it in both auth register and org profile save flows.
2. Implement frontend registration payload wiring for `/{locale}/organizations/register` to submit credentials plus required organization fields in one request.
3. Implement backend transactional registration flow that creates account and organization profile atomically.
4. Enforce strict required-field validation and deterministic error mapping in registration and organization profile write paths.
5. Ensure profile read contract returns required organization fields plus shell identity fields (`accountId`, `displayName`, derived `location`) without breaking legacy reads.
6. Update runtime API and adapter-contract documentation and validate with happy-path plus validation-error QA evidence.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with auth-flow, profile-model, and API-contract docs.
- Decision: `implementation_scope: fullstack` remains correct because frontend payload collection and backend transactional persistence must ship together.
- Decision: Added guardrails for shared validation model, transactional integrity, and derived-location consistency.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md`

# Dev Results
- Implemented single-step organization registration payload submission in `web` so `/{locale}/organizations/register` now sends credentials plus all required organization profile fields to `POST /auth/employer/register`.
- Added organization registration form sections and required-field UI for the complete profile model (display/legal names, contact fields, and structured legal-address fields) without introducing an independent `location` input.
- Added frontend validation/error handling for organization registration, including deterministic field-level mapping from backend validation details (`field`/`reason`) for recoverable correction flows.
- Extended frontend auth adapter contract with an explicit `OrganizationRegisterPayload` type to keep registration payload shape deterministic.
- Strengthened backend QA coverage by expanding auth registration tests to assert full required-field persistence and deterministic required-field validation failures for employer aliases.
- Verified required-field persistence remains readable through organization profile reads using existing org-profile tests.
- Validation run:
- `cd app && node --test --require ts-node/register src/auth/auth.service.manual-account-login.test.ts` (pass)
- `cd app && node --test --require ts-node/register src/organisation-profile/organisation-profile.service.test.ts src/organisation-profile/organisation-profile.controller.test.ts` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
Changes: `web/src/components/auth/register-view.tsx`, `web/src/lib/api/adapters/auth.ts`, `web/messages/en.json`, `web/messages/de.json`, `app/src/auth/auth.service.manual-account-login.test.ts`, `/home/sebas/git/agents/requirements/qa/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md`

# QA Results
- Requirement implementation is aligned with binding docs (`docs/web-auth-flows.md`, `docs/web-profile-settings-flow.md`, `docs/web-api-adapter-contract.md`, `docs/api-reference.md`, `docs/data-model-reference.md`).
- Frontend validation passed:
  - `/{locale}/organizations/register` resolves to register flow and submits one payload with credentials plus all required organization profile fields via `apiAdapters.auth.registerOrganization` to `POST /auth/employer/register`.
  - No independent `location` input is present in registration UI; copy and payload are aligned with derived-from-city rule.
  - Deterministic validation mapping is implemented for backend `details.field` and `details.reason`.
- Backend validation/persistence passed:
  - Employer aliases (`employer`, `organisation`, `organization`) resolve to `EMPLOYER`.
  - Strict required-field validation and deterministic error payload (`code`, `message`, `details.field`, `details.reason`) are enforced through shared normalization.
  - Account plus organization profile creation is performed as one nested create write (atomic all-or-nothing for account/profile persistence).
  - Organization profile read contract includes required fields and derived location behavior with legacy fallback.
- QA evidence (happy path + validation-error path):
  - Happy path: `register accepts organization aliases and persists required profile fields` (`app/src/auth/auth.service.manual-account-login.test.ts`).
  - Validation-error paths: `register rejects missing required employer profile field with deterministic details` and `register rejects invalid employer profile payload with deterministic details` (`app/src/auth/auth.service.manual-account-login.test.ts`).
  - Read compatibility evidence: `getProfile derives location from legalAddressCity for shell identity` and `getProfile keeps legacy location readable when legalAddressCity is missing` (`app/src/organisation-profile/organisation-profile.controller.test.ts`).
- Mandatory QA checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `267/267`)
- Changes: `/home/sebas/git/agents/requirements/qa/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md` -> `/home/sebas/git/agents/requirements/sec/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md`

# Security Results
- Reviewed requirement-scoped registration and profile-contract paths against binding docs:
  `docs/web-auth-flows.md`, `docs/web-profile-settings-flow.md`,
  `docs/web-api-adapter-contract.md`, and `docs/api-reference.md`.
- Fixed a security issue in organization registration error handling:
  `AuthService.register` no longer returns raw storage/runtime error messages to clients.
- Added deterministic conflict handling for unique account collisions (`P2002`) with
  `Account already exists`, and generic internal failure handling with
  `Registration failed` (`500`) for unexpected storage/runtime exceptions.
- Added regression tests to lock this behavior.
- Validation run:
  - `cd /home/sebas/git/shift-matching/app && node --test --require ts-node/register src/auth/auth.service.manual-account-login.test.ts` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
- Decision: pass. Move requirement to `ux`.
Changes: `app/src/auth/auth.service.ts`, `app/src/auth/auth.service.manual-account-login.test.ts`, `/home/sebas/git/agents/requirements/sec/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md` -> `/home/sebas/git/agents/requirements/ux/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed the organization registration flow implementation in `web/src/components/auth/register-view.tsx` against `docs/web-auth-flows.md`, `docs/web-profile-settings-flow.md`, and `docs/web-design-system.md`.
- Confirmed single-step registration UX shows all required organization profile fields in one form and keeps `location` as a derived concept (no separate location input field).
- Confirmed deterministic validation behavior is visible to users via field-level feedback for required/invalid organization inputs.
- Fixed requirement-scoped UX/copy issues:
- removed raw backend error text from registration UX and mapped submission failures to localized, deterministic auth messages,
- improved organization registration copy clarity in DE (section wording and required field labels for contact/legal-address inputs),
- aligned EN section wording for required organization profile fields.
- Validation: `node -e "JSON.parse(require('fs').readFileSync('/home/sebas/git/shift-matching/web/messages/de.json','utf8'));JSON.parse(require('fs').readFileSync('/home/sebas/git/shift-matching/web/messages/en.json','utf8'));console.log('JSON OK')"` passed; `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
Changes: `web/src/components/auth/register-view.tsx`, `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/deploy/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md` -> `/home/sebas/git/agents/requirements/released/REQ-NEW-AUTH-ORG-REGISTRATION-REQUIRED-PROFILE-FIELDS.md`
