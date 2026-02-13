---
id: REQ-NEW-WEB-ORG-PROFILE-SIMPLIFICATION
title: Simplify organization profile and settings surface
status: released
implementation_scope: frontend
review_risk: low
review_scope: qa_only
source: user-2026-02-12-org-profile-settings-simplification
---

# Goal
Simplify organization profile/settings interactions by removing low-value UI blocks and unimplemented options while keeping required profile and settings behavior intact.

# Scope
- Frontend-only behavior in active track `web/`.
- Organization profile route and embedded settings context: `/{locale}/app/organizations/profile` and `/{locale}/app/organizations/profile#settings`.
- Organization settings alias behavior: `/{locale}/app/organizations/settings` remains redirecting to settings fragment.

# Task Outline
- Keep `legalAddressCountry` required in the organization model and enforce defaulting logic as needed without adding a free country edit field.
- Remove non-essential helper/support cards from organization profile.
- Remove the header action `Zum Einstellungsbereich`.
- Show only `IMMEDIATE` as selectable in organization settings; render `DAILY` and `WEEKLY` as disabled placeholders.
- Remove organization governance and language-hint blocks from settings area.
- Use one persistent primary save action for the combined profile/settings screen context.

# Acceptance Criteria
- [ ] `/{locale}/app/organizations/profile` no longer shows the removed helper cards and no manual `legalAddressCountry` input field.
- [ ] `/{locale}/app/organizations/settings` continues to resolve to `/{locale}/app/organizations/profile#settings`.
- [ ] Settings options present only as: selectable `IMMEDIATE`, disabled `DAILY`, disabled `WEEKLY`.
- [ ] No duplicate primary save actions exist in the same editable profile/settings scope.
- [ ] Required profile field completion rules remain enforced for profile-save.
- [ ] Locale route and alias behavior remains unchanged.

# Out of Scope
- Implementing or expanding backend notification frequency processing.
- Changing role/permission model or auth/session flow.
- Backend/profile API contract changes.

# Constraints
- Keep implementation in `web/` only per frontend governance.
- Preserve organization profile model and required fields as documented in `docs/web-profile-settings-flow.md`.
- Keep UI behavior and route/guard model aligned with `docs/web-governance.md` and `docs/web-product-structure.md`.
- Maintain production copy governance and quality expectations from `docs/web-design-system.md` and `docs/web-quality-test-program.md`.

# References
- `docs/web-profile-settings-flow.md`
- `docs/web-product-structure.md`
- `docs/web-design-system.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# PO Results
- Decision: No direct contradiction with docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because changes are profile/settings UI behavior only.
- Decision: `review_risk` remains `low` and `review_scope` is `qa_only` for contained UI simplification.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ORG-PROFILE-SETTINGS-SIMPLIFICATION.md`, `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-PROFILE-SETTINGS-SIMPLIFICATION.md`

# Architecture Notes
- Keep organization profile field contract from `docs/web-profile-settings-flow.md`: required fields and save validation remain enforced in `PUT /organisations/profile/me`.
- Treat `/{locale}/app/organizations/settings` as route alias to `/{locale}/app/organizations/profile#settings`; do not change its redirect behavior.
- Preserve required profile completion flow: UI simplification must not weaken validation or allow partial required-profile saves.
- Notification-frequency rendering in settings can downgrade daily/weekly to disabled state only if backend still returns that enum (`IMMEDIATE|DAILY|WEEKLY`) without claiming full feature coverage.
- Keep one primary save control for profile+settings edit context to avoid action duplication and conflicting persistence flows.

# Architecture Results
- Decision: Ready for DEV; no doc-level contract conflicts identified after validation against `docs/web-profile-settings-flow.md`, `docs/web-product-structure.md`, and `docs/web-api-adapter-contract.md`.
- Decision: `review_risk` remains `low` due confined UI cleanup with existing routes and contracts.
- Decision: `review_scope` remains `qa_only` because change remains localized to profile/settings surface behavior.
- Changes: Updated front matter status to `dev`; added Architecture Notes and Architecture Results.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Profile/settings simplification is implemented with the helper cards removed, country input replaced by locale defaulting, disabled DAILY/WEEKLY notification options with IMMEDIATE as selectable, and the settings action removed from the embedded context to keep a single save path. Route alias and profile/save flow remain on the existing contract-preserving paths.
- Findings: none

# Security Results
- Reviewed implementation files:
  - `web/src/components/profile/organization-profile-page.tsx`
  - `web/src/components/settings/organization-settings-page.tsx`
  - `web/src/app/[locale]/app/organizations/settings/page.tsx`
  - `web/src/app/[locale]/settings/page.tsx`
  - `docs/web-profile-settings-flow.md`
- Decision: pass (`ux`)
- Findings: none
Changes: `security review only`, requirement file moved to `ux`; status updated to `ux`.

## UX Results
- Decision: pass
- Changes: web/src/components/profile/organization-profile-page.tsx, web/src/components/settings/organization-settings-page.tsx, web/src/app/[locale]/app/organizations/settings/page.tsx, web/src/app/[locale]/settings/page.tsx

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
