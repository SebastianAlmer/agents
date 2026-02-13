---
id: REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER
title: Fix organizations/shifts build blocker caused by useSearchParams without Suspense boundary
status: released
implementation_scope: frontend
source: qa-baseline-2026-02-11-shared-build-blocker
---

# Summary
Fix the shared Next.js production build blocker on the organization shifts route where `useSearchParams()` requires a Suspense boundary during prerender.

# Scope
- Frontend-only change in active track `web/`.
- Organization planning route area: `/{locale}/app/organizations/shifts` and related composition.
- Technical fix for build stability and route rendering safety.
- Preserve existing planning behavior and query semantics.

# Acceptance Criteria
- `npm --prefix /home/sebas/git/shift-matching/web run build` passes without `useSearchParams()` Suspense/prerender error on organization shifts routes.
- Route behavior remains unchanged for planning query handling (`view=list|calendar`, optional `scope`).
- Locale fallback behavior remains unchanged (`/en` resolves to equivalent `/de` path in phase-1 runtime).
- No backend/API endpoint, adapter contract, or schema change is introduced.

# Definition of Done
- Build blocker is resolved in `web/` without changing documented planning semantics.
- Organization planning route still follows canonical route model and alias behavior.
- Fix is scoped to technical rendering/build stabilization; no product behavior expansion.
- Requirement is ready for development with explicit non-regression boundaries.

# Assumptions
- Current failure is caused by client hook usage composition on route rendering and can be fixed entirely in frontend route/component structure.

# Constraints
- Keep canonical planning route unchanged: `/{locale}/app/organizations/shifts`.
- Keep documented planning semantics unchanged (`view=list|calendar`, default `view=list`).
- Keep locale-prefixed routing and phase-1 locale fallback behavior unchanged.
- Follow frontend governance: implement in `web/`, not in `web_legacy/`.
- Do not introduce new product behavior while applying technical fix.

# Out of Scope
- New planning features or UI redesign.
- Backend/API contract changes.
- Unrelated route refactors outside the blocker scope.

# References
- `docs/web-shifts-planning-flow.md`
- `docs/web-product-structure.md`
- `docs/web-governance.md`
- `docs/web-technical-foundation.md`
- `docs/web-quality-test-program.md`

# PO Results
- Decision: Requirement is aligned with current docs; no direct contradiction found.
- Decision: Requirement remains frontend-scoped in split routing mode (`implementation_scope: frontend`).
- Decision: Scope is constrained to technical build/render stabilization with planning behavior preserved.
- Decision: Ready for architecture stage.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`, `/home/sebas/git/agents/requirements/arch/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`

# Architecture Notes
- Keep canonical planning route and query semantics unchanged: `/{locale}/app/organizations/shifts` with `view=list|calendar` and optional `scope`.
- Resolve `useSearchParams()` composition using Next.js-supported Suspense/client-boundary pattern without changing product behavior.
- Limit changes to the owning shifts route/component composition in `web/`; avoid unrelated route refactors.
- Preserve locale-prefix and phase-1 locale fallback behavior exactly as documented.
- Keep alias and deep-link behavior intact for organization planning and occurrence-detail navigation.

# Dev Plan
1. Identify the exact `useSearchParams()` usage path in organization shifts route/component composition (`web/src/app/[locale]/app/organizations/shifts/...` and linked components).
2. Wrap/relocate the client hook usage behind an explicit Suspense-safe boundary (or equivalent supported composition) so prerender/build no longer fails.
3. Verify query-driven behavior (`view`, `scope`) remains unchanged in list/calendar rendering and navigation.
4. Run production build and route sanity checks to confirm blocker removal and non-regression on planning aliases.

# Architecture Results
- Decision: Architecture-ready; no contradiction with planning route model or scope boundaries.
- Decision: Frontend-only scope remains valid and bounded to technical rendering/build stabilization.
- Decision: Requirement proceeds to development.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`, `/home/sebas/git/agents/requirements/dev/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`

# Dev Results
- Added an explicit React `Suspense` boundary around `OrganizationShiftsPage` in the route entrypoint to satisfy Next.js prerender requirements for `useSearchParams()` usage in the client composition.
- Preserved existing route/query semantics for planning (`view=list|calendar`, optional `scope`) without behavior changes.
- Ran `npm --prefix /home/sebas/git/shift-matching/web run lint` successfully.
- Ran `npm --prefix /home/sebas/git/shift-matching/web run build` successfully; the previous `useSearchParams` Suspense/prerender blocker on organization shifts did not reappear.
- Changes: `/home/sebas/git/shift-matching/web/src/app/[locale]/app/organizations/shifts/page.tsx`, `/home/sebas/git/agents/requirements/dev/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`, `/home/sebas/git/agents/requirements/qa/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`

# QA Results
- Result: Pass.
- Validation: `web/src/app/[locale]/app/organizations/shifts/page.tsx` wraps `OrganizationShiftsPage` with an explicit React `Suspense` boundary, resolving the `useSearchParams()` prerender/build blocker.
- Validation: Planning query semantics remain unchanged in `web/src/components/jobs/organization-shifts-page.tsx` (`view=list|calendar`, optional `scope`, default list behavior).
- Validation: Locale fallback behavior remains unchanged (`/en/...` redirected to equivalent `/de/...`) in `web/src/proxy.ts`.
- Validation: Requirement remains frontend-scoped; no backend/API/schema change introduced.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-fatal `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248/248)
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`

# Security Results
- Validation: The fix introduces only a route-level `Suspense` boundary (`web/src/app/[locale]/app/organizations/shifts/page.tsx`) and does not change auth, permission, or data-access paths.
- Validation: Query handling in the planning page remains allowlisted (`view=list|calendar`, `scope=past|default`) and does not introduce user-controlled redirect or code-injection paths.
- Validation: Locale fallback and role guard behavior remain unchanged in `web/src/proxy.ts`.
- Decision: pass; move to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md -> /home/sebas/git/agents/requirements/ux/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`

# UX Results
- Validation: The route-level `Suspense` wrapper in `web/src/app/[locale]/app/organizations/shifts/page.tsx` is a technical rendering fix only and does not alter planning UX flow or visible copy.
- Validation: Planning interaction semantics in `web/src/components/jobs/organization-shifts-page.tsx` remain unchanged (`view=list|calendar`, optional `scope`, same occurrence-focused actions).
- Validation: Canonical/alias navigation behavior for organization planning remains aligned with docs and existing user expectations.
- Decision: pass; move to `deploy`.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`, `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; non-blocking EN `MISSING_MESSAGE` warnings observed)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248 tests)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md -> /home/sebas/git/agents/requirements/released/REQ-WEB-ORG-SHIFTS-FIX-USESEARCHPARAMS-SUSPENSE-BUILD-BLOCKER.md`
