---
name: Delivery Issue
about: Accepted delivery work with an explicit risk declaration
title: ''
labels: []
assignees: ''
---

## Risk declaration (required)

Humans declare tier and protected surfaces. Do **not** infer risk from changed paths.

- **Tier:** R0 / R1 / R2 / R3
- **Protected surfaces (check all that apply):**
  - [ ] visual_output
  - [ ] browser_journey
  - [ ] publication
  - [ ] planet_export
  - [ ] og_worker
  - [ ] daily

Optional machine-readable copy:

```json
{
  "schema": "chronicle-risk-declaration-v1",
  "tier": "R1",
  "surfaces": [],
  "notes": ""
}
```

## Objective

## Required changes

## Acceptance

## Rollback

See `docs/system/acceptance-harness.md` for the owner-check command matrix and failure rules.
