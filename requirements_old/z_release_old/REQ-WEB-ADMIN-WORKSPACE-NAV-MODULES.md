---
id: REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES
title: Expand admin workspace navigation to module-level primary admin IA
status: released
implementation_scope: frontend
source: user-2026-02-11-admin-area-and-legacy-review
---

# Summary
Keep admin in its own workspace and align admin primary navigation with target IA so admin users can access `accounts`, `analytics`, `mail`, and `contract-template` directly from admin shell navigation.

# Scope
- Frontend-only changes in `web/`.
- Admin route space and navigation:
  - `/{locale}/app/admin`
  - `/{locale}/app/admin/accounts`
  - `/{locale}/app/admin/analytics`
  - `/{locale}/app/admin/mail`
  - `/{locale}/app/admin/contract-template`

# Acceptance Criteria
- Admin role sees module-level primary navigation entries for `accounts`, `analytics`, `mail`, and `contract-template` in admin workspace.
- Participant and organization roles do not see admin navigation entries.
- Admin routes stay isolated under `/{locale}/app/admin...` and continue to rely on role guards.
- Existing alias behavior remains valid (`/{locale}/admin` alias to `/{locale}/app/admin`, `/{locale}/admin/login` available as admin-focused login alias).
- No backend endpoint or schema changes are introduced.

# Definition of Done
- Admin IA/navigation behavior matches admin IA and primary navigation definitions in `docs/web-product-structure.md`.
- Navigation copy is message-driven and no hardcoded production copy is added.
- QA evidence includes one admin-session navigation check and one non-admin visibility/guard check.
- Locale-prefixed route behavior for admin entry and module links is validated.

# Assumptions
- Admin shell/navigation structure in `web/` is the active source for role-specific primary navigation.
- Existing admin module routes remain available and are not being renamed in this requirement.
- Auth/session guard behavior remains as currently documented and implemented.

# Constraints
- Preserve role boundary rules from `docs/web-admin-governance-flow.md`.
- Keep locale-prefixed routing model unchanged, including admin aliases and protected-route behavior.
- Keep implementation in active track `web/` only (`web_legacy/` maintenance-only policy).
- Keep admin IA order and module naming aligned with `docs/web-product-structure.md`.

# Out of Scope
- Admin module business logic changes.
- Backend auth/session model changes.
- New admin backend endpoints, payload contracts, or data model changes.

# References
- `docs/web-product-structure.md`
- `docs/web-admin-governance-flow.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is navigation and route wiring within admin workspace.
- Decision: Alias acceptance language was aligned to auth documentation wording for `/{locale}/admin/login`.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md`, `/home/sebas/git/agents/requirements/arch/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md`

# Architecture Notes
- Keep admin primary navigation scoped to admin session context only; participant and organization shells must not render admin module entries.
- Align admin module order and labels with admin IA (`accounts`, `analytics`, `mail`, `contract-template`) from product structure.
- Keep admin route isolation unchanged under `/{locale}/app/admin...` and preserve alias behavior (`/{locale}/admin` and `/{locale}/admin/login`).
- Rely on existing role/session guards for direct-route access control and mismatch redirects; do not add alternate cross-role shortcuts.
- Preserve message-driven navigation copy and locale-prefixed route generation for all admin module links.

# Dev Plan
1. Update admin workspace navigation source in `web/` to expose module-level primary entries for `accounts`, `analytics`, `mail`, and `contract-template`.
2. Ensure non-admin role navigation sets remain unchanged and contain no admin entries.
3. Verify admin home and module link targets resolve to documented locale-prefixed routes in admin route space.
4. Validate alias behavior remains intact for `/{locale}/admin` and `/{locale}/admin/login` with current auth flow.
5. Verify direct access behavior by role: admin allowed, non-admin redirected by existing guard rules.
6. Capture QA evidence for one admin navigation happy path and one non-admin visibility/guard path.

# Architecture Results
- Decision: Requirement is architecture-ready and aligns with admin IA, route model, and role-boundary documentation.
- Decision: `implementation_scope: frontend` remains correct because this is navigation and route wiring only.
- Decision: Added guardrails for preserving alias behavior and role-scoped nav visibility.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md` -> `/home/sebas/git/agents/requirements/dev/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md`

# Dev Results
- Updated role-based app navigation to expose admin module-level primary entries in documented IA order: `accounts`, `analytics`, `mail`, `contract-template`.
- Kept non-admin navigation sets unchanged: participant navigation contains no admin entries; organization navigation remains organization-only.
- Added admin-module active-state matching in sidebar (including `/app/admin` alias landing treated as accounts context) without changing route/guard behavior.
- Added localized message-driven navigation copy keys for new admin module nav entries in both `en` and `de` bundles; no hardcoded production strings were introduced.
- QA evidence:
  - Admin-session navigation check: `resolveAppNavItems("ADMIN")` now maps to `/app/admin/accounts`, `/app/admin/analytics`, `/app/admin/mail`, `/app/admin/contract-template` in `web/src/lib/navigation.ts`.
  - Non-admin visibility/guard check: participant/employer nav resolvers do not include admin routes; role boundary redirect logic remains unchanged in `web/src/proxy.ts`.
- Validation: `npm --prefix web run lint` passed; `npm --prefix web run build` completed with pre-existing unrelated `MISSING_MESSAGE` logs in organization namespaces.
Changes: `web/src/lib/navigation.ts`, `web/src/components/shell/app-sidebar.tsx`, `web/messages/en.json`, `web/messages/de.json`, `/home/sebas/git/agents/requirements/qa/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md`

# QA Results
- Decision: Pass. Implementation matches requirement scope and authoritative docs for admin IA, role boundaries, and locale-prefixed admin routing.
- Validation:
  - Admin primary nav exposes module-level entries in the required order (`accounts`, `analytics`, `mail`, `contract-template`) for admin sessions via `resolveAppNavItems("ADMIN")` and `ADMIN_NAV_ITEMS`.
  - Non-admin role nav remains isolated from admin entries (`resolveAppNavItems("EMPLOYER")` -> organization nav, fallback -> participant nav).
  - Admin route isolation and role guards remain enforced in proxy middleware (`/{locale}/admin` and `/{locale}/app/admin...` require `ADMIN`; role mismatch redirects to role home).
  - Existing aliases remain valid (`/{locale}/admin` redirects to `/{locale}/app/admin`; `/{locale}/admin/login` redirects to `/{locale}/login`).
  - Navigation labels remain message-driven with required keys present in both `web/messages/en.json` and `web/messages/de.json`.
- Mandatory checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
  - `npm --prefix /home/sebas/git/shift-matching/web run build` passed (with pre-existing unrelated `MISSING_MESSAGE` logs in organization namespaces).
  - `npm --prefix /home/sebas/git/shift-matching/app run build` passed.
  - `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`248` passed, `0` failed).
Changes: `/home/sebas/git/agents/requirements/qa/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md` (updated QA results and status), `/home/sebas/git/agents/requirements/sec/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md` (moved from `qa` to `sec`)

# Security Results
- Decision: pass.
- Validation:
- Reviewed admin workspace navigation and route guard wiring against `docs/web-admin-governance-flow.md`, `docs/web-auth-flows.md`, and `docs/web-product-structure.md`.
- Identified and fixed a requirement-scoped role-boundary weakness.
- Session role parsing previously trusted the role cookie even when token role claims disagreed.
- Sidebar/header role fallback inferred role from pathname when no valid session was parsed.
- Implemented hardening in `web/src/lib/auth/session-cookie.ts` by parsing token `role` claim and failing closed (`null` session) on role cookie/token mismatch.
- Implemented hardening in `web/src/components/shell/app-sidebar.tsx` by defaulting to non-admin role when no valid session exists.
- Implemented hardening in `web/src/components/shell/app-header.tsx` by defaulting to non-admin role when no valid session exists.
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (with pre-existing unrelated `MISSING_MESSAGE` logs in organization EN namespaces).
Changes: `web/src/lib/auth/session-cookie.ts`, `web/src/components/shell/app-sidebar.tsx`, `web/src/components/shell/app-header.tsx`, `/home/sebas/git/agents/requirements/ux/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed admin workspace navigation implementation in `web/src/lib/navigation.ts` and `web/src/components/shell/app-sidebar.tsx` against `docs/web-product-structure.md` and `docs/web-admin-governance-flow.md`.
- Confirmed admin IA order and route targets are module-level and role-scoped as required (`accounts`, `analytics`, `mail`, `contract-template`), while non-admin primary navigation remains isolated from admin entries.
- Confirmed alias/guard behavior remains consistent with current admin route model and role boundary expectations.
- Fixed requirement-scoped DE UX terminology drift in admin navigation copy to avoid mixed-language labels/descriptions in productive UI (`Accounts`/`Analytics`/`Templates` wording updated to consistent German terminology for DE locale).
- Validation: `node -e "JSON.parse(require('fs').readFileSync('/home/sebas/git/shift-matching/web/messages/de.json','utf8')); console.log('JSON OK')"` passed; `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
Changes: `web/messages/de.json`, `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md` release gates.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-blocking EN `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `259` tests)
- Decision: pass; move to `released`.
- Changes: `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md` -> `/home/sebas/git/agents/requirements/released/REQ-WEB-ADMIN-WORKSPACE-NAV-MODULES.md`
