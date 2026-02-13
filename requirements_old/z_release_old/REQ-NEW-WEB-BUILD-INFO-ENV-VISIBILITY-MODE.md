---
id: REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE
title: Consolidate frontend build info visibility by environment and remove floating version overlay
status: released
implementation_scope: frontend
source: user-2026-02-12-build-info-env-visibility
---

# Summary
Remove the floating bottom-right version overlay and make the bottom-left build info surface environment-specific: detailed in `dev`, minimal version-only in `staging/prod`.

# Scope
- Frontend-only in active track `web/`.
- In-scope UI surfaces:
  - bottom-left build info surface in app shell
  - bottom-right floating version overlay
- In-scope environment policy:
  - `dev`: detailed diagnostics + backend health/version details
  - `staging` and `prod`: version-only text, no details, no "Build info" label

# Acceptance Criteria
- [ ] Bottom-right floating version overlay is removed in all roles/locales/environments.
- [ ] Bottom-left surface remains the single build/version visibility surface.
- [ ] In `dev`, bottom-left surface shows detailed diagnostics including backend availability status (`up`/`down`) and backend version with explicit fallback when unavailable.
- [ ] In `staging` and `prod`, bottom-left surface shows only frontend version text.
- [ ] In `staging` and `prod`, no "Build info" label/title is rendered.
- [ ] Environment mode is derived from generated web build info environment metadata.
- [ ] Existing auth/routing behavior remains unchanged.
- [ ] User-facing copy remains message-key driven where applicable.

# Definition of Done
- [ ] Build/version visibility behavior is implemented in `web/` with one bottom-left surface across supported roles/locales.
- [ ] Bottom-right floating version overlay is removed and not reintroduced in any environment mode.
- [ ] Dev mode shows diagnostic details plus backend availability/version fallback, while staging/prod show version-only output.
- [ ] QA evidence covers one dev-mode rendering and one staging/prod rendering with expected content differences.
- [ ] Build-info environment metadata from `web/public/build-info.json` is used as the single visibility-mode source.

# Assumptions
- Generated `web/public/build-info.json` remains available before `dev` and `build` runs.
- Existing backend health/build-info path remains available for dev-mode backend availability/version display.
- Environment naming (`dev`, `staging`, `prod`) in build metadata remains stable.

# Constraints
- Keep implementation in `web/` only.
- Reuse existing build-info and backend health/version data paths.
- Do not reintroduce a second build/version overlay surface.
- Keep locale routing model unchanged (`/de`, `/en`).
- Keep visibility policy aligned with `docs/web-release-versioning-model.md` and `docs/versioning-current-state.md`.
- Keep message-governance and active-track frontend rules aligned with `docs/web-governance.md`.

# Out of Scope
- Backend health/build endpoint redesign.
- Release automation redesign.
- New debug widgets beyond the specified build info behavior.

# References
- `docs/web-release-versioning-model.md`
- `docs/versioning-current-state.md`
- `docs/web-technical-foundation.md`
- `docs/web-governance.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because work is UI visibility behavior in `web/` only.
- Decision: Scope is constrained to build-info presentation policy by environment and overlay removal without backend contract changes.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md`

# Architecture Notes
- Keep exactly one build/version surface in shell bottom-left across all roles/locales/environments; do not keep fallback duplicate surfaces.
- Use `web/public/build-info.json` environment metadata as the single source for visibility mode selection (`dev` vs `staging`/`prod`).
- In `dev`, diagnostics may include backend availability and backend version with explicit unavailable fallback, but this detail must not leak into `staging`/`prod`.
- In `staging`/`prod`, render version-only text and suppress any "Build info" label or extra metadata.
- Keep all productive text message-key driven and preserve existing auth/routing behavior unchanged.

# Dev Plan
1. Remove the bottom-right floating version overlay component and all call sites.
2. Consolidate shell build-info rendering into the bottom-left surface with one shared entry point.
3. Implement environment-mode branching from generated build-info metadata (`web/public/build-info.json`).
4. Implement `dev` detail rendering with backend up/down and backend-version fallback handling.
5. Implement `staging`/`prod` version-only rendering with no label/diagnostic detail.
6. Validate role/locale coverage and QA evidence for one `dev` and one `staging`/`prod` rendering path.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with release/versioning visibility policy and build-info generation rules.
- Decision: `implementation_scope: frontend` remains correct because this is shell presentation behavior and overlay removal only.
- Decision: Added guardrails for single-surface enforcement, environment-derived mode selection, and production-safe minimal output.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md`

# Dev Results
- Removed the floating bottom-right build/version overlay by deleting the overlay component and its global style rules, and removing the layout call site.
- Consolidated build/version visibility to the bottom-left app-shell surface and implemented environment-mode branching from frontend build metadata (`build-info.json`).
- Implemented `dev` diagnostics with backend availability status (`up`/`down`) plus backend version with explicit unavailable fallback.
- Implemented `staging`/`prod` minimal mode with frontend version-only output and no "Build info" title.
- Verified frontend checks pass: `npm --prefix web run lint` and `npm --prefix web run build`.
Changes: `web/src/components/shell/app-build-meta.tsx`, `web/src/app/[locale]/layout.tsx`, `web/src/app/globals.css`, `web/src/components/system/build-info-badge.tsx`, `web/messages/en.json`, `web/messages/de.json`

# QA Results
- Requirement implementation is aligned with docs (`docs/web-release-versioning-model.md`, `docs/versioning-current-state.md`, `docs/web-technical-foundation.md`, `docs/web-governance.md`).
- Acceptance validation passed:
  - Bottom-right floating version overlay is removed (no remaining `build-info-badge` component or call site).
  - Bottom-left sidebar surface is the only build/version visibility surface (`web/src/components/shell/app-sidebar.tsx` renders `AppBuildMeta`).
  - Visibility mode is derived from generated frontend build-info environment metadata (`web/public/build-info.json` via `/build-info.json` -> `environment` in `AppBuildMeta`).
  - `dev` mode renders detailed diagnostics including backend status (`up`/`down`) and backend version with explicit unavailable fallback.
  - `staging`/`prod` mode renders version-only text and does not render the "Build info" label/title.
  - Auth/routing behavior remained unchanged in scoped files.
  - User-facing copy stays message-key driven for build-info labels and fallback text.
- QA evidence for mode differences:
  - Dev-mode path: current generated metadata (`web/public/build-info.json`) has `"environment": "dev"`, and `AppBuildMeta` dev branch includes detailed rows (`service`, `version`, `commit`, `build time`, `environment`, backend status/version).
  - Staging/prod path: release branch in `AppBuildMeta` returns only frontend version paragraph and omits title/details.
- Mandatory QA checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `267/267`)
- Changes: `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md` -> `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md`

# Security Results
- Reviewed requirement-scoped frontend implementation for build/version visibility policy and environment gating in:
  `web/src/components/shell/app-build-meta.tsx`, `web/src/components/shell/app-sidebar.tsx`,
  `web/src/app/[locale]/layout.tsx`, `web/src/app/globals.css`, and build-info generation scripts.
- Confirmed release-mode behavior is fail-closed: only `environment=dev` enables diagnostic rendering;
  all other/unknown values resolve to release mode (version-only).
- Confirmed backend health/version diagnostics are fetched/rendered only in dev mode and are not shown
  in staging/prod mode.
- Confirmed floating bottom-right build/version overlay remains removed; one bottom-left surface is used.
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
- Decision: pass. Move requirement to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md` -> `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md`

# UX Results
- Reviewed requirement-scoped UX/copy behavior against `docs/web-governance.md`, `docs/web-design-system.md`, `docs/web-release-versioning-model.md`, and `docs/versioning-current-state.md`.
- Confirmed one build/version surface in the bottom-left shell (`AppBuildMeta` in sidebar) and no remaining floating bottom-right overlay.
- Confirmed environment-driven visibility mode from frontend build metadata:
  - `dev`: detailed diagnostics with backend status (`up`/`down`) and backend version fallback.
  - `staging`/`prod`: frontend version-only text, no "Build info" title/label.
- Confirmed user-facing productive copy remains message-key driven for this surface.
- Decision: pass. Move requirement to `deploy`.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md` -> `/home/sebas/git/agents/requirements/released/REQ-NEW-WEB-BUILD-INFO-ENV-VISIBILITY-MODE.md`
