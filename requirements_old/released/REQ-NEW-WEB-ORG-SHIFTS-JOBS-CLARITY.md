---
id: REQ-NEW-WEB-ORG-SHIFTS-JOBS-CLARITY
title: Clarify organization split between planning and shift management
status: released
implementation_scope: frontend
review_risk: medium
review_scope: qa_ux
source: user-2026-02-12-org-shifts-jobs-clarity
---

# Goal
Make organization navigation intent unambiguous by separating planning operations (`shifts`) from shift management and creation (`jobs`).

# Scope
- Frontend navigation and page-intent copy in active `web/` organization workspace.
- In-scope organization routes:
  - `/{locale}/app/organizations/shifts`
  - `/{locale}/app/organizations/jobs`
- Related organization entry actions that hand off between planning and shift management.

# Task Outline
- Define `shifts` route intent as planning overview for existing occurrences and operational follow-up.
- Define `jobs` route intent as shift management workspace for create, drafts, templates, and related editing.
- Align organization navigation labels and route-level copy so the split is explicit to end users.
- Keep handoff actions between planning and shift management explicit and deterministic.
- Preserve deep-link behavior, locale-prefixed routing, and role-guard behavior.

# Acceptance Criteria
- [ ] Organization primary navigation clearly differentiates planning (`shifts`) and shift management (`jobs`) intent.
- [ ] `/{locale}/app/organizations/shifts` communicates planning and operational steering of existing occurrences.
- [ ] `/{locale}/app/organizations/jobs` communicates creation and management of new shifts, drafts, and templates.
- [ ] Existing deep links, role guards, and locale-prefixed routing continue to work unchanged.
- [ ] UI wording and referenced docs reflect the same route-intent split.

# Out of Scope
- Backend, API, or schema changes.
- Role model or permission model changes.
- URL slug renaming and redirect redesign outside existing dedicated route requirements.
- Feature redesign of planning or job-management behavior itself.

# Constraints
- Keep implementation in active frontend track `web/` and requirement docs only.
- Keep organization IA and navigation order aligned with `docs/web-product-structure.md`.
- Keep planning and shift-management intent aligned with `docs/web-shifts-planning-flow.md` and `docs/web-jobs-requests-flow.md`.
- Keep guard and locale behavior aligned with `docs/web-auth-flows.md`.
- Keep copy/state governance aligned with `docs/web-governance.md` and `docs/web-quality-test-program.md`.

# References
- `docs/web-product-structure.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-dashboard-flow.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# Notes for ARCH/DEV
- URL rename strategy remains tracked by its dedicated requirement and is not part of this requirement scope.

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is navigation and route-intent clarity in `web/`.
- Decision: Requirement was condensed to a lean IA and copy-intent brief with route/guard safety constraints.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ORG-SHIFTS-JOBS-CLARITY.md`, `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-SHIFTS-JOBS-CLARITY.md`

# Architecture Notes
- `/{locale}/app/organizations/shifts` is the canonical planning surface for occurrence-level monitoring and follow-up.
- `/{locale}/app/organizations/jobs` is the canonical shift-management surface for create, edit, drafts, templates, and detail deep links.
- Handoff actions must target canonical routes directly (`shifts`, `jobs`, `jobs?create=1`, `shifts?view=list|calendar`) and stay deterministic.
- Preserve locale prefixes, role guards, and existing deep-link behavior; this requirement changes navigation intent and copy clarity only.
- Keep organization navigation order aligned with `docs/web-product-structure.md`.

# Implementation Guardrails
- Do not add or rename organization route slugs, redirects, or query-parameter contracts in this requirement.
- Keep planning-vs-management wording consistent across both locales and all organization entry points that link to these routes.
- Validate handoff CTAs from dashboard/planning/management surfaces so each action lands on the intended canonical route.

# Risks & Tradeoffs
- Clearer route intent may require longer labels or helper copy; prioritize unambiguous intent over brevity.
- Keeping existing URLs minimizes migration risk but preserves any legacy naming debt outside this requirement scope.

# Architecture Results
- Decision: Ready for DEV; referenced docs consistently separate organization planning (`shifts`) from shift management (`jobs`).
- Decision: `review_risk` remains `medium` because nav-intent changes can regress deep links, locale routing, and role-guarded entry paths.
- Decision: `review_scope` remains `qa_ux` because the change is IA/copy clarity with route-behavior invariants.
- Changes: Updated front matter status to `dev`; added Architecture Notes, Implementation Guardrails, Risks & Tradeoffs, and Architecture Results.

# Dev Results
- Updated organization navigation and route-intent copy in `web/messages/de.json` and `web/messages/en.json` so planning (`shifts`) is framed as occurrence planning/operational follow-up and shift management (`jobs`) is framed as create/manage workspace (including drafts/templates intent).
- Updated organization dashboard, jobs, shifts, and offer-requests CTA labels to make planning-vs-management handoffs explicit across both locales.
- Kept canonical route contracts and locale/guard behavior unchanged; no slug or query contract renames were introduced.
- Updated frontend handoff links from jobs and offer-requests to use deterministic planning target `/{locale}/app/organizations/shifts?view=list`.
- Validation: `npm --prefix web run lint` passed.
- Validation: `npm --prefix web run build` passed.
Changes: `web/messages/de.json`, `web/messages/en.json`, `web/src/components/jobs/organization-jobs-page.tsx`, `web/src/components/jobs/organization-offer-requests-page.tsx`, `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-ORG-SHIFTS-JOBS-CLARITY.md`

## Review Bundle Results
- Risk: medium
- Scope: frontend
- Roles: QA, UX
- QA: pass - Planning vs shift-management intent is clear in organization nav and route-level copy, and handoff CTAs resolve to canonical routes. No requirement-scoped regressions were found.
- UX: pass - Organization navigation and copy now distinguish planning (shifts) from shift management (jobs) with clear handoff actions. Route contracts, locale behavior, and message-key usage remain intact.
- Aggregated outcome: deploy

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
