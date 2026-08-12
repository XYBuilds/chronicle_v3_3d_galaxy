## Risk declaration (required)

Humans declare tier and protected surfaces. Do **not** infer risk from changed paths.

- **Tier:** R0 / R1 / R2 / R3
- **Protected surfaces:**
  - [ ] visual_output
  - [ ] browser_journey
  - [ ] publication
  - [ ] planet_export
  - [ ] og_worker
  - [ ] daily

```json
{
  "schema": "chronicle-risk-declaration-v1",
  "tier": "R1",
  "surfaces": [],
  "notes": ""
}
```

## Summary

## Test plan

- [ ] `npm run test:owner-checks -w acceptance-harness -- --declaration <file> --dry-run` reviewed
- [ ] Applicable local owner checks from `docs/system/acceptance-harness.md`
- [ ] Contact sheet / evidence attached when visual_output or R2+ is declared
- [ ] Failure policy honored (no baseline edits merely to go green)

Closes #
