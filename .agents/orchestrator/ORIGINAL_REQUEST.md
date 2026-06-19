# Original User Request

## 2026-06-15T23:31:49+05:30

<USER_REQUEST>
You are the Project Orchestrator. Read .agents/ORIGINAL_REQUEST.md and coordinate the implementation of requirements inside the workspace /Users/iamsparsh00321/Desktop/01 Projects/Extensions/extensionproject. Your own working directory is /Users/iamsparsh00321/Desktop/01 Projects/Extensions/extensionproject/.agents/orchestrator. You must decompose the tasks, spawn explorer/implementer/reviewer/challenger agents as needed, track progress in progress.md, and report completion back to the sentinel.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-06-15T23:31:49+05:30.
</ADDITIONAL_METADATA>

## 2026-06-15T21:12:51Z

Refine the PDF and DOCX export pipeline of the NullNote Chrome extension to produce professional, perfectly scaled, and cleanly spaced documents while completely removing the Markdown export feature.

Working directory: `/Users/iamsparsh00321/Desktop/01 Projects/Extensions/extensionproject`
Integrity mode: demo

## Requirements

### R1. Clean Export Menu
Remove all traces of "Export as MD" from the export dropdown menu and any associated Markdown export logic. The menu should strictly contain only PDF and DOCX options.

### R2. Header Layout Refinement
Update the export header to feature the NullNote icon and the text "Created with NullNote" vertically aligned on the left, with the font size matching the icon height. The export date must be placed in the far top right corner, perfectly aligned on the same baseline.

### R3. Universal Dynamic Image Scaling
Implement a universal aspect-ratio-based image sizing algorithm for both PDF and DOCX exports. Images must visually dominate the page by consuming the maximum safe printable area. 
- Landscape images: Expand to maximum available content width.
- Portrait images: Scale to maximum reasonable height without becoming excessively tall.
- Square images: Use maximum balanced size.

### R4. Image and Content Spacing
Enforce consistent, professional spacing throughout the document:
- Exactly one text-line worth of vertical spacing after every image.
- Visually pleasing top spacing before the first image.
- Professional spacing between the title, metadata, and body content.

### R5. Reliable PDF and DOCX Generation
Ensure the complete document renders correctly for both PDF and DOCX formats without producing blank pages. The layout, scaling, and spacing must be consistent across both outputs.

## Acceptance Criteria

### Export Output Quality
- [ ] The export menu only shows "Export as PDF" and "Export as DOCX".
- [ ] A mock programmatic test script successfully generates a PDF and a DOCX containing ultra-wide landscape, normal landscape, square, portrait, and tall portrait dummy images.
- [ ] The mock document validates that the header is correctly aligned with the date strictly on the top right.
- [ ] The mock document validates that landscape images consume at least 95% of the safe page width.
- [ ] The mock document validates that portrait images are clamped vertically and do not dominate the page.
- [ ] Generated PDF files are not blank and contain the complete expected content.
- [ ] Generated DOCX files open successfully and reflect the exact same structural layout as the PDF.

## 2026-06-15T21:15:49Z

Refine the PDF and DOCX export pipeline of the NullNote Chrome extension to produce professional, perfectly scaled, and cleanly spaced documents while completely removing the Markdown export feature.

Working directory:
/Users/iamsparsh00321/Desktop/01 Projects/Extensions/extensionproject

Integrity mode: demo

---

## Requirements

### R1. Clean Export Menu

Remove all traces of "Export as MD" from the export dropdown menu and any associated Markdown export logic.

The export menu should strictly contain only:

* Export as PDF
* Export as DOCX

No other export options should remain.

---

### R2. Header Layout Refinement

Update the export header to create a clean, professional layout.

Requirements:

* The NullNote icon and the text "Created with NullNote" must be vertically aligned.
* The font size should approximately match the icon height.
* The text and icon should share the same baseline.
* The export date must be moved to the far top-right corner.
* The date should be perfectly aligned with the header baseline.
* Header appearance should remain visually consistent across both PDF and DOCX exports.

Target structure:

[Icon] Created with NullNote                         16/06/26

---

### R3. Universal Dynamic Image Scaling

Implement a universal aspect-ratio-aware image sizing algorithm for both PDF and DOCX exports.

The algorithm must NOT be hardcoded for any particular screenshot size.

General rule:

Every image should consume the maximum safe printable area while:

* preserving its original aspect ratio,
* never being cropped,
* never being stretched,
* never being distorted,
* never overflowing the page.

**Landscape Images**
* Expand to maximum available content width.
* Minimize unused white margins.
* Large landscape images should visually dominate the page.

**Portrait Images**
* Scale to the maximum practical height.
* Prevent excessively tall rendering.
* Avoid allowing portrait images to dominate the entire page.

**Square Images**
* Use maximum balanced dimensions.

The implementation must work correctly for:

* ultra-wide landscape,
* standard landscape,
* square,
* portrait,
* tall portrait images.

---

### R4. Image and Content Spacing

Enforce consistent, professional spacing throughout the exported document.

Requirements:

* Exactly one text-line worth of vertical spacing after every image.
* Visually pleasing spacing before the first image.
* Balanced spacing between:
    * header,
    * title,
    * metadata,
    * links,
    * timestamps,
    * images,
    * body content.

Avoid excessive empty white space.

---

### R5. Reliable PDF and DOCX Generation

Ensure the complete document renders correctly for both PDF and DOCX formats.

Requirements:

* No blank pages.
* No missing images.
* No incomplete rendering.
* Layout, scaling, and spacing must remain visually consistent across both formats.
* The export process should begin only after all images and assets have been fully processed and rendered.

---

## Acceptance Criteria

### Export Output Quality

* The export menu only shows "Export as PDF" and "Export as DOCX".
* A mock programmatic test script successfully generates a PDF and a DOCX containing ultra-wide landscape, standard landscape, square, portrait, and tall portrait dummy images.
* The mock document validates that the header is correctly aligned with the date strictly on the top right.
* The mock document validates that landscape images consume at least 95% of the safe page width.
* The mock document validates that portrait images are vertically clamped and do not dominate the page.
* Images are never cropped, stretched, or distorted.
* Generated PDF files are not blank and contain the complete expected content.
* Generated DOCX files open successfully and reflect the same structural layout as the PDF.
* The export pipeline waits for all images and assets to finish rendering before generating the final PDF or DOCX.
* PDF and DOCX exports remain visually consistent across all tested aspect ratios.
* The implementation is validated against the attached reference screenshots before the task is considered complete.

---

## Validation Requirement

The task should not be considered complete based solely on code changes.

The team should:

1. Generate mock export documents.
2. Test multiple image aspect ratios.
3. Generate actual PDF and DOCX outputs.
4. Verify exported files visually.
5. Compare the final result against the attached reference screenshots.

Implementation success requires both functional correctness and visual correctness.
