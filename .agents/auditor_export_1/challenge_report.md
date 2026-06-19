## Challenge Summary

**Overall risk assessment**: LOW

## Challenges

### [Low] Challenge 1: Extremely narrow aspect ratio images
- **Assumption challenged**: The scaling function `calculateOptimalMediaWidth` assumes that images will have standard/reasonable aspect ratios (e.g. not extremely tall or extremely wide).
- **Attack scenario**: If a screenshot has an extremely tall aspect ratio (e.g., width = 1, height = 10000), the aspect ratio is `0.0001`. Since it is <= 0.8, it will be treated as portrait:
  - `height = maxWidth * 0.60`
  - `width = height * ratio = (maxWidth * 0.60) * 0.0001`
  This results in a calculated width of `0px` after rounding, which will fail to display or cause render errors.
- **Blast radius**: The exported PDF/DOCX will render a blank or 0-width image element.
- **Mitigation**: Enforce a minimum width and height of at least `1px` (or `16px`) in `calculateOptimalMediaWidth` to avoid zero-sized elements.

### [Low] Challenge 2: Slow image network fetches or bad URLs leading to timeouts
- **Assumption challenged**: All images will load or fail within 5 seconds during the PDF export.
- **Attack scenario**: If there are many screenshots in a large document and the network or local Chrome extension runtime has severe latency, the `waitAllImagesLoaded` function will wait 5 seconds per image that doesn't load/error quickly. If multiple images time out sequentially, the UI might feel laggy, though they are run in parallel via `Promise.all`.
- **Blast radius**: If a document has 20 slow-loading images, the PDF generation will wait up to 5 seconds total (since they are concurrent), but the user might face a 5-second delay.
- **Mitigation**: Introduce a global timeout for the entire `waitAllImagesLoaded` execution (e.g. max 10 seconds total) instead of just per-image timeouts.

## Stress Test Results

- **Extreme Aspect Ratio (1:10000)** → `calculateOptimalMediaWidth(1, 10000, 800)` → returns `{ width: 0, height: 480 }` → **FAIL** (width becomes 0)
- **Null / Undefined Dimensions (0:0)** → `calculateOptimalMediaWidth(0, 0, 800)` → returns `{ width: 800, height: 450 }` (fallback 16:9) → **PASS**
- **Negative Dimensions (-100:200)** → `calculateOptimalMediaWidth(-100, 200, 800)` → returns `{ width: -480, height: -240 }` → **FAIL** (negative sizes in css/docx structure)

## Unchallenged Areas

- **html2pdf.js page breaks** — The visual alignment and page breaks depend heavily on `html2pdf.js` library internal canvas slicing, which could not be challenged in programmatic unit test environments.
