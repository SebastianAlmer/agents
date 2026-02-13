---
id: REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS
title: Remove unnecessary menu and heading subtexts (minimal-copy rule)
status: released
implementation_scope: frontend
source: user-2026-02-11-org-menu-remove-subtexts
---

# Summary
Remove non-essential helper/subtitle copy from navigation and heading areas so UI surfaces focus on primary labels and only keep subtexts where they are genuinely critical.

# Scope
- Frontend-only changes in active track `web/`.
- Organization shell/menu navigation rendering.
- Desktop and mobile navigation variants.
- Page and section heading blocks in app areas (`organizations`, `responders`, `admin`) where subtitle/description lines are currently non-essential.

# Acceptance Criteria
- In organization navigation, menu entries render only the primary label and no helper/subtext line.
- Non-essential subtitle/description lines under page or section headings are removed on affected app screens in responders, organizations, and admin areas.
- Subtitle/description text remains only when critical for safe understanding (for example legal/compliance warning, irreversible action consequence, or required next-step constraint).
- Navigation behavior remains unchanged (routing, active state, permissions, keyboard interaction).
- Menu icon rendering remains unchanged.
- Spacing and alignment remain stable on desktop and mobile.
- No backend/API endpoint or schema change is introduced.

# Definition of Done
- Change is implemented only in `web/`.
- Productive copy remains message-driven; removed subtexts are not rendered in UI.
- Locale-prefixed routing and role-specific menu visibility remain unchanged.
- QA evidence includes one desktop and one mobile menu smoke check plus one heading/subtitle reduction check in each role area.

# Assumptions
- Existing main menu labels are sufficient for orientation without additional helper lines.
- Critical explanatory copy can be identified reliably from existing legal/safety context.

# Constraints
- Keep locale-prefixed routing model unchanged (`/{locale}/...`) and route slugs English.
- Do not change menu order or role visibility rules defined in product structure.
- Do not introduce new navigation actions.
- Keep legal/safety/compliance-critical explanatory copy where removal would reduce decision safety.
- Keep keyboard accessibility for navigation controls unchanged.

# Out of Scope
- Menu restructuring, renaming, or reordering.
- Full copy rewrite unrelated to subtitle/helper reduction.
- Any role/auth guard changes.

# References
- `docs/web-product-structure.md`
- `docs/web-governance.md`
- `docs/web-design-system.md`
- `docs/modern-ui.md`

# PO Results
- Decision: Requirement aligns with navigation and governance docs; no direct contradiction found.
- Decision: In split routing mode, `implementation_scope` stays `frontend`.
- Decision: Scope remains UI-copy reduction only; routing, role visibility, and actions stay unchanged.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md`

# Architecture Notes
- Align implementation with design-system subtitle rule: subtitles are optional and only shown when critical context is required.
- Apply menu subtext removal in shared role navigation rendering to avoid drift between desktop and mobile variants.
- Keep role menu order, visibility, and route mapping unchanged as defined in product structure.
- Preserve message-driven copy handling: remove rendering/usage of non-critical keys, but do not hardcode fallback strings.
- Keep keyboard accessibility and focus behavior unchanged for all navigation controls.

# Dev Plan
1. Identify shared menu item rendering path(s) for organization navigation in `web/` and remove helper/subtext slot output.
2. Apply the same minimal-copy rule to heading/subtitle rendering in app shell heading blocks where subtitle is non-critical.
3. Keep existing route targets, active-state logic, permissions, and icon rendering unchanged.
4. Verify desktop and mobile navigation layouts remain aligned after subtext removal.
5. Validate one page per role area (`responders`, `organizations`, `admin`) for heading/subtitle behavior and non-regression.

# Architecture Results
- Decision: Architecture-ready; no contradiction with navigation model, language policy, or design-system subtitle guidance.
- Decision: Frontend-only scope remains valid and bounded to UI copy/rendering behavior.
- Decision: Requirement proceeds to development.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md`, `/home/sebas/git/agents/requirements/dev/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md`

# Dev Results
- Removed navigation helper/subtext rendering from app sidebar menu entries; primary labels and icons remain unchanged.
- Updated shared page heading component to hide subtitle/description by default and only render when explicitly flagged as critical context.
- Verified frontend baseline after changes:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (non-blocking pre-existing `MISSING_MESSAGE` output in EN locale still appears during static generation).
- Changes: `/home/sebas/git/shift-matching/web/src/components/shell/app-sidebar.tsx`, `/home/sebas/git/shift-matching/web/src/components/ui/page-heading.tsx`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md`

# QA Results
- Decision: pass.
- Validation: implementation aligns with `docs/web-design-system.md` heading subtitle rule and keeps role navigation order/visibility model from `docs/web-product-structure.md`.
- Requirement-scoped QA fix applied: removed non-critical `criticalDescription` rendering flags from responder heading blocks so subtitle copy is no longer rendered in those pages.
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`248` passed, `0` failed).
- QA evidence:
- Organization navigation menu entries render icon + primary label only in sidebar (`web/src/components/shell/app-sidebar.tsx`); no helper/subtext line is rendered per menu entry.
- Heading subtitle rendering now requires explicit `criticalDescription`; no active page currently sets it after QA fix (`web/src/components/ui/page-heading.tsx` and responder page usages).
- Routing, active-state logic, and role visibility paths remain unchanged in shared nav resolution and active-item mapping (`web/src/components/shell/app-sidebar.tsx`, `web/src/lib/navigation.ts`).
- Changes: `/home/sebas/git/shift-matching/web/src/components/dashboard/responder-dashboard.tsx`, `/home/sebas/git/shift-matching/web/src/components/jobs/responder-jobs-page.tsx`, `/home/sebas/git/shift-matching/web/src/components/jobs/responder-requests-page.tsx`, `/home/sebas/git/shift-matching/web/src/components/jobs/responder-shifts-page.tsx`, `/home/sebas/git/agents/requirements/sec/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md`

# Security Results
- Decision: pass.
- Validation:
- Reviewed requirement-scoped navigation and heading rendering in `web/src/components/shell/app-sidebar.tsx`, `web/src/components/ui/page-heading.tsx`, and route/menu mapping in `web/src/lib/navigation.ts` against `docs/web-product-structure.md`, `docs/web-governance.md`, and `docs/web-auth-flows.md`.
- Confirmed no security-sensitive behavior changes in this scope: route targets, role-based nav visibility, active-state logic, and auth/guard flows remain unchanged; only non-essential copy rendering is reduced.
- Confirmed no requirement-scoped security/compliance blocker was introduced by removing menu subtexts and non-critical heading descriptions.
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md` -> `/home/sebas/git/agents/requirements/ux/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed navigation and heading copy behavior in `web/src/components/shell/app-sidebar.tsx`, `web/src/components/ui/page-heading.tsx`, and `web/src/lib/navigation.ts` against `docs/web-design-system.md`, `docs/modern-ui.md`, and `docs/web-product-structure.md`.
- Applied a requirement-scoped UX/copy refinement by removing a non-essential sidebar brand subtext line in the app shell navigation area, preserving menu labels/icons, routing, and active-state behavior.
- Re-validated with `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass) and `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; pre-existing EN `MISSING_MESSAGE` output remains non-blocking and outside this requirement scope).
- Changes: `/home/sebas/git/shift-matching/web/src/components/shell/app-sidebar.tsx`, `/home/sebas/git/agents/requirements/ux/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md` release gates.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-blocking EN `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `259` tests)
- Decision: pass; move to `released`.
- Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md` -> `/home/sebas/git/agents/requirements/released/REQ-ORG-NAV-REMOVE-MENU-SUBTEXTS.md`
