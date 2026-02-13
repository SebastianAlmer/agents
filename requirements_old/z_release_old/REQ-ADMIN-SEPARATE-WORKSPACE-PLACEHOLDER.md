---
id: REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER
title: Separate admin workspace from organization navigation
status: released
implementation_scope: frontend
source: user-2026-02-11-org-menu-admin-separation
---

# Summary
Remove admin entry points from organization navigation and keep admin capabilities in a dedicated admin workspace under admin routes.

# Scope
- Organization shell/navigation behavior in active frontend `web/`.
- Admin workspace entry and routing behavior in admin route space.
- Role-guard and redirect behavior at route/shell level.

# Acceptance Criteria
- [ ] Organization navigation does not show admin entries or role-switch controls on organization routes.
- [ ] Admin workspace remains reachable only through admin route space (`/{locale}/app/admin...`) with admin session.
- [ ] Employer sessions attempting admin routes are redirected by existing role-guard behavior to employer home.
- [ ] Existing admin must-flow routes remain reachable for admin role (`accounts`, `analytics`, `mail`, `contract-template`).
- [ ] No backend endpoint or schema changes are introduced.

# Definition of Done
- [ ] Requirement is implemented only in active frontend track `web/`.
- [ ] Locale-prefixed behavior remains valid for `/de` and `/en` phase rules.
- [ ] QA evidence includes one organization-route check and one admin-route check for navigation and guard behavior.
- [ ] Docs remain aligned with final route/navigation behavior before release.

# Assumptions
- Existing admin endpoints and admin route tree are sufficient for phase-1 admin workspace behavior.
- No global cross-role switcher is part of this delivery.

# Constraints
- Follow route and IA contract from `docs/web-product-structure.md`.
- Keep admin and organization boundaries from `docs/web-admin-governance-flow.md` and `docs/scope-boundaries.md`.
- Preserve auth and role-guard behavior defined in `docs/web-auth-flows.md`.
- Keep `web_legacy/` maintenance-only per `docs/web-governance.md`.

# Out of Scope
- New admin business capabilities.
- Backend auth/session model redesign.
- Redesign of admin module internals.

# References
- `docs/web-product-structure.md`
- `docs/web-admin-governance-flow.md`
- `docs/web-auth-flows.md`
- `docs/scope-boundaries.md`
- `docs/web-governance.md`

# Architecture Notes
- Keep admin and organization shells strictly separated: no admin nav item, link, or role-switch control in organization primary/secondary navigation.
- Keep canonical admin route space unchanged (`/{locale}/app/admin...`) and rely on existing session role guards for access control and redirect behavior.
- Implement the change at shared shell/navigation level in `web/` so organization pages inherit consistent behavior without per-page drift.
- Preserve utility navigation contract (notifications, account menu, logout) and locale-prefixed routing behavior.
- Avoid backend/API modifications; current admin and auth endpoints are sufficient for this scope.

# Dev Plan
1. Locate shared organization shell/navigation components in `web/` and remove admin entry points and role-switch controls.
2. Verify admin route navigation remains available only for admin session context and no organization UI path links into admin space.
3. Validate role-guard behavior on direct admin-route access with employer session (`redirect to employer home`) and with admin session (`allow`).
4. Run frontend baseline checks and capture QA evidence for one organization route and one admin route.

# PO Results
- Decision: moved to `arch`; docs are aligned and there is no direct contradiction.
- Decision: set `implementation_scope: frontend` because required changes are route/shell/navigation and guard behavior integration only.
- Decision: kept backend out of scope; existing admin API surface stays unchanged.
Changes: `agents/requirements/selected/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md -> agents/requirements/arch/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md`

# Architecture Results
- Decision: architecture-ready; requirement aligns with updated role-navigation boundaries in product structure and scope docs.
- Decision: frontend-only scope is sufficient because existing auth/session guard behavior already enforces admin route isolation.
- Decision: added explicit implementation guardrails to keep locale routing, utility nav, and admin must-flow routes unchanged.
Changes: `agents/requirements/arch/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md -> agents/requirements/dev/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md`

# Dev Results
- Removed admin entry visibility for non-admin sessions in shared app sidebar; organization routes no longer expose admin navigation entry points.
- Kept admin route space and role-guard enforcement unchanged (`/{locale}/app/admin...` remains admin-only via existing proxy role checks).
- Verified frontend lint baseline is green (`npm --prefix web run lint`).
- Build check currently fails due pre-existing `useSearchParams` suspense blocker on organization shifts route, tracked separately in `REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER`.
Changes: `web/src/components/shell/app-sidebar.tsx`, `agents/requirements/selected/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md -> agents/requirements/qa/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md`

# QA Results
- Acceptance criteria validation: pass. Organization navigation is role-scoped via `resolveAppNavItems("EMPLOYER")` and contains no admin destination or role-switch controls (`web/src/lib/navigation.ts`, `web/src/components/shell/app-sidebar.tsx`).
- Guard and route-space validation: pass. Admin route space remains under `/{locale}/app/admin...`, with role mismatch redirect to role home enforced in proxy (`web/src/proxy.ts`), covering employer-to-admin redirect behavior.
- Admin must-flow route validation: pass. Admin routes for `accounts`, `analytics`, `mail`, and `contract-template` are present and wired (`web/src/app/[locale]/app/admin/...` and `web/src/components/admin/admin-home-page.tsx`).
- Mandatory baseline checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint`: pass
- `npm --prefix /home/sebas/git/shift-matching/web run build`: pass
- `npm --prefix /home/sebas/git/shift-matching/app run build`: pass
- `npm --prefix /home/sebas/git/shift-matching/app run test`: pass (248/248)
Changes: `agents/requirements/qa/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md` (status updated, QA results added)

# Security Results
- Decision: pass; organization navigation does not expose admin entries or role-switch controls, and admin route access remains isolated to admin sessions through proxy role guards.
- Verification: shared role navigation resolution (`resolveAppNavItems`) keeps employer menu admin-free, and direct employer access to `/{locale}/app/admin...` is redirected to employer home by `web/src/proxy.ts`.
- Requirement-scoped security fixes: none required.
Changes: `agents/requirements/sec/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md -> agents/requirements/ux/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md`

# UX Results
- Decision: pass; organization workspace navigation is admin-free and has no role-switch controls, while admin workspace remains isolated to admin route space.
- UX validation: organization sidebar resolves from employer nav set only (`resolveAppNavItems("EMPLOYER")`), admin destinations remain in admin route space, and role-mismatch redirects for employer->admin routes are enforced by existing proxy guards.
- Requirement-scoped UX/copy fixes: none required.
Changes: `agents/requirements/ux/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md -> agents/requirements/deploy/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md`

# Deploy Results
- Decision: pass; requirement is deploy-ready for Coolify check mode and remains frontend-only in `web/` with no backend/schema changes.
- Coolify/deploy checks: `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass), `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run test` (pass; 248 passed, 0 failed).
- Deploy guardrails: release gates from `docs/web-release-versioning-model.md` and baseline checks from `docs/web-quality-test-program.md` are satisfied for this requirement.
Changes: `agents/requirements/deploy/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md -> agents/requirements/released/REQ-ADMIN-SEPARATE-WORKSPACE-PLACEHOLDER.md`
