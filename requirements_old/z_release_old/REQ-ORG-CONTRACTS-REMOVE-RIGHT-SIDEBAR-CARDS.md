---
id: REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS
title: Remove right-side info cards on organization contracts page
status: released
implementation_scope: frontend
source: user-2026-02-11-org-contracts-remove-right-cards
---

# Summary
Remove the three informational cards on the right side of the organization contracts page to keep focus on contract list data and user actions.

# Scope
- Frontend-only change on organization contracts page.
- Route remains `/{locale}/app/organizations/contracts`.
- Remove right-column informational cards only.
- Keep contracts list, status chips, and document actions unchanged.
- Keep existing error handling behavior for contract documents.

# Acceptance Criteria
- On `/{locale}/app/organizations/contracts`, the informational cards `Sichtbarkeit`, `Status-Terminologie`, and `Fehlerzustaende` are not rendered.
- Contracts list remains visible and functional with existing status display and row actions.
- View/download behavior still depends on existing `downloadUrl` availability semantics.
- If one contract document fails, error feedback remains inline at contract level and does not replace the full page list.
- Locale-prefixed route behavior remains unchanged for `/de` and `/en` paths.

# Definition of Done
- UI change is implemented only in active frontend track `web/`.
- Requirement remains frontend-scoped; no backend/API/schema changes are introduced.
- Organization contracts route, role visibility, and guards remain unchanged.
- Requirement includes traceable PO/ARCH decisions and move to development stage.

# Assumptions
- The removed cards are guidance-only and not required to complete contract user tasks.
- Existing contract list and action labels already provide sufficient operational context.

# Constraints
- Route model must stay locale-prefixed (`/{locale}/...`) and route slug unchanged.
- Organization contracts route must remain `/{locale}/app/organizations/contracts`.
- Existing contracts data contract remains unchanged (`GET /contracts/me`; `downloadUrl` controls document action availability).
- Role visibility boundaries must remain unchanged (organization sees only own assignment-linked contracts; no admin template controls here).
- UI error handling must remain explicit and non-blocking at contract row level.

# Out of Scope
- Backend contract lifecycle or status model changes.
- API endpoint changes for contracts.
- Admin contract-template workflow changes.
- Participant contracts page redesign.

# References
- `docs/web-contracts-flow.md`
- `docs/web-product-structure.md`
- `docs/web-governance.md`
- `docs/scope-boundaries.md`

# PO Results
- Decision: Requirement aligns with contracts flow and route structure docs; no direct contradiction found.
- Decision: Requirement stays frontend-only in split routing mode (`implementation_scope: frontend`).
- Decision: Scope is limited to removing non-functional info cards while preserving list/actions and error behavior.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md`

# Architecture Notes
- Keep route ownership unchanged at `/{locale}/app/organizations/contracts`; do not move contract actions to other workspaces.
- Apply removal at shared organization contracts page/layout level to avoid per-view divergence.
- Preserve `downloadUrl`-driven action availability and row-level error handling exactly as documented.
- Keep role visibility boundaries intact (organization contract archive only; no admin template controls on this route).

# Dev Plan
1. Remove the three informational card blocks from `web/src/components/contracts/organization-contracts-page.tsx` (or its current equivalent composition root).
2. Keep contracts list/table rendering, status mapping, and view/download action wiring unchanged.
3. Verify row-level document error presentation still appears inline and list visibility remains intact when a document is unavailable.
4. Validate route behavior and locale-prefixed rendering on `/{locale}/app/organizations/contracts` without changing auth/guard behavior.

# Architecture Results
- Decision: Architecture-ready; no unresolved contradictions against contracts flow, route model, or scope boundaries.
- Decision: Frontend-only scope remains valid and bounded to UI reduction.
- Decision: Non-regression focus is on contract actions and inline error behavior.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md`, `/home/sebas/git/agents/requirements/dev/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md`

# Dev Results
- Verified `web/src/components/contracts/organization-contracts-page.tsx` no longer renders the right-column info cards (`Sichtbarkeit`, `Status-Terminologie`, `Fehlerzustaende`).
- Kept organization contracts list rendering, status chips, and `downloadUrl`-based view/download action behavior unchanged.
- Preserved inline, contract-level fallback when document URL is unavailable (`actions.unavailable`) without blocking the full page list.
- Ran frontend validation: `npm --prefix web run lint` passed.
Changes: `/home/sebas/git/agents/requirements/dev/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md -> /home/sebas/git/agents/requirements/qa/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md`

# QA Results
- Acceptance criteria validation: pass. On `/{locale}/app/organizations/contracts`, the three informational cards are not rendered; the page now renders heading, notices, and the contracts list surface only.
- Non-regression validation: pass. Contracts list rendering, status chip mapping, and `downloadUrl`-driven view/download or unavailable actions remain unchanged in `web/src/components/contracts/organization-contracts-page.tsx`.
- Route and scope validation: pass. Locale-prefixed route `web/src/app/[locale]/app/organizations/contracts/page.tsx` remains unchanged and frontend-only scope is preserved.
- Mandatory baseline checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint`: pass
- `npm --prefix /home/sebas/git/shift-matching/web run build`: pass
- `npm --prefix /home/sebas/git/shift-matching/app run build`: pass
- `npm --prefix /home/sebas/git/shift-matching/app run test`: pass (248/248)
Changes: `/home/sebas/git/agents/requirements/qa/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md` (status updated, QA results added)

# Security Results
- Decision: pass; organization contracts route remains role-guarded and locale-scoped, and requirement-scoped UI removal does not widen access or data exposure.
- Fixed: hardened organization contract document actions to use only safe `http/https` `downloadUrl` values before rendering interactive links; malformed/unsafe URLs now fall back to existing unavailable action state.
- Validation: `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; pre-existing EN message warnings remain outside this requirement scope).
Changes: `web/src/components/contracts/organization-contracts-page.tsx`, `/home/sebas/git/agents/requirements/sec/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md -> /home/sebas/git/agents/requirements/ux/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md`

# UX Results
- Decision: pass; organization contracts page keeps the contract list/action workflow intact after right-column guidance cards removal.
- UX validation: informational cards are not rendered; list visibility, status chips, and `downloadUrl`-driven action availability remain unchanged; unavailable documents still show inline row-level feedback without replacing the full list.
- Requirement-scoped UX/copy fixes: none required.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md -> /home/sebas/git/agents/requirements/deploy/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md`

# Deploy Results
- Decision: pass; requirement is deploy-ready for Coolify check mode and remains frontend-only with no backend/API/schema changes.
- Coolify/deploy checks: `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass), `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass), `npm --prefix /home/sebas/git/shift-matching/web run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run build` (pass), `npm --prefix /home/sebas/git/shift-matching/app run test` (pass; 248 passed, 0 failed).
- Notes: `web` build still reports pre-existing EN `MISSING_MESSAGE` warnings but exits successfully; no requirement-scoped deploy blocker detected.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md -> /home/sebas/git/agents/requirements/released/REQ-ORG-CONTRACTS-REMOVE-RIGHT-SIDEBAR-CARDS.md`
