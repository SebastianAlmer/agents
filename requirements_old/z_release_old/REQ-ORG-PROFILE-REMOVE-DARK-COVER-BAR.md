---
id: REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR
title: Remove decorative dark cover bar from organization profile card
status: released
implementation_scope: frontend
source: user-2026-02-11-org-profile-remove-black-bar
---

# Summary
Remove the decorative dark horizontal cover bar from the organization profile card on `/{locale}/app/organizations/profile` while keeping profile behavior and layout stability unchanged.

# Scope
- Frontend-only change in `web/` organization profile UI.
- Organization profile route behavior at `/{locale}/app/organizations/profile`.
- Desktop and mobile rendering of the same profile card.

# Acceptance Criteria
- The organization profile card no longer renders the decorative dark cover bar at the top.
- No replacement top decoration is introduced in this requirement (no dark strip, hero image, or decorative gradient block).
- Organization identity content (avatar/icon, name, supporting metadata) remains readable and aligned on desktop and mobile baseline viewports.
- Existing profile interactions remain unchanged: loading, validation, save action, and success/error feedback still function.
- Route behavior remains locale-prefixed and unchanged for this screen (`/de/app/organizations/profile` and `/en/app/organizations/profile`).

# Definition of Done
- Requirement scope is delivered only in frontend code under `web/` with no backend/API contract changes.
- QA evidence includes one desktop and one mobile verification for the organization profile screen without the dark cover bar.
- Governance baseline checks pass for this screen: localized route behavior, explicit state handling, and no hardcoded productive copy regressions.

# Assumptions
- The current organization profile card includes a decorative dark cover bar that is not functionally required.
- Removing this element does not require changing profile field definitions or API payload structure.

# Constraints
- Keep locale-prefixed routing and English slug rules unchanged (`docs/web-product-structure.md`, `docs/web-governance.md`).
- Keep the change in `web/` as the active frontend track; no `web_legacy/` feature work (`docs/web-governance.md`).
- Preserve profile field model and behavior boundaries for organization profile flow (`docs/web-profile-settings-flow.md`).
- Keep mobile baseline behavior stable in the defined phone viewport range (`docs/mobile-web-baseline.md`).
- Keep UI consistency with web design and layout standards without introducing unrelated redesign (`docs/web-design-system.md`, `docs/modern-ui.md`).

# Out of Scope
- Full profile page redesign.
- Responder profile visual refactor.
- New profile media/upload features.
- Any backend, auth, or API adapter changes.

# References
- `docs/web-profile-settings-flow.md`
- `docs/web-design-system.md`
- `docs/modern-ui.md`
- `docs/web-governance.md`
- `docs/web-product-structure.md`
- `docs/mobile-web-baseline.md`

# PO Results
- Decision: No direct contradiction with docs was identified; requirement is ready for architecture handoff.
- Decision: `implementation_scope` is `frontend` in split mode because the requested change is visual and route-behavior preserving.
- Decision: Scope is constrained to removing the decorative bar without introducing new UI elements or backend changes.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md`

# Architecture Notes
- Remove only the decorative top bar container in the organization profile card; keep profile fields, actions, and data binding unchanged.
- Keep canonical route behavior unchanged at `/{locale}/app/organizations/profile` with locale prefixes `/de` and `/en`.
- Do not introduce any replacement hero/decorative block; retain existing profile content hierarchy and readability.
- Preserve explicit loading, validation, save success/error handling, and message-driven copy behavior.
- Keep responsive stability in mobile baseline widths `360px` to `430px` without horizontal overflow.

# Dev Plan
1. Locate the decorative bar markup and related style hook in the `web/` organization profile component.
2. Remove only the decorative top bar element/style references while preserving card spacing and content alignment.
3. Verify profile behavior is unchanged: loading state, field validation, save action, and success/error feedback.
4. Verify route and responsive non-regression on `/{locale}/app/organizations/profile` for desktop and mobile baseline viewports.

# Architecture Results
- Decision: Requirement aligns with `docs/web-profile-settings-flow.md`, `docs/web-governance.md`, and `docs/mobile-web-baseline.md`; no unresolved architecture contradiction found.
- Decision: `implementation_scope: frontend` remains correct because this is a UI-only change with no contract or backend impact.
- Decision: Requirement is architecture-ready and moved to development.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md` -> `/home/sebas/git/agents/requirements/dev/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md`

# Dev Results
- Removed the decorative dark top cover bar from the organization profile card in `web/`, without adding any replacement hero/strip decoration.
- Kept organization identity content readable after bar removal by removing the previous negative avatar offset that depended on the removed cover area; desktop/mobile responsive layout classes remain unchanged.
- Verified integration baseline:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (non-blocking, pre-existing `MISSING_MESSAGE` logs for EN keys remain during static generation).
- Changes: `/home/sebas/git/shift-matching/web/src/components/profile/organization-profile-page.tsx`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md`

# QA Results
- Decision: pass.
- Validation: organization profile card on `/{locale}/app/organizations/profile` no longer renders a decorative dark cover bar and no replacement decorative strip/hero block was introduced.
- Scope compliance: frontend-only; no backend/API contract changes detected for this requirement scope.
- Behavior checks:
- Profile interactions remain present and unchanged in component logic (`loading`, client validation, save submit, success/error notice rendering).
- Locale-prefixed route behavior remains unchanged with canonical profile path in `web/src/app/[locale]/app/organizations/profile/page.tsx`.
- Responsive/layout stability remains based on existing classes (`p-6 md:p-8`, `flex flex-wrap`, no overflow-prone replacement block introduced).
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`248` passed, `0` failed).
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md` -> `/home/sebas/git/agents/requirements/ux/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md`

# Security Results
- Decision: pass.
- Validation:
- Reviewed requirement-scoped implementation in `web/src/components/profile/organization-profile-page.tsx` and route entry `web/src/app/[locale]/app/organizations/profile/page.tsx` against `docs/web-profile-settings-flow.md`, `docs/web-product-structure.md`, and `docs/web-auth-flows.md`.
- Confirmed scoped diff is visual-only (`SurfaceCard` decorative dark bar removal and dependent avatar offset normalization) with no changes to auth/session handling, role guards, routing, API calls, or data exposure behavior.
- No requirement-scoped security/compliance blocker found.
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md` -> `/home/sebas/git/agents/requirements/ux/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed organization profile UI implementation at `web/src/components/profile/organization-profile-page.tsx` and route entry at `web/src/app/[locale]/app/organizations/profile/page.tsx` against `docs/web-design-system.md`, `docs/modern-ui.md`, `docs/web-profile-settings-flow.md`, and `docs/mobile-web-baseline.md`.
- Confirmed the decorative dark cover bar is removed and no replacement decorative strip/hero block is rendered; organization identity content remains readable and aligned in the existing desktop/mobile layout structure.
- Confirmed requirement-scoped interaction behavior remains unchanged (loading, validation, save action, success/error notices).
- Re-validated with `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass).
- Changes: `/home/sebas/git/agents/requirements/ux/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md` release gates.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-blocking EN `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `259` tests)
- Decision: pass; move to `released`.
- Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md` -> `/home/sebas/git/agents/requirements/released/REQ-ORG-PROFILE-REMOVE-DARK-COVER-BAR.md`
