# E2E Test Suite Specifications

This document defines the E2E component and programmatic unit testing specifications for NullNote, covering both the rich text editor features (slash commands, placeholder) and the refined PDF and DOCX export pipeline (R1-R5).

---

## Test Runner Details

- **Test Framework**: Vitest v4.1.9
- **Environment**: JSDOM (configured in `vitest.config.ts`)
- **Execution Command**:
  ```bash
  npm run test
  ```
- **Execution Output**:
  ```
  Test Files  3 passed (3)
       Tests  52 passed (52)
    Start at  02:55:36
    Duration  1.86s (transform 478ms, setup 306ms, import 813ms, tests 1.52s, environment 1.20s)
  ```
  *Note: All 52 tests are passing. The PDF and DOCX export pipeline layout, alignment, image scaling, and loading constraints are fully implemented and verified.*

---

## Coverage Summary (Split by Tiers)

| Tier | Category / Focus | Description | Target Count | Actual Count | Status |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Tier 1** | Feature Coverage | Verifies core functionalities of slash commands (`/h`, `/p`), multi-line placeholders, export menus, standard header layouts, and template generation. | 20 | 20 | ✅ 20 / 20 Passed |
| **Tier 2** | Boundary & Corner Cases | Verifies case insensitivity, command placement (inline vs start-of-line), nested structures, consecutive slashes, image scaling thresholds, and aspect-ratio clamp limits. | 18 | 18 | ✅ 18 / 18 Passed |
| **Tier 3** | Cross-Feature Combinations | Verifies interaction between editor command triggers and placeholder visibility/state updates. | 6 | 6 | ✅ 6 / 6 Passed |
| **Tier 4** | Real-World Scenarios | Verifies continuous typing at various offsets, pasted content boundaries, multi-paragraph separation, and async asset loading latency/failures during export. | 8 | 8 | ✅ 8 / 8 Passed |
| **Total** | **All Tiers** | **Comprehensive E2E and Unit verification of Editor and Export Pipeline** | **52** | **52** | **✅ 100% Passed** |

---

## Feature Checklist Table

| Feature / Requirement | Testing Target | Core Verification & Assertions | Test Count | Status |
| :--- | :--- | :--- | :---: | :---: |
| **Slash Commands (`/h` & `/p`)** | Rich Text Editor Input | • Commands `/h` and `/p` are intercepted case-insensitively (`/H`, `/P`).<br>• Correct actions (manualMarker, manualCapture) are triggered via Chrome runtime messages.<br>• Cleaned text deletes slash commands without affecting nearby text/selection.<br>• Caret/cursor position is correctly preserved. | 32 | ✅ 32 / 32 Passed |
| **Multi-line Placeholder** | Editor Empty State Overlay | • Displays formatted instruction overlay containing keyboard shortcuts (- H: Marker, - P: Screenshot) and command help text when empty.<br>• Hides immediately when text or media (images, badge icons) is present.<br>• Restores correctly when all content is cleared. | 11 | ✅ 11 / 11 Passed |
| **Export Menu R1** | UI & Event Dispatchers | • Export dropdown menu contains exactly two options: "PDF" and "DOCX".<br>• strictly excludes all Markdown (`MD`) options or text.<br>• Clicking PDF option invokes `exportToPdf`; clicking DOCX option invokes `exportToDocs`. | 3 | ✅ 3 / 3 Passed |
| **Header Alignment R2** | HTML Template & Document Builders | • Header is flex layout with baseline alignment (`align-items: baseline`) and space-between justification (`justify-content: space-between`).<br>• Logo image and "Created with NullNote" brand text are center-aligned (`align-items: center`).<br>• Date is positioned at the top-right, sharing baseline alignment. | 1 | ✅ 1 / 1 Passed |
| **Image Scaling R3** | Sizing Algorithm (`calculateOptimalMediaWidth`) | • Landscape/Ultra-Wide (w/h >= 1.2): Sized to full printable width (>= 95% of `maxWidth`).<br>• Portrait/Tall Portrait (w/h <= 0.8): Height clamped to <= 60% of `maxWidth`, width scaled proportionally.<br>• Square/Near-Square (0.8 < w/h < 1.2): Balanced size at 80% of `maxWidth`.<br>• Original aspect ratio is preserved (within 0.05 pixel routing tolerance) without distortion. | 3 | ✅ 3 / 3 Passed |
| **Image/Content Spacing R4** | Export Styles & Content Builders | • Export template rendering compiles all notes sections (text, markers, and screenshots).<br>• Visual margins are correctly structured with alternating paragraphs and badge wrappers. | 1 | ✅ 1 / 1 Passed |
| **Generation/Asset Loading R5** | Export Lifecycle Loader | • `waitAllImagesLoaded` promise blocks generation until all assets are resolved.<br>• Latent assets are awaited up to a 5-second timeout.<br>• Failed/broken asset URLs are handled gracefully (on-error triggers resolve) to prevent document compilation freeze. | 1 | ✅ 1 / 1 Passed |
| **Total** | **All Specifications** | **All requirements R1-R5 & Editor actions are fully covered and verified.** | **52** | **✅ 52 / 52 Passed** |
