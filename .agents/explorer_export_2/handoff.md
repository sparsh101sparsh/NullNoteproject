# Handoff Report — Export Refactoring & Layout Improvements

## 1. Observation

Based on a detailed code inspection, the following paths and lines of code contain the structures to be changed or removed:

### A. MD Export Deletion Sites
* **`src/export/exporters.ts`**:
  * `exportToMarkdown` function (lines 676-711):
    ```typescript
    export function exportToMarkdown(doc: ExportDocument) {
      const markdownLines: string[] = [];
      ...
    }
    ```
* **`src/setupTests.ts`**:
  * Exporters mock definition (line 58):
    ```typescript
    exportToMarkdown: vi.fn(() => {}),
    ```
* **`src/sidepanel/App.tsx`**:
  * Import statement (line 20):
    ```typescript
    import { exportToPdf, exportToDocs, exportToMarkdown, compileExportDocument } from '@/export/exporters';
    ```
  * `handleExport` signature and logic (lines 776, 810-812, 814):
    ```typescript
    const handleExport = async (format: 'pdf' | 'docs' | 'markdown') => {
      ...
      } else if (format === 'markdown') {
        exportToMarkdown(exportDoc);
      }
      ...
      const labels: Record<string, string> = { pdf: 'PDF', docs: 'DOCX', markdown: 'Markdown' };
    ```
  * Dropdown options (lines 1018-1020):
    ```typescript
    {([{ label:'PDF', color:'#ef4444', bg:'#fef2f2', fmt:'pdf' as const },
       { label:'DOCX', color:'#3b82f6', bg:'#eff6ff', fmt:'docs' as const },
       { label:'MD', color:'#f59e0b', bg:'#fffbeb', fmt:'markdown' as const }]
    ```
* **`src/settings/App.tsx`**:
  * ExportFormat type (line 14):
    ```typescript
    type ExportFormat = 'pdf' | 'docs' | 'markdown';
    ```
  * Default format segmented control options (lines 285-289):
    ```typescript
    options={[
      { label: 'PDF', value: 'pdf' },
      { label: 'DOCX', value: 'docs' },
      { label: 'MD', value: 'markdown' },
    ]}
    ```
* **`src/storage/repository.ts`**:
  * Getters and setters for default format (lines 196-201):
    ```typescript
    export async function getDefaultExportFormat(): Promise<'pdf' | 'docs' | 'markdown'> {
      return getSetting<'pdf' | 'docs' | 'markdown'>(SETTINGS_DEFAULT_EXPORT_FORMAT, 'pdf');
    }
    export async function setDefaultExportFormat(v: 'pdf' | 'docs' | 'markdown') {
      return setSetting(SETTINGS_DEFAULT_EXPORT_FORMAT, v);
    }
    ```

### B. Layout and Sizing Sites
* **`src/export/exporters.ts`**:
  * `isVideoAspectRatio` helper (lines 212-215):
    ```typescript
    export function isVideoAspectRatio(origW: number, origH: number): boolean {
      if (!origW || !origH) return false;
      return (origW / origH) >= 0.9;
    }
    ```
  * `calculateOptimalMediaWidth` function (lines 217-250):
    ```typescript
    export function calculateOptimalMediaWidth(origW: number, origH: number, maxWidth: number): { width: number, height: number } {
      ...
    }
    ```
  * PDF `renderHtmlHeader` branding header (lines 253-264):
    ```typescript
    export function renderHtmlHeader(doc: ExportDocument): string {
      return `
        <div class="nullnote-branding-header" style="display: flex; align-items: center; ...">
          ...
        </div>
      `;
    }
    ```
  * PDF `renderResponsiveMedia` image styling (line 271):
    ```typescript
    return `<img src="${base64}" class="screenshot-img" style="width:${dims.width}px; height:${dims.height}px; display:block; border-radius:8px; border:none; margin: 16px auto;" />`;
    ```
  * PDF temporary container style overrides (lines 354, 365-373):
    ```typescript
    element.style.padding = '30px 40px';
    ...
    #nullnote-pdf-export-temp img, #nullnote-pdf-export-temp .screenshot-img {
      max-width: 100%;
      height: auto !important;
      border-radius: 8px;
      display: block;
      margin-bottom: 6px;
      page-break-inside: avoid !important;
      object-fit: contain;
    }
    ```
  * DOCX header text sizing (lines 453-467):
    ```typescript
    new TextRun({
      text: "Created with NullNote\t",
      bold: true,
      font: "Arial",
      size: 22,
      color: "0f172a"
    })
    ```
  * DOCX image paragraph spacing (lines 586, 628):
    ```typescript
    spacing: { after: 120 }
    ```

---

## 2. Logic Chain

1. **R1 (MD Removal)**: Removing the "Export as MD" option across the app prevents users from selecting it. Deleting it from types and helper functions ensures clean compilation and no dead mock definitions in tests.
2. **R2 (Header Alignment)**: Logo is `24px` tall. In PDF, enclosing the logo and branding text in a nested flex container (`align-items: center`) and setting branding text `font-size: 24px` / `line-height: 24px` creates a matches-height structure. Aligning the parent branding header using `justify-content: space-between` and `align-items: baseline` splits the date to the far right side and baseline-aligns it. For DOCX, setting the TextRun `size` to `36` translates to `18pt` (24px equivalent) and maps nicely to the 24px logo.
3. **R3 (Universal Dynamic Sizing)**: Dividing images by aspect ratio classes (`ratio >= 1.2` for landscape, `ratio <= 0.8` for portrait, and in between for square/near-square) provides clear boundaries:
   - Landscape images fill `maxWidth`.
   - Portrait images are height-constrained to `maxWidth * 0.60` (preventing vertical page overflow).
   - Square/Near-Square images are width-constrained to `maxWidth * 0.80` (preventing them from looking excessively large).
   This avoids complex upscaling limitations and is mathematically sound for aspect-ratio preservation.
4. **R4 (Image & Content Spacing)**:
   - One line of space equates to `24px` in PDF and `240` dxa (12pt) in DOCX.
   - Adjusting image bottom margins to `24px` in PDF (`margin: 16px auto 24px auto`) and `after: 240` in DOCX ensures exactly one line spacing after screenshots.
   - Removing the PDF wrapper padding (`element.style.padding = '0'`) resolves double margin layout issues, making margins match the `html2pdf` setting of `12mm` (~0.5 inches) exactly.
5. **R5 (Reliable Generation)**:
   - A delay (`requestAnimationFrame` + `setTimeout`) of 150ms after images load in PDF export allows JSDOM/Chrome to perform full layout passes and style recalculations before capturing the element, preventing blank canvas errors.

---

## 3. Caveats

- **Vitest JSDOM Environment**: Standard E2E test runs do not execute actual PDF/DOCX compilation code due to limitations of DOM libraries under Node. A mock check script (`test-exporters.ts` or similar) is required to run exporter code directly.

---

## 4. Conclusion

All requested modifications have been located and mapped out with precise strategies. The project is fully ready for the implementing agent to make code changes.

---

## 5. Verification Method

1. **Run E2E Suite**: Ensure existing tests pass:
   ```bash
   npm run test
   ```
2. **Compile and Inspect**: Build the extension using:
   ```bash
   npm run build
   ```
3. **Exporters Verification**: Verify header alignment, dynamic image sizes, and margin layout in generated documents.

---

## 6. Remaining Work

1. Update `src/export/exporters.ts` to implement header layouts, universal aspect-ratio sizing, margins/spacers, and the rendering delay.
2. Delete `exportToMarkdown` code from `src/export/exporters.ts` and clean up `src/setupTests.ts`.
3. Update types, forms, and dropdowns in `src/sidepanel/App.tsx`, `src/settings/App.tsx`, and `src/storage/repository.ts` to remove all traces of markdown.
4. Verify by running the tests.
