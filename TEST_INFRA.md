# Test Infrastructure Specification: Export Pipeline (R1-R5)

This document defines the comprehensive test plan, methodology, and execution framework for validating the NullNote PDF and DOCX export pipeline improvements.

---

## 1. Test Philosophy

The testing strategy is built around an **opaque-box, requirement-driven** model. 
* **Opaque-Box (Black-Box)**: Tests treat the export modules as functional units. We evaluate outputs—namely, generated HTML templates, DOM structures for PDF generation, programmatic properties of the generated DOCX `Document` object, and files downloaded—rather than checking internal private states or private variables.
* **Requirement-Driven**: Every test case directly maps to at least one requirement (R1 through R5) and must verify functional correctness as well as visual layout properties.

---

## 2. Feature Inventory Mapping

| Requirement ID | Feature Name | Testing Target | Core Verification & Assertions |
| :--- | :--- | :--- | :--- |
| **R1** | **Clean Export Menu** | Sidepanel UI, Settings UI, Storage Repository, Exporters | • Export menu dropdown contains exactly two options: "Export as PDF" and "Export as DOCX".<br>• Zero references to Markdown (`MD`) format in codebase or state repository.<br>• Default export settings exclude Markdown. |
| **R2** | **Header Layout Refinement** | PDF export DOM template, DOCX structure compiler | • NullNote logo and "Created with NullNote" vertical alignment.<br>• Icon height and text font-size match (~24px in HTML/PDF, 11pt/22 half-points in DOCX).<br>• Share the same baseline.<br>• Export date is positioned at the far top-right and aligned with the baseline.<br>• Visual layout is consistent between PDF and DOCX. |
| **R3** | **Universal Dynamic Image Scaling** | Sizing algorithm (`calculateOptimalMediaWidth`), PDF/DOCX renderers | • Dynamic calculation maintains the correct aspect ratio for all input sizes.<br>• Landscape: scale to maximum width (>=95% of safe printable width).<br>• Portrait/Tall Portrait: height clamped to <=60% of printable width, width scaled proportionally.<br>• Square: sized to maximum balanced dimensions.<br>• No cropping, stretching, distortion, or page overflow. |
| **R4** | **Image and Content Spacing** | CSS styles in PDF export, XML paragraph spacing in DOCX | • Exactly one text line of vertical space after every image (~24px for PDF/HTML, ~240 dxa for DOCX).<br>• Visually pleasing top margin/padding before the first image.<br>• Balanced spacing around title, headers, links, and body content without collapse. |
| **R5** | **Reliable Generation / Asset Loading** | Async asset loaders, export lifecycle events | • Loader blocks PDF/DOCX compiler until all image assets and icons are fully loaded/resolved.<br>• Delayed/latent assets are awaited up to a safe timeout.<br>• Failed assets are handled gracefully (alt text or empty frame) without crashing.<br>• Outputs are non-empty and non-blank. |

---

## 3. Methodology

### 3.1 Category-Partition Testing

We divide the testing domain into three independent categories: format, aspect ratio, and asset loading states.

#### Category 1: Export Format
* **Partition 1.1 [PDF]**: Page format is A4 (portrait), margins are set to `[8, 10, 8, 10]` mm, and target printable content width is **680px** (inside an 800px wide wrapper).
* **Partition 1.2 [DOCX]**: Margins set to **0.5 inches** (`720 dxa`), and target printable content width is **600px**.

#### Category 2: Image Aspect Ratio
* **Partition 2.1 [Ultra-Wide Landscape]**: Aspect ratio `w / h >= 2.0` (e.g., 21:9 or 2.33).
* **Partition 2.2 [Standard Landscape]**: Aspect ratio `1.0 < w / h < 2.0` (e.g., 16:9 or 1.77, 4:3 or 1.33).
* **Partition 2.3 [Square]**: Aspect ratio `w / h == 1.0`.
* **Partition 2.4 [Portrait]**: Aspect ratio `0.5 <= w / h < 1.0` (e.g., 3:4 or 0.75).
* **Partition 2.5 [Tall Portrait]**: Aspect ratio `w / h < 0.5` (e.g., 9:16 or 0.56, 1:2 or 0.50).

#### Category 3: Image Loading State
* **Partition 3.1 [Complete]**: Assets are immediately resolved and cached (resolved within <10ms).
* **Partition 3.2 [Delayed]**: Assets resolve with network/storage latency (e.g., 500ms to 2000ms delay).
* **Partition 3.3 [Failed]**: Asset URLs are broken or return HTTP errors (fail to resolve).

---

### 3.2 Boundary Value Analysis (BVA)

To verify the image-scaling algorithm without regressions, we focus on three mathematical boundary conditions:

#### BVA 1: Landscape Width Expansion Limit
* **Constraint**: Width must be >= 95% of printable width (`maxWidth`).
* **Test points**:
  * *94.9% of maxWidth* (Invalid/Fail)
  * *95.0% of maxWidth* (Minimum Acceptable Pass)
  * *99.0% of maxWidth* (Nominal Pass)
  * *100.0% of maxWidth* (Maximum Limit Pass)

#### BVA 2: Portrait Height Clamping Limit
* **Constraint**: Portrait height must be clamped to <= 60% of printable width (`maxWidth`).
  * *Note: If the printable width is 680px, the maximum portrait height limit is 408px. If width is 600px, the height limit is 360px.*
* **Test points**:
  * *59.0% of maxWidth* (Nominal Pass)
  * *60.0% of maxWidth* (Maximum Allowed Height Pass)
  * *60.1% of maxWidth* (Invalid Height - must be clamped/Fail)

#### BVA 3: Aspect Ratio Classification Threshold
* **Constraint**: Transition from Landscape/Square to Portrait classification is defined by `isVideoAspectRatio(w, h)`.
* **Threshold**: `w / h = 0.90`.
* **Test points**:
  * *Aspect ratio = 0.89*: Classified as Portrait (Height clamping applied).
  * *Aspect ratio = 0.90*: Classified as Landscape/Square (No portrait clamping, scales to maxWidth).
  * *Aspect ratio = 0.91*: Classified as Landscape/Square (No portrait clamping).

---

### 3.3 Pairwise Combinatorial Testing

Using the categories defined in Section 3.1, we cover all pairs of (Format, Aspect Ratio), (Format, Loading State), and (Aspect Ratio, Loading State) using a minimal suite of 15 combinations:

| Case ID | Export Format | Aspect Ratio | Loading State | Expected Layout & Sizing Outcome | Traced Requirements |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC_PAIR_01** | PDF | Ultra-Wide (21:9) | Complete | Sized to max width (680px), height derived to keep ratio. Immediate export. | R3, R5 |
| **TC_PAIR_02** | DOCX | Ultra-Wide (21:9) | Delayed | Awaits image resolution. Sized to max width (600px). | R3, R5 |
| **TC_PAIR_03** | PDF | Ultra-Wide (21:9) | Failed | Gracefully proceeds with broken icon/alt layout, no crash. | R3, R5 |
| **TC_PAIR_04** | DOCX | Standard Landscape (16:9) | Complete | Sized to max width (600px). Immediate export. | R3, R5 |
| **TC_PAIR_05** | PDF | Standard Landscape (16:9) | Delayed | Awaits resolution. Sized to max width (680px). | R3, R5 |
| **TC_PAIR_06** | DOCX | Standard Landscape (16:9) | Failed | Replaces image run with safe text or placeholder, no crash. | R3, R5 |
| **TC_PAIR_07** | PDF | Square (1:1) | Complete | Sized to max width (680px) and height (680px). Centered. | R3, R5 |
| **TC_PAIR_08** | DOCX | Square (1:1) | Delayed | Awaits load. Sized to max width (600px) and height (600px). Centered. | R3, R5 |
| **TC_PAIR_09** | PDF | Square (1:1) | Failed | Renders broken frame. Does not block document compiler. | R3, R5 |
| **TC_PAIR_10** | DOCX | Portrait (3:4) | Complete | Height clamped to 360px (60% of 600px), width scaled to 270px. Centered. | R3, R5 |
| **TC_PAIR_11** | PDF | Portrait (3:4) | Delayed | Awaits load. Height clamped to 408px (60% of 680px), width is 306px. | R3, R5 |
| **TC_PAIR_12** | DOCX | Portrait (3:4) | Failed | Gracefully proceeds with paragraph text spacing intact. | R3, R5 |
| **TC_PAIR_13** | PDF | Tall Portrait (9:16) | Complete | Height clamped to 408px, width scaled down proportionally to 230px. | R3, R5 |
| **TC_PAIR_14** | DOCX | Tall Portrait (9:16) | Delayed | Awaits load. Height clamped to 360px, width scaled down to 203px. | R3, R5 |
| **TC_PAIR_15** | PDF | Tall Portrait (9:16) | Failed | Continues generation. Normal top/bottom spacing around text is preserved. | R3, R5 |

---

### 3.4 Real-World Workload Testing

To ensure stability in production contexts, three stress-test workloads are simulated:

#### Scenario A: The "Lecture Marathon" Document
* **Description**: A long document consisting of 25 text paragraphs, 5 markers, and 12 screenshots with varying aspect ratios (3 ultra-wide, 5 standard landscape, 2 square, and 2 tall portrait) captured from a 3-hour lecture.
* **Evaluation Criteria**: 
  * Generation does not run out of memory or crash the sidepanel.
  * PDF does not produce blank pages, and page breaks (`page-break-inside: avoid`) prevent cutting images/markers across page boundaries.
  * DOCX opens in Microsoft Word/Google Docs without corruption or XML structure warnings.

#### Scenario B: High-Latency Mobile Network Session
* **Description**: A document containing 8 screenshots where the retrieval from IndexedDB or remote asset store is simulated with a latency of 1500ms per image.
* **Evaluation Criteria**:
  * The export pipeline blocks and keeps the user interface in a "Generating..." state.
  * The document is compiled only after all 8 images resolve.
  * Timeout handler resolves the export anyway after 10 seconds if any assets remain unresolved, preventing a perpetual UI lock.

#### Scenario C: Alternating Layout Spacing Check
* **Description**: A document structure designed as: `Header -> Title -> Text -> Image -> Text -> Marker -> Text -> Image`.
* **Evaluation Criteria**:
  * Spacing after each image is exactly one text line (HTML: ~24px margin/padding; DOCX: ~240 dxa paragraph spacing after image run).
  * No consecutive spaces accumulate.
  * Alignment of all texts, links, and markers remains visually consistent.

---

## 4. Coverage Metrics & Exit Criteria

Before declaring the testing phase complete and ready for release, the following metrics must be achieved:

1. **Requirements Coverage**: 100% of requirements R1 to R5 mapped to test assertions.
2. **Category Coverage**: 100% of the categories and partitions defined in Section 3.1 must have passing test cases.
3. **Boundary Values Coverage**: All BVA thresholds must be verified in unit tests with strict tolerance assertions.
4. **Statement Coverage**: 100% statement coverage for the core image scaling logic `calculateOptimalMediaWidth`.
5. **No Visual Corruption**: Visual artifacts (overlapping text, zero-width images, text wrapping logo) must be audited and verified using mockup document tests.

---

## 5. Verification Commands

Run the test suite using the following commands:

```bash
# Run the complete test suite including UI component and export pipeline tests
npm run test

# Run a specific test suite file targeting the export pipeline
npx vitest run tests/export-test.ts

# Perform TypeScript compilation check to verify type safety
npm run typecheck

# Execute ESLint to ensure layout and style guideline compliance
npm run lint
```
