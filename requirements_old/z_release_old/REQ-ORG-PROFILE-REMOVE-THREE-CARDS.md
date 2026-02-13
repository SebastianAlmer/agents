---
id: REQ-ORG-PROFILE-REMOVE-THREE-CARDS
title: Remove the three summary cards on organization profile page
status: released
implementation_scope: frontend
source: user-2026-02-11-org-profile-remove-three-cards
---

# Summary
Remove the three summary cards from the organization profile page so the view stays focused on profile/account data and edit actions.

# Scope
- Frontend-only change in active frontend track `web/`.
- Route: `/{locale}/app/organizations/profile`.
- Remove the three summary-card UI blocks from page layout.
- Keep profile form, save behavior, and account actions unchanged.

# Acceptance Criteria
- On `/{locale}/app/organizations/profile`, the three summary cards are not rendered.
- Organization profile form fields and save behavior remain unchanged.
- Existing profile visibility/edit rules remain unchanged.
- Layout remains usable on desktop and mobile after card removal.
- No backend/API endpoint, adapter contract, or schema change is introduced.

# Definition of Done
- Change is implemented only in `web/`.
- Organization profile route and role guard behavior remain unchanged.
- Locale-prefixed route behavior remains unchanged for `/de` and `/en` paths.
- Requirement is ready for development with explicit non-regression constraints.

# Assumptions
- The removed cards are informational only and not required for mandatory organization profile actions.

# Constraints
- Keep canonical route unchanged: `/{locale}/app/organizations/profile`.
- Keep organization profile required field model unchanged (display name, legal name, contact email, legal address).
- Keep existing organization profile visibility and edit rules unchanged.
- Keep locale-prefixed routing and deterministic role-based access behavior unchanged.
- Productive UI copy remains message-driven (no hardcoded production strings).

# Out of Scope
- Full organization profile IA redesign.
- Organization settings flow redesign.
- Role/permission model changes.
- Backend profile data-model or API changes.

# References
- `docs/web-profile-settings-flow.md`
- `docs/web-product-structure.md`
- `docs/web-dashboard-flow.md`
- `docs/web-governance.md`
- `docs/scope-boundaries.md`

# PO Results
- Decision: Requirement aligns with current profile/settings and governance docs; no direct contradiction found.
- Decision: In split routing mode, requirement remains frontend-scoped (`implementation_scope: frontend`).
- Decision: Scope is constrained to UI-only removal of summary cards with profile behavior preserved.
- Decision: Ready for architecture stage.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`

# Architecture Notes
- Keep canonical route and role guard unchanged at `/{locale}/app/organizations/profile`.
- Remove only informational summary-card blocks; keep required profile fields and save flow intact.
- Apply changes in the organization profile page component only to avoid cross-role regressions.
- Preserve message-driven copy and locale-prefix behavior without introducing hardcoded production strings.
- Maintain responsive layout quality after card removal on mobile and desktop.

# Dev Plan
1. Locate organization profile page composition in `web/src/components/profile/organization-profile-page.tsx` (or current equivalent).
2. Remove the three summary-card UI blocks while keeping form sections, validation, and save actions unchanged.
3. Verify route behavior and role access on `/{locale}/app/organizations/profile` remains unchanged.
4. Validate responsive layout and spacing after removal for desktop and mobile breakpoints.

# Architecture Results
- Decision: Architecture-ready; no unresolved contradiction with profile/settings docs.
- Decision: Frontend-only scope remains valid and bounded to UI simplification.
- Decision: Requirement proceeds to development.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`, `/home/sebas/git/agents/requirements/dev/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`

# Dev Results
- Verified `web/src/components/profile/organization-profile-page.tsx` no longer renders the three informational summary cards.
- Confirmed org profile form, validation, save action, and route scope remain unchanged.
- No frontend code changes were required for this requirement because implementation is already present in the active `web/` track.
- Changes: `/home/sebas/git/agents/requirements/dev/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`

# QA Results
- Validation: `web/src/components/profile/organization-profile-page.tsx` does not render the three summary-card UI blocks on `/{locale}/app/organizations/profile`.
- Validation: Organization profile form fields, validation, save action, and settings action remain unchanged.
- Validation: Canonical route remains `/{locale}/app/organizations/profile`; no role or backend contract changes were introduced.
- Validation: Layout remains usable after card removal, with form content and actions preserved in the existing responsive structure.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248 tests)
- Decision: pass; move to `sec`.
Changes: `/home/sebas/git/agents/requirements/qa/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md -> /home/sebas/git/agents/requirements/sec/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`

# Security Results
- Validation: Scope is UI-only card removal on `web/src/components/profile/organization-profile-page.tsx`; profile save flow and field validation behavior remain unchanged.
- Validation: Organization route access control remains enforced by role guards in `web/src/proxy.ts` for `/{locale}/app/organizations/*`; this requirement introduces no permission-model changes.
- Validation: No new user-controlled redirect targets, dynamic external links, or backend/API/schema changes were introduced in requirement scope.
- Decision: pass; move to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md -> /home/sebas/git/agents/requirements/ux/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`

# UX Results
- Validation: `web/src/components/profile/organization-profile-page.tsx` does not render the three summary-card blocks on `/{locale}/app/organizations/profile`.
- Validation: Profile form fields, validation, save action, and settings link remain present and unchanged in behavior after card removal.
- Validation: Page layout remains usable with one primary profile surface on desktop and mobile breakpoints; no new UX friction introduced by this requirement.
- Decision: pass; move to `deploy`.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`, `/home/sebas/git/agents/requirements/deploy/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; non-blocking EN `MISSING_MESSAGE` warnings observed)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248 tests)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md -> /home/sebas/git/agents/requirements/released/REQ-ORG-PROFILE-REMOVE-THREE-CARDS.md`
