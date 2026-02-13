---
id: REQ-NEW-WEB-ADMIN-NAV-MISSING-LINKS
title: Ensure admin navigation covers all active admin routes
status: released
implementation_scope: frontend
review_risk: low
review_scope: qa_ux
source: user-2026-02-12-admin-nav-missing-links
---

# Goal
Ensure admin users can reach all active admin modules from sidebar navigation without manual URL entry.

# Scope
- Admin sidebar navigation behavior in `web/` for authenticated admin sessions.
- Direct navigation coverage for:
  - `/{locale}/app/admin`
  - `/{locale}/app/admin/mail/templates`
- Preserve existing admin navigation coverage for accounts, analytics, mail, and contract template.

# Task Outline
- Align admin navigation entries with canonical admin routes documented for phase 1.
- Add direct sidebar entries for overview and mail templates admin routes.
- Keep existing admin entries for accounts, analytics, mail, and contract template.
- Ensure route-to-active-item mapping is deterministic for all admin navigation entries.
- Keep labels message-key based and preserve role-isolated navigation.

# Acceptance Criteria
- [ ] Admin sidebar exposes direct links to `/{locale}/app/admin` and `/{locale}/app/admin/mail/templates`.
- [ ] Admin sidebar continues to expose accounts, analytics, mail, and contract template entries.
- [ ] Active navigation state is correct on `/{locale}/app/admin` and `/{locale}/app/admin/mail/templates`.
- [ ] Non-admin navigation does not expose admin entries.
- [ ] Locale-prefixed guard and redirect behavior remains unchanged.

# Out of Scope
- New admin features or new admin routes.
- Backend/API/schema changes.
- Broader admin UX redesign outside navigation completeness.

# Constraints
- Keep route model and canonical admin destinations aligned with `docs/web-product-structure.md`.
- Keep admin and organization boundary rules aligned with `docs/web-admin-governance-flow.md`.
- Keep role/session guard behavior aligned with `docs/web-auth-flows.md`.
- Keep i18n and UI governance rules aligned with `docs/web-governance.md`.

# References
- `docs/web-product-structure.md`
- `docs/web-admin-governance-flow.md`
- `docs/web-governance.md`
- `docs/web-auth-flows.md`

# PO Results
- Decision: No direct contradiction with docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` is `frontend` in split mode because scope is admin sidebar/navigation only.
- Decision: Requirement was compressed to goal, scope, task outline, and outcome-focused acceptance checks.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ADMIN-NAV-MISSING-LINKS.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ADMIN-NAV-MISSING-LINKS.md`

# Architecture Notes
- Keep admin navigation aligned to canonical admin route set in docs, including direct access to `/{locale}/app/admin` and `/{locale}/app/admin/mail/templates`.
- Keep admin route space role-isolated; non-admin shells must not expose admin navigation entries.
- Keep active-state mapping deterministic for nested admin routes so the correct nav item is highlighted.
- Keep labels message-key driven and locale-prefixed route behavior unchanged.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with admin IA and route-boundary docs.
- Decision: `review_risk` remains `low`; impact is navigation completeness without contract or lifecycle changes.
- Decision: `review_scope` set to `qa_ux` to focus review on nav coverage and active-state correctness.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ADMIN-NAV-MISSING-LINKS.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ADMIN-NAV-MISSING-LINKS.md`

# Dev Results
- Added direct admin sidebar navigation entries for `/{locale}/app/admin` and `/{locale}/app/admin/mail/templates` in `web/`, while keeping existing entries for accounts, analytics, mail, and contract template.
- Updated admin active-item mapping to be deterministic: overview activates only on `/{locale}/app/admin`; mail templates activate only on `/{locale}/app/admin/mail/templates`; non-admin role navigation remains unchanged.
- Added message-key backed nav copy for the new entries in both `de` and `en` locale bundles; no hardcoded productive copy introduced.
- Validation: `npm --prefix web run lint` passed.
- Validation: `npm --prefix web run build` passed.
Changes: `web/src/lib/navigation.ts`, `web/src/components/shell/app-sidebar.tsx`, `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-ADMIN-NAV-MISSING-LINKS.md`

## Review Bundle Results
- Risk: low
- Scope: frontend
- Roles: QA, UX
- QA: pass - Admin sidebar link coverage and active-state mapping for overview and mail templates are correct and role-isolated; relevant web checks passed.
- UX: pass - Admin sidebar navigation covers all active admin routes in scope with deterministic active-state behavior and message-key labels.
- Aggregated outcome: deploy

# Deploy Results
- Decision: pass. Requirement is deploy-ready for Coolify.
- Verified deploy gates against binding docs `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Mandatory checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass: `269` passed, `0` failed)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass: `QA gate: OK`)
- Coolify readiness for this scope remains valid:
  - build-info generation succeeded for both `web` and `app` artifacts.
  - no additional environment-variable requirements were introduced by this requirement scope.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-NEW-WEB-ADMIN-NAV-MISSING-LINKS.md` -> `/home/sebas/git/agents/requirements/released/REQ-NEW-WEB-ADMIN-NAV-MISSING-LINKS.md`
