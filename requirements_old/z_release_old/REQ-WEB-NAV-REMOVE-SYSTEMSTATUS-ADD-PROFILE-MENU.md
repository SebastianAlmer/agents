---
id: REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU
title: Remove sidebar status/switch controls and add profile submenu in header
status: released
implementation_scope: frontend
source: user-2026-02-11-ui-navigation-cleanup
---

# Summary
Clean up authenticated web shell navigation by removing sidebar status/switch controls, exposing deterministic build metadata, and consolidating account actions in a profile submenu.

# Scope
- Frontend-only changes in active track `web/`.
- Shared authenticated shell navigation and header interactions.
- Lower-left shell area content update (remove status/switch controls, show build metadata).
- Top-right profile interaction update to deterministic submenu.

# Acceptance Criteria
- `Systemstatus` is not rendered in authenticated app shell.
- `Rolle wechseln` is not rendered in authenticated app shell.
- Lower-left shell area renders frontend build metadata from build-info with deterministic fields: service (`web`), semantic version, commit short hash, UTC build time, environment.
- Top-right profile trigger opens submenu with exactly two items: `Profil` and `Abmelden`.
- `Profil` route target is role-resolved:
  - `PARTICIPANT` -> `/{locale}/app/responders/profile`
  - `EMPLOYER` -> `/{locale}/app/organizations/profile`
  - `ADMIN` -> `/{locale}/app/admin`
- `Abmelden` keeps existing logout behavior and redirect flow (`/{locale}/logout` to `/{locale}/login`).
- Submenu interaction is keyboard-accessible and deterministic (explicit trigger, close on escape/outside interaction).
- Productive copy is message-driven (no hardcoded production labels).
- No backend/API endpoint or schema change is introduced.

# Definition of Done
- Shell/navigation updates are implemented only in `web/`.
- Locale-prefixed routing and role-guard behavior remain unchanged.
- Utility-navigation contract remains intact (account menu/logout available; unrelated utility actions are not regressed).
- QA evidence can cover one role path per role plus logout path.

# Assumptions
- Shared shell has deterministic role context to resolve `Profil` destination.
- Build metadata artifact already exists in frontend build output.

# Constraints
- Organization navigation must not expose admin destinations or role-switch controls.
- Utility navigation remains aligned with route model (`account menu`, `logout`; search/notifications where available).
- Logout flow remains within existing auth contract and route model.
- Locale-prefix routing remains mandatory and route segments stay English.
- Interactive controls must satisfy keyboard accessibility baseline.

# Out of Scope
- Role model changes.
- New account actions beyond `Profil` and `Abmelden`.
- Backend auth/session contract changes.
- Dashboard KPI/worklist behavior changes.

# References
- `docs/web-product-structure.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-release-versioning-model.md`
- `docs/web-technical-foundation.md`
- `docs/web-design-system.md`
- `docs/scope-boundaries.md`

# PO Results
- Decision: Requirement aligns with current navigation/auth/versioning docs; no direct contradiction found.
- Decision: Requirement remains frontend-scoped in split routing mode (`implementation_scope: frontend`).
- Decision: Admin `Profil` fallback target remains `/{locale}/app/admin` because no dedicated admin profile route exists in target route model.
- Decision: Ready for architecture stage.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`, `/home/sebas/git/agents/requirements/arch/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`

# Architecture Notes
- Keep utility-navigation contract intact: account menu and logout remain available; do not regress other utility actions where present.
- Remove status/switch controls from shell composition only; do not alter role-resolution or auth route logic.
- Build metadata in lower-left area must be deterministic and sourced from existing build-info artifact, not runtime heuristics.
- Resolve profile destination strictly by authenticated role context (`responders`, `organizations`, `admin`).
- Enforce keyboard-accessible submenu behavior (explicit trigger, escape/outside close, focus-safe interaction).

# Dev Plan
1. Update shared authenticated shell/sidebar component to remove `Systemstatus` and `Rolle wechseln` controls.
2. Render deterministic build metadata block (service, semver, short hash, UTC build time, environment) in lower-left shell area using existing build-info source.
3. Replace top-right profile action with submenu containing exactly `Profil` and `Abmelden`.
4. Implement role-resolved `Profil` target mapping for participant/employer/admin and keep logout route behavior unchanged.
5. Validate keyboard interaction and locale-prefixed route behavior across one route per role.

# Architecture Results
- Decision: Architecture-ready; requirement is consistent with navigation model, auth flows, and admin route boundaries.
- Decision: Frontend-only scope remains valid and bounded to shell/navigation UI behavior.
- Decision: Requirement proceeds to development.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`, `/home/sebas/git/agents/requirements/dev/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`

# Dev Results
- Verified authenticated sidebar no longer renders `Systemstatus` or `Rolle wechseln`; lower-left area renders deterministic build metadata block via `AppBuildMeta`.
- Verified top-right profile submenu renders exactly two actions (`Profil`, `Abmelden`) and keeps role-resolved profile routing (`PARTICIPANT`, `EMPLOYER`, `ADMIN`).
- Verified submenu interaction behavior for close on outside interaction and `Escape`, with keyboard-focus handoff to first menu item.
- No additional frontend code change was required in this step because implementation is already present in active `web/`.
- Changes: `/home/sebas/git/agents/requirements/dev/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`, `/home/sebas/git/agents/requirements/qa/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`

# QA Results
- Result: Pass.
- Validation: Authenticated app shell does not render `Systemstatus` or `Rolle wechseln` in active frontend components/messages.
- Validation: Lower-left sidebar area renders `AppBuildMeta` with deterministic fields from `/build-info.json` (`service`, `version`, `commitShort`, UTC `buildTime`, `environment`), with `service` fallback fixed to `web`.
- Validation: Top-right profile menu is an explicit trigger with exactly two actions (`profile`, `logout`), role-resolved profile destination mapping (`PARTICIPANT` -> `/app/responders/profile`, `EMPLOYER` -> `/app/organizations/profile`, `ADMIN` -> `/app/admin`), and existing logout path `/logout` (locale-prefixed by navigation layer).
- Validation: Keyboard/interaction behavior is implemented (`aria-haspopup`, `aria-expanded`, close on `Escape`, close on outside pointer interaction, focus handoff to first menu item).
- Validation: Productive copy is message-driven via `app.header.*` and `app.sidebar.*` keys.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-fatal `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248/248)
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`

# Security Results
- Validation: Profile submenu links are fixed internal routes (`/app/responders/profile`, `/app/organizations/profile`, `/app/admin`, `/logout`) and do not accept user-controlled redirect targets.
- Validation: Role and protected-route enforcement remains in existing proxy guard logic (`web/src/proxy.ts`); this requirement does not change auth/session contracts or role-guard boundaries.
- Validation: Build metadata display in sidebar (`AppBuildMeta`) reads deterministic fields from `/build-info.json` and renders as plain text without introducing executable content paths.
- Decision: pass; move to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md -> /home/sebas/git/agents/requirements/ux/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`

# UX Results
- Validation: Authenticated shell UI in `web/src/components/shell/app-sidebar.tsx` does not render `Systemstatus` or `Rolle wechseln`; lower-left area renders `AppBuildMeta` with deterministic build-info fields.
- Validation: Header account interaction in `web/src/components/shell/app-header.tsx` uses an explicit trigger and submenu with exactly two items (`profile`, `logout`), mapped through message keys.
- Validation: Profile destination mapping remains role-resolved (`PARTICIPANT` -> `/app/responders/profile`, `EMPLOYER` -> `/app/organizations/profile`, `ADMIN` -> `/app/admin`) and logout remains `/{locale}/logout` via `href=\"/logout\"`.
- Validation: Submenu interaction satisfies requirement baseline for keyboard/interaction determinism (trigger button, `aria-expanded`, close on `Escape`, close on outside interaction, first-item focus handoff).
- Decision: pass; move to `deploy`.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`, `/home/sebas/git/agents/requirements/deploy/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; non-blocking EN `MISSING_MESSAGE` warnings observed)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248 tests)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md -> /home/sebas/git/agents/requirements/released/REQ-WEB-NAV-REMOVE-SYSTEMSTATUS-ADD-PROFILE-MENU.md`
