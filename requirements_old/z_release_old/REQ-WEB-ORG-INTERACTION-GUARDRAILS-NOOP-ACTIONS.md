---
id: REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS
title: Enforce org interaction guardrails for critical actions
status: released
implementation_scope: frontend
source: user-2026-02-11-field-feedback-auth-navigation
---

# Summary
Harden organization interaction safety for critical actions so high-impact decisions require confirmation and users never encounter silent no-op actions.

# Scope
- Frontend-only changes in `web/` for the remaining org guardrail gaps.
- Target components:
  - `web/src/components/jobs/organization-offer-requests-page.tsx`
  - `web/src/components/jobs/organization-shifts-page.tsx`
  - `web/src/components/jobs/organization-job-detail-page.tsx`
- Action guardrail policy in scope:
  - `critical`: explicit confirmation before dispatch.
  - `blocked`: disabled with explicit reason and next-step hint.
  - `normal`: immediate execution without confirmation.

# Critical Action Baseline
Critical actions requiring confirmation in this requirement:
- Offer request decision: `BOOKED` and `DECLINED`.
- Shift template deletion.
- Job/occurrence deletion in org job detail.

# Acceptance Criteria
- [ ] No clickable org action in scoped components is a silent no-op.
- [ ] `BOOKED` and `DECLINED` actions in org offer-requests require explicit confirmation before request dispatch.
- [ ] Shift template delete requires explicit confirmation before delete API call.
- [ ] Org job detail delete uses the documented confirmation dialog pattern (no native `window.confirm`).
- [ ] Disabled critical actions expose explicit reason text and an actionable hint where recovery is possible.
- [ ] Loading and error states for scoped actions provide deterministic recovery (`retry`, `back`, or clear alternative action).
- [ ] Message keys are used for all user-facing copy added/changed by this requirement.

# Definition of Done
- [ ] Guardrail behavior is implemented for scoped org actions in `web/` without changing backend contracts.
- [ ] QA evidence includes one happy path and one negative/error path for each critical action group (request decision, template delete, job/occurrence delete).
- [ ] Confirmation, blocked-action reason, and recovery behaviors are verified on locale-prefixed routes and mobile-reachable interaction surfaces.
- [ ] No silent no-op action remains in scoped organization components.

# Assumptions
- Existing organization decision and deletion APIs remain available and unchanged for current phase.
- Offer-request decision actions remain scoped to actionable pending decisions in organization offer-requests view.
- Existing UI architecture can support dialog-based confirmation and disabled-state messaging without route redesign.

# Constraints
- Keep existing request lifecycle transitions and permissions unchanged (`PENDING -> BOOKED|DECLINED` organization decisions).
- Keep organization decision surface and canonical routes unchanged (`/{locale}/app/organizations/offer-requests`, `/{locale}/app/organizations/jobs`, `/{locale}/app/organizations/shifts`).
- Use documented confirmation dialog pattern for critical actions and explicit text-based status/validation feedback.
- Keep explicit loading/empty/error state handling and deterministic recovery behavior.
- Keep productive copy message-key based in active `web/` track.
- No backend or data-model contract changes in this requirement.
- Do not add confirmation dialogs to low-impact actions outside the defined critical action baseline.

# Out of Scope
- Backend request lifecycle or data-model changes.
- New organization routes, role guard changes, or navigation restructuring.
- Admin critical-action guardrail changes.
- Global redesign of non-critical action patterns outside scoped components.

# References
- `docs/web-design-system.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-product-structure.md`
- `docs/api-reference.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because the work is interaction guardrails and UI behavior in existing organization surfaces.
- Decision: Scope is constrained to critical-action confirmation, blocked-action clarity, and no-noop behavior without backend contract changes.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md`, `/home/sebas/git/agents/requirements/arch/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md`

# Architecture Notes
- Keep critical-action coverage bounded to the defined baseline only (`BOOKED`/`DECLINED`, template delete, job or occurrence delete); do not broaden confirmation scope in this requirement.
- Use the documented confirmation dialog pattern for critical actions; avoid native `window.confirm` and keep flows mobile-reachable.
- Preserve organization request lifecycle and permissions (`PENDING -> BOOKED|DECLINED`) while adding only interaction guardrails and clearer blocked-state behavior.
- Replace silent no-op actions with deterministic blocked states that include explicit reason text and a recovery hint where applicable.
- Keep all added productive copy message-key based and keep explicit loading/error recovery actions (`retry`, `back`, or clear alternative).

# Dev Plan
1. Inventory all scoped org actions in the three target components and classify each as `critical`, `blocked`, or `normal`.
2. Implement confirmation-dialog wrappers for the three critical action groups before dispatch.
3. Add deterministic blocked-action rendering with explicit reason text and next-step hint for unavailable contexts.
4. Ensure action states handle `loading`, success, and recoverable `error` without silent failures or duplicate dispatch.
5. Validate locale-prefixed route behavior and message-key coverage for all new/changed copy.
6. Run QA scenarios for one happy path and one negative/error path per critical action group.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with design-system confirmation patterns, org request lifecycle invariants, and canonical organization routes.
- Decision: `implementation_scope: frontend` remains correct because this change is interaction behavior and UI-state hardening only.
- Decision: Added guardrails to eliminate silent no-op behavior while keeping lifecycle rules and permissions unchanged.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md` -> `/home/sebas/git/agents/requirements/dev/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md`

# Dev Results
- Implemented confirmation-before-dispatch for scoped critical org actions: offer-request `BOOKED`/`DECLINED`, shift-template delete, and org job-detail delete.
- Replaced native delete confirmation in org job detail with the documented dialog pattern and kept mobile-reachable interaction flow.
- Added explicit blocked-action reason and recovery hints for missing context and in-flight lock states on scoped critical actions.
- Ensured deterministic recovery paths for failures via dialog/notices with retry and cancel/back alternatives.
- Verified frontend gates: `npm --prefix web run lint` and `npm --prefix web run build` both pass.
Changes: `web/src/components/jobs/organization-offer-requests-page.tsx`, `web/src/components/jobs/organization-shifts-page.tsx`, `web/src/components/jobs/organization-job-detail-page.tsx`

# QA Results
- Decision: pass -> `sec`.
- Scope validation against docs and requirement passed for all scoped components:
  - `web/src/components/jobs/organization-offer-requests-page.tsx`
  - `web/src/components/jobs/organization-shifts-page.tsx`
  - `web/src/components/jobs/organization-job-detail-page.tsx`
- Critical action group evidence:
  - Request decision (`BOOKED`/`DECLINED`) happy path: action opens explicit confirmation dialog and dispatch occurs only from confirm submit; negative path: blocked context renders explicit reason + hint and failed decision shows retry path in dialog/notices.
  - Template delete happy path: delete opens explicit confirmation dialog before API delete call; negative path: missing template context renders blocked reason + hint and failed delete exposes retry action.
  - Job/occurrence delete happy path: delete opens documented confirmation dialog and proceeds on confirm; negative path: missing route context and in-flight lock expose explicit blocked messaging and failed delete provides retry/cancel alternatives.
- Verified requirement acceptance:
  - No silent no-op org action observed in scoped components.
  - No native `window.confirm` usage remains in scoped critical delete flow.
  - Changed copy for guardrails/recovery remains message-key driven in `web/messages/en.json` and `web/messages/de.json`.
  - Locale-prefixed route usage is preserved via i18n navigation links for scoped surfaces.
- Mandatory checks (in order):
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` pass
  - `npm --prefix /home/sebas/git/shift-matching/web run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run test` pass (`267` passed, `0` failed)
Changes: `/home/sebas/git/agents/requirements/qa/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md` -> `/home/sebas/git/agents/requirements/sec/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md`

# Security Results
- Decision: pass -> `ux`.
- Reviewed security-relevant implementation for scoped guardrail surfaces:
  - `web/src/components/jobs/organization-offer-requests-page.tsx`
  - `web/src/components/jobs/organization-shifts-page.tsx`
  - `web/src/components/jobs/organization-job-detail-page.tsx`
- Security checks in scope:
  - Confirmed critical actions (`BOOKED`/`DECLINED`, template delete, job/occurrence delete) use explicit confirmation dialogs before dispatch.
  - Confirmed no native `window.confirm` remains in scoped components.
  - Confirmed disabled/blocked critical actions expose explicit blocked-state messaging in scoped flows.
  - Confirmed no silent no-op interaction path remained in scoped components.
  - Confirmed user-facing guardrail copy remains message-key based.
- Regression verification:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` pass
  - `npm --prefix /home/sebas/git/shift-matching/web run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run build` pass
  - `npm --prefix /home/sebas/git/shift-matching/app run test` pass (`269` passed, `0` failed)
Changes: `/home/sebas/git/agents/requirements/sec/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md` -> `/home/sebas/git/agents/requirements/ux/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md`

# UX Results
- Decision: pass. Move requirement to `deploy`.
- Reviewed scoped guardrail UX against binding docs (`docs/web-design-system.md`, `docs/web-governance.md`, `docs/web-quality-test-program.md`, `docs/web-jobs-requests-flow.md`, `docs/web-product-structure.md`, `docs/api-reference.md`).
- Confirmed critical actions remain confirmation-gated and no silent no-op action path is exposed in scoped components.
- Requirement-scoped UX/copy fix applied:
  removed raw adapter/backend error-message rendering from scoped critical-action flows and replaced it with deterministic message-key copy plus existing retry/back alternatives.
- Added aligned DE/EN message keys for action-failure notices in organization offer-requests and organization job-detail flows.
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
Changes: `web/src/components/jobs/organization-offer-requests-page.tsx`, `web/src/components/jobs/organization-job-detail-page.tsx`, `web/messages/en.json`, `web/messages/de.json`, `/home/sebas/git/agents/requirements/ux/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md`

# Deploy Results
- Decision: pass. Requirement is deploy-ready for Coolify.
- Verified binding release gates from `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Mandatory checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass: `269` passed, `0` failed)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass: `QA gate: OK`)
- Coolify deployment readiness for this requirement remains satisfied:
  - build-info generation runs in both build pipelines (`web` and `app`) without failures.
  - no new environment-variable requirements were introduced by this requirement scope.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md` -> `/home/sebas/git/agents/requirements/released/REQ-WEB-ORG-INTERACTION-GUARDRAILS-NOOP-ACTIONS.md`
