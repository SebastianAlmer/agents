---
id: REQ-NEW-WEB-ORG-JOBS-CREATE-SAVE-DRAFT-ACTION
title: Add save-draft action to organization create flow
status: released
implementation_scope: frontend
review_risk: low
review_scope: qa_only
source: user-2026-02-12-org-jobs-create-save-draft-action
---

# Goal
Allow organizations to save in-progress create-form data as a draft without publishing.

# Scope
- Frontend behavior in active track `web/`.
- Organization create mode at `/{locale}/app/organizations/jobs?create=1`.
- Draft-save action using existing draft endpoints and adapter contract.

# Task Outline
- Add `Als Entwurf speichern` as a secondary action in create mode.
- Save current form snapshot via existing draft adapter path.
- Keep publish action behavior and publish validation unchanged.
- Show explicit success/error feedback for draft-save outcome.
- Keep locale-prefixed routing and role/session guards unchanged.

# Acceptance Criteria
- [ ] Create mode shows an `Als Entwurf speichern` action.
- [ ] Triggering save-draft stores current form state through existing draft adapter contract.
- [ ] Save-draft works independently of publish validation flow.
- [ ] Publish action (`Einsatz veroeffentlichen`) remains unchanged.
- [ ] User receives explicit draft-save success/error feedback, with message-key based copy.

# Out of Scope
- Backend, API, or schema changes.
- Draft business-process redesign beyond create-mode save action.
- Jobs workspace IA/navigation redesign.

# Constraints
- Keep implementation in active frontend track `web/` only.
- Keep jobs workspace model aligned with `docs/web-jobs-requests-flow.md` (`offers/create/drafts/templates`).
- Keep planning/create route behavior aligned with `docs/web-shifts-planning-flow.md`.
- Keep UI governance and QA baseline aligned with `docs/web-governance.md`, `docs/web-design-system.md`, and `docs/web-quality-test-program.md`.

# References
- `docs/web-jobs-requests-flow.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-governance.md`
- `docs/web-design-system.md`
- `docs/web-quality-test-program.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is create-flow UI behavior and existing adapter usage.
- Decision: `review_risk` is `low` and `review_scope` is `qa_only` because change is clear, contained, and contract-preserving.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ORG-JOBS-CREATE-SAVE-DRAFT-ACTION.md`, `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-JOBS-CREATE-SAVE-DRAFT-ACTION.md`

# Architecture Notes
- Keep draft-save on the existing organization create entry route `/{locale}/app/organizations/jobs?create=1` with current locale/guard behavior.
- Use existing draft adapter contract only (`POST /job-offers/drafts`, `PATCH /job-offers/drafts/:id`); no new endpoint or payload model.
- Draft-save must be operationally independent from publish validation and must not trigger publish side effects.
- Success and error feedback must use message-key based copy and remain explicit (not color-only).

# Architecture Results
- Decision: Ready for DEV; docs already define jobs create/drafts scope and draft endpoints for this behavior.
- Decision: `review_risk` stays `low` because the change is UI-local and contract-preserving.
- Decision: `review_scope` stays `qa_only` because no security, auth, permission, or data-migration surface changes.
- Changes: Updated front matter status to `dev`; added Architecture Notes and Architecture Results.

# Dev Results
- Added a secondary create-mode action `Als Entwurf speichern` on `/{locale}/app/organizations/jobs?create=1` with dedicated draft-save request handling.
- Saved the current create-form snapshot through the existing drafts adapter contract (`saveOrganizationShiftDraft`) using contract fields `organisationName`, `step`, and `form`.
- Kept publish behavior unchanged (`Einsatz veröffentlichen` still uses existing publish validation and submit flow); draft-save runs independently of publish validation.
- Added explicit draft-save feedback via message keys for success and error in both locales.
- Validation: `npm --prefix web run lint` (pass)
- Validation: `npm --prefix web run build` (pass)
- Changes: `web/src/components/jobs/organization-jobs-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-ORG-JOBS-CREATE-SAVE-DRAFT-ACTION.md`

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Save-draft was added in organization create mode with a dedicated secondary action and explicit draft-save success/error notices, while publish creation remains on the existing submit flow with unchanged validation. Draft persistence uses the existing saveOrganizationShiftDraft adapter with POST/PATCH behavior and draft id tracking for updates.
- Findings: none

# Security Results
- Reviewed implementation files and binding docs for auth/guard and draft persistence behavior:
  - `web/src/components/jobs/organization-jobs-page.tsx`
  - `web/src/lib/api/adapters/jobs.ts`
  - `web/src/app/[locale]/app/organizations/jobs/page.tsx`
  - `docs/web-jobs-requests-flow.md`
  - `docs/web-shifts-planning-flow.md`
- Decision: pass -> `ux`.
- Findings: none
Changes: `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-ORG-JOBS-CREATE-SAVE-DRAFT-ACTION.md` -> `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-ORG-JOBS-CREATE-SAVE-DRAFT-ACTION.md`

## UX Results
- Decision: pass
- Changes: web/src/components/jobs/organization-jobs-page.tsx, web/messages/de.json, web/messages/en.json

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
