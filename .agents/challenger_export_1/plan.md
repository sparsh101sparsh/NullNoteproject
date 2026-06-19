# Verification Plan - Export Pipeline Correctness

This plan outlines the steps to verify the correctness, visual rendering layout, and robust operation of the NullNote export pipeline.

## Steps to Execute

### Step 1: Aspect Ratio Mathematical Verification
- Inspect the implementation of `calculateOptimalMediaWidth` in `src/export/exporters.ts`.
- Verify mathematically that the returned dimensions (`width`, `height`) preserve the exact aspect ratio of the inputs (`origW`, `origH`) for various classes of inputs:
  - Landscape orientation (ratio >= 1.2)
  - Portrait orientation (ratio <= 0.8)
  - Near-Square/Square orientation (0.8 < ratio < 1.2)
  - Fallback dimensions when input dimensions are missing (0 or null).

### Step 2: Styling and Resizing Integrity Analysis
- Examine CSS stylesheet definitions, PDF/DOCX templates, and generated HTML.
- Look for rules that may override or clash with the calculated width/height values (e.g. `height: auto !important` in the PDF stylesheet, and how PDF and DOCX renderers handle it).
- Assess whether stretching or skewing could occur in edge cases.

### Step 3: Image Loading Fallback and Timeout Verification
- Inspect `waitAllImagesLoaded` in `src/export/exporters.ts`.
- Ensure there is a timeout configured to prevent infinite hanging if an image fails to load or download.
- Check how `onerror` and `onload` handlers interact with the timeout.

### Step 4: Run Tests
- Propose and execute the test command: `npx vitest run --testTimeout=30000`.
- Record test results.

### Step 5: Adversarial Review & Edge Case Mining
- Write a Challenge/Adversarial Report focusing on how the export pipeline could fail (e.g. DOM elements layout issues, huge base64 strings, page breaks splitting image/text elements, memory/quota exhaustion).

### Step 6: Produce Handoff / Challenger Confirmation Report
- Compile findings into a 5-component handoff report.
- Deliver findings via `send_message` to parent sub-orchestrator.
