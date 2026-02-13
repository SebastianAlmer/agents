---
id: REQ-NEW-WEB-SIDEBAR-ACTIVE-HIGHLIGHT-COLOR-ALIGNMENT
title: Align sidebar active highlight color with primary token
status: released
implementation_scope: frontend
review_risk: low
review_scope: qa_only
source: user-2026-02-12-sidebar-highlight-color-alignment
---

# Goal
Align organization and participant sidebar active-state styling with the primary design token system for consistent interaction clarity.

# Scope
- Frontend behavior in active track `web/`.
- Sidebar active navigation styling across role-scoped app routes.
- Active-item visual presentation and readability, without changing navigation behavior.

# Task Outline
- Replace active sidebar gradient treatment with primary token-based background treatment.
- Reuse the primary button color family (including active/contrast tokens) for active items.
- Keep route matching, active detection, and non-active/hover states functionally unchanged.
- Preserve contrast and focus visibility in line with accessibility baseline.
- Keep changes within shared navigation shell styling token usage.

# Acceptance Criteria
- [ ] Active sidebar item no longer uses gradient treatment.
- [ ] Active sidebar item uses primary token family (`--zz-primary*`) consistent with `btn-primary-aa` semantics.
- [ ] Active item remains clearly readable for text and icon states.
- [ ] Non-active and hover states are unchanged functionally.
- [ ] Navigation behavior and role-based routes remain unchanged.

# Out of Scope
- Navigation IA or route model changes.
- Header or other layout redesign.
- Backend/API or auth/session contract changes.

# Constraints
- Route and navigation model remain aligned with `docs/web-product-structure.md`.
- Color and component behavior remain aligned with token and accessibility baseline in `docs/web-design-system.md`.
- Quality verification follows `docs/web-quality-test-program.md` flow expectations.
- Work stays in `web/` per `docs/web-governance.md`.

# References
- `docs/web-design-system.md`
- `docs/modern-ui.md`
- `docs/web-product-structure.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# Architecture Notes
- Keep sidebar active styling on tokenized primitives (`--zz-primary`, `--zz-primary-soft`, `--zz-on-primary`) to stay consistent with `btn-primary-aa` contrast expectations.
- Preserve role-based active-route detection and no behavior change to `web-product-structure` navigation ordering or access.
- Confirm active-state visual updates only touch shared shell classes so role-specific route surfaces continue using same token contract.
- Keep non-active and hover behavior unchanged; only replace active background/color mapping to avoid implicit routing-side regressions.
- Enforce WCAG AA contrast and visible focus for active/focus states as defined in `web-design-system`.

# Architecture Results
- Ready for implementation handoff; no doc-level contradictions found.
- Risk remains scoped to a UI token/style change (`review_risk: low`, `review_scope: qa_only`).
- Changes: updated `status` to `dev`, added architecture validation notes, moved requirement to `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-SIDEBAR-ACTIVE-HIGHLIGHT-COLOR-ALIGNMENT.md`.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Sidebar active-state styling now uses primary tokenized colors without gradient and aligns readout to button-primary token semantics while preserving existing active-route matching and navigation behavior. Hover/non-active classes and role-based route highlighting logic are unchanged aside from visual token substitution.
- Findings: none

# Security Results
- Reviewed implementation files:
  - `web/src/components/shell/app-sidebar.tsx`
  - `web/src/lib/navigation.ts`
  - `web/src/components/shell/app-session-guard.tsx`
  - `web/src/lib/auth/session.ts`
  - `docs/web-design-system.md`
  - `docs/web-governance.md`
- Decision: pass (`ux`)
- Findings: none
Changes: security review only; requirement file remains implementation-compliant and is being moved to `ux` with `status: ux`.

## UX Results
- Decision: pass
- Changes: web/src/components/shell/app-sidebar.tsx

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
