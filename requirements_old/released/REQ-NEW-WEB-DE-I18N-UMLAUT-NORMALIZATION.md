---
id: REQ-NEW-WEB-DE-I18N-UMLAUT-NORMALIZATION
title: Normalize DE UI orthography in active web flows
status: released
implementation_scope: frontend
review_risk: medium
review_scope: qa_ux
source: user-2026-02-12-de-translation-umlaut-normalization
---

# Goal
Normalize German user-facing copy in active `web/` flows so DE runtime text follows binding orthography rules and avoids ASCII transliterations where umlaut or eszett forms are intended.

# Scope
- Normalize user-facing DE message values in `web/messages/de.json`.
- Cover active `web/` screens that render DE copy from message keys.
- Keep technical ASCII-only strings unchanged (keys, route slugs, IDs, code identifiers, database field names).

# Task Outline
- Review active DE message namespaces for orthography issues.
- Replace transliterated DE words with correct orthography in message values.
- Fix encoding artifacts or mojibake in DE user-facing values.
- Verify active flows still source productive copy from message keys.
- Capture QA evidence for DE orthography checks and technical exceptions.

# Acceptance Criteria
- [x] Active DE UI copy in `web/` contains no ASCII transliterations where umlaut or eszett forms are intended.
- [x] `web/messages/de.json` is UTF-8 clean and free of mojibake in user-facing values.
- [x] Technical ASCII-only contexts remain unchanged (keys, routes, IDs, code identifiers, database field names).
- [x] Active flows continue to resolve productive DE copy via message keys with no new hardcoded UI copy.
- [x] Locale routing behavior and EN readiness policy remain unchanged.

# Out of Scope
- Terminology redesign beyond orthography normalization.
- New features, route changes, or behavior changes.
- Backend, API, or schema changes.
- EN copy rewrite beyond message-key consistency.

# Constraints
- Keep work in active frontend track `web/` per `docs/web-governance.md`.
- Keep DE runtime and locale routing policy aligned with `docs/ui-language-policy.md` and `docs/web-product-structure.md`.
- Apply copy and QA governance from `docs/web-governance.md` and `docs/web-quality-test-program.md`.
- Keep UTF-8 and DE orthography constraints aligned with `docs/development-constraints.md` and `docs/glossary.md`.

# References
- `docs/ui-language-policy.md`
- `docs/glossary.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`
- `docs/development-constraints.md`
- `docs/web-product-structure.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` stays `frontend` in split mode because scope is DE copy quality in `web/`.
- Decision: Requirement was reduced to a lean outcome brief with doc-bound constraints.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-DE-I18N-UMLAUT-NORMALIZATION.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-DE-I18N-UMLAUT-NORMALIZATION.md`

# Architecture Notes
- Keep orthography normalization limited to user-facing DE message values; technical ASCII-only contexts remain unchanged.
- Treat UTF-8 integrity as a release guardrail: fix mojibake at source message files, not via runtime transforms.
- Keep routing, locale policy, and message-key sourcing unchanged; this is copy normalization, not flow behavior change.
- Prioritize active web namespaces first to avoid broad churn while still covering must-flow screens.

# Implementation Guardrails
- Apply deterministic exception boundaries: keys, URLs, IDs, code identifiers, and DB field names stay ASCII.
- Avoid mixed-mode wording in one message value (part transliterated, part normalized); normalize full user-facing phrase.
- Validate changes through DE must-flow screens and keep EN readiness untouched.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with language policy, glossary, and UTF-8 integrity constraints.
- Decision: `review_risk` remains `medium` due to broad message-surface impact across active DE flows.
- Decision: `review_scope` remains `qa_ux` because primary risk is UI copy correctness and runtime rendering quality.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-DE-I18N-UMLAUT-NORMALIZATION.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-DE-I18N-UMLAUT-NORMALIZATION.md`

# Dev Results
- Normalized German user-facing message values in `web/messages/de.json` from ASCII transliterations to proper umlaut/eszett spelling where orthographically intended.
- Kept technical ASCII-only contexts unchanged (message keys, placeholders, route/code identifiers embedded in text).
- Validation: `rg -n "Ã|Â|�" /home/sebas/git/shift-matching/web/messages/de.json` returned no matches (no mojibake).
- Validation: post-change token audit found remaining `ae/oe/ue` cases only in valid orthography or technical terms (for example `aktuell`, `zuerst`, `Queue`, `Request`, `Quelle`).
- Checks run: `npm --prefix /home/sebas/git/shift-matching/web run lint` (passed), `npm --prefix /home/sebas/git/shift-matching/web run build` (passed).
- Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-DE-I18N-UMLAUT-NORMALIZATION.md` -> `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-DE-I18N-UMLAUT-NORMALIZATION.md`

## Review Bundle Results
- Risk: medium
- Scope: frontend
- Roles: QA, UX
- QA: pass - DE i18n orthography normalization in active web messages is consistent with docs: no mojibake detected, no common ASCII transliteration regressions in user-facing values, and relevant web checks passed.
- UX: pass - DE orthography normalization meets binding UX language rules on reviewed active web copy; no blocking UX findings.
- Aggregated outcome: deploy

# Deploy Results
- Decision: pass. Requirement is deploy-ready for Coolify.
- Verified deploy gates against binding docs `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Mandatory checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass: `269` passed, `0` failed)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass: `QA gate: OK`)
- Coolify readiness for this scope remains valid:
  - build-info generation succeeded for both `web` and `app` artifacts.
  - no additional environment-variable requirements were introduced by this requirement scope.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-NEW-WEB-DE-I18N-UMLAUT-NORMALIZATION.md` -> `/home/sebas/git/agents/requirements/released/REQ-NEW-WEB-DE-I18N-UMLAUT-NORMALIZATION.md`
