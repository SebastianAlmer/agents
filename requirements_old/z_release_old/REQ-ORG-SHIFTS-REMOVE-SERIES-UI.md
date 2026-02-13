---
id: REQ-ORG-SHIFTS-REMOVE-SERIES-UI
title: Remove shift-series UI from organization shifts page
status: released
implementation_scope: frontend
source: user-2026-02-11-org-shifts-remove-series-ui
---

# Summary
Remove shift-series presentation from the organization planning page and keep the UI focused on single shift occurrences.

# Scope
- Frontend-only change in active frontend track `web/`.
- Route: `/{locale}/app/organizations/shifts`.
- Remove series-specific labels/sections/metadata from planning UI.
- Keep existing single-occurrence actions and route behavior.

# Acceptance Criteria
- On `/{locale}/app/organizations/shifts`, no series-specific UI is rendered (no series window, no recurrence days, no occurrences-per-series metadata).
- Planning UI remains occurrence-focused with existing occurrence fields (title, location, time range, status, request/applicant context where currently supported).
- Existing action from planning to occurrence detail remains unchanged: `/{locale}/app/organizations/jobs/{offerId}?occurrence={occurrenceId}`.
- Planning route behavior remains unchanged with `view=list|calendar` on same route and default `view=list`.
- No backend/API endpoint, adapter contract, or schema change is introduced by this requirement.

# Definition of Done
- Organization planning page no longer communicates recurring/series concepts in active UI.
- Change is implemented only in `web/` and keeps locale-prefixed route behavior unchanged.
- Existing planning quick actions and route mappings continue to work as documented.
- Requirement is ready for development with explicit non-regression scope.

# Assumptions
- Series-related payload fields may still exist temporarily in backend responses, but active frontend planning UI should ignore/hide them.

# Constraints
- Organization planning workspace remains `/{locale}/app/organizations/shifts`.
- Planning workspace must not introduce recurring-series semantics.
- No new product behavior may depend on series-level routes or series-level API semantics.
- Route and role-guard behavior remains unchanged.
- Productive copy remains message-driven (no hardcoded production labels).

# Out of Scope
- Backend removal of legacy recurrence fields/endpoints.
- Redesign of full jobs/shifts information architecture.
- Changes to job create/edit forms outside this planning page.

# References
- `docs/web-shifts-planning-flow.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-product-structure.md`
- `docs/scope-boundaries.md`
- `docs/web-governance.md`

# PO Results
- Decision: Requirement aligns with current planning and scope docs; no direct contradiction found.
- Decision: Requirement remains frontend-scoped in split routing mode (`implementation_scope: frontend`).
- Decision: Scope is constrained to removing series UI while preserving occurrence-level planning behavior and existing navigation/actions.
- Decision: Ready for architecture stage.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`

# Architecture Notes
- Keep canonical planning workspace unchanged at `/{locale}/app/organizations/shifts` with URL state `view=list|calendar`.
- Remove only series/recurrence presentation from UI; keep occurrence-level status, deadline, and staffing context intact.
- Keep deep-link behavior unchanged for occurrence detail: `/{locale}/app/organizations/jobs/{offerId}?occurrence={occurrenceId}`.
- Do not add any logic that depends on series-level routes or series-level API semantics.
- Keep locale-prefixed routing and role guards unchanged.

# Dev Plan
1. Locate organization planning UI composition (`web/src/components/jobs/organization-shifts-page.tsx` or current equivalent).
2. Remove series/recurrence-specific labels, metadata blocks, and helper text from list and calendar presentations.
3. Keep occurrence-focused fields/actions unchanged, including detail deep-link and shift-management navigation.
4. Verify `view=list|calendar` behavior and default `view=list` still works on the same route.
5. Validate no regression in alias/route behavior for organization planning paths.

# Architecture Results
- Decision: Architecture-ready; requirement is consistent with planning flow and scope boundaries.
- Decision: Frontend-only scope remains valid and bounded to UI semantics cleanup.
- Decision: Requirement proceeds to development.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`, `/home/sebas/git/agents/requirements/dev/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`

# Dev Results
- Updated `app.organizationShifts.heading` text in `en` locale to remove series semantics and keep planning occurrence-focused.
- Removed unused series-related `organizationShifts` message blocks from `de` and `en` locale files.
- Verified no `app.organizationShifts.series*` or `messages.emptySeries` keys are referenced by active frontend code.
- Ran `npm --prefix web run lint` successfully.
- Changes: `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/agents/requirements/dev/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`

# QA Results
- Result: Pass.
- Validation: `web/src/components/jobs/organization-shifts-page.tsx` renders occurrence-focused planning UI and does not render series/recurrence metadata on `/{locale}/app/organizations/shifts`.
- Validation: occurrence detail action remains `/{locale}/app/organizations/jobs/{offerId}?occurrence={occurrenceId}`.
- Validation: planning route behavior remains on the same route with `view=list|calendar` and default `view=list`; alias redirects remain consistent with docs.
- Validation: requirement scope remains frontend-only; no backend/API/schema change was required for this requirement.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-fatal `MISSING_MESSAGE` logs remain in baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248/248)
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`

# Security Results
- Validation: Planning page route/query handling remains constrained to documented values (`scope=upcoming|past`, `view=list|calendar`) and does not introduce open redirects or user-controlled navigation targets.
- Validation: Occurrence detail links remain internal app routes (`/app/organizations/jobs/{offerId}?occurrence={occurrenceId}`) and role-boundary enforcement is unchanged via existing route guards.
- Validation: Requirement remains frontend-only (UI semantics/copy cleanup); no backend/API/schema/auth contract changes were introduced.
- Decision: pass; move to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md -> /home/sebas/git/agents/requirements/ux/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`

# UX Results
- Validation: `web/src/components/jobs/organization-shifts-page.tsx` remains occurrence-focused and does not render series window, recurrence-day, or occurrences-per-series UI on `/{locale}/app/organizations/shifts`.
- Validation: Planning labels and helper copy in `web/messages/en.json` and `web/messages/de.json` avoid recurring-series semantics for the organization planning workspace.
- Validation: Existing planning actions stay unchanged, including occurrence detail deep-linking to `/app/organizations/jobs/{offerId}?occurrence={occurrenceId}` and `view=list|calendar` behavior on the same route.
- Decision: pass; move to `deploy`.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`, `/home/sebas/git/agents/requirements/deploy/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; non-blocking EN `MISSING_MESSAGE` warnings observed)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248 tests)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md -> /home/sebas/git/agents/requirements/released/REQ-ORG-SHIFTS-REMOVE-SERIES-UI.md`
