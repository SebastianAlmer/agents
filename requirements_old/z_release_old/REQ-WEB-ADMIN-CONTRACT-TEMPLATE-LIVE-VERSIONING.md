---
id: REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING
title: Replace admin contract-template placeholder with live versioning workflow
status: released
implementation_scope: frontend
source: user-2026-02-11-admin-area-and-legacy-review
---

# Summary
Replace the static admin contract-template placeholder with live template versioning workflow in `web` using existing admin contract-template adapter APIs.

# Scope
- Frontend-only implementation in `web/` for admin contract-template screen behavior.
- Route `/{locale}/app/admin/contract-template` and page component rendering.
- Adapter-backed template workflow:
  - `apiAdapters.contracts.fetchAdminContractTemplate`
  - `apiAdapters.contracts.uploadAdminContractTemplate`
  - `apiAdapters.contracts.previewAdminContractTemplate`
  - `apiAdapters.contracts.activateAdminContractTemplate`
- Read-only version visibility plus workflow actions for upload, preview, and activate.

# Acceptance Criteria
- Contract-template screen loads live payload from adapter data source (active template, versions, placeholders) and removes static placeholder content.
- DOCX upload action is available and submits multipart file payload through the contracts adapter.
- Preview action is available per version and renders returned preview context when available (for example warnings, placeholder findings, preview metadata).
- Activate action is available for non-active versions, reflects preview-before-activate flow visibility, and refreshes active state after success.
- Version list rendering is deterministic and clearly identifies active versus non-active versions.
- UI explicitly handles `loading`, `empty`, `error`, and action progress states (`uploading`, `checking`, `activating`).
- Unauthorized or expired-session responses follow existing localized admin auth-guard behavior for protected routes.
- Component uses adapter methods only for domain transport (no direct `fetch` calls for contract-template data/actions).

# Definition of Done
- `web/src/components/admin/admin-contract-template-page.tsx` is API-backed through contracts adapter methods and supports upload, preview, and activate actions.
- UI behavior reflects the single-active-template invariant in loaded and post-activation states.
- QA evidence includes one happy path (upload -> preview -> activate), one action failure path, and one unauthorized/session-expiry guard path.
- Route behavior remains locale-prefixed and admin-role guarded.

# Assumptions
- Existing admin contract-template endpoints remain available and compatible with current contracts adapter methods.
- Preview response shape may vary; UI handles optional preview fields safely without runtime failure.
- Audit event recording for upload/preview/activate is handled by backend governance services.

# Constraints
- Keep admin route isolation under `/{locale}/app/admin...` and do not expose template-governance controls outside admin routes.
- Keep contract-template module as template-governance only, not participant/employer contract archive behavior.
- Use existing contract-template endpoints and adapter layer only; no new API route design in this requirement.
- Preserve governance safeguards: validation before persistence, preview-before-activate flow visibility, and single-active-template invariant.
- Keep implementation in `web/` as primary frontend track; no rebuild feature work in `web_legacy/`.
- Keep localized route and protected-route auth-guard behavior unchanged.

# Out of Scope
- Contract-template backend lifecycle or schema changes.
- Rich template editor beyond current endpoint contract.
- New reporting/export capabilities for template operations.
- Changes to admin accounts, analytics, or mail modules.

# References
- `docs/web-admin-governance-flow.md`
- `docs/web-contracts-flow.md`
- `docs/api-reference.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because the needed endpoints and adapter contracts are already documented.
- Decision: Scope now explicitly enforces governance safeguards for preview-before-activate and single-active-template behavior.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md`, `/home/sebas/git/agents/requirements/arch/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md`

# Architecture Notes
- Keep contract-template governance isolated to `/{locale}/app/admin/contract-template` under existing admin role guards.
- Use contracts adapter methods only for load and actions (`fetch`, `upload`, `preview`, `activate`); no direct screen-level transport calls.
- Preserve governance safeguards in UI flow: validation before persistence, preview-before-activate visibility, and single-active-template invariant.
- Treat preview/check warnings as visible operator feedback that does not hard-block activate action, consistent with scope boundaries.
- Keep deterministic version ordering and explicit state handling (`loading`, `empty`, `error`, `uploading`, `checking`, `activating`) with message-driven copy.

# Dev Plan
1. Replace static placeholder data in `web/src/components/admin/admin-contract-template-page.tsx` with adapter-backed template load flow.
2. Wire DOCX upload action via contracts adapter multipart method and add clear action-progress and failure feedback states.
3. Wire per-version preview action and render preview/check outputs safely when optional fields are missing.
4. Wire activate action for non-active versions and refresh template state after success to enforce one active version in UI.
5. Implement deterministic version-list ordering and clear active/non-active markers.
6. Verify admin guard behavior and localized auth fallback remain unchanged for unauthorized or expired sessions.
7. Capture QA evidence for happy path (`upload -> preview -> activate`), one action-failure path, and one unauthorized/session-expiry path.

# Architecture Results
- Decision: Requirement is architecture-ready and consistent with admin governance, contracts flow, and adapter-contract documentation.
- Decision: `implementation_scope: frontend` remains correct because required admin contract-template endpoints and adapter methods are already documented.
- Decision: Added architecture guardrails for non-blocking preview warnings and deterministic post-activation state refresh.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md` -> `/home/sebas/git/agents/requirements/dev/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md`

# Dev Results
- Replaced the admin contract-template placeholder view with live adapter-backed load/upload/preview/activate workflow in `web/src/components/admin/admin-contract-template-page.tsx`.
- Added explicit UI handling for `loading`, `empty`, `error`, upload/check/activate progress, deterministic version ordering, active/non-active markers, and preview details rendering with safe optional-field parsing.
- Preserved admin auth-guard behavior for missing/expired sessions by reusing localized login redirect flow.
- Expanded contract-template adapter DTO typing in `web/src/lib/api/adapters/contracts.ts` and aligned localized message keys in `web/messages/de.json` and `web/messages/en.json`.
- Validation: `npm --prefix web run lint` passed; `npm --prefix web run build` completed with pre-existing unrelated `MISSING_MESSAGE` logs in other organization modules.
Changes: `web/src/components/admin/admin-contract-template-page.tsx`, `web/src/lib/api/adapters/contracts.ts`, `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md`

# QA Results
- Decision: pass.
- Validation:
- Contract-template screen is live adapter-backed and placeholder content is removed (`apiAdapters.contracts.fetchAdminContractTemplate`).
- DOCX upload is wired through contracts adapter multipart flow (`uploadAdminContractTemplate` with `FormData`).
- Per-version preview is wired and preview context renders safely (`warnings`, placeholder findings, metadata, body preview).
- Activate action is available only for non-active versions, preserves preview-before-activate visibility, and refreshes template state after success.
- Version ordering is deterministic and active/non-active state is explicit.
- UI explicitly handles `loading`, `empty`, `error`, and action progress states (`uploading`, `checking`, `activating`).
- Unauthorized responses clear session and redirect to localized login through existing guard helper.
- Component uses adapter methods only; no direct `fetch` is used for contract-template transport.
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (pre-existing non-blocking EN `MISSING_MESSAGE` logs remain in unrelated organization namespaces).
- `npm --prefix /home/sebas/git/shift-matching/app run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`248` passed, `0` failed).
- QA evidence:
- Happy path: upload -> preview -> activate workflow is live and refreshes to single active version state.
- Action failure path: upload/preview/activate failures render explicit localized error notices and keep workflow recoverable.
- Unauthorized/session-expiry path: missing/expired/unauthorized session routes through localized login redirect behavior.
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md`

# Security Results
- Decision: pass.
- Validation:
- Reviewed requirement-scoped contract-template workflow across `web/src/components/admin/admin-contract-template-page.tsx`, `web/src/lib/api/adapters/contracts.ts`, `app/src/contracts/contract-template.controller.ts`, and `app/src/contracts/contract-template.service.ts` against `docs/web-admin-governance-flow.md`, `docs/web-api-adapter-contract.md`, and `docs/web-auth-flows.md`.
- Fixed an audit compliance gap in this workflow: template preview actions are now audited with admin context, and upload actions now emit explicit upload audit actions (`UPLOADED`) instead of generic create-only action labels.
- Added regression coverage for controller forwarding and service audit behavior for preview/upload paths.
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`252` passed, `0` failed).
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (pre-existing non-blocking EN `MISSING_MESSAGE` logs remain outside this requirement scope).
- Changes: `/home/sebas/git/shift-matching/app/src/contracts/contract-template.controller.ts`, `/home/sebas/git/shift-matching/app/src/contracts/contract-template.service.ts`, `/home/sebas/git/shift-matching/app/src/contracts/contract-template.controller.test.ts`, `/home/sebas/git/shift-matching/app/src/contracts/contract-template.service.test.ts`, `/home/sebas/git/agents/requirements/sec/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md` -> `/home/sebas/git/agents/requirements/ux/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed contract-template workflow UX/copy in `web/src/components/admin/admin-contract-template-page.tsx` against `docs/web-admin-governance-flow.md`, `docs/web-contracts-flow.md`, `docs/web-design-system.md`, and `docs/glossary.md`.
- Fixed requirement-scoped DE localization quality in `app.adminContractTemplate` by removing mixed-language user-facing wording in badge, action guards, and safeguard text while preserving behavior and message-key wiring.
- Confirmed read-only governance flow remains clear and unchanged for upload, preview, activate, and explicit state handling (`loading`, `empty`, `error`, `uploading`, `checking`, `activating`).
- Re-validated with `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass).
- Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/agents/requirements/ux/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md` release gates.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-blocking EN `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `259` tests)
- Decision: pass; move to `released`.
- Changes: `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md` -> `/home/sebas/git/agents/requirements/released/REQ-WEB-ADMIN-CONTRACT-TEMPLATE-LIVE-VERSIONING.md`
