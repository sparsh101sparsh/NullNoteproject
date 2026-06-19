# E2E & Component Testing Analysis for sidepanel App component

## Executive Summary
This report analyzes the sidepanel App component (`src/sidepanel/App.tsx`) and the storage layer (`src/storage/repository.ts`) to establish a component/E2E testing framework using **Vitest** and **JSDOM**. 
The codebase has no pre-existing tests. Setting up Vitest + JSDOM requires mocking:
1. **Chrome Extension APIs** (`chrome.runtime`, `chrome.tabs`, `chrome.storage`)
2. **Storage Layer / IndexedDB** (mocking repository imports or using `fake-indexeddb`)
3. **Browser APIs** not fully supported by JSDOM (`URL.createObjectURL`, `window.scrollTo`, `window.alert`)
4. **Export Engines** (`@/export/exporters`) to prevent external library crashes.

---

## 1. Codebase Overview & Observations

### Current Dependencies & Configurations (`package.json`, `vite.config.ts`)
- **React**: `^18.3.1`
- **Vite**: `^4.4.9` (Vite 4)
- **IndexedDB Wrapper**: `idb ^8.0.3`
- **Chrome API Typings**: `@types/chrome ^0.0.204`
- **Vite Configuration**: Uses `@/` alias mapped to `src/`. Entry points are defined for `sidepanel`, `popup`, and `settings` HTML files.

### Sidepanel App Component Dependency Analysis (`src/sidepanel/App.tsx`)
The `App` component interacts heavily with external environments upon mounting and user interaction:
- **Chrome Extension APIs**:
  - `chrome.tabs.query` (queries current active YouTube tab to extract `videoId` and `videoTitle`).
  - `chrome.runtime.sendMessage` (coordinates states like auto-capture, ready states, marker changes).
  - `chrome.runtime.onMessage.addListener` / `removeListener` (listens to content script events like screenshot capture, title modifications).
  - `chrome.runtime.getURL` (resolves relative asset paths for marker icons).
- **Storage Layer**:
  - Automatically loads/creates notes via `getDocument` and `getScreenshotsForVideo` on mount or `videoId` changes.
  - Automatically saves editor content on user input via debounced calls to `saveDocument` and `pruneOrphanedRecords`.
- **Browser APIs**:
  - `URL.createObjectURL` & `URL.revokeObjectURL` (manages temporary browser URLs for IndexedDB-backed screenshot blobs).
  - `window.scrollTo` (resets horizontal scroll behavior on mount).
  - `window.alert` (warns user on exporter errors).
  - `history.scrollRestoration` (configured to `'manual'`).

---

## 2. DevDependencies Setup for Vitest + JSDOM

To establish the test suite, we need to install the following devDependencies:

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

### Configuration Files

#### A. Vitest Configuration (`vitest.config.ts`)
A dedicated Vitest configuration is recommended instead of merging with `vite.config.ts`. This isolates testing from Rollup multi-input bundler configurations:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: false, // Disables parsing CSS files to speed up test execution
  },
});
```

#### B. Setup File (`src/setupTests.ts`)
Configure Jest-DOM assertions and common browser API mocks here:

```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock scrollTo since JSDOM does not implement it
window.scrollTo = vi.fn();

// Mock alert
window.alert = vi.fn();
```

---

## 3. Mocking Chrome Extension APIs

Since tests run in Node/JSDOM, we must construct a complete mock of the `chrome` global object in `src/setupTests.ts`.

### Chrome API Mock Implementation

```typescript
import { vi } from 'vitest';

// Keep track of active message listeners to trigger them inside tests
const mockListeners = new Set<(message: any, sender: any, sendResponse: any) => void>();

globalThis.chrome = {
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://mock-extension-id/${path}`),
    sendMessage: vi.fn((message, callback) => {
      if (callback) {
        // Run asynchronously or synchronously to emulate background script response
        callback();
      }
    }),
    onMessage: {
      addListener: vi.fn((listener) => {
        mockListeners.add(listener);
      }),
      removeListener: vi.fn((listener) => {
        mockListeners.delete(listener);
      }),
    },
    lastError: undefined,
  },
  tabs: {
    query: vi.fn((queryInfo, callback) => {
      // Return a mock active YouTube tab by default
      callback([
        {
          id: 12345,
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Rick Astley - Never Gonna Give You Up - YouTube',
          active: true,
        },
      ]);
    }),
  },
} as unknown as typeof chrome;

// Helper function to dispatch events from content/background scripts during tests
export const triggerChromeMessage = (message: any) => {
  mockListeners.forEach((listener) => listener(message, {}, () => {}));
};
```

---

## 4. Handling the Storage Layer (IndexedDB vs. Repository Mocking)

There are two primary approaches to handle the storage layer during testing:

### Option A: Complete Mocking of `@/storage/repository` (Recommended)
This approach intercepts all repository database calls. It is fast, eliminates dependency on IndexedDB in Node, and allows test-specific data assertions.

#### Implementation in `src/setupTests.ts` (or per test file):
```typescript
vi.mock('@/storage/repository', () => {
  return {
    getDocument: vi.fn(async (videoId, defaultTitle) => ({
      videoId,
      videoTitle: defaultTitle || 'Mock Video Title',
      documentContent: '<p>Start typing your lecture notes here...</p>',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    saveDocument: vi.fn(async () => {}),
    saveVideoTitle: vi.fn(async () => {}),
    getScreenshotsForVideo: vi.fn(async () => []),
    saveScreenshotBlob: vi.fn(async () => {}),
    saveMarkerRecord: vi.fn(async () => {}),
    pruneOrphanedRecords: vi.fn(async () => {}),
    getAutoCaptureEnabled: vi.fn(async () => false),
    setAutoCaptureEnabled: vi.fn(async () => {}),
    getAutoCaptureInterval: vi.fn(async () => 30),
    setAutoCaptureInterval: vi.fn(async () => {}),
    getSelectedMarkerIcon: vi.fn(async () => 'MarkIcon1'),
    setSelectedMarkerIcon: vi.fn(async () => {}),
    getImageOutlineEnabled: vi.fn(async () => false),
    setImageOutlineEnabled: vi.fn(async () => {}),
    getAllDocuments: vi.fn(async () => []),
  };
});
```

### Option B: Using `fake-indexeddb` for Database Integration Testing
If we need to test real data persistence and the repository wrapper logic, we can polyfill IndexedDB.

1. **Install polyfill**:
   ```bash
   npm install -D fake-indexeddb
   ```
2. **Add to `src/setupTests.ts`**:
   ```typescript
   import 'fake-indexeddb/auto';
   ```
3. **Clean up database between tests**:
   ```typescript
   import { openNullNoteDB } from '@/storage/db';

   afterEach(async () => {
     const db = await openNullNoteDB();
     const tx = db.transaction(db.objectStoreNames, 'readwrite');
     for (const storeName of db.objectStoreNames) {
       await tx.objectStore(storeName).clear();
     }
     await tx.done;
     db.close();
   });
   ```

### Critical Mock: `URL.createObjectURL` and `URL.revokeObjectURL`
Regardless of Option A or B, the component creates object URLs from screenshots. JSDOM does not implement these methods, which will cause runtime crashes during tests. 
Add the following mocks in `src/setupTests.ts`:

```typescript
globalThis.URL.createObjectURL = vi.fn((blob: Blob) => 'blob:mock-screenshot-url');
globalThis.URL.revokeObjectURL = vi.fn();
```

---

## 5. Mocking the Export System

The exporters (`exportToPdf`, `exportToDocs`, `exportToMarkdown`) rely on external document layout libraries (`docx`, `html2pdf.js`, `@packback/html-to-docx`) which fail in Node.js environments.
Mock `@/export/exporters` to isolate component logic:

```typescript
vi.mock('@/export/exporters', () => ({
  exportToPdf: vi.fn(async () => {}),
  exportToDocs: vi.fn(async () => {}),
  exportToMarkdown: vi.fn(() => {}),
  compileExportDocument: vi.fn(async () => ({
    videoId: 'mock-video-id',
    videoTitle: 'Mock Video Title',
    videoUrl: 'https://youtube.com/...',
    content: '<p>Mock Content</p>',
    screenshots: [],
    markers: [],
  })),
}));
```

---

## 6. Recommendations for Writing First Test

Here is a recommended starting template for testing `App.tsx` (e.g., `src/sidepanel/App.test.tsx`):

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import * as repository from '@/storage/repository';
import { triggerChromeMessage } from '../setupTests';

describe('Sidepanel App Component', () => {
  it('loads and displays default notes structure on mount', async () => {
    render(<App />);

    // Wait for the document title to be visible
    const titleElement = await screen.findByText('Rick Astley - Never Gonna Give You Up');
    expect(titleElement).toBeInTheDocument();

    // Verify Repository fetch was triggered
    expect(repository.getDocument).toHaveBeenCalledWith(
      'dQw4w9WgXcQ',
      'Rick Astley - Never Gonna Give You Up'
    );
  });

  it('handles incoming messages from content script', async () => {
    render(<App />);
    
    // Simulate content script triggering a screenshot capture
    triggerChromeMessage({
      type: 'insert-screenshot',
      timestamp: 42,
      imageData: 'data:image/jpeg;base64,mockdata',
    });

    // Check that saveDocument is eventually triggered due to editor updates
    await waitFor(() => {
      expect(repository.saveDocument).toHaveBeenCalled();
    });
  });
});
```

---

## Conclusion
A Vitest + JSDOM configuration with a dedicated setup file to mock Chrome APIs, standard missing browser APIs (`URL`), and the storage repository provides a robust, fast, and crash-free testing framework for this React Extension sidebar application.
