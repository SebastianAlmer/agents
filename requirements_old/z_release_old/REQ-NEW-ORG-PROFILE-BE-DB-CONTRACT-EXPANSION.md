---
id: REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION
title: Expand organization profile backend and data model for required contact and structured address fields
status: released
implementation_scope: backend
source: user-2026-02-12-org-profile-fields-registration-followup
---

# Summary
Implement backend contract and persistence expansion so required organization profile data is complete and consistent across profile save and organization registration.

# Scope
- Backend API contract updates in `app/` for:
  - `PUT /organisations/profile/me`
  - `GET /organisations/profile/me`
  - `POST /auth/employer/register` (and accepted organization role aliases)
- Data-model and persistence updates for organization profile required fields.
- Validation/error behavior for required-field completeness.
- Backward-compatible handling for existing incomplete organization profiles.

# Required Organization Field Model
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

# Contract Rules
- `location` remains exposed for shell/header identity and is derived from `legalAddressCity`.
- Registration and profile-save contracts must use the same required organization field model.
- Existing role/lifecycle permissions remain unchanged.

# Acceptance Criteria
- [x] DB schema supports persistent storage of the required organization field model without lossy mapping.
- [x] `PUT /organisations/profile/me` validates and persists the complete required organization field model.
- [x] `GET /organisations/profile/me` returns required organization profile fields and derived `location` consistently.
- [x] `POST /auth/employer/register` accepts and persists required organization profile fields at account creation.
- [x] Validation errors for missing/invalid required fields are deterministic and map to actionable FE error states.
- [x] Legacy organizations with incomplete data remain readable, but profile edit/save requires completion of required fields (Option B).
- [x] Existing auth/session guards and role routing behavior remain unchanged.

# Definition of Done
- [x] Backend endpoints `GET /organisations/profile/me`, `PUT /organisations/profile/me`, and `POST /auth/employer/register` implement the required organization field model and validation behavior.
- [x] Persistence layer and schema changes are implemented with forward migration and no lossy fallback mapping for required fields.
- [x] Legacy incomplete organization records remain readable, while save paths enforce required-field completion as documented.
- [x] API/reference docs and adapter-contract docs are updated to reflect new runtime contract.
- [x] QA evidence covers one happy path and one validation-error path for profile save and organization registration.

# Assumptions
- Existing endpoint paths and role guards remain canonical and are not renamed in this requirement.
- FE integration will continue through adapter-layer contract and consume deterministic validation errors.
- Required organization profile model in `docs/web-profile-settings-flow.md` is the authoritative target field set.

# Constraints
- Keep organization profile field contract aligned with `docs/web-profile-settings-flow.md`.
- Keep auth registration flow alignment with `docs/web-auth-flows.md` (organization registration must collect required organization profile fields).
- Keep adapter/API contract continuity and explicit error mapping behavior from `docs/web-api-adapter-contract.md`.
- Keep runtime API behavior and role access model consistent with `docs/api-reference.md`.
- Keep participant profile model and non-organization domains unchanged.

# Out of Scope
- Organization UX redesign outside field-completeness and save/register correctness.
- Admin account-management redesign.
- New language enablement decisions.
- New role/auth method introduction.

# References
- `docs/web-profile-settings-flow.md`
- `docs/web-auth-flows.md`
- `docs/web-api-adapter-contract.md`
- `docs/api-reference.md`
- `docs/data-model-reference.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` is set to `backend` in split mode because this requirement targets API/schema/runtime contract expansion.
- Decision: Scope is constrained to organization profile/register backend contract and data-model expansion with legacy-read compatibility.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md`

# Architecture Notes
- Keep the required organization field model exactly aligned with `docs/web-profile-settings-flow.md` for both registration and profile endpoints.
- Preserve shell identity contract: `location` remains derived from `legalAddressCity`, and `accountId` remains returned for session-identity binding checks.
- Use one shared backend validation contract for `POST /auth/employer/register` and `PUT /organisations/profile/me` to avoid field-drift between create and update paths.
- Apply Option B compatibility from docs: existing incomplete organization records remain readable, but write paths enforce full required-field completion.
- Keep error responses deterministic and adapter-friendly so FE can map required-field failures to explicit actionable form states.

# Dev Plan
1. Define canonical DTO and validation schema for required organization fields, shared by registration and organization-profile upsert flows.
2. Add schema migration for structured organization contact and legal-address fields with non-lossy persistence mapping.
3. Expand `POST /auth/employer/register` to accept and persist the required organization profile payload at account creation.
4. Expand `GET /organisations/profile/me` and `PUT /organisations/profile/me` contracts to return and validate required fields plus derived `location`.
5. Implement legacy compatibility behavior so incomplete historical records remain readable while update/save paths require full completion.
6. Update API and adapter contract docs and validate deterministic validation-error behavior with happy-path and invalid-input QA evidence.

# Architecture Results
- Decision: Requirement is architecture-ready and aligns with organization profile field policy, auth registration flow, and backend contract backlog direction.
- Decision: `implementation_scope: backend` remains correct because this requirement is API/data-model/runtime contract expansion without frontend flow redesign.
- Decision: Added guardrails to prevent contract drift between registration and profile-save paths while preserving legacy-read compatibility.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md`

# Dev Results
- Implemented shared organization required-field validation for registration and profile-save paths with deterministic validation payload details (`code`, `message`, `details.field`, `details.reason`).
- Expanded organisation profile persistence with structured contact and legal-address columns, plus forward migration.
- Updated `GET /organisations/profile/me` and `PUT /organisations/profile/me` contracts to include required organization fields and derived `location` (`legalAddressCity`), with legacy fallback read behavior.
- Expanded `POST /auth/:role/register` for employer aliases to accept/persist required organization profile fields transactionally at account creation.
- Added QA evidence via backend tests for happy and validation paths in profile save and organization registration.
- Updated backend API/data-model/adapter docs to reflect the new runtime contract.
- Changes: app/prisma/schema.prisma, app/prisma/migrations/20260212113000_org_profile_required_fields/migration.sql, app/src/organisation-profile/organisation-required-fields.ts, app/src/organisation-profile/organisation-profile.service.ts, app/src/organisation-profile/organisation-profile.controller.ts, app/src/organisation-profile/organisation-profile.service.test.ts, app/src/organisation-profile/organisation-profile.controller.test.ts, app/src/auth/auth.service.ts, app/src/auth/auth.controller.ts, app/src/auth/auth.service.manual-account-login.test.ts, docs/api-reference.md, docs/web-api-adapter-contract.md, docs/data-model-reference.md

# QA Results
- Implementation is aligned with binding docs for organization required-field model, registration contract, and derived-location rule (`docs/web-profile-settings-flow.md`, `docs/web-auth-flows.md`, `docs/web-api-adapter-contract.md`, `docs/api-reference.md`, `docs/data-model-reference.md`).
- Backend contract validation passed:
  - `PUT /organisations/profile/me` enforces required organization fields via shared normalization and persists structured contact/address fields.
  - `GET /organisations/profile/me` returns required structured fields and derives `location` from `legalAddressCity` with legacy fallback when city is missing.
  - `POST /auth/:role/register` accepts employer aliases (`employer`, `organisation`, `organization`) and persists required organization profile fields at account creation.
- Deterministic validation payload behavior passed:
  - Shared validation raises `BadRequestException` payload with `code`, `message`, `details.field`, `details.reason`.
  - Coverage exists for required and invalid cases in registration and profile-save tests.
- Persistence/model validation passed:
  - Prisma schema includes structured organization contact and legal-address fields on `OrganisationProfile`.
  - Migration adds persistent DB columns for these fields without removing legacy fields.
  - Registration create path writes account + organization profile in one nested write (atomic account/profile persistence).
- QA evidence (happy + validation paths):
  - Registration happy: `register accepts organization aliases and persists required profile fields` (`app/src/auth/auth.service.manual-account-login.test.ts`).
  - Registration validation: missing/invalid required fields return deterministic `details` (`app/src/auth/auth.service.manual-account-login.test.ts`).
  - Profile save validation: invalid contact email returns deterministic `details` and city-derived location is persisted (`app/src/organisation-profile/organisation-profile.service.test.ts`).
  - Profile read legacy compatibility: city-derived location and legacy fallback behavior (`app/src/organisation-profile/organisation-profile.controller.test.ts`).
- Mandatory QA checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `267/267`)
- Changes: `/home/sebas/git/agents/requirements/qa/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md` -> `/home/sebas/git/agents/requirements/sec/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md`

# Security Results
- Reviewed requirement-scoped implementation and docs alignment for:
  `POST /auth/:role/register`, `GET /organisations/profile/me`, and
  `PUT /organisations/profile/me`, including shared validation and derived-location behavior.
- Confirmed deterministic validation errors (`code`, `message`, `details.field`, `details.reason`)
  and required-field enforcement are consistent across registration and organization profile save.
- Confirmed role guards and account binding remain unchanged and enforce employer-only access to
  organization profile endpoints.
- Confirmed runtime behavior matches Option B compatibility: legacy incomplete records are readable,
  and write paths require full required-field completion.
- Verification run:
  - `cd /home/sebas/git/shift-matching/app && node --test --require ts-node/register src/organisation-profile/organisation-profile.service.test.ts src/organisation-profile/organisation-profile.controller.test.ts src/auth/auth.service.manual-account-login.test.ts` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
- Decision: pass. Move requirement to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md` -> `/home/sebas/git/agents/requirements/ux/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed requirement-scoped profile contract UX impact in `web/src/components/profile/organization-profile-page.tsx` and organization-profile message namespaces against `docs/web-profile-settings-flow.md`, `docs/web-api-adapter-contract.md`, and `docs/web-design-system.md`.
- Confirmed required organization fields, derived-location rule, and required-field validation behavior are represented in productive UI copy and form feedback.
- Fixed requirement-scoped UX issues:
- removed raw backend error-text exposure in organization-profile load/save fallback states and mapped to localized deterministic messages,
- improved DE terminology consistency for contact and structured legal-address labels in organization profile copy,
- aligned EN edit-rule wording with required-field save behavior.
- Validation: `node -e "JSON.parse(require('fs').readFileSync('/home/sebas/git/shift-matching/web/messages/de.json','utf8'));JSON.parse(require('fs').readFileSync('/home/sebas/git/shift-matching/web/messages/en.json','utf8'));console.log('JSON OK')"` passed; `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
Changes: `web/src/components/profile/organization-profile-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/deploy/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md` -> `/home/sebas/git/agents/requirements/released/REQ-NEW-ORG-PROFILE-BE-DB-CONTRACT-EXPANSION.md`
