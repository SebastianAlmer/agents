---
id: REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD
title: Connect responder contracts page to live API data and download links
status: released
implementation_scope: frontend
source: user-2026-02-11-delta-from-REQ-CONTRACT-AUTOGEN-STORAGE-AND-DOWNLOAD
---

# Summary
Replace static mock cards in the responder contracts page with live contract archive data so authenticated responders can view and download their real contract documents.

# Scope
- Frontend implementation in `web/` for responder contracts flow only.
- Participant route `/{locale}/app/responders/contracts`.
- Data source via existing contracts adapter for `GET /contracts/me`.
- Display contract archive list with counterpart, contract period metadata, status, and document actions.

# Acceptance Criteria
- [ ] No hardcoded responder contract entries remain; rendered entries come from live adapter response data.
- [ ] Contracts are loaded through the `web` API adapter contract for `GET /contracts/me` (no direct page-level transport call).
- [ ] Each rendered contract includes counterpart name and period context from archive fields (`validFrom`, `validUntil`, and `contractDate` fallback when term dates are unavailable).
- [ ] Status rendering uses binding UI terminology `Active`, `Pending signature`, and `Expired`; legacy termless/historical records are mapped to `Expired` in UI.
- [ ] `View` and `Download` actions use `downloadUrl` when present; when `downloadUrl` is missing, actions are visibly unavailable and non-interactive.
- [ ] Screen includes explicit `loading`, `empty`, and `error` states, with retry action for recoverable list-load failures.
- [ ] Missing or expired session follows protected-route behavior and redirects to `/{locale}/login?next=<requested-path>` instead of showing an authenticated contracts error screen.
- [ ] Archive list ordering remains deterministic by preserving adapter response order from `GET /contracts/me` (no client-side reordering that changes backend archive semantics).

# Definition of Done
- [ ] Requirement implementation is confined to `web/` and does not add new feature behavior in `web_legacy/`.
- [ ] User-facing copy follows frontend copy governance (message-based text, no hardcoded production strings).
- [ ] Locale-prefixed routing behavior for contracts remains valid for `/de` and `/en` path handling per current phase rules.
- [ ] Evidence is recorded for responder happy path, one negative/error path, and permission/session-guard behavior.

# Assumptions
- Existing contracts adapter in `web` already exposes the `GET /contracts/me` call and normalized response fields used by the responder contracts page.
- Role filtering and deterministic archive ordering are provided by the backend/archive endpoint contract.

# Constraints
- `web/` is the active frontend track; `web_legacy/` is maintenance-only.
- Participant contracts visibility is restricted to contracts bound to the current participant session.
- Contracts list must follow `GET /contracts/me` archive semantics, including `downloadUrl`-based document availability.
- UI status labels for contracts must use the binding terminology `Active`, `Pending signature`, and `Expired`.
- For document access issues, keep the list visible and show explicit inline error context for affected contract actions.

# Architecture Notes
- Keep responder contracts page on the same adapter contract as organization contracts (`apiAdapters.contracts.fetchMyContracts`) to avoid transport drift.
- Treat backend archive order as authoritative; UI should render in received order to preserve deterministic sort/tie-break semantics.
- Derive status chips with a stable rule: future `validFrom` -> `Pending signature`, `isActive` true -> `Active`, otherwise -> `Expired`.
- For legacy records without term bounds (`validFrom`/`validUntil`), render period via `contractDate` fallback and status as `Expired`.
- Keep protected-route redirect behavior in middleware/proxy path; contracts page should not introduce a custom unauthenticated error surface.

# Dev Plan
1. Replace responder static contract mocks with adapter-driven load state using `ApiResult` handling in `web` conventions.
2. Normalize contract card view-model fields (counterpart label, period text, status token, document availability flag) from `GET /contracts/me` payload data.
3. Implement deterministic status/period mapping logic consistent with contracts flow rules, including legacy termless record fallback handling.
4. Wire `View` and `Download` actions to `downloadUrl`, and show disabled/unavailable action state plus inline per-item context for document access issues.
5. Ensure auth/session guard behavior is inherited from protected route handling and validate `/{locale}/login?next=...` redirect on missing/expired session.
6. Verify locale route behavior for `/de` and `/en` according to phase rules and capture QA evidence for happy path, error path, and guard path.

# Out of Scope
- Backend changes to contract generation, storage, signing, or archive API payloads.
- Organization contracts screen behavior.
- Admin contract template lifecycle screens.

# References
- `docs/web-contracts-flow.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-product-structure.md`
- `docs/scope-boundaries.md`

# PO Results
- Decision: moved to `arch` because requirement is implementation-ready after alignment with binding auth/session routing behavior.
- Decision: set `implementation_scope: frontend` for split routing mode.
- Decision: kept scope focused on responder contracts page integration without backend contract changes.
Changes: `agents/requirements/selected/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md -> agents/requirements/arch/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md`

# Architecture Results
- Decision: requirement is architecture-ready after explicit alignment with archive ordering, legacy-status mapping, and protected-route behavior from `docs/web-contracts-flow.md`, `docs/web-auth-flows.md`, and `docs/scope-boundaries.md`.
- Decision: kept implementation scope frontend-only in `web/` with adapter-layer contract enforcement from `docs/web-api-adapter-contract.md`.
- Decision: added a concrete dev execution plan for state handling, mapping logic, and validation evidence.
Changes: `agents/requirements/arch/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md -> agents/requirements/dev/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md`

# Dev Results
- Replaced responder contracts mock cards with adapter-backed list loading via `apiAdapters.contracts.fetchMyContracts` and preserved backend response order in rendering.
- Added contract view-model mapping for counterpart label, period text (`validFrom`/`validUntil`, fallback to `contractDate`), and UI status mapping (`active`, `pending`, `expired`) with termless legacy records forced to `expired`.
- Implemented explicit `loading`, `empty`, and `error` list states with retry action only when failures are recoverable (`retryable=true`).
- Wired `View` and `Download` actions to `downloadUrl`; when missing, both actions are disabled/non-interactive and inline item-level document-unavailable context is shown.
- Added session guard fallback in the page: missing token or adapter `unauthorized` redirects to `/{locale}/login?next=<requested-path>` rather than showing an authenticated contracts error state.
- Validation evidence: `npm run lint` (web) passed after implementation.
Changes: `web/src/components/contracts/responder-contracts-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `agents/requirements/dev/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md -> agents/requirements/qa/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md`

# QA Results
- Decision: pass; requirement matches `docs/web-contracts-flow.md`, `docs/web-api-adapter-contract.md`, `docs/web-auth-flows.md`, and `docs/web-governance.md`.
- Acceptance validation: responder contracts render from `apiAdapters.contracts.fetchMyContracts` only, preserve backend order, map status to `active`/`pending`/`expired` with legacy termless fallback to `expired`, and derive period from `validFrom`/`validUntil` with `contractDate` fallback.
- Document actions: `View` and `Download` both bind to `downloadUrl` when present; when absent, actions are disabled and inline unavailable context is shown.
- States and guard behavior: explicit `loading`, `empty`, and `error` states exist; retry appears only for recoverable failures; missing session token and `unauthorized` API responses redirect to `/{locale}/login?next=<requested-path>`.
- Mandatory QA checks: `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run test` (pass; 242 passed, 0 failed).
- Evidence: happy path (live list with counterpart, period, status, and active links), one negative path (recoverable list-load error with retry), and session guard path (redirect to locale login with `next` query) are covered in implementation and validated in QA review.
Changes: `agents/requirements/qa/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md -> agents/requirements/sec/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md`

# Security Results
- Decision: pass; responder contract document actions now require a safe `http/https` `downloadUrl` before rendering interactive links.
- Security validation: login redirect behavior remains locale-scoped and internal (`/{locale}/login?next=...`), and unsafe/malformed document URLs are treated as unavailable actions.
- Checks: `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass).
Changes: `web/src/components/contracts/responder-contracts-page.tsx`, `agents/requirements/sec/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md -> agents/requirements/ux/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md`

# UX Results
- Decision: pass; responder contracts list keeps requirement-scoped UX behavior and now uses localized UI copy for list-load failures instead of surfacing raw adapter/backend error text.
- UX validation: binding status terminology (`Active`, `Pending signature`, `Expired`) remains mapped through message keys, contract-level unavailable-document hint stays explicit, and retry remains visible only for recoverable list-load failures.
- Checks: `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass).
Changes: `web/src/components/contracts/responder-contracts-page.tsx`, `agents/requirements/ux/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md -> agents/requirements/deploy/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md`

# Deploy Results
- Decision: pass; requirement is deploy-ready for Coolify check mode and remains frontend-scoped with no new API/runtime environment variables.
- Coolify/deploy checks: `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run test` (pass; 242 passed, 0 failed), `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass).
- Deploy guardrails: release gates from `docs/web-release-versioning-model.md` and baseline checks from `docs/web-quality-test-program.md` are satisfied for this requirement.
Changes: `agents/requirements/deploy/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md -> agents/requirements/released/REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD.md`
