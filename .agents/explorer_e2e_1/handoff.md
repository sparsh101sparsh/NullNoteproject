# Handoff Report — explorer_e2e_1

## 1. Observation
- **package.json**: Found no test runner (e.g. vitest, jest) or browser environment runner (e.g. jsdom) in `devDependencies`. Contains Vite version `^4.4.9`.
- **vite.config.ts**: Alias `@/` is configured to map to `src/`. Rollup entry points are set for popup, settings, and sidepanel:
  ```typescript
  input: {
    sidepanel: path.resolve(__dirname, 'src/sidepanel/index.html'),
    popup: path.resolve(__dirname, 'src/popup/index.html'),
    settings: path.resolve(__dirname, 'src/settings/index.html'),
  }
  ```
- **src/sidepanel/App.tsx**: Directly accesses Chrome APIs and Browser APIs.
  - Chrome API calls:
    - `chrome.runtime.getURL(path)` (Line 169)
    - `chrome.runtime.sendMessage(...)` (Line 188, 250, etc.)
    - `chrome.tabs?.query(...)` (Line 232)
    - `chrome.runtime.onMessage.addListener(...)` (Line 337)
  - Browser APIs:
    - `URL.createObjectURL(blob)` (Line 280, 502, etc.)
    - `window.scrollTo(0, window.scrollY)` (Line 221)
    - `alert(...)` (Line 748)
- **src/storage/repository.ts**: Directly imports database connection from `./db.ts` which uses the `idb` library to open IndexedDB stores.
- **Test files**: A search using `find_by_name` returned zero matching test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`), indicating no tests exist.

---

## 2. Logic Chain
1. **Vitest + JSDOM Setup**: Since the project is built on Vite, **Vitest** is the standard, fastest test runner choice. The sidepanel `App.tsx` contains React components and DOM manipulations (e.g., `document.createElement`, `TreeWalker`, editing `innerHTML`). Thus, a DOM simulation environment like **JSDOM** is required to run tests.
2. **Chrome API Mocking**: Running the component directly in Node/JSDOM will crash with a `ReferenceError` when it accesses the undefined `chrome` object on mount. Therefore, a global mock of `chrome` must be registered on `globalThis` in the setup script.
3. **Storage / IndexedDB Mocking**: On mount, `App.tsx` calls multiple repository promises (e.g., `getAutoCaptureEnabled()`, `getAutoCaptureInterval()`, `getSelectedMarkerIcon()`, `getImageOutlineEnabled()`). If these calls invoke the real IndexedDB wrapper (`idb`), they will crash in JSDOM because IndexedDB is not defined globally. We can solve this either by:
   - **Mocking the Repository Imports (Recommended)**: Mocking `@/storage/repository` completely using Vitest's `vi.mock` API to return resolved promises representing the mock database values.
   - **Using `fake-indexeddb`**: Polyfilling the IndexedDB global object so `idb` can successfully perform operations in an in-memory database.
4. **JSDOM Missing APIs**: JSDOM does not implement `URL.createObjectURL`, `window.scrollTo`, or `window.alert`. Since `App.tsx` calls these methods directly on mount and during screenshot/export operations, they must be mocked in the test setup file.

---

## 3. Caveats
- **Exporting Libraries**: The exporters (`exportToPdf`, `exportToDocs`, etc.) import heavy Node/Browser libraries. Testing the exporter components directly is not in scope for component testing of `App.tsx`. Therefore, the export modules must be mocked.
- **Selection & Range**: The component manipulates text selections (e.g., `document.createRange()`, `window.getSelection()`). JSDOM selection support is basic. Tests that assert exact selection behaviour might require additional range mock helpers if JSDOM crashes.

---

## 4. Conclusion
To successfully write component tests for `App.tsx` in a Node/JSDOM environment, we must install `vitest`, `jsdom`, and `@testing-library/react`. We must write a dedicated `vitest.config.ts` configuration, and initialize a `setupTests.ts` configuration script to mock Chrome Extension APIs, JSDOM missing methods (`URL.createObjectURL`, `window.scrollTo`, `window.alert`), and intercept the database layer.

---

## 5. Verification Method
1. Inspect the analysis report at `.agents/explorer_e2e_1/analysis.md` to review the complete mock configurations and architectural recommendations.
2. Confirm the presence of proposed code for `vitest.config.ts`, `src/setupTests.ts`, and `src/sidepanel/App.test.tsx` in the report.
3. (For subsequent agents/implementers): The setup can be verified by running `npx vitest run` once the dependencies are installed and the config files are written. The test suite should execute and pass without throwing runtime references or JSDOM environment errors.
