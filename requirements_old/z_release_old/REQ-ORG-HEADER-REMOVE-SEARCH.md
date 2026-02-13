---
id: REQ-ORG-HEADER-REMOVE-SEARCH
title: Remove header search for organization role
status: released
implementation_scope: frontend
source: user-2026-02-11-org-remove-header-search
---

# Summary
Remove header search for organization users while keeping participant header search behavior unchanged.

# Scope
- Frontend-only change in active frontend track `web/`.
- Shared authenticated header behavior in app routes.
- Role-based visibility for header search.
- Preserve notifications, account menu, and logout behavior.

# Acceptance Criteria
- On organization app routes (`/{locale}/app/organizations/...`), header search input is not rendered.
- On participant app routes (`/{locale}/app/responders/...`), header search input remains rendered and behavior stays unchanged.
- On admin app routes (`/{locale}/app/admin...`), header search input is not rendered.
- Notifications, account menu, and logout controls remain available and functional for existing roles.
- No backend/API endpoint or schema change is introduced.

# Definition of Done
- Role-based header search visibility is implemented only in `web/`.
- Route behavior remains locale-prefixed and role guards are unchanged.
- Header layout remains usable on desktop and mobile after removing org/admin search.
- Requirement is ready for architecture handoff with explicit non-regression scope.

# Assumptions
- Organization workflows do not require global header search in current scope.
- Participant workflows continue using existing search entry points.

# Constraints
- Locale-prefixed routing remains mandatory (`/{locale}/...`).
- Route slugs remain English across locales.
- Utility navigation follows documented model: search is optional "where available", while notifications/account/logout remain present.
- Productive UI copy remains message-driven (no hardcoded production strings).
- No role-rights, auth, or redirect behavior changes are introduced.

# Out of Scope
- Search algorithm, indexing, or backend query changes.
- New organization-specific search replacement UI.
- Changes to dashboard data sources or API contracts.

# References
- `docs/web-product-structure.md`
- `docs/web-dashboard-flow.md`
- `docs/web-governance.md`
- `docs/web-auth-flows.md`
- `docs/ui-language-policy.md`

# PO Results
- Decision: Requirement is aligned with docs; no direct contradiction found.
- Decision: Utility-navigation rule allows role-scoped search visibility because search is documented as optional where available.
- Decision: Requirement remains frontend-only in split routing mode (`implementation_scope: frontend`).
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-HEADER-REMOVE-SEARCH.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-HEADER-REMOVE-SEARCH.md`

# Architecture Notes
- Keep routing and role guards unchanged; apply visibility only in header UI composition.
- Implement role-scoped rendering from existing authenticated role context to avoid route-based duplication.
- Preserve utility actions parity for notifications, account menu, and logout across roles.
- Keep header behavior responsive on mobile and desktop after org/admin search removal.
- Keep labels and placeholders message-driven; do not introduce hardcoded production strings.

# Dev Plan
1. Identify shared header component(s) used by `responders`, `organizations`, and `admin` app shells in `web/`.
2. Add role-based visibility condition so search input renders only for participant role.
3. Verify org and admin routes render header without search while other utility controls remain functional.
4. Validate participant routes keep search behavior unchanged and locale-prefixed navigation remains intact.

# Architecture Results
- Decision: Architecture-ready; no contradictions with navigation model or auth flow.
- Decision: Frontend-only scope is valid and bounded to role-based header rendering.
- Decision: Requirement proceeds to development.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-HEADER-REMOVE-SEARCH.md`, `/home/sebas/git/agents/requirements/dev/REQ-ORG-HEADER-REMOVE-SEARCH.md`

# Dev Results
- Verified shared header role gating in `web/src/components/shell/app-header.tsx`: search input visibility is `showSearch = role === "PARTICIPANT"`.
- Confirmed acceptance behavior is already satisfied: organization and admin routes do not render header search; participant routes keep it.
- Confirmed utility controls (notifications, profile menu, logout) remain available in the same header composition.
- Ran frontend validation: `npm --prefix web run lint` passed.
Changes: `/home/sebas/git/agents/requirements/dev/REQ-ORG-HEADER-REMOVE-SEARCH.md -> /home/sebas/git/agents/requirements/qa/REQ-ORG-HEADER-REMOVE-SEARCH.md`

# QA Results
- Validation: Requirement behavior is implemented in `web/src/components/shell/app-header.tsx` with role-based gating `showSearch = role === "PARTICIPANT"`.
- Validation: Organization and admin header states do not render search, while participant header search remains present.
- Validation: Notifications, account menu, and logout controls remain available in the shared header component.
- Validation: No backend/API/schema changes introduced by this requirement scope.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248 tests)
- Decision: pass; move to `sec`.
Changes: `/home/sebas/git/agents/requirements/qa/REQ-ORG-HEADER-REMOVE-SEARCH.md -> /home/sebas/git/agents/requirements/sec/REQ-ORG-HEADER-REMOVE-SEARCH.md`

# Security Results
- Validation: Role-based search visibility remains UI-only in `web/src/components/shell/app-header.tsx` and does not introduce auth or permission logic changes.
- Validation: Protected route authorization boundaries remain enforced in `web/src/proxy.ts`; this requirement does not alter role guards or redirect policy.
- Validation: No backend/API/schema/session-contract changes were introduced for this requirement scope.
- Decision: pass; move to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-HEADER-REMOVE-SEARCH.md -> /home/sebas/git/agents/requirements/ux/REQ-ORG-HEADER-REMOVE-SEARCH.md`

# UX Results
- Decision: pass; shared header search visibility is correctly role-scoped to participant routes only.
- UX validation: organization and admin routes do not render the header search input; participant routes keep existing search behavior; notifications, account menu, and logout remain available and unchanged.
- Requirement-scoped UX/copy fixes: none required.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-ORG-HEADER-REMOVE-SEARCH.md -> /home/sebas/git/agents/requirements/deploy/REQ-ORG-HEADER-REMOVE-SEARCH.md`

# Deploy Results
- Decision: pass; requirement is deploy-ready for Coolify check mode and remains frontend-only with no backend/API/schema changes.
- Coolify/deploy checks: `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass), `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run test` (pass; 248 passed, 0 failed).
- Notes: `web` build reports pre-existing EN `MISSING_MESSAGE` warnings but exits successfully; no requirement-scoped deploy blocker detected.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-HEADER-REMOVE-SEARCH.md -> /home/sebas/git/agents/requirements/released/REQ-ORG-HEADER-REMOVE-SEARCH.md`
