---
id: REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES
title: Replace role help/onboarding redirect-only pages with explicit live guidance surfaces
status: released
implementation_scope: frontend
source: user-2026-02-12-frontend-wiring-stub-audit
---

# Summary
Replace redirect-only behavior on active role help/onboarding routes with explicit, message-driven pages so participant and organization guidance is available in-app without immediate profile redirects.

# Scope
- Frontend-only implementation in active track `web/`.
- In-scope routes:
  - `/{locale}/app/responders/help`
  - `/{locale}/app/responders/onboarding`
  - `/{locale}/app/organizations/onboarding`
- Existing role/session guards and locale-prefix behavior stay unchanged.

# Acceptance Criteria
- [ ] The three in-scope routes render dedicated screens and no longer immediately redirect to profile pages.
- [ ] Screens provide explicit guidance and deterministic CTAs toward profile/settings completion using current role route model.
- [ ] Productive copy is message-key driven (no hardcoded productive copy in components).
- [ ] Explicit `loading`, `empty` (where applicable), `error`, and success/notice handling is documented and implemented per screen intent.
- [ ] Guard behavior for missing/expired/unauthorized session remains aligned with existing documented auth flows.
- [ ] Legacy alias redirects that are explicitly documented as redirect-only remain unchanged.

# Definition of Done
- [ ] `/{locale}/app/responders/help`, `/{locale}/app/responders/onboarding`, and `/{locale}/app/organizations/onboarding` render dedicated route surfaces in `web/`.
- [ ] QA evidence includes one authenticated happy path per in-scope route and one guard/unauthorized path.
- [ ] Locale-prefixed route behavior and documented alias redirects remain valid after change.
- [ ] Build and lint baseline for `web` remains passing with no new i18n coverage regressions.

# Assumptions
- Current redirect-only behavior on these canonical routes is implementation debt, not intended product behavior.
- Existing auth/session guards already provide required protection and do not require backend changes for this requirement.
- Guidance content can be delivered with existing message catalog patterns and route structure.

# Constraints
- Keep role rights, lifecycle invariants, and route slugs unchanged.
- Keep locale policy unchanged (`de` runtime-active, `en` prepared).
- Keep implementation in `web/` only; no `web_legacy/` feature work.
- Keep adapter-boundary rules from frontend governance/docs.
- Keep canonical-route behavior aligned with `docs/web-product-structure.md` (canonical routes render surfaces; redirect-only is for aliases/legacy paths).

# Out of Scope
- Backend endpoint/schema changes.
- Navigation IA expansion beyond current documented route model.
- New locale enablement decisions.

# References
- `docs/web-product-structure.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`
- `docs/web-profile-settings-flow.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is route-surface and UI guidance behavior in `web/`.
- Decision: Scope is constrained to canonical help/onboarding surfaces while preserving documented alias and guard behavior.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md`

# Architecture Notes
- Keep canonical route behavior from product structure: the three in-scope canonical routes must render dedicated surfaces and must not be redirect-only.
- Preserve alias behavior for documented redirect-only paths (for example `/{locale}/help` alias) and do not convert aliases into new canonical pages.
- Keep existing auth/session guards unchanged; only documented guard redirects (missing/expired/unauthorized) may navigate away from canonical surfaces.
- Keep copy governance strict: productive text remains message-key driven with DE runtime active and EN prepared-only.
- Keep implementation bounded to `web/` route surfaces and local guidance/CTA behavior without backend or route-model expansion.

# Dev Plan
1. Replace current immediate redirects on `/{locale}/app/responders/help`, `/{locale}/app/responders/onboarding`, and `/{locale}/app/organizations/onboarding` with dedicated route surfaces.
2. Define deterministic CTA targets per role that route users toward existing profile/settings completion paths.
3. Implement explicit screen intent states (`loading`, `empty` where relevant, `error`, success/notice) for each surface.
4. Ensure i18n keys for new guidance surfaces are centralized and complete in DE/EN catalogs with no hardcoded productive copy.
5. Verify guard behavior remains unchanged for unauthenticated, expired, and unauthorized access scenarios.
6. Validate alias redirects and canonical-route behavior together to avoid regressions in route matrix expectations.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with canonical route-surface rules, auth guards, and locale/copy governance.
- Decision: `implementation_scope: frontend` remains correct because this work is route-surface behavior and message-driven UI only.
- Decision: Added architecture guardrails to preserve redirect-only alias behavior while converting canonical routes to live surfaces.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md`

# Dev Results
- Replaced redirect-only canonical route pages with dedicated live surfaces for `/{locale}/app/responders/help`, `/{locale}/app/responders/onboarding`, and `/{locale}/app/organizations/onboarding`.
- Added new frontend components with explicit `loading`, `empty` (where applicable), `error`, and success/notice state handling plus deterministic CTA routing to existing profile/settings destinations.
- Added centralized i18n key coverage for new surfaces in both DE and EN catalogs (`app.responderHelp.*`, `app.responderOnboarding.*`, `app.organizationOnboarding.*`) with no hardcoded productive copy in components.
- Kept alias redirect behavior unchanged (`/{locale}/help` remains redirect-only) and kept existing auth/session guard behavior by reusing current session and unauthorized redirect helpers.
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed.
Changes: `/home/sebas/git/shift-matching/web/src/app/[locale]/app/responders/help/page.tsx`, `/home/sebas/git/shift-matching/web/src/app/[locale]/app/responders/onboarding/page.tsx`, `/home/sebas/git/shift-matching/web/src/app/[locale]/app/organizations/onboarding/page.tsx`, `/home/sebas/git/shift-matching/web/src/components/help/responder-help-page.tsx`, `/home/sebas/git/shift-matching/web/src/components/onboarding/responder-onboarding-page.tsx`, `/home/sebas/git/shift-matching/web/src/components/onboarding/organization-onboarding-page.tsx`, `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md`

# QA Results
- Binding docs validation completed:
- `docs/web-product-structure.md` canonical route behavior requires dedicated surfaces for canonical role routes and keeps redirect-only behavior for aliases.
- `docs/web-auth-flows.md` requires protected-route login redirects and role-guard behavior for unauthorized sessions.
- `docs/web-governance.md` requires message-key driven productive copy and explicit loading/empty/error/success handling for new screens.
- `docs/web-quality-test-program.md` requires regression baseline checks and route-level guard/locale behavior continuity.
- `docs/web-profile-settings-flow.md` confirms participant/organization completion targets used by onboarding CTAs.
- In-scope canonical routes render dedicated surfaces and are no longer redirect-only:
- `/{locale}/app/responders/help` -> `web/src/app/[locale]/app/responders/help/page.tsx`
- `/{locale}/app/responders/onboarding` -> `web/src/app/[locale]/app/responders/onboarding/page.tsx`
- `/{locale}/app/organizations/onboarding` -> `web/src/app/[locale]/app/organizations/onboarding/page.tsx`
- Legacy alias redirect behavior remains intact:
- `/{locale}/help` remains redirect-only to `/{locale}/app/responders/help` in `web/src/app/[locale]/help/page.tsx`.
- State handling validation for all three surfaces:
- explicit `loading`, `empty`, `error` state rendering is present.
- success/notice handling is present via readiness/incomplete notices.
- Guard-path validation:
- missing local session token path clears session and redirects to localized login with `next` via `clearSessionAndRedirectToLogin`.
- unauthorized API response path redirects through the same session-clear login helper.
- role and protected-route middleware guards remain enforced in `web/src/proxy.ts`.
- i18n and copy governance validation:
- all productive copy in new surfaces is message-key driven (`app.responderHelp.*`, `app.responderOnboarding.*`, `app.organizationOnboarding.*`).
- DE and EN message namespaces are present and key-coverage scan for the three new components reports `missing_de: 0`, `missing_en: 0`.
- Mandatory QA checks passed in required order:
- `npm --prefix /home/sebas/git/shift-matching/web run lint`
- `npm --prefix /home/sebas/git/shift-matching/web run build`
- `npm --prefix /home/sebas/git/shift-matching/app run build`
- `npm --prefix /home/sebas/git/shift-matching/app run test` (`267` passed, `0` failed)
- Decision: pass, moved to `sec`.
- Changes: `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md` -> `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md`

# Security Results
- Reviewed requirement-scoped security behavior in:
  `web/src/app/[locale]/app/responders/help/page.tsx`,
  `web/src/app/[locale]/app/responders/onboarding/page.tsx`,
  `web/src/app/[locale]/app/organizations/onboarding/page.tsx`,
  `web/src/components/help/responder-help-page.tsx`,
  `web/src/components/onboarding/responder-onboarding-page.tsx`,
  `web/src/components/onboarding/organization-onboarding-page.tsx`,
  `web/src/app/[locale]/help/page.tsx`,
  `web/src/lib/auth/login-redirect.ts`,
  and `web/src/proxy.ts`.
- Confirmed canonical help/onboarding routes now render dedicated surfaces while documented alias `/{locale}/help` remains redirect-only.
- Confirmed protected-route and role guard enforcement remains in middleware (`web/src/proxy.ts`), and client unauthorized/missing-session paths clear local session and redirect to localized login with `next`.
- Confirmed CTA targets stay on internal canonical app/profile/settings routes and do not introduce external redirect vectors.
- Confirmed productive copy for new surfaces remains message-key driven in DE/EN catalogs (`app.responderHelp.*`, `app.responderOnboarding.*`, `app.organizationOnboarding.*`).
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
- Decision: pass. Move requirement to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md` -> `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md`

# UX Results
- Reviewed requirement-scoped UX/copy behavior against `docs/web-governance.md`, `docs/web-product-structure.md`, `docs/web-design-system.md`, and `docs/ui-language-policy.md`.
- Confirmed all three in-scope canonical routes render dedicated live surfaces and are no longer redirect-only:
  - `/{locale}/app/responders/help`
  - `/{locale}/app/responders/onboarding`
  - `/{locale}/app/organizations/onboarding`
- Confirmed alias behavior remains unchanged (`/{locale}/help` stays redirect-only to `/{locale}/app/responders/help`).
- Confirmed productive copy in requirement-scoped surfaces is message-key driven and static key coverage is complete (`missing_de=0`, `missing_en=0`) for:
  - `web/src/components/help/responder-help-page.tsx`
  - `web/src/components/onboarding/responder-onboarding-page.tsx`
  - `web/src/components/onboarding/organization-onboarding-page.tsx`
- Fixed requirement-scoped DE copy terminology in new onboarding/help namespaces to remove mixed-language wording (`Requests`) and improve consistency in guidance text.
- Validation:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
- Decision: pass. Move requirement to `deploy`.
Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md` -> `/home/sebas/git/agents/requirements/released/REQ-NEW-WEB-ROLE-HELP-ONBOARDING-LIVE-SURFACES.md`
