## 2026-06-15T21:17:42Z

Create the file `TEST_INFRA.md` at the project root `/Users/iamsparsh00321/Desktop/01 Projects/Extensions/extensionproject/TEST_INFRA.md` with the comprehensive test plan for R1 to R5 (PDF and DOCX Export Pipeline).

The `TEST_INFRA.md` must follow the format and philosophy specified in the instructions:
- Test Philosophy: Opaque-box, requirement-driven.
- Methodology: Category-Partition, Boundary Value Analysis (BVA), Pairwise Combinatorial Testing, and Real-World Workload Testing.
- Feature Inventory mapping R1 (Clean Export Menu), R2 (Header Layout), R3 (Image Scaling), R4 (Spacing), and R5 (Reliable Generation/Asset Loading).
- Specific coverage metrics/criteria.

Include details for:
- Category-Partition categories: format (PDF, DOCX), aspect ratios (ultra-wide, standard landscape, square, portrait, tall portrait), and image loading state (complete, delayed, failed).
- BVA boundaries: landscape width (>=95% of printable width), portrait height clamping (<=60% of width), and aspect ratio threshold.
- Pairwise combination table.
- Real-World Workload Testing scenarios.
- Verification commands for running tests.

Make sure the file is well-formatted and detailed. Do not add any dummy code, implement the file exactly as a professional spec.
