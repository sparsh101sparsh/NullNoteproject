# Scope: export_pipeline_improvements

## Architecture
- Exporters code in `src/export/exporters.ts`.
- UI files referencing exports in `src/sidepanel/App.tsx` and `src/settings/App.tsx`.
- Repository storage logic in `src/storage/repository.ts`.
- Test files located in `src/**/*.test.ts` or related folders.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration | Codebase analysis and planning for R1-R5 (Explorers: abdff032-d17b-4973-987b-410685a3a76f, d2780ea9-b61c-4c4d-a7dc-652c2a08e038, 3b6a2db1-8923-4d4b-a522-0be212da100e) | None | DONE |
| 2 | Implementation | Worker implementing MD removal, refined headers, aspect-ratio-based image sizing, image spacing, and reliable image loading (Worker: 12e4678a-6d2f-4265-bd5d-5019cf87d783) | M1 | DONE |
| 3 | Verification | Reviewer checks, Challenger verification, E2E tests, and Auditor checks (Reviewers: 01b9f5be-4151-4aa1-b67c, 247a612b-f4f7-4a54; Challenger: 68682ffb-933e-46bc; Auditor: ac5b50ea-f7fc-45a9) | M2 | DONE |

## Interface Contracts
- Exporter API: Export functions and options exposed to UI sidepanel and settings.
- `calculateOptimalMediaWidth`: Universal aspect-ratio-based image sizing function, takes image attributes and container width and returns optimal dimensions.
