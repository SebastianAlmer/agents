---
id: REQ-NEW-WEB-ORG-SETTINGS-MERGE-INTO-PROFILE-CARD
title: Keep organization settings embedded in organization profile
status: released
implementation_scope: frontend
review_risk: medium
review_scope: qa_ux
source: user-2026-02-12-org-settings-as-profile-card
---

# Goal
Ensure organization settings are managed only in the organization profile settings context, with a deterministic redirect from the legacy settings route.

# Scope
- Frontend behavior in active track `web/`.
- Organization settings context at `/{locale}/app/organizations/profile#settings`.
- Compatibility alias handling for `/{locale}/app/organizations/settings`.
- In-scope settings domains: notification frequency, governance policy, language preference.

# Task Outline
- Keep organization settings rendered within organization profile settings context.
- Enforce deterministic redirect from `/{locale}/app/organizations/settings` to `/{locale}/app/organizations/profile#settings`.
- Preserve existing settings load and save behavior in embedded settings context.
- Preserve role guard and locale-prefixed routing behavior.
- Keep productive copy message-key based.

# Acceptance Criteria
- [ ] Organization settings are available in `/{locale}/app/organizations/profile#settings` with existing capabilities.
- [ ] `/{locale}/app/organizations/settings` does not operate as standalone workspace and always redirects to `/{locale}/app/organizations/profile#settings`.
- [ ] Embedded settings keep current load, save, and error handling behavior for in-scope settings domains.
- [ ] Role and session guard behavior remains unchanged on profile/settings access.
- [ ] Productive copy remains message-key based with no hardcoded UI copy.

# Out of Scope
- Backend, API, or schema changes.
- New organization settings domains.
- Participant or admin settings redesign.
- Route model changes beyond the existing settings alias redirect contract.

# Constraints
- Keep implementation in active frontend track `web/` only.
- Keep profile and settings consolidation rules aligned with `docs/web-profile-settings-flow.md`.
- Keep route and alias behavior aligned with `docs/web-product-structure.md`.
- Keep locale and guard behavior aligned with `docs/web-auth-flows.md`.
- Keep copy and screen-state governance aligned with `docs/web-governance.md` and `docs/web-quality-test-program.md`.

# References
- `docs/web-product-structure.md`
- `docs/web-profile-settings-flow.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is organization profile/settings UI behavior.
- Decision: Requirement was reduced to a lean implementation brief focused on embedded settings behavior and route continuity.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ORG-SETTINGS-MERGE-INTO-PROFILE-CARD.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ORG-SETTINGS-MERGE-INTO-PROFILE-CARD.md`

# Architecture Notes
- Keep organization settings ownership embedded in `/{locale}/app/organizations/profile#settings`; do not reintroduce a standalone settings workspace.
- Treat `/{locale}/app/organizations/settings` as compatibility alias only, with deterministic redirect to profile settings context.
- Preserve settings-domain boundaries (notification frequency, governance policy, language preference) and existing load/save behavior.
- Keep role/session guards and locale-prefixed routing unchanged; alias redirect must still honor guard behavior.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with profile-settings consolidation and alias rules in docs.
- Decision: `review_risk` remains `medium` because route alias behavior and embedded settings context can regress navigation/guard expectations.
- Decision: `review_scope` remains `qa_ux` to focus review on redirect correctness and embedded-settings behavior parity.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-ORG-SETTINGS-MERGE-INTO-PROFILE-CARD.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-SETTINGS-MERGE-INTO-PROFILE-CARD.md`

# Dev Results
- Embedded organization settings domains (notification frequency, governance policy, language preference) into the organization profile `#settings` surface by reusing the existing settings component in embedded mode.
- Converted `/{locale}/app/organizations/settings` into a deterministic redirect-only alias to `/{locale}/app/organizations/profile#settings` so it no longer renders a standalone workspace.
- Kept role/session guard behavior unchanged via existing locale-prefixed protected routing and updated employer settings alias resolution to the canonical profile settings anchor.
- Updated organization onboarding settings CTA to point to the canonical profile settings anchor.
- Validation: `npm --prefix web run lint` passed.
- Validation: `npm --prefix web run build` passed.
Changes: `web/src/components/settings/organization-settings-page.tsx`, `web/src/components/profile/organization-profile-page.tsx`, `web/src/app/[locale]/app/organizations/settings/page.tsx`, `web/src/components/onboarding/organization-onboarding-page.tsx`, `web/src/app/[locale]/settings/page.tsx`, `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-ORG-SETTINGS-MERGE-INTO-PROFILE-CARD.md`

## Review Bundle Results
- Risk: medium
- Scope: frontend
- Roles: QA, UX
- QA: pass - Organization settings are embedded in profile settings context and organization settings alias route is redirect-only to /app/organizations/profile#settings, with behavior parity verified.
- UX: pass - Organization settings are correctly embedded in profile context and organization settings route now behaves as redirect-only alias.
- Aggregated outcome: deploy

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
