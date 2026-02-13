---
id: REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE
title: Integrate organisation shift templates in frontend creation flow
status: released
implementation_scope: frontend
source: user-2026-02-11-fe-delta-refinement
---

# Summary
Enable organisation users to manage shift templates and reuse them in the job creation flow in `web/`, using existing backend endpoints through the frontend adapter contract.

# Scope
- Frontend implementation only in `web/`.
- Organisation planning area under `/{locale}/app/organizations/shifts` with templates scope (`?scope=templates` and alias route behavior).
- Organisation jobs area under `/{locale}/app/organizations/jobs` for template-based prefill during job creation.
- Existing API surface only (`/job-offers/templates` endpoints via adapter layer).

# Acceptance Criteria
- [ ] In organization templates scope, users can create, edit, and delete templates and see changes reflected after save/delete.
- [ ] Template CRUD operations use the `web` API adapter layer and existing template endpoints (`GET/POST/PATCH/DELETE /job-offers/templates`) with no direct page-level `fetch`.
- [ ] In organization job creation, selecting a template prefills supported offer input fields, including required `location`, from template values.
- [ ] Prefilled values remain editable before submit, and submitted job-offer payload values remain authoritative.
- [ ] Loading, empty, and error states are explicitly handled for template list and template actions; recoverable failures provide a visible retry path.
- [ ] Route behavior remains locale-prefixed (`/de`, `/en`) and restricted to authenticated organization context.
- [ ] Missing/expired session and role mismatch follow protected-route rules from auth flow (redirect to login with `next`, or to authenticated role home where applicable) instead of rendering organization template actions.
- [ ] Template list rendering uses deterministic ordering behavior (preserve backend order or apply explicit stable client ordering with tie-breaks).
- [ ] While EN is not active in phase 1, `/en` routes for this flow resolve to the equivalent `/de` route behavior.

# Definition of Done
- [ ] Changes are implemented in `web/` only; no new feature behavior is added to `web_legacy/`.
- [ ] Productive UI copy is message-driven and not hardcoded in page/component code.
- [ ] Flow evidence covers organization happy path, one template operation failure path, and permission/session guard behavior.
- [ ] The implementation follows adapter-layer error classification and does not introduce uncaught transport exceptions into UI flow code.

# Assumptions
- Existing backend template endpoints and current payload shape are sufficient for phase-1 template CRUD and prefill usage.
- Organization jobs create flow already has the necessary form model to accept template-prefilled values.

# Constraints
- `web/` is the active frontend track; `web_legacy/` is maintenance-only.
- Frontend domain data access must go through adapter modules with `ApiResult<T>` handling.
- Organization template behavior must stay within current in-scope boundaries: create/edit/delete templates and prefill job offer input values.
- All user-facing states for this flow must include explicit loading, empty, success, and error handling.
- Locale-prefixed routing and English route slugs must remain consistent with the web route model.

# Architecture Notes
- Canonical organization planning route remains `/{locale}/app/organizations/shifts`; `.../shifts/templates` is an alias to templates scope and should not create a separate flow contract.
- Template and prefill data access stays on the jobs adapter contract with `ApiResult<T>` outcomes; no direct transport calls in route/page components.
- Scope boundaries are binding for template behavior: CRUD and prefill only, with required `location` preserved and final submitted job-offer payload as source of truth.
- Route/session protection is owned by auth/proxy guard behavior; this requirement must integrate with redirects instead of adding custom unauthorized template surfaces.
- Any template list presentation must have deterministic ordering semantics to satisfy web governance baseline for list/worklist behavior.

# Dev Plan
1. Confirm existing `web` adapter methods and payload fields for `GET/POST/PATCH/DELETE /job-offers/templates` cover templates view and jobs prefill usage.
2. Define templates-scope screen state model (`loading`, `ready`, `empty`, `error`) and action-state handling for create/edit/delete operations with retry paths.
3. Define template-to-job-create mapping contract for supported fields, including required `location`, while keeping all prefilled values editable.
4. Define error-to-UI behavior using adapter classification (`network`, `timeout`, `validation`, `conflict`, `server`, `unknown`) without uncaught transport exceptions.
5. Validate route and guard behavior for `/{locale}/app/organizations/shifts/templates` and `/{locale}/app/organizations/jobs` under missing session, role mismatch, and locale fallback.
6. Capture delivery evidence for happy path, one template action failure path, deterministic list behavior, and permission/session guard behavior.

# Out of Scope
- Backend API, database schema, or validation rule changes for templates.
- New template capabilities beyond existing fields/endpoints (for example versioning, sharing, automation, or cross-organization templates).
- Participant or admin template workflows.
- Changes to unrelated jobs/request lifecycle rules.

# References
- `docs/scope-boundaries.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-product-structure.md`

# PO Results
- Decision: moved to `arch` because the requirement is aligned with current scope and docs without direct contradictions.
- Decision: set `implementation_scope: frontend` for split routing mode.
- Decision: kept the requirement focused on frontend integration using existing backend template endpoints.
Changes: `agents/requirements/selected/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md -> agents/requirements/arch/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md`

# Architecture Results
- Decision: architecture-ready after aligning templates scope, jobs prefill behavior, and adapter constraints with `docs/scope-boundaries.md`, `docs/web-shifts-planning-flow.md`, and `docs/web-api-adapter-contract.md`.
- Decision: kept requirement frontend-only and within governance/auth route rules from `docs/web-governance.md`, `docs/web-product-structure.md`, and `docs/web-auth-flows.md`.
- Decision: added explicit deterministic ordering and phase-1 locale fallback criteria to remove implementation ambiguity.
Changes: `agents/requirements/arch/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md -> agents/requirements/dev/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md`

# Dev Results
- Implemented organization template CRUD in `/{locale}/app/organizations/shifts?scope=templates` with adapter-only calls (`fetchOrganizationShiftTemplates`, `saveOrganizationShiftTemplate`, `deleteOrganizationShiftTemplate`) and immediate list refresh after save/delete.
- Added explicit template list states (`loading`, `empty`, `error`) with visible retry action for recoverable load failures, plus template action feedback and retry path for recoverable save/delete failures.
- Preserved deterministic template ordering by rendering adapter response order without client-side reordering.
- Added organization jobs create-form template selection and prefill mapping for supported fields (title, description, required `location`, field, requirements, compensation, deadline days/time, tags text), while keeping all prefilled values editable before submit.
- Kept job-offer submit payload form-driven so edited prefilled values remain authoritative at submission time.
- Aligned frontend behavior with protected-route expectations by redirecting missing token or adapter `unauthorized` to `/{locale}/login?next=<requested-path>` instead of rendering template actions.
- Added message-driven copy keys for new template CRUD/prefill/retry UI in locale message catalogs.
- Validation evidence: `npm run lint` (web) passed.
Changes: `web/src/components/jobs/organization-shifts-page.tsx`, `web/src/components/jobs/organization-jobs-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `agents/requirements/dev/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md -> agents/requirements/qa/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md`

# QA Results
- Decision: pass; implementation aligns with `docs/web-shifts-planning-flow.md`, `docs/web-jobs-requests-flow.md`, `docs/web-api-adapter-contract.md`, `docs/web-auth-flows.md`, `docs/web-governance.md`, and `docs/web-product-structure.md`.
- Acceptance validation: templates scope supports create/edit/delete with post-action refresh; all template CRUD operations use adapter methods (`apiAdapters.jobs.*`) with no direct page-level transport calls.
- Prefill validation: template selection in organization jobs pre-fills supported fields including required `location`; prefilled values remain editable and submit payload remains form-authoritative.
- State/guard validation: loading/empty/error states are explicit for template list and actions; recoverable failures expose retry; missing token and `unauthorized` responses redirect to `/{locale}/login?next=<requested-path>`; role mismatch and locale fallback behavior are enforced by `web/src/proxy.ts`.
- Determinism and locale validation: template list rendering preserves backend order; locale-prefixed routes are used and `/en` routes redirect to equivalent `/de` paths in phase 1 via enabled-locale guard.
- Mandatory QA checks: `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run test` (pass; 242 passed, 0 failed).
- Evidence coverage: happy path (template CRUD + jobs prefill), one failure path (recoverable template load/action retry), and permission/session guard behavior are validated.
Changes: `agents/requirements/qa/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md -> agents/requirements/sec/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md`

# Security Results
- Decision: pass; security review confirms protected-route redirect behavior is preserved and adapter-only transport usage remains intact for template CRUD and job create flows.
- Fixed: enforced controlled taxonomy values for `requirements` in template prefill/save and job-create submission, preventing tampered or untrusted requirement values from being persisted outside allowed options.
- Validation: `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass).
Changes: `web/src/components/jobs/organization-job-options.ts`, `web/src/components/jobs/organization-shifts-page.tsx`, `web/src/components/jobs/organization-jobs-page.tsx`, `agents/requirements/sec/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md -> agents/requirements/ux/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md`

# UX Results
- Decision: pass; template quick-reuse UX is requirement-complete and now keeps error copy message-driven in template load/action and job-create failure states.
- UX validation: template list/action errors and template prefill loader no longer surface raw adapter/backend error strings; recoverable failure retry paths remain visible; copy remains localized through message keys.
- Checks: `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass).
Changes: `web/src/components/jobs/organization-shifts-page.tsx`, `web/src/components/jobs/organization-jobs-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `agents/requirements/ux/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md -> agents/requirements/deploy/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md`

# Deploy Results
- Decision: pass; requirement is deploy-ready for Coolify check mode and remains within frontend-only scope in `web/` with adapter-based calls.
- Coolify/deploy checks: `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run test` (pass; 242 passed, 0 failed), `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass).
- Deploy guardrails: required release gates from `docs/web-release-versioning-model.md` and baseline checks from `docs/web-quality-test-program.md` are satisfied.
Changes: `agents/requirements/deploy/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md -> agents/requirements/released/REQ-ORG-SHIFT-TEMPLATES-QUICK-REUSE.md`
