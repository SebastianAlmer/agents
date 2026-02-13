---
id: REQ-CONTRACT-TEMPLATE-GLOBAL-FIRST-OPTIONAL-ORG-LATER
title: Use one global contract template first and defer per-organisation templates
status: new
source: user-2026-02-09-transcript-item-5
---

# Summary
Start with one shared contract template for all organisations. Keep per-organisation template customization as deferred follow-up work.

# Scope
- Admin contract template management.
- Contract rendering input source.
- Product decision boundaries for template customization.

# Requirements
- Current implementation uses one active global contract template.
- No per-organisation template branching in this requirement.
- Add explicit backlog follow-up for optional per-organisation templates.
- UI and docs must state current behavior clearly.

# Acceptance Criteria (draft)
- [ ] Contracts are rendered from one active global template.
- [ ] Admin can manage that global template.
- [ ] No organisation-specific template path is introduced in this change.
- [ ] Follow-up requirement exists for potential organisation-specific templates.

# Constraints
- Must remain aligned with current docs requiring one active contract template.

# References
- `Anforderungen/9.2.26.vtt`
- `docs/scope-boundaries.md`
- `docs/roles-and-functions.md`

