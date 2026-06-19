# Scope: E2E Testing Track

## Architecture
- **Vitest Environment**: Set up with JSDOM, React Testing Library, and chrome-mock.
- **Export Test Script**: Runs programmatically in Node.js environment using mock documents and aspect ratios.
- **Verification Harness**: Assertions to inspect layout, icon/text alignment, image sizing, and waiting logic.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Create TEST_INFRA.md | Design and write the comprehensive testing plan at the project root. | None | PLANNED |
| 2 | R1 Export Menu Test | Write automated component test verifying the removal of "Export as MD" from the export dropdown menu. | M1 | PLANNED |
| 3 | Programmatic Export Test | Create `tests/export-test.ts` to generate mock documents containing various image aspect ratios. | M1 | PLANNED |
| 4 | Programmatic Assertions | Add layout and sizing assertions inside the programmatic test to validate alignment, image scaling, distortion, and wait pipeline. | M3 | PLANNED |
| 5 | Verify & TEST_READY.md | Run all tests (both component and programmatic), ensure they pass, and publish `TEST_READY.md`. | M2, M4 | PLANNED |

## Interface Contracts
- No new production code interface contracts are introduced by the testing track. Testing track follows specifications of R1 to R5.
