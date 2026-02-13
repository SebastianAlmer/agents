---
id: REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS
title: Make org dashboard and management links open functional target views
status: released
implementation_scope: frontend
source: user-2026-02-11-field-feedback-auth-navigation
---

# Summary
Ensure organization dashboard and management actions navigate to functional, visible target views so users land in the intended planning, shift-management, create, and detail contexts rather than URL-only or fallback behavior.

# Scope
- Organization dashboard CTA/worklist action navigation behavior.
- Planning route state activation for `/{locale}/app/organizations/shifts` (`view=list|calendar`, `scope=past`).
- Organization shift-management route behavior for `/{locale}/app/organizations/jobs`.
- Create flow and occurrence-detail deep-link entry behavior (`?create=1`, `?occurrence={occurrenceId}`).
- Disabled-state behavior with explicit reason text when an action cannot resolve a usable target state.

# Acceptance Criteria
- [ ] Organization dashboard actions route to documented targets and render visible destination surfaces:
  `/{locale}/app/organizations/offer-requests`,
  `/{locale}/app/organizations/shifts?view=list`,
  `/{locale}/app/organizations/shifts?view=calendar`,
  `/{locale}/app/organizations/jobs?create=1`,
  `/{locale}/app/organizations/profile`.
- [ ] Planning list, planning calendar, and past planning actions render the intended route state (`view`/`scope`) and do not result in URL-only updates with unchanged content.
- [ ] `Details oeffnen` actions resolve to `/{locale}/app/organizations/jobs/{id}?occurrence={occurrenceId}` and open the detail context for the selected occurrence.
- [ ] `Jobs verwalten` opens `/{locale}/app/organizations/jobs` shift-management workspace without redirecting back to dashboard except documented auth/role guards.
- [ ] When required target context is unavailable, actions are non-interactive and expose explicit reason text; silent no-op clicks are not allowed.
- [ ] All navigation behavior works for locale-prefixed `de` and `en` paths with English route slugs.

# Definition of Done
- [ ] Route-action behavior for organization dashboard/planning/management is aligned with documented action mapping and canonical route rules.
- [ ] QA evidence covers happy path plus one negative path for unavailable target context and validates explicit disabled-state reasons.
- [ ] Routing checks confirm canonical organization routes render dedicated surfaces and do not behave as redirect-only aliases (except documented auth/role guards).
- [ ] No backend endpoint, schema, or API contract changes are required to satisfy this requirement.

# Assumptions
- Existing route surfaces and query-state parsing in `web` are available for the documented organization routes.
- Data needed to build action links (offer/job/occurrence identifiers) remains available from existing dashboard/planning payloads or current UI state.
- This requirement is limited to navigation/state activation UX and does not change business decision logic.

# Constraints
- Use canonical organization routes and route-state contracts as defined in `docs/web-product-structure.md` and `docs/web-shifts-planning-flow.md`.
- Keep dashboard action mapping consistent with `docs/web-dashboard-flow.md`.
- Keep organization planning vs shift-management workspace separation (`shifts` vs `jobs`) per `docs/scope-boundaries.md` and `docs/web-jobs-requests-flow.md`.
- Implement in active frontend track `web/` and keep locale-prefixed, English-slug route conventions from `docs/web-governance.md`.
- Preserve quality-gate expectations for route behavior and must-flow navigation from `docs/web-quality-test-program.md`.

# Out of Scope
- New organization routes or IA restructuring.
- Backend API, data model, or schema changes.
- Changes to participant/admin navigation behavior.
- New ranking, prioritization, or automation logic in dashboard/worklists.

# References
- `docs/web-dashboard-flow.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-product-structure.md`
- `docs/web-quality-test-program.md`
- `docs/web-governance.md`
- `docs/scope-boundaries.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because required behavior is routing/state activation in existing web surfaces.
- Decision: Scope is constrained to organization navigation/action reliability without backend contract changes.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md`

# Architecture Notes
- Keep dashboard and planning actions bound to documented canonical routes and query-state contracts (`view`, `scope`, `create`, `occurrence`), with no new route model.
- Keep planning and shift-management workspace separation strict: `/{locale}/app/organizations/shifts` for planning context and `/{locale}/app/organizations/jobs` for management/create.
- Preserve canonical-route behavior: destination routes render dedicated surfaces and may redirect only for documented auth/role guards.
- When target context is unavailable, render non-interactive actions with explicit reason text; avoid silent no-op navigation.
- Keep locale-prefixed navigation and message-key copy governance aligned with phase-1 locale policy (DE runtime-active, EN prepared).

# Dev Plan
1. Inventory organization dashboard, planning, and management CTA handlers and map each to documented route targets.
2. Normalize route builders for `view=list|calendar`, `scope=past`, `create=1`, and occurrence detail deep links.
3. Implement route-state activation checks so destination surfaces update UI state with URL changes instead of URL-only transitions.
4. Add disabled-action rules for missing target context (for example missing `id` or `occurrenceId`) with explicit localized reason text.
5. Verify guard behavior for unauthorized/role-mismatched access remains unchanged and does not regress canonical route rendering.
6. Execute QA checks for happy path and one unavailable-context negative path across organization dashboard/planning/management flows.

# Architecture Results
- Decision: Requirement is architecture-ready and aligns with dashboard action mapping, planning flow route-state contracts, and canonical route rules.
- Decision: `implementation_scope: frontend` remains correct because this is navigation reliability and UI state activation within existing routes.
- Decision: Added guardrails for disabled-action semantics and URL-to-surface state consistency to prevent silent navigation failures.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md` -> `/home/sebas/git/agents/requirements/dev/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md`

# Dev Results
- Implemented query-state activation for organization jobs workspace create entry: `/{locale}/app/organizations/jobs?create=1` now opens the create form on route entry.
- Kept planning past navigation on canonical route state by linking directly to `/{locale}/app/organizations/shifts?scope=past`.
- Added explicit disabled-state behavior for occurrence-detail actions across organization dashboard, shifts planning, jobs pipeline, and offer-requests surfaces when required route IDs are unavailable.
- Added localized (`de`/`en`) reason texts for disabled detail/open-job actions.
- Verified frontend quality gates: `npm --prefix web run lint` and `npm --prefix web run build` pass.
Changes: `web/src/app/[locale]/app/organizations/jobs/page.tsx`, `web/src/components/jobs/organization-jobs-page.tsx`, `web/src/components/dashboard/organization-dashboard.tsx`, `web/src/components/jobs/organization-shifts-page.tsx`, `web/src/components/jobs/organization-offer-requests-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md`

# QA Results
- Decision: pass -> `sec` (requirement implementation aligns with docs and acceptance criteria).
- Verified organization dashboard route targets map to documented canonical destinations and render dedicated surfaces:
  `/{locale}/app/organizations/offer-requests`,
  `/{locale}/app/organizations/shifts?view=list`,
  `/{locale}/app/organizations/shifts?view=calendar`,
  `/{locale}/app/organizations/jobs?create=1`,
  `/{locale}/app/organizations/profile`
  in `web/src/components/dashboard/organization-dashboard.tsx`.
- Verified planning state activation by query parameters in `web/src/components/jobs/organization-shifts-page.tsx`:
  `view=list|calendar` switches visible surface state and `scope=past` switches to the past surface (not URL-only no-op).
- Verified deep-link detail behavior:
  detail actions build `/{locale}/app/organizations/jobs/{id}?occurrence={occurrenceId}`
  from dashboard/shifts/jobs/offer-requests, and occurrence query activation is handled in
  `web/src/components/jobs/organization-job-detail-page.tsx`.
- Verified negative-path behavior for unavailable route context:
  detail/open-job actions become non-interactive and show explicit reason text in
  `organization-dashboard`, `organization-shifts-page`, `organization-jobs-page`, and `organization-offer-requests-page`.
- Verified locale routing behavior uses locale-prefixed navigation (`de`/`en`) with English slugs via `web/src/i18n/navigation.ts` and `web/src/i18n/routing.ts`.
- Mandatory checks:
  `npm --prefix /home/sebas/git/shift-matching/web run lint` pass
  `npm --prefix /home/sebas/git/shift-matching/web run build` pass
  `npm --prefix /home/sebas/git/shift-matching/app run build` pass
  `npm --prefix /home/sebas/git/shift-matching/app run test` pass (`267` passed, `0` failed)
Changes: `/home/sebas/git/agents/requirements/qa/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md` -> `/home/sebas/git/agents/requirements/sec/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md`

# Security Results
- Reviewed requirement-scoped navigation and route-state implementation in:
  `web/src/app/[locale]/app/organizations/jobs/page.tsx`,
  `web/src/components/dashboard/organization-dashboard.tsx`,
  `web/src/components/jobs/organization-jobs-page.tsx`,
  `web/src/components/jobs/organization-shifts-page.tsx`,
  `web/src/components/jobs/organization-offer-requests-page.tsx`,
  and `web/src/proxy.ts`.
- Confirmed organization action links resolve to documented canonical organization routes only; no cross-role/admin destinations or external targets were introduced.
- Confirmed deep-link actions to `/{locale}/app/organizations/jobs/{id}?occurrence={occurrenceId}` are guarded by route-context checks and render explicit non-interactive fallback text when IDs are unavailable.
- Confirmed create entry `?create=1` and planning query states (`view`, `scope`) activate within canonical surfaces without bypassing existing auth/role guards.
- Confirmed middleware role guard enforcement for organization routes remains unchanged (`EMPLOYER` required under `/{locale}/app/organizations...`).
- Confirmed productive disabled-state copy remains message-key driven in DE/EN catalogs.
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
- Decision: pass. Move requirement to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md` -> `/home/sebas/git/agents/requirements/ux/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md`

# UX Results
- Decision: pass. Move requirement to `deploy`.
- Verified UX/navigation behavior against binding docs (`docs/web-dashboard-flow.md`, `docs/web-shifts-planning-flow.md`, `docs/web-jobs-requests-flow.md`, `docs/web-product-structure.md`, `docs/web-governance.md`, `docs/scope-boundaries.md`).
- Confirmed dashboard actions route to documented targets and visible destination surfaces for offer requests, planning list/calendar, create flow, and profile.
- Confirmed planning query-state activation (`view=list|calendar`, `scope=past`) updates visible organization planning surfaces and is not URL-only.
- Confirmed occurrence deep-link actions resolve to `/{locale}/app/organizations/jobs/{id}?occurrence={occurrenceId}` and detail context selection uses the occurrence query when present.
- Confirmed missing-context actions are non-interactive and show explicit reason text across dashboard, shifts, jobs, and offer-requests surfaces.
- UX fix applied: added explicit disabled visual state (`disabled:cursor-not-allowed disabled:opacity-60`) to the primary decision button in offer requests so disabled behavior is clear alongside existing reason text.
- Validation run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - Requirement-scoped i18n key coverage check for affected components (pass, no missing `de`/`en` keys).
Changes: `web/src/components/jobs/organization-offer-requests-page.tsx`, `/home/sebas/git/agents/requirements/ux/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md` -> `/home/sebas/git/agents/requirements/released/REQ-ORG-NAV-LINK-ACTIONS-ROUTE-TO-WORKING-VIEWS.md`
