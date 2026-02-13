---
id: REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY
title: Ensure reliable logout and session invalidation across org flows
status: released
implementation_scope: fullstack
source: user-2026-02-11-field-feedback-auth-navigation
---

# Summary
Ensure logout and session invalidation are deterministic so users can always sign out, expired sessions are enforced, and account switching works without manual cookie cleanup.

# Scope
- Frontend logout trigger, redirect, and post-logout protected-route behavior in `web/`.
- Session invalidation behavior for explicit logout and expiry paths.
- Account switching reliability across participant/employer/admin login flows.
- Minimal backend additions only when required for deterministic session handling (for example introspection/invalidation support already listed in API backlog).

# Acceptance Criteria
- Clicking `Abmelden` from app utility menu always navigates to `/{locale}/logout`, clears effective auth session, and lands on `/{locale}/login`.
- After logout, direct access to protected routes under `/{locale}/app` and `/{locale}/admin` redirects to localized login until successful re-authentication.
- Expired session is consistently invalidated and redirected to localized login; authenticated shell UI does not remain usable after expiry.
- Login with account A, logout, then login with account B (same browser) works without hard refresh/manual cookie deletion and resolves to the correct role home.
- Role-guard behavior remains intact: protected role mismatch redirects to authenticated role home.

# Definition of Done
- Requirement-scoped implementation is completed in `web/` and backend only where technically required for deterministic session handling.
- Auth/session behavior is documented in `docs/web-auth-flows.md` including logout and expiry handling expectations.
- Quality baseline is updated in `docs/web-quality-test-program.md` with explicit logout and account-switch verification coverage.
- API contract docs are updated in `docs/web-api-adapter-contract.md` when backend session endpoints/semantics change.
- QA evidence includes at least one deterministic run for logout, expired-session redirect, and account-switch path.

# Assumptions
- Current phase-1 auth model remains cookie-based session persistence on frontend (`zz_access_token`, `zz_auth_role`, `zz_auth_exp`, `zz_auth_locale`) unless a dedicated requirement supersedes this.
- No org-side role switcher is introduced; user context change is handled by logout/login.

# Constraints
- Keep locale-prefixed routing and login redirect semantics (`next`) for protected targets.
- No role switcher is introduced in organization shell.
- Preserve role-resolved home routing and role guards defined for `/{locale}/app` and `/{locale}/admin`.
- Keep adapter-based API integration model in `web` (no direct ad-hoc fetch usage in product screens).

# Out of Scope
- Redesign of login UI, registration UX, or magic-link product behavior outside logout/session reliability.
- Broad auth architecture migration (for example full move to server-managed httpOnly sessions) beyond requirement-scoped fixes.
- Notification center redesign and unrelated dashboard/navigation changes.

# Documentation updates required
- `docs/web-auth-flows.md` (explicit logout reliability + expiry handling expectations)
- `docs/web-quality-test-program.md` (mandatory checks for logout/account-switch path)
- `docs/web-api-adapter-contract.md` (if backend introspection/invalidation endpoint is added)

# References
- `docs/web-auth-flows.md`
- `docs/web-quality-test-program.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-product-structure.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is architecture-ready.
- Decision: `implementation_scope` remains `fullstack` because deterministic session handling may require backend support in addition to frontend fixes.
- Decision: Scope remains focused on logout/session invalidation and account-switch reliability only.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md`, `/home/sebas/git/agents/requirements/arch/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md`

# Architecture Notes
- Keep locale-safe logout flow strictly on canonical route `/{locale}/logout`; menu/link wiring must remain locale-aware.
- Session invalidation must be enforced in both client state and route guards (`/{locale}/app*`, `/{locale}/admin`) to avoid stale authenticated UI.
- Preserve current phase-1 cookie session model and role-home redirect semantics; no role-switcher and no auth model redesign in this scope.
- Prefer FE/proxy deterministic behavior first; backend additions are limited to requirement-scoped gaps (for example introspection/invalidation semantics already tracked in API backlog).
- Keep adapter-contract discipline: auth/session API calls stay in adapter layer and documented if endpoint semantics change.

# Dev Plan
1. Audit current logout trigger path(s) and ensure all app sign-out actions resolve to canonical `/{locale}/logout` behavior.
2. Implement deterministic client-side session clear + redirect handling and align with proxy guard invalidation on missing/expired session.
3. Validate protected-route behavior after logout/expiry (`/{locale}/app*`, `/{locale}/admin`) including `next` handling and role mismatch redirect continuity.
4. Add minimal backend support only if FE/proxy behavior cannot guarantee deterministic invalidation/account-switch reliability; keep endpoint contract changes documented.
5. Update auth and quality docs (`web-auth-flows`, `web-quality-test-program`, and `web-api-adapter-contract` when applicable) to match implemented runtime behavior.
6. Produce QA evidence for logout, expired-session redirect, and account-switch scenario in one browser session.

# Architecture Results
- Decision: Architecture-ready; no unresolved contradiction with routing, auth/session, or role-boundary docs.
- Decision: Requirement remains `fullstack` because deterministic runtime behavior may span FE/proxy and minimal backend support.
- Decision: Scope is constrained to logout/session invalidation reliability and account-switch determinism.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md`, `/home/sebas/git/agents/requirements/dev/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md`

# Dev Results
- Added deterministic logout invalidation in `web/src/proxy.ts`: `/{locale}/logout` now always clears auth cookies and redirects to localized login.
- Added app-shell session guard and shared auth redirect helper so expired/missing sessions are cleared and redirected to localized login with protected `next` while the shell is already open.
- Updated unauthorized client redirects in organization jobs/shifts and responder contracts flows to use the shared clear-session + localized-login redirect helper.
- Updated docs for auth/session runtime behavior and QA baseline coverage (`docs/web-auth-flows.md`, `docs/web-quality-test-program.md`).
- QA evidence (deterministic runs):
- `npm --prefix web run lint` passed.
- `npm --prefix web run build` passed (non-blocking pre-existing `MISSING_MESSAGE` logs for EN locale remain).
- `curl -s -D - -o /dev/null http://localhost:3001/de/logout` returned `307` to `/de/login` with auth cookie invalidation headers.
- `curl -s -D - -o /dev/null http://localhost:3001/de/app/responders/dashboard` returned `307` to `/de/login?next=...`.
- `curl -s -D - -o /dev/null -H 'Cookie: zz_access_token=fakeA; zz_auth_role=PARTICIPANT; zz_auth_exp=1; zz_auth_locale=de' http://localhost:3001/de/app/responders/dashboard` returned `307` to localized login and cleared auth cookies, covering expired-session and account-switch cleanup determinism.
- Changes: `/home/sebas/git/shift-matching/web/src/proxy.ts`, `/home/sebas/git/shift-matching/web/src/lib/auth/login-redirect.ts`, `/home/sebas/git/shift-matching/web/src/components/shell/app-session-guard.tsx`, `/home/sebas/git/shift-matching/web/src/components/shell/app-shell.tsx`, `/home/sebas/git/shift-matching/web/src/app/[locale]/logout/page.tsx`, `/home/sebas/git/shift-matching/web/src/components/contracts/responder-contracts-page.tsx`, `/home/sebas/git/shift-matching/web/src/components/jobs/organization-jobs-page.tsx`, `/home/sebas/git/shift-matching/web/src/components/jobs/organization-shifts-page.tsx`, `/home/sebas/git/shift-matching/docs/web-auth-flows.md`, `/home/sebas/git/shift-matching/docs/web-quality-test-program.md`, `/home/sebas/git/agents/requirements/qa/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md`

# QA Results
- Decision: pass.
- Validation: requirement behavior is aligned with `docs/web-auth-flows.md`, `docs/web-quality-test-program.md`, and `docs/web-api-adapter-contract.md`.
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`248` passed, `0` failed).
- Deterministic QA evidence:
- `curl -s -D - -o /dev/null http://localhost:3001/de/logout` returned `307` to `/de/login` with auth cookie invalidation headers (`zz_access_token`, `zz_auth_role`, `zz_auth_exp`, `zz_auth_locale`, `zz_auth_account`).
- `curl -s -D - -o /dev/null http://localhost:3001/de/app/responders/dashboard` returned `307` to `/de/login?next=...` when no session was present.
- `curl -s -D - -o /dev/null -H 'Cookie: zz_access_token=fakeA; zz_auth_role=PARTICIPANT; zz_auth_exp=1; zz_auth_locale=de' http://localhost:3001/de/app/responders/dashboard` returned `307` to localized login and cleared auth cookies (expired-session invalidation and account-switch cleanup path).
- `curl -s -D - -o /dev/null -H 'Cookie: zz_access_token=fakeP; zz_auth_role=PARTICIPANT; zz_auth_exp=4102444800; zz_auth_locale=de' http://localhost:3001/de/app/admin` returned `307` to `/de/app/responders/dashboard` (role mismatch guard preserved).
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md`

# Security Results
- Decision: pass.
- Validation:
- Reviewed requirement-scoped auth/session runtime paths in `web/src/proxy.ts`, `web/src/lib/auth/login-redirect.ts`, `web/src/lib/auth/session.ts`, and `web/src/components/shell/app-session-guard.tsx` against `docs/web-auth-flows.md` and `docs/web-api-adapter-contract.md`.
- Identified and fixed an open-redirect hardening gap in login `next` handling: `web/src/components/auth/login-view.tsx` now rejects unsafe internal targets (protocol-relative `//...`, backslash variants, and encoded leading slash/backslash forms) before post-login navigation.
- Re-validated with `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass) and `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing EN `MISSING_MESSAGE` logs remain non-blocking and outside this requirement scope).
- Changes: `/home/sebas/git/shift-matching/web/src/components/auth/login-view.tsx`, `/home/sebas/git/agents/requirements/sec/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md` -> `/home/sebas/git/agents/requirements/ux/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed logout/session UX behavior in `web/src/components/shell/app-header.tsx`, `web/src/components/shell/app-session-guard.tsx`, `web/src/lib/auth/login-redirect.ts`, and `web/src/proxy.ts` against `docs/web-auth-flows.md`, `docs/web-quality-test-program.md`, and `docs/glossary.md`.
- Fixed a requirement-scoped reliability UX risk: disabled prefetch on the account-menu logout navigation target so `/{locale}/logout` is only requested on explicit user intent.
- Re-validated with `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass).
- Changes: `/home/sebas/git/shift-matching/web/src/components/shell/app-header.tsx`, `/home/sebas/git/agents/requirements/ux/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md` release gates.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; non-blocking EN `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `259` tests)
- Decision: pass; move to `released`.
- Changes: `/home/sebas/git/agents/requirements/deploy/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md` -> `/home/sebas/git/agents/requirements/released/REQ-AUTH-LOGOUT-AND-SESSION-INVALIDATION-RELIABILITY.md`
