---
id: REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION
title: Fix org account identity binding in shell/header presentation
status: released
implementation_scope: fullstack
source: user-2026-02-11-field-feedback-auth-navigation
---

# Summary
Ensure authenticated organization sessions are bound to the correct account/profile identity so shell/header identity never shows another user.

# Scope
- Frontend identity rendering in organization shell/header and related profile entry points.
- Session-to-account/profile binding checks during login, re-entry, and protected route use.
- Backend payload/contract hardening only where needed to guarantee deterministic identity source-of-truth.

# Acceptance Criteria
- After login with an organization account, displayed header/profile identity matches that account's organization profile source-of-truth fields.
- No cross-account identity bleed occurs after prior same-browser sessions (account A logout, account B login).
- On detected identity mismatch (session account vs resolved profile identity), session is invalidated and user is redirected to localized login.
- Protected-route and role-guard behavior remains unchanged (`/{locale}/app...`, `/{locale}/admin`, role-home redirects).
- Identity-rendering behavior is deterministic on reload and on `/{locale}/app` role re-entry routing.

# Definition of Done
- Organization shell/header identity is bound to authenticated session account and rendered from API-backed source data.
- Identity mismatch handling is implemented and validated for login, reload, and same-browser account switch scenarios.
- Docs are updated where behavior/contract is clarified (`web-auth-flows`, `web-profile-settings-flow`, and `web-api-adapter-contract` if endpoint semantics change).
- QA evidence includes: one happy path, one mismatch/fallback path, and one account-switch path.

# Assumptions
- Organization display identity uses organization profile fields defined for `/{locale}/app/organizations/profile`.
- Current phase auth/session and route-guard model remains active; no role switcher is introduced.

# Constraints
- Keep locale-prefixed routing and guard behavior from `docs/web-auth-flows.md` and `docs/web-product-structure.md`.
- Keep admin/organization boundary rules unchanged (no cross-role shortcuts in organization shell).
- Use adapter-layer API integration rules from `docs/web-api-adapter-contract.md`.
- Preserve role and account model constraints from current docs (explicit roles, deterministic role-home routing).

# Out of Scope
- Redesign of global auth UX flows unrelated to identity binding.
- Broad auth architecture migration (for example server-managed session redesign) beyond requirement-scoped fixes.
- Organization navigation/IA redesign outside identity presentation behavior.

# Documentation updates required
- `docs/web-auth-flows.md` (identity binding and mismatch fallback behavior)
- `docs/web-profile-settings-flow.md` (organization identity source-of-truth fields)
- `docs/web-api-adapter-contract.md` (if identity/session payload contract is tightened)

# References
- `docs/web-auth-flows.md`
- `docs/web-profile-settings-flow.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-product-structure.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture review.
- Decision: `implementation_scope` remains `fullstack` because deterministic identity binding may require backend contract hardening in addition to frontend fixes.
- Decision: Scope is constrained to account identity presentation and mismatch handling only.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md`, `/home/sebas/git/agents/requirements/arch/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md`

# Architecture Notes
- Keep canonical role and route guard behavior unchanged; this requirement targets same-role identity correctness, not cross-role navigation behavior.
- Bind rendered organization identity to authenticated session account source-of-truth fields from profile/contracted payload, not cached prior-session UI state.
- Treat detected session-account versus resolved-profile mismatch as a security-integrity fault: clear auth cookies/session and redirect to localized login.
- Preserve adapter-layer boundary for identity reads; if backend hardening is needed, keep it limited to deterministic identity source fields and explicit mismatch semantics.
- Keep locale-prefixed routing and role-home resolution behavior unchanged outside the mismatch-fallback path.

# Dev Plan
1. Map current identity render path in org shell/header to the exact adapter payload fields used after login and protected-route re-entry.
2. Add deterministic session-account to profile-identity consistency check in frontend session/bootstrap flow.
3. Implement mismatch fallback path: invalidate session artifacts and redirect to `/{locale}/login` with safe next-handling rules.
4. Harden backend contract only if required to expose deterministic identity source fields needed for the check.
5. Verify non-regression for standard auth guard behavior (missing/expired session, role mismatch, role-home redirects).
6. Capture QA evidence for happy path, mismatch fallback, and same-browser account switch (`A -> logout -> B`) scenarios.

# Architecture Results
- Decision: Requirement is architecture-ready and consistent with auth-flow guard rules, profile source-of-truth boundaries, and product route model.
- Decision: `implementation_scope: fullstack` remains appropriate because frontend mismatch detection may require backend identity-contract hardening.
- Decision: Added explicit architecture guardrails for integrity-fault fallback and strict non-regression of existing role-guard behavior.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md` -> `/home/sebas/git/agents/requirements/dev/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md`

# Dev Results
- Organization shell/header identity now resolves from API-backed organization profile data (`displayName` + `location`) instead of static placeholder copy.
- Session/account binding is enforced for employer sessions by matching session account identity (`zz_auth_account` / JWT `sub`) against `GET /organisations/profile/me -> accountId`; mismatch or unauthorized identity fetch clears session and redirects to localized login.
- Same-browser account switch behavior is hardened by persisting/clearing session account identity cookie and verifying identity on shell bootstrap/focus/re-entry.
- Docs updated for session cookie model, organization identity source-of-truth fields, and adapter contract expectations.
- Validation run: `npm --prefix web run lint` (pass), `npm --prefix web run build` (pass; existing unrelated EN `MISSING_MESSAGE` logs remain in build output).
Changes: `web/src/components/shell/app-header.tsx`, `web/src/components/shell/app-session-guard.tsx`, `web/src/lib/auth/session-cookie.ts`, `web/src/lib/auth/session.ts`, `web/src/lib/auth/organization-identity.ts`, `web/src/lib/api/adapters/profile.ts`, `web/src/proxy.ts`, `web/messages/de.json`, `web/messages/en.json`, `docs/web-auth-flows.md`, `docs/web-profile-settings-flow.md`, `docs/web-api-adapter-contract.md`, `/home/sebas/git/agents/requirements/qa/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md`

# QA Results
- Decision: pass.
- Docs validation: implementation aligns with `docs/web-auth-flows.md`, `docs/web-profile-settings-flow.md`, and `docs/web-api-adapter-contract.md` identity-binding requirements (`accountId` session binding + `displayName`/`location` source fields).
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`248` passed, `0` failed).
- Requirement evidence:
- Happy path contract: backend `GET /organisations/profile/me` response includes `accountId`, `displayName`, and `location` (`app/src/organisation-profile/organisation-profile.controller.ts`), and FE header renders identity from resolved profile values (`web/src/components/shell/app-header.tsx`).
- Mismatch/fallback path: organization identity resolver returns `mismatch` when session `accountId` and profile `accountId` differ or are missing, and shell guard/header invalidates session by redirecting to localized login (`web/src/lib/auth/organization-identity.ts`, `web/src/components/shell/app-session-guard.tsx`, `web/src/components/shell/app-header.tsx`).
- Account-switch hardening: session account identity cookie is persisted and cleared deterministically (`web/src/lib/auth/session.ts`, `web/src/proxy.ts`); logout response clears `zz_auth_account`, verified via `curl -s -D - -o /dev/null http://localhost:3001/de/logout`.
- Non-regression checks: role mismatch and protected-route guard behavior remain intact (`curl` checks on `/de/app/admin` and `/de/app/organizations/dashboard` showed expected localized redirects).
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md`

# Security Results
- Decision: pass.
- Validation:
- Reviewed requirement-scoped identity/session paths in `web/src/lib/auth/organization-identity.ts`, `web/src/components/shell/app-session-guard.tsx`, `web/src/components/shell/app-header.tsx`, `web/src/lib/auth/session-cookie.ts`, and `app/src/organisation-profile/organisation-profile.controller.ts` against `docs/web-auth-flows.md` and `docs/web-api-adapter-contract.md`.
- Hardened session-account binding precedence in `web/src/lib/auth/session-cookie.ts` to prefer signed JWT `sub` over mutable `zz_auth_account` cookie fallback, reducing cookie-tampering influence on identity checks.
- Hardened organization profile auth failure handling in `app/src/organisation-profile/organisation-profile.controller.ts` by returning `UnauthorizedException` instead of generic runtime errors when auth context is missing.
- Re-validated with `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-blocking EN `MISSING_MESSAGE` logs remain outside this requirement scope), `npm --prefix /home/sebas/git/shift-matching/app run build` (pass), and `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `248`/`248`).
- Changes: `/home/sebas/git/shift-matching/web/src/lib/auth/session-cookie.ts`, `/home/sebas/git/shift-matching/app/src/organisation-profile/organisation-profile.controller.ts`, `/home/sebas/git/agents/requirements/sec/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md` -> `/home/sebas/git/agents/requirements/ux/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed organization identity presentation and mismatch fallback behavior in `web/src/components/shell/app-header.tsx`, `web/src/components/shell/app-session-guard.tsx`, and `web/src/lib/auth/organization-identity.ts` against `docs/web-auth-flows.md`, `docs/web-profile-settings-flow.md`, and `docs/glossary.md`.
- Fixed requirement-scoped copy clarity in header fallback identity text to avoid misleading indefinite loading wording when profile identity resolution encounters transient errors.
- Re-validated with `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass).
- Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/ux/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md` release gates.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-blocking EN `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `259` tests)
- Decision: pass; move to `released`.
- Changes: `/home/sebas/git/agents/requirements/deploy/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md` -> `/home/sebas/git/agents/requirements/released/REQ-AUTH-ORG-IDENTITY-BINDING-CORRECT-ACCOUNT-PRESENTATION.md`
