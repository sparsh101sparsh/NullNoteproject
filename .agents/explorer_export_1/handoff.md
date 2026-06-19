# Handoff Report — Export Refactoring Design (explorer_export_1)

This report details our findings, logic chain, caveats, conclusion, and verification methods for refactoring NullNote's export system according to the user requirements.

---

## 1. Observation

Direct observations from the codebase files:

1. **Markdown Export References (R1)**:
   - In `src/export/exporters.ts` (lines 676-711):
     `export function exportToMarkdown(doc: ExportDocument) { ... }`
   - In `src/sidepanel/App.tsx` (line 20):
     `import { exportToPdf, exportToDocs, exportToMarkdown, compileExportDocument } from '@/export/exporters';`
   - In `src/sidepanel/App.tsx` (lines 810-812):
     `} else if (format === 'markdown') { exportToMarkdown(exportDoc); }`
   - In `src/sidepanel/App.tsx` (line 814):
     `const labels: Record<string, string> = { pdf: 'PDF', docs: 'DOCX', markdown: 'Markdown' };`
   - In `src/sidepanel/App.tsx` (line 1020):
     `{ label:'MD', color:'#f59e0b', bg:'#fffbeb', fmt:'markdown' as const }]`
   - In `src/settings/App.tsx` (line 14):
     `type ExportFormat = 'pdf' | 'docs' | 'markdown';`
   - In `src/settings/App.tsx` (line 288):
     `{ label: 'MD', value: 'markdown' }`
   - In `src/storage/repository.ts` (lines 196-200):
     `export async function getDefaultExportFormat(): Promise<'pdf' | 'docs' | 'markdown'> { ... }`
   - In `src/setupTests.ts` (line 58):
     `exportToMarkdown: vi.fn(() => {}),`

2. **Header Layout (R2)**:
   - PDF Header in `src/export/exporters.ts` (lines 255-259):
     ```html
     <div class="nullnote-branding-header" style="display: flex; align-items: center; margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
       ${doc.logoBase64 ? `<img class="logo-img" src="${doc.logoBase64}" style="width: 24px; height: 24px; border-radius: 5px; display: block; margin: 0 8px 0 0; padding: 0; background: transparent;" />` : ''}
       <span style="font-size: 14px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em;">Created with NullNote</span>
       <span style="font-size: 13px; color: #64748b; font-weight: 500; margin-left: 24px;">${doc.exportDate}</span>
     </div>
     ```
   - DOCX Header in `src/export/exporters.ts` (lines 453-479):
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
     ```

3. **Image Sizing (R3)**:
   - Sizing function in `src/export/exporters.ts` (lines 217-251):
     `export function calculateOptimalMediaWidth(origW: number, origH: number, maxWidth: number): { width: number, height: number }`
     Currently contains logic treating square images the same as landscape, and has complicated upscaling factors which can lead to page overflow.

4. **Image & Content Spacing (R4)**:
   - PDF image margin in `src/export/exporters.ts` (line 271):
     `margin: 16px auto;`
     Conflicts with style block `margin-bottom: 6px;` (line 370).
   - DOCX image paragraph spacing in `src/export/exporters.ts` (lines 586 and 628):
     `spacing: { after: 120 }` (6pt, which is less than a line height).

5. **Reliable Generation & Image Loading (R5)**:
   - Pre-loading images function in `src/export/exporters.ts` (lines 198-210):
     `export function waitAllImagesLoaded(container: HTMLElement): Promise<void>`
     Currently does not have a safety timeout, meaning it can hang indefinitely if an image event handler is missed or fails to fire.
   - PDF Container margins in `src/export/exporters.ts` (lines 354 and 400):
     `element.style.padding = '30px 40px';` and `margin: [8, 10, 8, 10]`. This creates double margin.

6. **Test Execution Timeouts**:
   - Running the test suite (`npm run test` or `npx vitest run --testTimeout=30000`) results in test timeouts on the current host. The total duration of the E2E Vitest suite exceeded 19 minutes due to JSDOM E2E loading bottlenecks in this CPU-constrained environment. This is a pre-existing host environment issue and occurs on the completely unmodified codebase.

---

## 2. Logic Chain

1. **R1 (Remove Export as MD)**:
   - Clean removal of all UI options and helper code ensures no dead code or broken UI buttons remain. Removing from mocks (`setupTests.ts`) ensures tests compile. Removing from settings pages and storage signatures keeps the data models sound.
2. **R2 (Baseline-Aligned Headers)**:
   - PDF: Changing parent to `justify-content: space-between; align-items: baseline;` and grouping the logo + branding text in a nested flex container with `align-items: center; gap: 8px;` vertically centers the logo next to the branding text while aligning the branding baseline perfectly with the date text.
   - DOCX: Setting branding text size to `28` (14pt) and date text size to `20` (10pt) aligns with PDF typography. Adding a bottom border to the branding paragraph (`border: { bottom: { color: "e2e8f0", value: "single" } }`) gives it a matching layout line.
3. **R3 (Aspect-Ratio-Based Image Sizing)**:
   - Classifying images by aspect ratio:
     - `ratio >= 1.2` (Landscape): Expand to full printable width (`maxWidth`).
     - `ratio <= 0.8` (Portrait): Limit height to `60%` of printable width (`maxWidth * 0.60`) to avoid overflow and single-image page splitting.
     - `0.8 < ratio < 1.2` (Square/Near-Square): Limit width to a balanced `80%` of printable width (`maxWidth * 0.80`).
   - Sizing dynamically using `width = height * ratio` or `height = width / ratio` maintains the source aspect ratio perfectly without skewing.
4. **R4 (Spacing and Margins)**:
   - One line of text is ~24px (PDF) and ~240 dxa (DOCX).
   - Setting bottom margin on images to `24px` (PDF inline and stylesheet) and `spacing: { before: 120, after: 240 }` (DOCX image paragraph) guarantees consistent single-line whitespace after images.
5. **R5 (Reliable Generation)**:
   - Adding a 5-second fallback timeout (`setTimeout`) to `waitAllImagesLoaded` ensures that even if some image fails to trigger `onload` or `onerror`, the promise resolves and export proceeds.
   - Setting PDF container padding to `0` and `html2pdf` margin to `12` (12mm) eliminates double margins and aligns the A4 output layout with DOCX's `720 dxa` (0.5 inch) margin.

---

## 3. Caveats

- **Vitest Environment**: Vitest runs in JSDOM, which does not render PDF canvases or export DOCX directly. Exporters must be tested through manual inspections or mock verifications.
- **Async Resource Fetching**: Chrome extension URLs (`chrome.runtime.getURL`) are mocked inside test environments but must be available at runtime. The fallback paths are maintained to ensure execution safety.
- **Vitest Timeouts**: E2E tests naturally time out on this CPU-limited host machine due to heavy JSDOM rendering and clock-mocking operations (`useFakeTimers` / `useRealTimers`). This does not affect exporter build soundness.

---

## 4. Conclusion

The export refactoring requirements are highly scoped and clean. By modifying the identified lines in `src/export/exporters.ts`, `src/sidepanel/App.tsx`, `src/settings/App.tsx`, `src/storage/repository.ts`, and `src/setupTests.ts`, we will satisfy all user requirements perfectly.

Detailed proposals for changes are written in `/Users/iamsparsh00321/Desktop/01 Projects/Extensions/extensionproject/.agents/explorer_export_1/analysis.md`.

---

## 5. Verification Method

1. **Vitest E2E Tests**: Run vitest with high timeout or selectively for faster feedback:
   ```bash
   npx vitest run --testTimeout=60000
   ```
2. **Visual In-Browser Testing**:
   - Trigger the export dropdown: confirm only "PDF" and "DOCX" options exist.
   - Export a document: confirm that:
     - PDF and DOCX headers show the logo, branding text, and date on a unified baseline.
     - Images scale correctly based on aspect ratios (ultra-wide/landscape fill width, portrait is vertically clamped, square is centered at 80% width).
     - Page margins are equal and consistent.
     - Gaps under images are exactly one line.
