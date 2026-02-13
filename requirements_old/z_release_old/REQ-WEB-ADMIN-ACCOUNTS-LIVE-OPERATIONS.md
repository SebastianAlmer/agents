---
id: REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS
title: Replace admin accounts placeholder with live account lifecycle operations
status: released
implementation_scope: frontend
source: user-2026-02-11-admin-area-and-legacy-review
---

# Summary
Replace the static admin accounts placeholder with live account lifecycle operations in `web` using existing admin adapter contracts and route guards.

# Scope
- Frontend-only implementation in `web/` for admin accounts lifecycle UI.
- Admin accounts route `/{locale}/app/admin/accounts` and its page component behavior.
- Adapter-layer integration for list/create/activate/deactivate/anonymize/delete account actions.
- Account lifecycle interaction safeguards in UI (confirmation and irreversible-action reason capture).

# Acceptance Criteria
- Account rows are loaded from live adapter data; static placeholder rows are removed.
- Manual account creation supports documented fields and enums: `email`, `password`, `role` (`PARTICIPANT` or `EMPLOYER`), `status` (`ACTIVE` or `INACTIVE`).
- Lifecycle actions are available from the UI and wired to live operations: activate, deactivate, anonymize, delete.
- Irreversible actions (`anonymize`, `delete`) require explicit confirmation and a non-empty reason before dispatch.
- After each successful create or lifecycle action, the visible account list is refreshed deterministically.
- UI explicitly handles `loading`, `empty`, `error`, and success/notice states.
- Unauthorized or expired session responses follow auth guard behavior and route to localized login as defined in auth flows.
- Productive user-facing copy remains message-driven/localized (no hardcoded production strings).

# Definition of Done
- `web/src/components/admin/admin-accounts-page.tsx` is API-backed through admin adapters only, with all lifecycle actions operational.
- Role and status labels render deterministically from API values and remain consistent with current state semantics.
- QA evidence includes: one happy path, one irreversible-action guard path (confirmation plus reason), and one session/unauthorized redirect path.
- Route and permission behavior remains valid under locale-prefixed admin paths.

# Assumptions
- Existing admin account endpoints and adapter methods remain available as documented.
- Audit event persistence is handled by backend/admin services; this requirement covers frontend triggering and guard UX.
- No new role types or account status values are introduced in this change.

# Constraints
- Keep admin IA and route model unchanged under `/{locale}/app/admin...`.
- Use adapter-layer API integration only; no direct domain `fetch` usage in screens.
- Preserve admin and organization boundary rules; no admin controls outside admin route space.
- Keep auth/session guard behavior aligned with localized redirect rules for protected routes.
- Keep frontend delivery in `web/` as primary track; no rebuild feature work in `web_legacy/`.

# Out of Scope
- New backend fields or new admin account endpoints.
- Bulk actions or advanced filter/search beyond current API contract.
- Changes to admin analytics, mail, or contract-template modules.
- Auth architecture redesign beyond existing session/guard behavior.

# References
- `docs/web-admin-governance-flow.md`
- `docs/api-reference.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because required backend endpoints/contracts are already documented and in scope.
- Decision: Requirement now explicitly includes irreversible-action safeguards required by admin governance.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md`, `/home/sebas/git/agents/requirements/arch/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md`

# Architecture Notes
- Keep admin account lifecycle UI inside admin route space only, with module route `/{locale}/app/admin/accounts` and unchanged role guards.
- Use existing admin adapters only for all reads and writes (`fetch`, `create`, `activate`, `deactivate`, `anonymize`, `delete`); no direct screen-level transport calls.
- For irreversible actions (`anonymize`, `delete`), block dispatch until confirmation is explicit and reason input is trimmed non-empty.
- Keep deterministic post-action behavior: refresh account list after successful mutation and keep state handling explicit (`loading`, `empty`, `error`, success/notice).
- Preserve auth/session fallback behavior from existing guard model (missing/expired session redirects to localized login; role mismatch stays role-home redirect).

# Dev Plan
1. Wire `web/src/components/admin/admin-accounts-page.tsx` list load to admin adapter result states and remove static placeholder rows.
2. Implement create-account form wiring with documented fields/enums and deterministic validation/error presentation.
3. Implement row lifecycle actions (`activate`, `deactivate`, `anonymize`, `delete`) with per-action pending states and adapter error mapping.
4. Add irreversible-action gate UX requiring explicit confirmation and non-empty reason before anonymize/delete dispatch.
5. Verify guard and routing behavior stays unchanged on `/{locale}/app/admin/accounts` for admin, unauthenticated, and role-mismatch sessions.
6. Capture QA evidence for happy path, irreversible-action guard path, and unauthorized-session redirect path.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with admin governance, admin API contract, and auth/session guard docs.
- Decision: `implementation_scope: frontend` remains correct because documented admin endpoints already cover required lifecycle operations.
- Decision: Added explicit architecture guardrails for irreversible-action reason capture and deterministic post-mutation refresh behavior.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md` -> `/home/sebas/git/agents/requirements/dev/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md`

# Dev Results
- Replaced admin accounts placeholder UI with live adapter-backed operations in `web/src/components/admin/admin-accounts-page.tsx`:
- Live list load from `apiAdapters.admin.fetchAccounts` with explicit `loading`, `empty`, `error`, and success/error notice states.
- Deterministic account ordering on refresh (createdAt desc, then email/id fallback).
- Manual create-account form wired to `createAccount` with required fields and enum-constrained role/status values.
- Lifecycle actions wired to adapters (`activate`, `deactivate`, `anonymize`, `delete`) with per-row pending state and post-success list refresh.
- Added irreversible-action safeguard flow for `anonymize` and `delete`: explicit confirmation checkbox plus non-empty reason required before dispatch.
- Unauthorized API responses now clear session and redirect to localized login via existing auth helper (`clearSessionAndRedirectToLogin`), preserving guard behavior.
- Updated admin adapter account action response typings to match the documented/live contract (`{ status: "ok" }` for activate/deactivate/anonymize/delete).
- Added full i18n message coverage for the new admin accounts UI in both `de` and `en` namespaces (no hardcoded productive copy introduced).
- Verification:
- `npm --prefix web run lint` passed.
- `npm --prefix web run build` passed (pre-existing non-blocking `MISSING_MESSAGE` logs for unrelated EN namespaces still appear during static generation).
- Changes: `/home/sebas/git/shift-matching/web/src/components/admin/admin-accounts-page.tsx`, `/home/sebas/git/shift-matching/web/src/lib/api/adapters/admin.ts`, `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md`

# QA Results
- Decision: pass.
- Validation:
- Live account rows are adapter-backed and placeholder rows are removed (`apiAdapters.admin.fetchAccounts` load path in `admin-accounts-page.tsx`).
- Create flow supports documented fields and enums (`email`, `password`, `role` as `PARTICIPANT|EMPLOYER`, `status` as `ACTIVE|INACTIVE`).
- Lifecycle actions are wired to live operations (`activate`, `deactivate`, `anonymize`, `delete`) with deterministic post-success list refresh.
- Irreversible actions require explicit confirmation plus non-empty trimmed reason before dispatch.
- UI state handling is explicit for `loading`, `empty`, `error`, and success/notice paths.
- Unauthorized handling clears session and redirects to localized login via existing auth helper (`clearSessionAndRedirectToLogin`).
- Productive copy remains localized through message namespaces (`adminAccounts` in `web/messages/de.json` and `web/messages/en.json`).
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (pre-existing non-blocking `MISSING_MESSAGE` logs in unrelated EN namespaces remain).
- `npm --prefix /home/sebas/git/shift-matching/app run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`248` passed, `0` failed).
- QA evidence:
- Happy path: create and lifecycle mutations call adapters and refresh the list deterministically after success.
- Irreversible-action guard path: anonymize/delete are blocked until confirmation checkbox is checked and reason text is non-empty.
- Unauthorized-session redirect path: unauthorized adapter failures route through session clear + localized login redirect helper.
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md`

# Security Results
- Decision: pass.
- Validation:
- Reviewed admin lifecycle implementation and route-guard behavior in `web/src/components/admin/admin-accounts-page.tsx`, `web/src/lib/api/adapters/admin.ts`, `web/src/lib/api/client.ts`, `app/src/admin/admin.controller.ts`, and `app/src/admin/admin.service.ts` against `docs/web-admin-governance-flow.md`, `docs/web-api-adapter-contract.md`, and `docs/api-reference.md`.
- Fixed requirement-scoped auditability gap for irreversible actions: `anonymize` and `delete` now carry a non-empty reason end-to-end and persist that reason in audit logs.
- Added backend enforcement and normalization for irreversible-action reasons (required, trimmed, control characters removed, whitespace collapsed, max length 500) to prevent empty or unsafe log payloads.
- Updated API/adapter contract docs so irreversible admin account actions explicitly require `reason`.
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`249` passed, `0` failed).
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (pre-existing non-blocking EN `MISSING_MESSAGE` logs remain outside this requirement scope).
- Changes: `/home/sebas/git/shift-matching/web/src/components/admin/admin-accounts-page.tsx`, `/home/sebas/git/shift-matching/web/src/lib/api/adapters/admin.ts`, `/home/sebas/git/shift-matching/web/src/lib/api/client.ts`, `/home/sebas/git/shift-matching/app/src/admin/admin.controller.ts`, `/home/sebas/git/shift-matching/app/src/admin/admin.service.ts`, `/home/sebas/git/shift-matching/app/src/admin/admin.controller.test.ts`, `/home/sebas/git/shift-matching/app/src/admin/admin.service.test.ts`, `/home/sebas/git/shift-matching/docs/api-reference.md`, `/home/sebas/git/shift-matching/docs/web-api-adapter-contract.md`, `/home/sebas/git/agents/requirements/sec/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md` -> `/home/sebas/git/agents/requirements/ux/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed admin accounts UX/copy and irreversible-action safeguards in `web/src/components/admin/admin-accounts-page.tsx` against `docs/web-admin-governance-flow.md`, `docs/web-design-system.md`, `docs/web-governance.md`, and `docs/glossary.md`.
- Fixed requirement-scoped DE localization quality issues in the admin accounts namespace by removing mixed English/German UI terms from visible labels and warnings, while preserving behavior and message-key wiring.
- Confirmed live lifecycle operations, irreversible-action gate behavior (reason + confirmation), and localized error/notice states remain intact after copy changes.
- Re-validated with `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass).
- Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/agents/requirements/ux/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md` release gates.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-blocking EN `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `259` tests)
- Decision: pass; move to `released`.
- Changes: `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md` -> `/home/sebas/git/agents/requirements/released/REQ-WEB-ADMIN-ACCOUNTS-LIVE-OPERATIONS.md`
