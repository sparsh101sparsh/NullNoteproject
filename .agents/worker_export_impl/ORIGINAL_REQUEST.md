## 2026-06-16T02:49:10Z

You are teamwork_preview_worker.
Your working directory is /Users/iamsparsh00321/Desktop/01 Projects/Extensions/extensionproject/.agents/worker_export_impl/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task is to implement the export pipeline improvements and MD removal:

1. Remove "Export as MD" (R1):
   - In src/export/exporters.ts: Delete the exportToMarkdown function.
   - In src/sidepanel/App.tsx:
     - Update imports to remove exportToMarkdown.
     - Update handleExport parameter type: change format: 'pdf' | 'docs' | 'markdown' to format: 'pdf' | 'docs'.
     - Remove the else if (format === 'markdown') { exportToMarkdown(exportDoc); } block from handleExport.
     - Remove 'markdown' key from the labels object: change to { pdf: 'PDF', docs: 'DOCX' }.
     - Remove the MD option from the dropdown menu options array.
   - In src/settings/App.tsx:
     - Update ExportFormat type to remove 'markdown': change to 'pdf' | 'docs'.
     - Remove the MD option from the SegmentedControl options.
   - In src/storage/repository.ts:
     - Update getDefaultExportFormat and setDefaultExportFormat parameter/return types to remove 'markdown'.
   - In src/setupTests.ts:
     - Remove the mocked exportToMarkdown function.

2. Refine export headers layout (R2):
   - In src/export/exporters.ts:
     - Update renderHtmlHeader to wrap the logo and branding text in a flex container aligned to center, and let the outer container use align-items: baseline and justify-content: space-between to baseline-align the branding and date. Add a bottom border separator line: border-bottom: 1.5px solid #e2e8f0; padding-bottom: 12px;.
     - For DOCX header in exportToDocs, set branding text size to 28 (14pt) and date text size to 20 (10pt), and add a bottom border to the paragraph to match the PDF line layout:
       border: {
         bottom: {
           color: "e2e8f0",
           space: 8,
           value: "single",
           size: 6
         }
       }

3. Universal aspect-ratio-based image sizing (R3):
   - In src/export/exporters.ts:
     - Rewrite calculateOptimalMediaWidth to handle landscape, portrait, and square/near-square media layout rules:
       - Landscape (ratio >= 1.2): width = maxWidth, height = maxWidth / ratio.
       - Portrait (ratio <= 0.8): height = maxWidth * 0.60, width = height * ratio.
       - Square/Near-Square (0.8 < ratio < 1.2): width = maxWidth * 0.80, height = width / ratio.

4. Consistent Spacing and Margins (R4):
   - In src/export/exporters.ts:
     - PDF Image Spacing: In renderResponsiveMedia and CSS stylesheet inside exportToPdf, set image margin to 24px bottom (use margin: 16px auto 24px auto in inline styles, and margin-top: 16px !important; margin-bottom: 24px !important; in the stylesheet).
     - PDF Margins: In exportToPdf, set element.style.padding = '0'; (instead of 30px 40px) and margin: [12, 12, 12, 12] in the html2pdf config.
     - PDF Max Content Width: In renderExportTemplate, set PDF_MAX_WIDTH to 800 (since padding is 0).
     - DOCX Image Spacing: In exportToDocs, set screenshot paragraph spacing to { before: 120, after: 240 } in both locations (marker screenshot and regular screenshot block).

5. Ensure Reliable Generation (R5):
   - In src/export/exporters.ts:
     - In waitAllImagesLoaded, add a 5-second fallback safety timeout using setTimeout for each image promise to resolve.

6. Verify Work:
   - Run Vitest tests: npm run test
   - Make sure all tests compile and pass.

Deliver your handoff report by calling send_message to the parent sub-orchestrator. Provide detailed file diffs/summaries of your edits.
