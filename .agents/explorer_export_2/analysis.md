# Analysis Report: Export Refactoring & Layout Enhancements

## Core Findings
This report details the implementation plan for removing all traces of Markdown export across the codebase, refactoring the PDF/DOCX layouts, implementing a universal aspect-ratio image sizing algorithm, applying consistent spacing and margins, and ensuring robust rendering.

---

## 1. Requirement 1: Remove All Traces of "Export as MD"

To completely clean the "Export as MD" (Markdown) option, modifications must be made to five files:

### A. `src/export/exporters.ts`
* **Action**: Delete the entire `exportToMarkdown` function (lines 676-711).
* **Rationale**: This function generates the Markdown string, creates the Blob, and triggers the download. Since MD export is deprecated, this code is dead.

### B. `src/setupTests.ts`
* **Action**: Delete the mock definition `exportToMarkdown: vi.fn(() => {}),` (line 58).
* **Rationale**: Removes Vitest mock references to the deleted function, preventing import or type issues.

### C. `src/sidepanel/App.tsx`
* **Imports**: Update line 20 to remove `exportToMarkdown` from imports:
  ```typescript
  // Before
  import { exportToPdf, exportToDocs, exportToMarkdown, compileExportDocument } from '@/export/exporters';
  // After
  import { exportToPdf, exportToDocs, compileExportDocument } from '@/export/exporters';
  ```
* **handleExport function (Line 776, 810-812, 814)**:
  - Update parameter type to `format: 'pdf' | 'docs'`.
  - Remove the MD-specific handling block:
    ```typescript
    // Delete lines 810-812
    } else if (format === 'markdown') {
      exportToMarkdown(exportDoc);
    }
    ```
  - Remove `markdown` from `labels`:
    ```typescript
    // Before
    const labels: Record<string, string> = { pdf: 'PDF', docs: 'DOCX', markdown: 'Markdown' };
    // After
    const labels: Record<string, string> = { pdf: 'PDF', docs: 'DOCX' };
    ```
* **Dropdown Option List (Lines 1018-1020)**:
  - Remove the object corresponding to `fmt: 'markdown'` from the options array inside the render method.

### D. `src/settings/App.tsx`
* **Type Declaration**: Update `ExportFormat` (line 14):
  ```typescript
  // Before
  type ExportFormat = 'pdf' | 'docs' | 'markdown';
  // After
  type ExportFormat = 'pdf' | 'docs';
  ```
* **Segmented Control Options (Lines 285-289)**:
  - Remove `{ label: 'MD', value: 'markdown' }` from options array.

### E. `src/storage/repository.ts`
* **Type Declarations**: Update `getDefaultExportFormat` and `setDefaultExportFormat` to return/accept only `'pdf' | 'docs'`:
  ```typescript
  // Before
  export async function getDefaultExportFormat(): Promise<'pdf' | 'docs' | 'markdown'> {
    return getSetting<'pdf' | 'docs' | 'markdown'>(SETTINGS_DEFAULT_EXPORT_FORMAT, 'pdf');
  }
  export async function setDefaultExportFormat(v: 'pdf' | 'docs' | 'markdown') { ... }

  // After
  export async function getDefaultExportFormat(): Promise<'pdf' | 'docs'> {
    return getSetting<'pdf' | 'docs'>(SETTINGS_DEFAULT_EXPORT_FORMAT, 'pdf');
  }
  export async function setDefaultExportFormat(v: 'pdf' | 'docs') { ... }
  ```

---

## 2. Requirement 2: Refine Export Headers Layout

Align logo, branding text, and date on the same line, matching the heights of logo and branding text (24px) for both PDF and DOCX.

### A. PDF Header Layout (`src/export/exporters.ts`, lines 253-264)
* **Design Strategy**: Use CSS Flexbox with `justify-content: space-between` and `align-items: baseline`. Nest the logo and the branding text in an inner flexbox with `align-items: center` to ensure they are centered relative to each other.
* **Proposed HTML/CSS**:
  ```html
  <div class="nullnote-branding-header" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="display: flex; align-items: center; gap: 8px;">
      ${doc.logoBase64 ? `<img class="logo-img" src="${doc.logoBase64}" style="width: 24px; height: 24px; border-radius: 5px; display: block; margin: 0; padding: 0; background: transparent;" />` : ''}
      <span style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; line-height: 24px;">Created with NullNote</span>
    </div>
    <span style="font-size: 14px; color: #64748b; font-weight: 500;">${doc.exportDate}</span>
  </div>
  ```

### B. DOCX Header Layout (`src/export/exporters.ts`, lines 453-467)
* **Design Strategy**: Increase `TextRun` font size for the branding text to `36` (which represents 18pt, scaling up to match the 24px height of the logo).
* **Proposed Code**:
  ```typescript
  headerChildren.push(
    new TextRun({
      text: "Created with NullNote\t",
      bold: true,
      font: "Arial",
      size: 36, // 18pt (matches 24px height)
      color: "0f172a"
    }),
    new TextRun({
      text: doc.exportDate,
      font: "Arial",
      size: 20, // 10pt
      color: "64748b"
    })
  );
  ```

---

## 3. Requirement 3: Universal Dynamic Image Sizing

Simplify image sizing inside `calculateOptimalMediaWidth` to be based purely on the image's original aspect ratio.

### A. Delete Unused Code (`src/export/exporters.ts`, lines 212-215)
* **Action**: Delete `isVideoAspectRatio` function.

### B. Update `calculateOptimalMediaWidth` (`src/export/exporters.ts`, lines 217-250)
* **Sizing Algorithm**:
  - **Landscape (`ratio >= 1.2`)**: Render at full `maxWidth`.
  - **Portrait (`ratio <= 0.8`)**: Constrain height to `maxWidth * 0.6` and compute width.
  - **Square / Near-Square (`0.8 < ratio < 1.2`)**: Render at `maxWidth * 0.8` to avoid overwhelming page space.
* **Proposed Code**:
  ```typescript
  export function calculateOptimalMediaWidth(origW: number, origH: number, maxWidth: number): { width: number, height: number } {
    if (!origW || !origH) {
      return { width: maxWidth, height: Math.round(maxWidth * (9 / 16)) };
    }
    const ratio = origW / origH;
    if (ratio >= 1.2) {
      // Landscape: Expand to maximum available content width
      return { width: Math.round(maxWidth), height: Math.round(maxWidth / ratio) };
    } else if (ratio <= 0.8) {
      // Portrait: Scale to maximum height (60% of maxWidth)
      const targetHeight = maxWidth * 0.60;
      return { width: Math.round(targetHeight * ratio), height: Math.round(targetHeight) };
    } else {
      // Square/Near-Square: Balanced size (80% of maxWidth)
      const targetWidth = maxWidth * 0.80;
      return { width: Math.round(targetWidth), height: Math.round(targetWidth / ratio) };
    }
  }
  ```

---

## 4. Requirement 4: Spacing After Images & Margins

### A. PDF Spacing
* **Image Spacing**: Set `margin: 16px auto 24px auto;` on the inline styles in `renderResponsiveMedia` to provide exactly one line (24px) of spacing below the image. In the style overrides block, remove `height: auto !important;` to respect the dynamically calculated aspect-ratio height, and update the bottom margin to `24px`.
* **Margins**: Set PDF options margins in `html2pdf()` options to `[12, 12, 12, 12]` (12mm / ~0.5 inches).
* **Double Margin Fix**: Set temporary wrapper element padding to `0` (from `30px 40px`). Update `PDF_MAX_WIDTH` from `680` to `800` (fits printable A4 width).

### B. DOCX Spacing
* **Image Spacing**: In `exportToDocs`, set spacing `after` to `240` (12pt / one line worth of spacing) on paragraphs that contain images (lines 586 and 628).
* **Margins**: Maintain page margin parameters at `720` (0.5 inches) for top, bottom, left, and right.

---

## 5. Requirement 5: Reliable Generation (No Blank Pages)

To prevent async rendering races (where `html2pdf.js` captures a blank canvas before layout completes):
* **Delay Pass**: Add a combined `requestAnimationFrame` and `setTimeout` delay pass after waiting for image loading:
  ```typescript
  // Wait for images to load
  await waitAllImagesLoaded(element);
  // Allow browser to perform layout/styling computation pass
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 150)));
  ```
