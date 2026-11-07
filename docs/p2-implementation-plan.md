# P2 implementation plan (pointer)

**Full plan:** [implementation_plans/p2-lesson-engine-mvp.md](../implementation_plans/p2-lesson-engine-mvp.md)
**Governing design:** [p2-solution-design.md](./p2-solution-design.md) (approved) · **Contract:** [CONTRACT-v0.1](../shared/CONTRACT-v0.1.md) (frozen)

## Build order (fastest unblock)

| Milestone | Tasks | Unblocks |
|---|---|---|
| M0 Foundation | T-001–T-004 (deps, config, errors, storage) | everything |
| M1 Ingest | T-005–T-007b (guards, sync upload, tests) | **P1** (CP1) |
| M2 Plan engine | T-008–T-013 (llm ping, prompts, validator/repair, ladder, hour-0 CLI) | fixtures (CP-F) |
| M3 Lessons route | T-014–T-015 (idempotent, locked, cached) | **P1/P3** real lesson (CP2) |
| M4 Q&A | T-016–T-019 (whole-index, int cite labels, refusal) | **P3** (CP3) |
| M5 Hardening | T-020–T-023 (e2e smoke, README, conditional `paged`) | demo |

**Gaps (defaults in plan §4 — override before execute if needed):** G-01 send over-budget prompts with warning · G-03 no retry after 45s ⇒ error · G-07 `les_demo` Q&A live, fixture only on failure.
