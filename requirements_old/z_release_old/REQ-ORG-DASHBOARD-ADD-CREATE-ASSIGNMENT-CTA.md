---
id: REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA
title: Add create-job CTA on organization dashboard
status: released
implementation_scope: frontend
source: user-2026-02-11-org-dashboard-cta
---

# Summary
Add a second CTA in the organization dashboard action area so users can jump directly to the existing job creation entry.

# Scope
- Frontend-only change in active frontend track `web/`.
- Organization dashboard route: `/{locale}/app/organizations/dashboard`.
- Add a new create-job CTA in the existing organization action block.
- Navigate the new CTA to the canonical create entry route.
- Keep existing dashboard action behavior unchanged.

# Acceptance Criteria
- On `/{locale}/app/organizations/dashboard`, action area contains existing management action and a new create-job action.
- Clicking the new create-job action routes to `/{locale}/app/organizations/jobs?create=1`.
- Existing jobs-management CTA keeps current behavior.
- CTA copy is message-driven (i18n) and not hardcoded in component code.
- No backend endpoint, adapter contract, or schema change is introduced by this requirement.

# Definition of Done
- Requirement is implementable as frontend-only scope with no backend dependency.
- Dashboard CTA behavior aligns with documented organization dashboard action mapping.
- Locale-prefixed route behavior (`/de`, `/en`) stays unchanged.
- Requirement is ready for architecture handoff with clear non-regression constraints.

# Assumptions
- Existing create entry `/{locale}/app/organizations/jobs?create=1` remains valid.
- Current dashboard action area has enough space for an additional CTA without changing IA.

# Constraints
- Organization dashboard action mapping must follow docs: create/management action points to `/{locale}/app/organizations/jobs?create=1`.
- Locale-prefixed routing is mandatory and route slugs remain English.
- UI terminology must stay message-driven and consistent with language policy/glossary.
- No assignment-domain behavior is introduced; this is a navigation CTA only.
- Role guards and permissions remain unchanged.

# Out of Scope
- Changes to job creation form fields, validation, or flow internals.
- New dashboard widgets/cards unrelated to this CTA.
- Changes to offer-request decision flow.
- Backend/API changes.

# References
- `docs/web-dashboard-flow.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-product-structure.md`
- `docs/ui-language-policy.md`
- `docs/glossary.md`
- `docs/scope-boundaries.md`

# PO Results
- Decision: Requirement aligns with dashboard and jobs-flow docs; no direct contradiction found.
- Decision: Requirement stays frontend-scoped for split routing mode (`implementation_scope: frontend`).
- Decision: Functional intent is limited to CTA addition and canonical route navigation.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md`

# Architecture Notes
- Keep the organization dashboard route unchanged at `/{locale}/app/organizations/dashboard`.
- Reuse existing navigation helpers and route building pattern so locale prefix handling stays consistent.
- Keep the existing management CTA behavior unchanged; the new create CTA is an additive action only.
- Ensure CTA labels are message-driven and remain aligned with terminology policy.
- No adapter/API changes: navigation target remains `/{locale}/app/organizations/jobs?create=1`.

# Dev Plan
1. Update organization dashboard action block component to include a second CTA for create flow.
2. Wire the new CTA to `/{locale}/app/organizations/jobs?create=1` using the same locale-aware routing approach as existing actions.
3. Keep existing jobs-management CTA semantics and visual priority intact; avoid regressions in current action behavior.
4. Validate DE/EN locale-prefixed navigation and mobile reachability for both actions on dashboard.

# Architecture Results
- Decision: Architecture-ready; requirement is consistent with dashboard action mapping and route model.
- Decision: Frontend-only scope is valid and bounded to dashboard CTA composition and navigation.
- Decision: No unresolved architecture contradictions found.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md`, `/home/sebas/git/agents/requirements/dev/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md`

# Dev Results
- Added a second CTA in the organization dashboard heading action area at `/{locale}/app/organizations/dashboard`.
- Kept existing manage-jobs CTA behavior unchanged (`/app/organizations/jobs`) and added create CTA to canonical route (`/app/organizations/jobs?create=1`).
- Kept CTA labels message-driven by adding `app.organizationDashboard.heading.createAction` in DE/EN message catalogs.
- Verified frontend baseline with `npm --prefix web run lint` (pass).
Changes: `/home/sebas/git/shift-matching/web/src/components/dashboard/organization-dashboard.tsx`, `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/dev/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md -> /home/sebas/git/agents/requirements/qa/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md`

# QA Results
- Validation: Implementation matches `docs/web-dashboard-flow.md`, `docs/web-jobs-requests-flow.md`, `docs/web-product-structure.md`, and route/copy constraints from `docs/ui-language-policy.md` and `docs/glossary.md`.
- Validation: Dashboard heading action area includes both actions; existing manage action remains `/app/organizations/jobs`, and added create action routes to `/app/organizations/jobs?create=1` via locale-aware app routing.
- Fix applied during QA: updated new CTA label terminology to remain job-based and glossary-aligned (`de`: `Neuen Job anlegen`, `en`: `Create new job`).
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, 248 tests)
- Decision: pass; move requirement to `sec`.
Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md -> /home/sebas/git/agents/requirements/sec/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md`

# Security Results
- Validation: New dashboard create CTA uses a static internal path (`/app/organizations/jobs?create=1`) and does not include user-controlled URL parts.
- Validation: Authorization boundaries remain unchanged; protected organization routes are still gated to `EMPLOYER` in `web/src/proxy.ts`.
- Validation: Requirement remains frontend-only with no backend endpoint, schema, or auth/session model changes.
- Decision: pass; move requirement to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md -> /home/sebas/git/agents/requirements/ux/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md`, `/home/sebas/git/shift-matching/web/src/components/dashboard/organization-dashboard.tsx`, `/home/sebas/git/shift-matching/web/src/proxy.ts`

# UX Results
- Decision: pass; organization dashboard action area now includes both manage and create job CTAs with locale-aware routing.
- UX validation: existing manage CTA behavior is unchanged, new create CTA targets canonical create entry (`/{locale}/app/organizations/jobs?create=1` via locale-aware link handling), and CTA copy remains message-driven in DE/EN catalogs.
- Requirement-scoped UX/copy fixes: none required.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md -> /home/sebas/git/agents/requirements/deploy/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md`

# Deploy Results
- Decision: pass; requirement is deploy-ready for Coolify check mode and remains frontend-only with no backend/API/schema changes.
- Coolify/deploy checks: `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass), `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run test` (pass; 248 passed, 0 failed).
- Notes: `web` build still reports pre-existing EN `MISSING_MESSAGE` warnings but exits successfully; no requirement-scoped deploy blocker detected.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md -> /home/sebas/git/agents/requirements/released/REQ-ORG-DASHBOARD-ADD-CREATE-ASSIGNMENT-CTA.md`
