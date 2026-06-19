# Project Plan: PDF & DOCX Export Pipeline Refinement

## Phases

### Phase 1: Exploration
- Locate export components, logic, UI dropdown elements, and relevant PDF/DOCX generation libraries.
- Analyze how Markdown export is currently implemented and integrated.
- Check the structure of existing tests.

### Phase 2: Design and Milestone Setup
- Define milestones and interface contracts in `PROJECT.md`.
- Formulate test specifications (`TEST_INFRA.md`).

### Phase 3: Parallel Tracks
- **Track A: E2E Test Suite Creation**: Design and implement programmatic test cases validating header alignment, image scaling (landscape, portrait, square), spacing rules, and absence of Markdown option.
- **Track B: Implementation**: Clean export menu (remove MD), align header layout, implement universal aspect-ratio dynamic image scaling, establish consistent spacing, ensure reliable generation.

### Phase 4: Verification and Hardening
- Run the full E2E test suite.
- Audit verification (clean verdict).
- Perform Phase 2 adversarial coverage hardening.
