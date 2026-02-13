---
id: REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION
title: Clarify organization contracts empty state and supported capabilities
status: released
implementation_scope: frontend
source: user-2026-02-11-field-feedback-auth-navigation
---

# Summary
Clarify the organization contracts empty state so users understand what this route supports today: archive/list/view/download of organization-linked contracts. The UX must not imply unsupported actions such as manual contract upload or template management.

# Scope
- Empty-state copy and CTA behavior on `/{locale}/app/organizations/contracts`.
- Empty-state guidance for conditions where `GET /contracts/me` returns no contracts.
- UI wording that explains how contracts become available (booking flow and active-pair reuse rules).
- Preserve current list, sorting, view, and download behavior when contracts exist.

# Acceptance Criteria
- [ ] When organization contracts data is empty, the page shows an explicit empty state that states no contracts are currently available for the organization account.
- [ ] Empty-state messaging explains that contracts are created in booking flow context and not via manual upload in the organization route.
- [ ] The organization contracts screen does not expose or suggest admin template lifecycle actions (upload, activate, template governance).
- [ ] If contracts exist, current archive/list/view/download behavior remains unchanged.
- [ ] Empty-state copy uses localized message keys and appears in both `de` and `en` locale routes.

# Definition of Done
- [ ] Requirement-conformant empty-state behavior is defined for `web/src/components/contracts/organization-contracts-page.tsx`.
- [ ] QA checklist covers both empty and non-empty organization contract scenarios, including role boundary checks.
- [ ] QA evidence confirms no UI entry points for manual organization-side upload or template management.
- [ ] References and constraints remain aligned with current docs in `docs/`.

# Assumptions
- `GET /contracts/me` remains the source for organization contract archive data and can return an empty collection for valid accounts.
- Existing booking-to-contract generation behavior remains as documented and is not changed by this requirement.
- No new backend endpoint is needed for this clarification-focused UX update.

# Constraints
- Organization contracts route scope is limited to contracts linked to the current organization assignments (`docs/web-contracts-flow.md`).
- Contract list/loading behavior must stay based on `GET /contracts/me` and existing role visibility rules (`docs/web-contracts-flow.md`).
- Organization area must not include admin contract-template governance controls (`docs/web-contracts-flow.md`, `docs/roles-and-functions.md`).
- Contract creation remains booking-driven when no active employer-participant contract exists; manual organization-side upload is out of scope (`docs/scope-boundaries.md`).

# Out of Scope
- Admin contract template lifecycle features.
- Backend contract generation logic or term policy changes.
- New organization-side contract authoring or upload capability.
- Changes to participant contract route behavior.

# References
- `docs/web-contracts-flow.md`
- `docs/scope-boundaries.md`
- `docs/roles-and-functions.md`
- `docs/web-api-adapter-contract.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` stays `frontend` in split mode because the change is UX/copy and role-boundary presentation only.
- Decision: Scope is constrained to empty-state clarity while preserving existing contract archive/list behavior.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md`

# Architecture Notes
- Keep organization contracts capabilities bounded to archive/list/view/download from `GET /contracts/me`; do not introduce create/upload/template controls.
- Use explicit route-surface state handling (`loading`, `empty`, `error`, `success`) for organization contracts to match frontend governance and adapter mapping.
- Empty-state wording must state that contracts are created in booking flow when no active employer-participant contract exists.
- Preserve role boundaries: organization route must not expose admin template governance actions or admin endpoints.
- Keep productive copy message-key driven for locale-prefixed routes, with DE runtime-active and EN prepared.

# Dev Plan
1. Audit the current `organization-contracts-page` state branches for fetch success, empty collection, and error handling.
2. Define and wire message keys for capability-clarifying empty-state copy and any bounded CTA text.
3. Implement empty-state rendering for `GET /contracts/me` empty results without changing non-empty list/sort/view/download behavior.
4. Verify no UI actions or links imply manual organization-side upload or admin template lifecycle management.
5. Extend QA coverage for empty vs non-empty organization contract scenarios, role-boundary checks, and locale-prefixed route behavior.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with `docs/web-contracts-flow.md`, `docs/scope-boundaries.md`, and `docs/roles-and-functions.md`.
- Decision: `implementation_scope: frontend` remains correct because this is route-surface copy/state clarification only.
- Decision: Added implementation guardrails to prevent capability drift toward admin template management or manual upload.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md` -> `/home/sebas/git/agents/requirements/dev/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md`

# Dev Results
- Updated `web/src/components/contracts/organization-contracts-page.tsx` empty-state rendering to clarify supported capabilities for this route and provide a deterministic CTA to booking flow (`/app/organizations/offer-requests`).
- Empty-state copy now explicitly states:
- no contracts are currently available for the organization account,
- contracts are generated through booking flow context,
- active employer-participant contracts are reused instead of generating duplicates,
- manual upload/template governance is not supported in this organization route.
- Preserved existing non-empty archive/list/view/download behavior and guarded empty-state rendering so it only appears for successful empty fetch results (not session/error notice states).
- Added localized message-key coverage for the new empty-state capability copy and CTA in both catalogs:
- `web/messages/de.json` (`app.organizationContracts.messages.emptyTitle`, `app.organizationContracts.emptyRules.*`, `app.organizationContracts.actions.toOfferRequests`)
- `web/messages/en.json` (same key set plus missing organization-contract runtime keys already used by the component: `messages.loading`, `card.*`, `status.*`, `actions.unavailable`)
- Validation evidence:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed.
Changes: `/home/sebas/git/shift-matching/web/src/components/contracts/organization-contracts-page.tsx`, `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md`

# QA Results
- Binding docs validation completed:
- `docs/web-contracts-flow.md` confirms organization route scope is archive/list/view/download from `GET /contracts/me` and excludes admin template governance.
- `docs/scope-boundaries.md` confirms contract generation is booking-driven and active employer-participant contracts are reused.
- `docs/roles-and-functions.md` confirms employer non-permission for admin account/template management functions.
- `docs/web-api-adapter-contract.md` confirms contract archive uses `GET /contracts/me` and admin template lifecycle stays on admin endpoints.
- Implementation validation for `web/src/components/contracts/organization-contracts-page.tsx`:
- empty state is shown only on successful empty dataset (`contracts.length === 0`) and not on session/error notice paths.
- empty-state copy clearly states no contracts available, booking-flow generation, active-pair reuse, and no manual upload/template governance.
- deterministic CTA in empty state routes to `"/app/organizations/offer-requests"` (booking flow context).
- non-empty branch preserves list rendering and view/download behavior; no admin/template controls are exposed.
- locale/message-key validation:
- referenced `app.organizationContracts.*` keys in the component resolve in both `web/messages/de.json` and `web/messages/en.json` (`missing_de: 0`, `missing_en: 0`).
- role-boundary validation:
- no organization contracts UI entry points for upload/activate/template governance actions.
- mandatory QA checks passed in required order:
- `npm --prefix /home/sebas/git/shift-matching/web run lint`
- `npm --prefix /home/sebas/git/shift-matching/web run build`
- `npm --prefix /home/sebas/git/shift-matching/app run build`
- `npm --prefix /home/sebas/git/shift-matching/app run test` (`267` passed, `0` failed)
- Decision: pass, moved to `sec`.
- Changes: `/home/sebas/git/agents/requirements/qa/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md` -> `/home/sebas/git/agents/requirements/sec/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md`

# Security Results
- Reviewed requirement-scoped implementation in:
  `web/src/components/contracts/organization-contracts-page.tsx`,
  `web/src/app/[locale]/app/organizations/contracts/page.tsx`,
  `web/src/proxy.ts`,
  `web/src/lib/api/adapters/contracts.ts`,
  `web/messages/de.json`,
  and `web/messages/en.json`.
- Confirmed empty-state capability clarification does not introduce admin/template lifecycle entry points in organization contracts UI.
- Confirmed route remains role-guarded (`EMPLOYER`) via middleware and scope remains organization contract archive/list/view/download from `GET /contracts/me`.
- Confirmed external document links remain protocol-restricted to `http/https` and use `rel=\"noopener noreferrer\"` on new-tab actions.
- Confirmed productive copy for empty-state clarification is message-key driven in both DE and EN locales.
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
- Decision: pass. Move requirement to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md` -> `/home/sebas/git/agents/requirements/ux/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md`

# UX Results
- Reviewed requirement-scoped UX/copy behavior against `docs/web-contracts-flow.md`, `docs/scope-boundaries.md`, `docs/roles-and-functions.md`, `docs/web-api-adapter-contract.md`, and `docs/web-governance.md`.
- Confirmed empty-state behavior on `/{locale}/app/organizations/contracts` is explicit and capability-bounded:
  - states no contracts are currently available for the organization account,
  - explains booking-flow generation and active-pair reuse,
  - does not expose or suggest manual upload/template governance actions.
- Confirmed non-empty branch retains archive/list/view/download behavior and empty-state CTA routes deterministically to `"/app/organizations/offer-requests"`.
- Confirmed message-key coverage for `app.organizationContracts.*` used by `web/src/components/contracts/organization-contracts-page.tsx` remains complete in DE/EN (`missing_de=0`, `missing_en=0`).
- Applied requirement-scoped terminology fix in empty-state guidance copy:
  - DE `app.organizationContracts.emptyRules.one`: `Offer Request` -> `Jobanfrage`
  - EN `app.organizationContracts.emptyRules.one`: `offer request` -> `job request`
- Validation:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
- Decision: pass. Move requirement to `deploy`.
Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/ux/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md` -> `/home/sebas/git/agents/requirements/released/REQ-ORG-CONTRACTS-EMPTY-STATE-CAPABILITY-CLARIFICATION.md`
