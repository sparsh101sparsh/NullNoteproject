## 2026-06-16T02:52:40Z

Create two test files in the `tests/` directory:

1. `tests/ExportMenu.test.tsx`
This file should contain automated component tests in Vitest that verify R1 (MD export menu removal):
- Mounts `<App />` using React Testing Library and awaits repository load.
- Clicks the Export button and asserts the dropdown is rendered.
- Asserts that the dropdown menu options contain PDF and DOCX options, but strictly DO NOT contain "MD", "Markdown", or "Export as MD".
- Asserts that clicking PDF triggers `exportToPdf` and clicking DOCX triggers `exportToDocs` (by checking if the mocked exporter functions were called).

2. `tests/export-test.ts`
This file should contain programmatic unit and layout assertions running in Vitest/Node environment to validate the export pipeline (R2 to R5):
- Compiles mock documents with dummy images of various aspect ratios:
  - Ultra-wide landscape (e.g. 21:9 or 21/9)
  - Standard landscape (e.g. 16:9 or 16/9)
  - Square (1:1 or 1/1)
  - Portrait (e.g. 3:4 or 3/4)
  - Tall portrait (e.g. 9:16 or 9/16)
- Asserts layout and calculation properties using `calculateOptimalMediaWidth`, `renderHtmlHeader`, and `renderExportTemplate` from `src/export/exporters.ts`:
  - **Header Alignment (R2)**: Parses the HTML returned by `renderHtmlHeader` (using jsdom or regex) and asserts that the header container is flex with vertical center alignment (`display: flex`, `align-items: center`), the logo and text share the baseline, and the date is aligned in the far top right (`margin-left: auto` or similar alignment styling).
  - **Landscape Width (R3)**: Verifies that landscape images (standard and ultra-wide) scale to consume at least 95% of the printable width (e.g. check width returned by `calculateOptimalMediaWidth` is >= 95% of `maxWidth` for 680px and 600px).
  - **Portrait Height (R3)**: Verifies that portrait images (portrait and tall portrait) are vertically clamped (e.g. check that height returned by `calculateOptimalMediaWidth` is <= 60% of `maxWidth` and does not dominate).
  - **No Distortion (R3)**: Asserts that for all test aspect ratios, the calculated width and height preserve the original aspect ratio without cropping, stretching, or distortion (i.e. calculated width / height ratio equals original width / height ratio, within a tiny float tolerance).
  - **Asset Loading wait (R5)**: Test `waitAllImagesLoaded` function with mock images (some complete, some with delayed loading) and verify that the promise resolves only after all images have completed loading.

After creating these files, run `npm run test` or `npx vitest run tests/ExportMenu.test.tsx` and `npx vitest run tests/export-test.ts` to verify the tests run. Expect some assertions to fail if the implementation has not completed yet, but ensure the test runner executes them correctly. Provide the exact test runner output in your handoff report.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
