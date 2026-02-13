---
id: REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT
title: Rebuild organization menu with planning workspace and shift management workspace
status: released
implementation_scope: frontend
source: user-2026-02-11-org-menu-rebuild-planning-management
---

# Summary
Rework organization navigation so operations are clearly split into planning and shift management workspaces with canonical routing and deterministic route behavior.

# Scope
- Organization primary navigation order and labels.
- Canonical routing for planning and shift management workspaces.
- Alias normalization for documented legacy organization routes.
- Workspace responsibility boundaries between planning, shift management, and offer-requests.
- Documentation alignment for product structure and flow mapping.

# Acceptance Criteria
- Organization primary navigation order is `dashboard`, `planning`, `shift management`, `offer-requests`, `responders`, `contracts`, `organization profile/settings`; no admin entry is exposed.
- Canonical routes are enforced:
  - planning -> `/{locale}/app/organizations/shifts`
  - shift management -> `/{locale}/app/organizations/jobs`
- Planning route supports URL state `view=list|calendar` on the same route with default `view=list`.
- Organization alias normalization matches documented targets:
  - `/{locale}/app/organizations/shifts/active` -> `/{locale}/app/organizations/shifts?view=list`
  - `/{locale}/app/organizations/shifts/drafts` -> `/{locale}/app/organizations/jobs?scope=drafts`
  - `/{locale}/app/organizations/shifts/templates` -> `/{locale}/app/organizations/jobs?scope=templates`
- Workspace boundaries are preserved:
  - planning visibility in `.../organizations/shifts`
  - create/edit/drafts/templates in `.../organizations/jobs`
  - request decisions in `.../organizations/offer-requests`
- Dashboard action mapping remains aligned with docs:
  - `.../organizations/shifts?view=list`
  - `.../organizations/shifts?view=calendar`
  - `.../organizations/jobs?create=1`

# Definition of Done
- Requirement has testable route/navigation acceptance criteria for frontend implementation.
- Requirement is aligned with current docs for IA order, canonical routes, alias behavior, and workspace boundaries.
- Frontend-only scope is explicit and backend contract changes are excluded.
- Requirement is ready for development with `status: dev` and `implementation_scope: frontend`.

# Assumptions
- Final localized menu labels are maintained via message catalogs and not hardcoded.
- Canonical route names remain unchanged.
- Backend planning-feed/API evolution is handled in separate backend requirements.

# Constraints
- Locale-prefixed routes remain mandatory (`/{locale}/...`).
- Route slugs remain English across locales.
- Organization navigation must not expose admin destinations or role-switch controls.
- Planning workspace must not introduce recurring-series semantics.
- Redirect and role-resolution behavior must remain deterministic.

# Out of Scope
- Backend API endpoint additions or contract changes.
- Participant/public/admin IA redesign.
- Request lifecycle/status transition changes.
- New product behavior beyond documented navigation/workspace split.

# References
- `docs/web-product-structure.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-dashboard-flow.md`
- `docs/scope-boundaries.md`

# PO Results
- Decision: Requirement is aligned with current docs; no direct contradiction found.
- Decision: In split routing mode, this requirement remains frontend-scoped (`implementation_scope: frontend`).
- Decision: Backend contract evolution is intentionally tracked outside this navigation requirement.
- Decision: Ready for architecture stage.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md`

# Architecture Notes
- Keep the organization primary navigation order exactly as documented in product structure.
- Treat `/{locale}/app/organizations/shifts` as the canonical planning workspace with URL state `view=list|calendar`.
- Keep shift management responsibilities in `/{locale}/app/organizations/jobs`; do not move create/edit/draft/template actions into planning route.
- Preserve deterministic alias normalization for `.../shifts/active`, `.../shifts/drafts`, and `.../shifts/templates` to documented targets.
- Keep role boundaries strict: no admin destination or role-switch controls in organization navigation.

# Dev Plan
1. Update organization navigation config/rendering to the documented order and labels (dashboard, planning, shift management, offer-requests, responders, contracts, profile/settings).
2. Ensure planning entry routes to `/{locale}/app/organizations/shifts` and default URL behavior resolves to `view=list`.
3. Verify alias route normalization for `.../shifts/active`, `.../shifts/drafts`, and `.../shifts/templates` matches documented redirect/query targets.
4. Confirm dashboard action links continue targeting planning list/calendar and create-flow routes as specified.
5. Run route-level regression checks for locale prefix behavior and organization-only navigation boundaries.

# Architecture Results
- Decision: Architecture-ready; requirement is consistent with routing model, navigation IA, and workspace boundaries.
- Decision: Frontend-only scope remains valid; backend contract changes stay out of scope.
- Decision: Requirement proceeds to development.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md`, `/home/sebas/git/agents/requirements/dev/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md`

# Dev Results
- Implemented role-specific organization sidebar navigation order and entries: dashboard, planning, shift management, offer-requests, responders, contracts, profile/settings; admin entry is not exposed for organization role.
- Added organization nav i18n keys (`planning`, `shiftManagement`, `offerRequests`, `responders`) in DE/EN message catalogs.
- Normalized organization alias routes per requirement:
  - `.../shifts/active` -> `.../shifts?view=list`
  - `.../shifts/drafts` -> `.../jobs?scope=drafts`
  - `.../shifts/templates` -> `.../jobs?scope=templates`
- Updated planning workspace route behavior to support `view=list|calendar` on the same route with default `list`, and removed drafts/templates tabs from planning route UI to keep those concerns in jobs workspace.
- Updated dashboard action mapping links so planning follow-up routes use `.../organizations/shifts?view=list` and `.../organizations/shifts?view=calendar`, while create flow remains `.../organizations/jobs?create=1`.
- Verified frontend baseline with `npm --prefix web run lint` (pass).
Changes: `/home/sebas/git/shift-matching/web/src/lib/navigation.ts`, `/home/sebas/git/shift-matching/web/src/components/shell/app-sidebar.tsx`, `/home/sebas/git/shift-matching/web/src/app/[locale]/app/organizations/shifts/active/page.tsx`, `/home/sebas/git/shift-matching/web/src/app/[locale]/app/organizations/shifts/drafts/page.tsx`, `/home/sebas/git/shift-matching/web/src/app/[locale]/app/organizations/shifts/templates/page.tsx`, `/home/sebas/git/shift-matching/web/src/components/jobs/organization-shifts-page.tsx`, `/home/sebas/git/shift-matching/web/src/components/dashboard/organization-dashboard.tsx`, `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/dev/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md -> /home/sebas/git/agents/requirements/qa/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md`

# QA Results
- Validation: Organization primary navigation order and role boundaries are implemented in `web/src/lib/navigation.ts` and rendered in `web/src/components/shell/app-sidebar.tsx` as `dashboard`, `planning`, `shift management`, `offer-requests`, `responders`, `contracts`, `profile`; admin entry is not exposed for organization role.
- Validation: Canonical route mapping is in place: planning -> `/{locale}/app/organizations/shifts`, shift management -> `/{locale}/app/organizations/jobs`.
- Validation: Planning workspace supports URL state `view=list|calendar` with default `list` in `web/src/components/jobs/organization-shifts-page.tsx`.
- Validation: Alias normalization matches docs:
  - `/{locale}/app/organizations/shifts/active` -> `/{locale}/app/organizations/shifts?view=list`
  - `/{locale}/app/organizations/shifts/drafts` -> `/{locale}/app/organizations/jobs?scope=drafts`
  - `/{locale}/app/organizations/shifts/templates` -> `/{locale}/app/organizations/jobs?scope=templates`
- Validation: Dashboard action mapping remains aligned in `web/src/components/dashboard/organization-dashboard.tsx` with links to `.../shifts?view=list`, `.../shifts?view=calendar`, and `.../jobs?create=1`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248 tests)
- Decision: pass; move to `sec`.
Changes: `/home/sebas/git/agents/requirements/qa/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md -> /home/sebas/git/agents/requirements/sec/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md`

# Security Results
- Validation: Organization navigation composition in `web/src/lib/navigation.ts` keeps role boundaries intact; organization role does not expose admin destinations.
- Validation: Alias normalization pages (`.../shifts/active`, `.../shifts/drafts`, `.../shifts/templates`) redirect only to fixed internal paths and do not use user-controlled redirect targets.
- Validation: Planning URL-state handling (`view=list|calendar`) is allowlisted in `web/src/components/jobs/organization-shifts-page.tsx`, preventing unsafe or unexpected route-state values from changing navigation behavior.
- Decision: pass; move to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md -> /home/sebas/git/agents/requirements/ux/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md`

# UX Results
- Validation: Organization navigation labels and order in `web/src/lib/navigation.ts` and `web/messages/en.json`/`web/messages/de.json` match the documented split between planning and shift management.
- Validation: Planning workspace copy in `web/src/components/jobs/organization-shifts-page.tsx` and message catalogs keeps boundary guidance clear (planning in `.../organizations/shifts`, drafts/templates/create in `.../organizations/jobs`).
- Validation: Alias redirects and dashboard follow-up routes use canonical destinations without UX ambiguity.
- Decision: pass; move to `deploy`.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md`, `/home/sebas/git/agents/requirements/deploy/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md`

# Deploy Results
- Validation: Coolify deploy-readiness checks are green for this requirement scope and repository state.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; non-blocking EN `MISSING_MESSAGE` warnings observed)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248 tests)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md -> /home/sebas/git/agents/requirements/released/REQ-ORG-NAV-SPLIT-PLANNING-AND-SHIFT-MANAGEMENT.md`
