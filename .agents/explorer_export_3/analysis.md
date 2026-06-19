# Export Subsystem Cleanups and Enhancements Analysis

This document outlines the detailed investigation and design strategy for refactoring the export subsystem of NullNote. It covers:
1. Complete removal of "Export as MD" across all UI, setting, repository, exporter, and test mock files.
2. Refined export header layouts for PDF and DOCX, aligning the logo, branding text, and date baseline.
3. Universal aspect-ratio-based image sizing algorithm in `calculateOptimalMediaWidth`.
4. Consistent spacing after images (exactly one line) and visually pleasing margins (avoiding double margins).
5. Generation reliability optimizations, including a layout rendering microtask delay for image loading.

---

## 1. Traceability: Remove "Export as MD" (R1)

The following files and lines contain references to "Export as MD", the `.md` export type, or the Markdown exporter function `exportToMarkdown`. These must be removed or modified:

### A. `src/storage/repository.ts`
* **File Path**: `src/storage/repository.ts`
* **Changes**:
  * Modify `getDefaultExportFormat` signature (line 196) and helper call (line 197) to exclude `'markdown'`:
    ```typescript
    export async function getDefaultExportFormat(): Promise<'pdf' | 'docs'> {
      return getSetting<'pdf' | 'docs'>(SETTINGS_DEFAULT_EXPORT_FORMAT, 'pdf');
    }
    ```
  * Modify `setDefaultExportFormat` signature (line 199) to exclude `'markdown'`:
    ```typescript
    export async function setDefaultExportFormat(v: 'pdf' | 'docs') {
      return setSetting(SETTINGS_DEFAULT_EXPORT_FORMAT, v);
    }
    ```

### B. `src/settings/App.tsx`
* **File Path**: `src/settings/App.tsx`
* **Changes**:
  * Update `ExportFormat` type union (line 14) to exclude `'markdown'`:
    ```typescript
    type ExportFormat = 'pdf' | 'docs';
    ```
  * Remove the MD format option from the `SegmentedControl` options (line 288):
    ```typescript
    options={[
      { label: 'PDF', value: 'pdf' },
      { label: 'DOCX', value: 'docs' },
    ]}
    ```

### C. `src/sidepanel/App.tsx`
* **File Path**: `src/sidepanel/App.tsx`
* **Changes**:
  * Remove `exportToMarkdown` from the import list of `@/export/exporters` (line 20):
    ```typescript
    import { exportToPdf, exportToDocs, compileExportDocument } from '@/export/exporters';
    ```
  * Update `handleExport` signature (line 776) to exclude `'markdown'`:
    ```typescript
    const handleExport = async (format: 'pdf' | 'docs') => {
    ```
  * Remove the `markdown` handler block in `handleExport` (lines 810–812):
    ```typescript
    // REMOVE these lines:
    } else if (format === 'markdown') {
      exportToMarkdown(exportDoc);
    }
    ```
  * Update the labels map inside `handleExport` (line 814) to exclude the `markdown` key:
    ```typescript
    const labels: Record<string, string> = { pdf: 'PDF', docs: 'DOCX' };
    ```
  * Remove the MD option object from the dropdown render options array (lines 1018–1021):
    ```typescript
    {([{ label:'PDF', color:'#ef4444', bg:'#fef2f2', fmt:'pdf' as const },
       { label:'DOCX', color:'#3b82f6', bg:'#eff6ff', fmt:'docs' as const }]
    ).map(opt => (
    ```

### D. `src/export/exporters.ts`
* **File Path**: `src/export/exporters.ts`
* **Changes**:
  * Remove the entire function definition of `exportToMarkdown` (lines 676–711).

### E. `src/setupTests.ts`
* **File Path**: `src/setupTests.ts`
* **Changes**:
  * Remove `exportToMarkdown` from the mocked exports of `@/export/exporters` (line 58):
    ```typescript
    vi.mock('@/export/exporters', () => ({
      exportToPdf: vi.fn(async () => {}),
      exportToDocs: vi.fn(async () => {}),
      compileExportDocument: vi.fn(async () => ({ ... })),
    }));
    ```

---

## 2. Export Headers Layout (R2)

### A. PDF Header Layout
The current HTML header has the logo, branding text, and date in a single row, but they are not properly aligned to their text baselines. The branding text ("Created with NullNote") is also only `14px`, making it look small next to the `24px` logo.

* **Target File**: `src/export/exporters.ts` (lines 253–265)
* **Design Strategy**:
  1. Increase the font size of the branding text to `24px` (matching the logo height).
  2. Wrap the logo and branding text in an inner `div` with `display: flex; align-items: center; gap: 8px;`. This centers the logo image vertically relative to the text.
  3. Set the outer container to `display: flex; justify-content: space-between; align-items: baseline;`. This aligns the baselines of the branding text and the date span.
  4. Increase date text size to `14px` for cleaner secondary typography.

* **Proposed Implementation**:
  ```typescript
  export function renderHtmlHeader(doc: ExportDocument): string {
    return `
      <div class="nullnote-branding-header" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${doc.logoBase64 ? `<img class="logo-img" src="${doc.logoBase64}" style="width: 24px; height: 24px; border-radius: 5px; display: block; margin: 0; padding: 0; background: transparent;" />` : ''}
          <span style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; line-height: 24px;">Created with NullNote</span>
        </div>
        <span style="font-size: 14px; color: #64748b; font-weight: 500;">${doc.exportDate}</span>
      </div>
      <div style="margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <h1 class="export-title" style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; line-height: 1.3;">${doc.title}</h1>
        ${doc.videoUrl ? `<a href="${doc.videoUrl}" target="_blank" style="font-size: 13px; color: #f59e0b; font-weight: 600; text-decoration: none; word-break: break-all;">${doc.videoUrl}</a>` : ''}
      </div>
    `;
  }
  ```

### B. DOCX Header Layout
We must translate these font-size requirements into DOCX runs (where font sizes are expressed in half-points).

* **Target File**: `src/export/exporters.ts` (lines 433–480)
* **Design Strategy**:
  1. Set the branding text `size` property to `36` (18pt, which is equivalent to 24px).
  2. Set the export date `size` property to `22` (11pt, matching ~14px).
  3. Ensure the tab stop remains positioned at `TabStopPosition.MAX` with type `TabStopType.RIGHT` to push the date to the right margin.

* **Proposed Implementation**:
  ```typescript
  // Header logo & branding bar
  const headerChildren: any[] = [];
  if (doc.logoBase64) {
    try {
      const logoBytes = base64ToUint8Array(doc.logoBase64);
      headerChildren.push(
        new ImageRun({
          data: logoBytes,
          transformation: {
            width: 24,
            height: 24
          }
        }),
        new TextRun({ text: "  " })
      );
    } catch (e) {
      console.error('[NullNote] DOCX Logo insertion failed:', e);
    }
  }

  headerChildren.push(
    new TextRun({
      text: "Created with NullNote\t",
      bold: true,
      font: "Arial",
      size: 36, // 18pt = 24px equivalent
      color: "0f172a"
    }),
    new TextRun({
      text: doc.exportDate,
      font: "Arial",
      size: 22, // 11pt = 14.6px equivalent
      color: "64748b"
    })
  );
  ```

---

## 3. Universal Aspect-Ratio Image Sizing (R3)

Currently, the image sizing separates images into "Landscape/Square" and "Portrait". We will implement a universal classification based on three aspect ratio ranges:
1. **Landscape (`ratio >= 1.2`)**: Fills the maximum printable width.
2. **Portrait (`ratio <= 0.8`)**: Capped height of 60% of the maximum width (prevents extremely tall portrait images from taking up a whole page).
3. **Square/Near-Square (`0.8 < ratio < 1.2`)**: Balanced dominance, sizing width to 80% of maximum width.

* **Target File**: `src/export/exporters.ts` (lines 217–251)
* **Proposed Implementation**:
  ```typescript
  export function calculateOptimalMediaWidth(origW: number, origH: number, maxWidth: number): { width: number, height: number } {
    if (!origW || !origH) {
      return { width: maxWidth, height: Math.round(maxWidth * (9 / 16)) }; // fallback 16:9
    }
    
    const ratio = origW / origH;
    
    if (ratio >= 1.2) {
      // Landscape: Expand to maximum available width
      return {
        width: Math.round(maxWidth),
        height: Math.round(maxWidth / ratio)
      };
    } else if (ratio <= 0.8) {
      // Portrait: Scale to maximum height (60% of maxWidth)
      const targetHeight = maxWidth * 0.60;
      return {
        width: Math.round(targetHeight * ratio),
        height: Math.round(targetHeight)
      };
    } else {
      // Square/Near-Square: Balanced width (80% of maxWidth)
      const targetWidth = maxWidth * 0.80;
      return {
        width: Math.round(targetWidth),
        height: Math.round(targetWidth / ratio)
      };
    }
  }
  ```
  *(Note: The `isVideoAspectRatio` helper can be removed from lines 212–215 as it is no longer needed.)*

---

## 4. Spacing and Margin Consistency (R4)

### A. PDF Spacing and Margins
* **Target File**: `src/export/exporters.ts` (lines 344–379)
* **Changes**:
  1. Change the stylesheet rule in `exportToPdf` to only target `.screenshot-img`. This fixes a bug in the current code where the style rule `height: auto !important` and margins were applied to the marker icons and logo, distorting their sizes.
  2. Set the bottom margin on `.screenshot-img` to exactly `24px` (representing exactly one line height) and top margin to `16px`, centered horizontally.
  3. Avoid double margin issues: Set `element.style.padding = '0';` (from `'30px 40px'`) and update width of the container to `703px` (representing 186mm printable width at 96 DPI). Update `PDF_MAX_WIDTH` to `703`.
  4. Set `opt.margin = [12, 12, 12, 12]` (12mm on all sides, approx 0.5 inches) for the `html2pdf` options. This makes the PDF margin clean and removes any offset from the container.

* **Proposed Implementation**:
  ```typescript
  // Inside exportToPdf
  const PDF_MAX_WIDTH = 703;
  ...
  element.style.width = '703px';
  element.style.padding = '0';
  ...
  const stylesHtml = `
    <style>
      #nullnote-pdf-export-temp * { box-sizing: border-box; }
      #nullnote-pdf-export-temp .marker-badge, #nullnote-pdf-export-temp .screenshot-block {
        page-break-inside: avoid !important;
      }
      #nullnote-pdf-export-temp .screenshot-img {
        max-width: 100%;
        height: auto !important;
        border-radius: 8px;
        display: block;
        margin: 16px auto 24px auto !important;
        page-break-inside: avoid !important;
        object-fit: contain;
      }
      #nullnote-pdf-export-temp p {
        margin-top: 0;
        margin-bottom: 10px;
      }
    </style>
  `;
  ...
  const opt: any = {
    margin:       [12, 12, 12, 12],
    filename,
    ...
  ```

### B. DOCX Spacing and Margins
* **Target File**: `src/export/exporters.ts` (lines 586 and 628)
* **Changes**:
  1. Set spacing after images to exactly `240 dxa` (12pt, representing exactly one line).
* **Proposed Implementation**:
  ```typescript
  // Inside exportToDocs (lines 586 and 628)
  spacing: { after: 240 }
  ```

---

## 5. Reliable Generation and Image Loading (R5)

To prevent blank pages or truncated media in PDF generation, we must wait for all images to be loaded and fully decoded before launching the PDF capture.

* **Target File**: `src/export/exporters.ts` (line 395)
* **Changes**:
  1. Introduce a `100ms` microtask delay after `waitAllImagesLoaded(element)` resolves, ensuring the browser layout engine has completely processed and rendered the images.
* **Proposed Implementation**:
  ```typescript
  // Wait for images to load and let browser complete layout reflow
  await waitAllImagesLoaded(element);
  await new Promise((resolve) => setTimeout(resolve, 100));
  ```

---

## 6. Pre-existing Test Suite Issue (Vitest Fake Timers Timeout)

During execution of the test suite (`npm run test`), there is a pre-existing test failure that cascades into timeouts for almost all subsequent tests.

* **Issue Location**: `tests/App.test.tsx` (lines 70–89, test 1.4: "should trigger database save after typing /h").
* **Root Cause**:
  1. The test triggers `vi.useFakeTimers()` to control timing for debounce logic.
  2. An assertion failure occurs: `expect(repository.saveDocument).toHaveBeenCalled()` fails because the debounced `triggerSaveAndMarkerUpdate` is an async function, and its microtasks did not get a chance to execute before the assertion (which runs synchronously immediately after `vi.advanceTimersByTime`).
  3. Because the assertion throws an error, the cleanup code `vi.useRealTimers()` (line 78) is never reached.
  4. Subsequent tests are executed with fake timers still active, causing all of them to time out (since any `await` or async operations do not progress timers naturally).
* **Workaround/Resolution Strategy**:
  - The fake timers mock setup should be wrapped in `try-finally` blocks or managed in `beforeEach`/`afterEach` hooks to guarantee cleanup, e.g.:
    ```typescript
    afterEach(() => {
      vi.useRealTimers();
    });
    ```
  - Async debounced functions should be advanced using `await vi.advanceTimersByTimeAsync(1000)` instead of `vi.advanceTimersByTime(1000)`.

