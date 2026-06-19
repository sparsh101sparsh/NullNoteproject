# Analysis Report: Export System Refactoring

This report provides the detailed implementation strategy and exact code modifications for refactoring the NullNote export system.

---

## 1. Remove all traces of "Export as MD" (R1)
To completely remove the Markdown export feature, we need to modify 5 files:
1. `src/export/exporters.ts` - Delete the Markdown exporter function.
2. `src/sidepanel/App.tsx` - Remove the "MD" option from the UI dropdown and handleExport logic.
3. `src/settings/App.tsx` - Remove the "MD" format option from settings and update types.
4. `src/storage/repository.ts` - Remove the "markdown" option from storage types and default format logic.
5. `src/setupTests.ts` - Remove the mocked `exportToMarkdown` function.

### A. src/export/exporters.ts
* **Lines to remove**: Lines 676 to 711
* **Target code**:
```typescript
export function exportToMarkdown(doc: ExportDocument) {
  const markdownLines: string[] = [];

  for (const entry of doc.notes) {
    if (entry.type === 'text') {
      markdownLines.push(entry.text || '');
    } else if (entry.type === 'marker') {
      const formatted = formatSeconds(entry.timestamp || 0);
      markdownLines.push(`\n**Marker • ${formatted}**\n`);
      if (entry.screenshotBase64) {
        markdownLines.push(`![Screenshot](${entry.screenshotBase64})\n`);
      }
    } else if (entry.type === 'screenshot') {
      const formatted = formatSeconds(entry.timestamp || 0);
      markdownLines.push(`\n**Screenshot • ${formatted}**\n`);
      if (entry.screenshotBase64) {
        markdownLines.push(`![Screenshot](${entry.screenshotBase64})\n`);
      }
    }
  }

  const markdown = markdownLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const header = `# ${doc.title || 'Lecture Notes'}\nExport Date: ${doc.exportDate}\n\n`;
  const blob = new Blob([header + markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Append anchor to body — required for reliable download in extension context
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  a.download = `${(doc.title || 'Lecture_Notes').replace(/\s+/g, '_')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

### B. src/sidepanel/App.tsx
* **Line 20**: Update imports to remove `exportToMarkdown`.
  * **Before**: `import { exportToPdf, exportToDocs, exportToMarkdown, compileExportDocument } from '@/export/exporters';`
  * **After**: `import { exportToPdf, exportToDocs, compileExportDocument } from '@/export/exporters';`
* **Line 776**: Update `handleExport` parameter type.
  * **Before**: `const handleExport = async (format: 'pdf' | 'docs' | 'markdown') => {`
  * **After**: `const handleExport = async (format: 'pdf' | 'docs') => {`
* **Lines 810-812**: Remove Markdown condition block.
  * **Before**:
  ```typescript
      } else if (format === 'markdown') {
        exportToMarkdown(exportDoc);
      }
  ```
  * **After**: (Remove completely)
* **Line 814**: Remove `'markdown'` key from `labels`.
  * **Before**: `const labels: Record<string, string> = { pdf: 'PDF', docs: 'DOCX', markdown: 'Markdown' };`
  * **After**: `const labels: Record<string, string> = { pdf: 'PDF', docs: 'DOCX' };`
* **Lines 1018-1021**: Remove MD option from the UI dropdown array.
  * **Before**:
  ```typescript
                {([{ label:'PDF', color:'#ef4444', bg:'#fef2f2', fmt:'pdf' as const },
                   { label:'DOCX', color:'#3b82f6', bg:'#eff6ff', fmt:'docs' as const },
                   { label:'MD', color:'#f59e0b', bg:'#fffbeb', fmt:'markdown' as const }]
                ).map(opt => (
  ```
  * **After**:
  ```typescript
                {([{ label:'PDF', color:'#ef4444', bg:'#fef2f2', fmt:'pdf' as const },
                   { label:'DOCX', color:'#3b82f6', bg:'#eff6ff', fmt:'docs' as const }]
                ).map(opt => (
  ```

### C. src/settings/App.tsx
* **Line 14**: Update `ExportFormat` type.
  * **Before**: `type ExportFormat = 'pdf' | 'docs' | 'markdown';`
  * **After**: `type ExportFormat = 'pdf' | 'docs';`
* **Lines 285-290**: Remove `MD` option from `SegmentedControl`.
  * **Before**:
  ```typescript
              options={[
                { label: 'PDF', value: 'pdf' },
                { label: 'DOCX', value: 'docs' },
                { label: 'MD', value: 'markdown' },
              ]}
  ```
  * **After**:
  ```typescript
              options={[
                { label: 'PDF', value: 'pdf' },
                { label: 'DOCX', value: 'docs' },
              ]}
  ```

### D. src/storage/repository.ts
* **Line 196**: Update `getDefaultExportFormat` return signature.
  * **Before**: `export async function getDefaultExportFormat(): Promise<'pdf' | 'docs' | 'markdown'> {`
  * **After**: `export async function getDefaultExportFormat(): Promise<'pdf' | 'docs'> {`
* **Line 197**: Update default format setting getter.
  * **Before**: `return getSetting<'pdf' | 'docs' | 'markdown'>(SETTINGS_DEFAULT_EXPORT_FORMAT, 'pdf');`
  * **After**: `return getSetting<'pdf' | 'docs'>(SETTINGS_DEFAULT_EXPORT_FORMAT, 'pdf');`
* **Line 199**: Update `setDefaultExportFormat` parameter signature.
  * **Before**: `export async function setDefaultExportFormat(v: 'pdf' | 'docs' | 'markdown') {`
  * **After**: `export async function setDefaultExportFormat(v: 'pdf' | 'docs') {`

### E. src/setupTests.ts
* **Line 58**: Remove `exportToMarkdown` from mock definition.
  * **Before**:
  ```typescript
  vi.mock('@/export/exporters', () => ({
    exportToPdf: vi.fn(async () => {}),
    exportToDocs: vi.fn(async () => {}),
    exportToMarkdown: vi.fn(() => {}),
    compileExportDocument: vi.fn(async () => ({
  ```
  * **After**:
  ```typescript
  vi.mock('@/export/exporters', () => ({
    exportToPdf: vi.fn(async () => {}),
    exportToDocs: vi.fn(async () => {}),
    compileExportDocument: vi.fn(async () => ({
  ```

---

## 2. Refine export headers layout (R2)
To refine the header layout so that the logo, branding text, and date align perfectly on the same baseline for both PDF and DOCX, while remaining visually consistent:

### A. PDF Header (src/export/exporters.ts)
We modify `renderHtmlHeader` to wrap the logo and branding text in a flex container aligned to center, and let the outer container use `align-items: baseline` and `justify-content: space-between` to baseline-align the branding and date. We also add a bottom border separator.
* **Target lines**: Lines 253 to 265
* **Before**:
```typescript
export function renderHtmlHeader(doc: ExportDocument): string {
  return `
    <div class="nullnote-branding-header" style="display: flex; align-items: center; margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      ${doc.logoBase64 ? `<img class="logo-img" src="${doc.logoBase64}" style="width: 24px; height: 24px; border-radius: 5px; display: block; margin: 0 8px 0 0; padding: 0; background: transparent;" />` : ''}
      <span style="font-size: 14px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em;">Created with NullNote</span>
      <span style="font-size: 13px; color: #64748b; font-weight: 500; margin-left: 24px;">${doc.exportDate}</span>
    </div>
    <div style="margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <h1 class="export-title" style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; line-height: 1.3;">${doc.title}</h1>
      ${doc.videoUrl ? `<a href="${doc.videoUrl}" target="_blank" style="font-size: 13px; color: #f59e0b; font-weight: 600; text-decoration: none; word-break: break-all;">${doc.videoUrl}</a>` : ''}
    </div>
  `;
}
```
* **After**:
```typescript
export function renderHtmlHeader(doc: ExportDocument): string {
  return `
    <div class="nullnote-branding-header" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        ${doc.logoBase64 ? `<img class="logo-img" src="${doc.logoBase64}" style="width: 24px; height: 24px; border-radius: 5px; display: block; margin: 0; padding: 0; background: transparent;" />` : ''}
        <span style="font-size: 14px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; line-height: 24px;">Created with NullNote</span>
      </div>
      <span style="font-size: 13px; color: #64748b; font-weight: 500; line-height: 1.3;">${doc.exportDate}</span>
    </div>
    <div style="margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <h1 class="export-title" style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; line-height: 1.3;">${doc.title}</h1>
      ${doc.videoUrl ? `<a href="${doc.videoUrl}" target="_blank" style="font-size: 13px; color: #f59e0b; font-weight: 600; text-decoration: none; word-break: break-all;">${doc.videoUrl}</a>` : ''}
    </div>
  `;
}
```

### B. DOCX Header (src/export/exporters.ts)
To align with the PDF baseline design and branding font sizes, we set the DOCX branding text run font size to `28` (14pt) and the date text run size to `20` (10pt), keeping the TabStops alignment for the date. We also add a bottom border to the paragraph to match the PDF header line.
* **Target lines**: Lines 453 to 480
* **Before**:
```typescript
    headerChildren.push(
      new TextRun({
        text: "Created with NullNote\t",
        bold: true,
        font: "Arial",
        size: 22, // 11pt
        color: "0f172a"
      }),
      new TextRun({
        text: doc.exportDate,
        font: "Arial",
        size: 20, // 10pt
        color: "64748b"
      })
    );

    children.push(
      new Paragraph({
        children: headerChildren,
        tabStops: [
          {
            type: TabStopType.RIGHT,
            position: TabStopPosition.MAX
          }
        ],
        spacing: { after: 360 }
      })
    );
```
* **After**:
```typescript
    headerChildren.push(
      new TextRun({
        text: "Created with NullNote\t",
        bold: true,
        font: "Arial",
        size: 28, // 14pt (matches PDF 14px size)
        color: "0f172a"
      }),
      new TextRun({
        text: doc.exportDate,
        font: "Arial",
        size: 20, // 10pt (matches PDF 13px/10pt size)
        color: "64748b"
      })
    );

    children.push(
      new Paragraph({
        children: headerChildren,
        tabStops: [
          {
            type: TabStopType.RIGHT,
            position: TabStopPosition.MAX
          }
        ],
        spacing: { after: 360 },
        border: {
          bottom: {
            color: "e2e8f0",
            space: 8,
            value: "single",
            size: 6
          }
        }
      })
    );
```

---

## 3. Universal aspect-ratio-based image sizing algorithm (R3)
We implement a robust, universal aspect-ratio-based image sizing algorithm inside `calculateOptimalMediaWidth` that handles landscape, portrait, and square/near-square media layout rules:
* **Landscape (`ratio >= 1.2`)**: Fills the full available printable width (`maxWidth`).
* **Portrait (`ratio <= 0.8`)**: Constrains height to `60%` of printable width, maintaining aspect ratio.
* **Square/Near-Square (`0.8 < ratio < 1.2`)**: Sized to a balanced `80%` of printable width, maintaining aspect ratio.

* **Target lines**: Lines 217 to 251
* **Before**:
```typescript
export function calculateOptimalMediaWidth(origW: number, origH: number, maxWidth: number): { width: number, height: number } {
  if (!origW || !origH) return { width: maxWidth, height: Math.round(maxWidth * (9 / 16)) }; // fallback 16:9
  
  const ratio = origW / origH;
  
  if (isVideoAspectRatio(origW, origH)) {
    // Landscape or Square (Treat as Video Frame)
    // Expand to nearly maximum printable width, capped at 1.5x upscaling
    const MAX_UPSCALE = 1.5;
    const targetWidth = Math.min(maxWidth, origW * MAX_UPSCALE);
    return {
      width: Math.round(targetWidth),
      height: Math.round(targetWidth / ratio)
    };
  } else {
    // Portrait (e.g. 9:16 Shorts or extremely tall images)
    // Limit height to approximately 65% of the printable width (effectively ~50-60% of A4 page height)
    const MAX_PORTRAIT_HEIGHT = maxWidth * 0.65;
    const MAX_UPSCALE = 1.5;
    
    // First, find what the height would be if we capped upscaling
    const naturalTargetHeight = Math.min(origH * MAX_UPSCALE, origH); // actually we can just use 1.5x upscale cap for portrait too
    
    // Now constrain height
    const targetHeight = Math.min(MAX_PORTRAIT_HEIGHT, origH * MAX_UPSCALE);
    
    // Derive width to perfectly maintain aspect ratio
    const targetWidth = Math.min(targetHeight * ratio, maxWidth);
    
    return {
      width: Math.round(targetWidth),
      height: Math.round(targetWidth / ratio)
    };
  }
}
```
* **After**:
```typescript
export function calculateOptimalMediaWidth(origW: number, origH: number, maxWidth: number): { width: number, height: number } {
  if (!origW || !origH) {
    return { width: maxWidth, height: Math.round(maxWidth * (9 / 16)) }; // fallback 16:9
  }
  
  const ratio = origW / origH;
  
  if (ratio >= 1.2) {
    // Landscape: Expand to maximum printable content width
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
    // Square/Near-Square: Balanced size (80% of maxWidth)
    const targetWidth = maxWidth * 0.80;
    return {
      width: Math.round(targetWidth),
      height: Math.round(targetWidth / ratio)
    };
  }
}
```

---

## 4. Apply consistent spacing and margins (R4)
To ensure exactly one line of spacing (approx. `24px` in PDF / `240 dxa` in DOCX) is added after every image and margins are visually pleasing:

### A. PDF Spacing & Margins (src/export/exporters.ts)
* **Image Spacing**: In `renderResponsiveMedia` we specify the bottom margin as `24px` inline. We also align the stylesheet rule inside `exportToPdf` to avoid double or conflicting margin settings.
* **Target lines in renderResponsiveMedia**: Line 271
  * **Before**: `return <img src="${base64}" class="screenshot-img" style="width:${dims.width}px; height:${dims.height}px; display:block; border-radius:8px; border:none; margin: 16px auto;" />;`
  * **After**: `return <img src="${base64}" class="screenshot-img" style="width:${dims.width}px; height:${dims.height}px; display:block; border-radius:8px; border:none; margin: 16px auto 24px auto;" />;`
* **Target lines in exportToPdf stylesheet**: Lines 365-373
  * **Before**:
  ```css
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
  * **After**:
  ```css
        #nullnote-pdf-export-temp img, #nullnote-pdf-export-temp .screenshot-img {
          max-width: 100%;
          height: auto !important;
          border-radius: 8px;
          display: block;
          margin-top: 16px !important;
          margin-bottom: 24px !important;
          margin-left: auto !important;
          margin-right: auto !important;
          page-break-inside: avoid !important;
          object-fit: contain;
        }
  ```

### B. DOCX Spacing & Margins (src/export/exporters.ts)
* **Image Spacing**: In `exportToDocs`, set screenshot paragraphs spacing to `{ after: 240 }` (exactly 12pt, representing a single line of text). We do this in two locations: the marker screenshot paragraph and the regular screenshot block paragraph.
* **Target line for marker screenshot (Line 586)**:
  * **Before**: `spacing: { after: 120 }`
  * **After**: `spacing: { before: 120, after: 240 }`
* **Target line for regular screenshot (Line 628)**:
  * **Before**: `spacing: { after: 120 }`
  * **After**: `spacing: { before: 120, after: 240 }`

---

## 5. Ensure reliable generation & wait for images to load (R5)

### A. Safety Timeout for Image Loading
In JSDOM/extension context, we must ensure images are loaded before generating PDF to prevent blank pages or missing elements. We add a `5-second` safety fallback timeout in `waitAllImagesLoaded`.
* **Target lines**: Lines 198 to 210
* **Before**:
```typescript
export function waitAllImagesLoaded(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  const promises = images.map((img) => {
    if (img.complete) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve(); // continue even if one image fails to load
    });
  });
  return Promise.all(promises).then(() => {});
}
```
* **After**:
```typescript
export function waitAllImagesLoaded(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  const promises = images.map((img) => {
    if (img.complete) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, 5000); // 5-second safety fallback timeout
      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  });
  return Promise.all(promises).then(() => {});
}
```

### B. Avoid Double Margins and Page Breaks
1. In `exportToPdf` (lines 354 and 400), we set `element.style.padding = '0';` (instead of `30px 40px`) and `margin: [12, 12, 12, 12]` on the `html2pdf` configuration options. This ensures that the page layout margin is exactly 12mm on all sides without stacking container padding.
2. In `renderExportTemplate` (line 279), we change the max content width limit `PDF_MAX_WIDTH` from `680` to `800` to reflect the full width of the element (800px) when padding is 0.
3. Keep the `page-break-inside: avoid !important` rule on both `.marker-badge` and `.screenshot-block` to avoid vertical line splits and orphaned elements that could generate unnecessary blank spaces or trailing blank pages.
