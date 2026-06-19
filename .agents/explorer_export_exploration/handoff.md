# Handoff Report — Export subsystem exploration

This report outlines the location and analysis of all export-related code in the NullNote Chrome extension codebase, specifically focusing on PDF, DOCX, and Markdown formats. It details recommended strategies for implementing R1 (Clean Export Menu), R2 (Header Layout), R3 (Universal Dynamic Image Scaling), R4 (Image & Content Spacing), and R5 (Reliable PDF/DOCX Generation).

---

## 1. Observation

Direct observations from code files, including lines and exact styles used for export:

### A. Export Dropdown UI Component
* **Path**: `src/sidepanel/App.tsx`
* **Triggering Event**: The dropdown opens by clicking the "Export" button (lines 972-1000) and stores positioning in state `exportDropdownPos` (lines 985-989).
* **Dropdown Element**: Rendered at lines 1001-1042:
  ```tsx
  {exportMenuOpen && exportDropdownPos && (
    <div
      ref={exportDropdownRef}
      style={{
        position: 'fixed',
        top: exportDropdownPos.top,
        right: exportDropdownPos.right,
        width: 160,
        borderRadius: 12,
        border: '1.5px solid #e8ecf0',
        background: '#fff',
        padding: '4px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        zIndex: 99999,
        animation: 'slideDown 0.12s ease'
      }}
    >
      {([{ label:'PDF', color:'#ef4444', bg:'#fef2f2', fmt:'pdf' as const },
         { label:'DOCX', color:'#3b82f6', bg:'#eff6ff', fmt:'docs' as const },
         { label:'MD', color:'#f59e0b', bg:'#fffbeb', fmt:'markdown' as const }]
      ).map(opt => (
        <button
          key={opt.fmt}
          type="button"
          disabled={isExporting}
          onClick={() => {
            if (!isExporting) {
              setExportMenuOpen(false);
              setExportDropdownPos(null);
              handleExport(opt.fmt);
            }
          }}
          style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'7px 10px', borderRadius:8, border:'none', background:'transparent', cursor: isExporting ? 'not-allowed' : 'pointer', fontSize:12, fontWeight:600, color:'#374151' }}
          onMouseEnter={e => { if (!isExporting) { (e.currentTarget as HTMLButtonElement).style.background = opt.bg; (e.currentTarget as HTMLButtonElement).style.color = opt.color; } }}
          onMouseLeave={e => { if (!isExporting) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; } }}
        >
          <span style={{ fontWeight:800, color:opt.color, minWidth:32 }}>{opt.label}</span>
          <span>Export as {opt.label}</span>
        </button>
      ))}
    </div>
  )}
  ```
* **Click-Outside Handler**: Set up in `useEffect` at lines 174-186:
  ```typescript
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (exportBtnRef.current?.contains(target)) return;
      if (exportDropdownRef.current?.contains(target)) return;
      setExportMenuOpen(false);
      setExportDropdownPos(null);
    };
    document.addEventListener('mousedown', onClickOutside, true);
    return () => document.removeEventListener('mousedown', onClickOutside, true);
  }, [exportMenuOpen]);
  ```

### B. Export Implementations (PDF, DOCX, Markdown)
* **Path**: `src/export/exporters.ts`
* **Libraries**:
  * PDF: `html2pdf.js` (imported at line 3).
  * DOCX: `docx` library (imported at line 5).
  * Markdown: Built natively using Javascript `Blob` (lines 676-711).
* **Header Generation**:
  * PDF: `renderHtmlHeader` at lines 253-264:
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
  * DOCX: `exportToDocs` builds header paragraphs programmatically (lines 433-514):
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
* **Image Sizing Algorithm**:
  * Uses `calculateOptimalMediaWidth` at lines 217-251:
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
* **Image and Content Spacing**:
  * PDF: Renders screenshots/badges via `renderResponsiveMedia` with style `margin: 16px auto` (line 271) and CSS styling:
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
  * DOCX: Inserts screenshots with spacing: `{ after: 120 }` (6pt) (lines 586, 628).

### C. Test Environment and Configuration
* **Test Configurations**: Configured in `vitest.config.ts`, using `jsdom` environment and setup file `./src/setupTests.ts`.
* **Existing Tests**: E2E Component Test Suite exists in `tests/App.test.tsx`.
* **Exporters Mocking**: In `src/setupTests.ts`, the exporters module is completely mocked (lines 55-67):
  ```typescript
  vi.mock('@/export/exporters', () => ({
    exportToPdf: vi.fn(async () => {}),
    exportToDocs: vi.fn(async () => {}),
    exportToMarkdown: vi.fn(() => {}),
    compileExportDocument: vi.fn(async () => ({ ... })),
  }));
  ```
  This means that the existing tests do NOT cover the exporter functions themselves.

---

## 2. Logic Chain

1. **R1 (Clean Export Menu)**: Removing Markdown exports requires removing the UI element in `sidepanel/App.tsx`, the settings control in `settings/App.tsx`, database model references in `storage/repository.ts`, the mock in `setupTests.ts`, and the exporter logic itself in `export/exporters.ts`.
2. **R2 (Header Layout)**: The branding text needs to be size-matched with the icon (`24px` tall). For PDF, this can be styled using CSS flexbox `align-items: baseline` and `justify-content: space-between` with font-size `24px` and line-height `24px`. For DOCX, we must build a paragraph using tab stops and size the TextRun to half-points equivalent to 18pt/24px (value `36`).
3. **R3 (Universal Image Sizing)**: We can classify images clearly based on aspect ratio (`ratio = width / height`):
   - Landscape (`ratio >= 1.2`): Target full `maxWidth`.
   - Portrait (`ratio <= 0.8`): Clamp height to `maxWidth * 0.6` and calculate width.
   - Square/Near-Square (`0.8 < ratio < 1.2`): Set width to `maxWidth * 0.8` (balanced dominance) and calculate height.
4. **R4 (Image & Content Spacing)**: Exactly one text line is ~24px (PDF) and ~240 dxa (DOCX).
   - In PDF: Apply `margin: 24px auto` inside `renderResponsiveMedia` on the images.
   - In DOCX: Set paragraph `spacing: { before: 240, after: 240 }` on screenshots.
   - Adjust title and header spacing blocks consistently.
5. **R5 (Reliable Generation)**: Double margin issues are avoided by matching PDF layout padding and margins (margins `12mm`, body width `800px`) and setting DOCX page margins to 0.5 inches (`720 dxa`).

---

## 3. Caveats

- **Network Constraints**: Operating in `CODE_ONLY` network mode; external libraries for PDF/DOCX generation are pinned locally inside `node_modules` (e.g. `html2pdf.js` and `docx`).
- **Vitest Environment Limitations**: Vitest runs inside JSDOM, which does not render Canvas or PDF outputs, so E2E export tests must be mocked or tested outside the main E2E suite via standalone node test scripts (e.g. `test-docx-gen.ts`).

---

## 4. Conclusion

The export pipeline is well-contained. Refactoring it to satisfy R1-R5 is highly feasible by applying changes directly to `src/export/exporters.ts`, `src/sidepanel/App.tsx`, `src/settings/App.tsx`, `src/storage/repository.ts`, and `src/setupTests.ts`.

### Recommended Strategies

#### R1. Clean Export Menu
1. **Remove MD from UI Dropdown**: In `src/sidepanel/App.tsx`, remove the MD option object from the dropdown list.
2. **Update Type Signatures**: Update types to exclude `'markdown'`.
3. **Delete Markdown exporter**: Remove `exportToMarkdown` completely from `src/export/exporters.ts` and `src/setupTests.ts`.
4. **Clean settings**: Remove MD from segmented control options in `src/settings/App.tsx`.

#### R2. Header Layout
1. **PDF Header CSS**: Update `renderHtmlHeader` in `src/export/exporters.ts`:
   ```html
   <div class="nullnote-branding-header" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
     <div style="display: flex; align-items: center; gap: 8px;">
       ${doc.logoBase64 ? `<img class="logo-img" src="${doc.logoBase64}" style="width: 24px; height: 24px; border-radius: 5px; display: block; margin: 0; padding: 0; background: transparent;" />` : ''}
       <span style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; line-height: 24px;">Created with NullNote</span>
     </div>
     <span style="font-size: 14px; color: #64748b; font-weight: 500;">${doc.exportDate}</span>
   </div>
   ```
2. **DOCX Header**: Update `exportToDocs` in `src/export/exporters.ts` to set TextRun size to `36` (18pt / 24px equivalent) and keep the tab stops aligning date to the right.

#### R3. Universal Dynamic Image Sizing
Update `calculateOptimalMediaWidth` inside `src/export/exporters.ts` to:
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

#### R4. Image and Content Spacing
1. **PDF Image Margins**: Set `margin: 24px auto` inside `renderResponsiveMedia` and remove image overrides in styling blocks.
2. **DOCX Image Spacing**: In `exportToDocs`, define image paragraph spacing as `spacing: { before: 240, after: 240 }` to ensure exactly one line worth of spacing below, and pleasing spacing above.
3. **Content Spacing**: Set consistent vertical spacers:
   - Header margin after: `24px` / `360 dxa`.
   - Title margin after: `8px` / `80 dxa`.
   - Video URL margin after: `24px` / `360 dxa`.

#### R5. Reliable PDF/DOCX Generation
1. **Document Page Setup**: Margins in DOCX set to `720 dxa` (0.5 inches) for all sides. Margins in PDF (`html2pdf` options) set to `[12, 12, 12, 12]` (12mm, approx. 0.5 inches).
2. **Avoid Page Splits**: Continue utilizing CSS `page-break-inside: avoid !important` on `.marker-badge` and `.screenshot-block`.
3. **Download Safety**: Keep dynamic anchor element downloads with a revoke URL timeout to ensure large files complete download before memory release.

---

## 5. Verification Method

To verify these changes:
1. **Run E2E Suite**: Ensure the E2E component suite passes:
   ```bash
   npm run test
   ```
2. **Standalone Test Script**: Create a mock script (e.g. `test-exporters.ts` in root) to programmatically trigger PDF and DOCX generation with ultra-wide landscape, normal landscape, square, portrait, and tall portrait dummy images.
3. **Check Layouts**: Open the generated PDF and DOCX and inspect:
   - Export menu strictly showing PDF & DOCX.
   - Header icon, branding text, and date baseline alignment.
   - Image scaling dimensions (landscape at maximum width; portrait height capped; square balanced).
   - Margin sizes in both documents (equal sizes).
