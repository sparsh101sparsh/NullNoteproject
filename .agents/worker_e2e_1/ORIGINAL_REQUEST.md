## 2026-06-15T18:06:36Z
You are worker_e2e_1. Your working directory is /Users/iamsparsh00321/Desktop/01 Projects/Extensions/extensionproject/.agents/worker_e2e_1.
Your task is to set up the E2E component test suite for the sidepanel App component (src/sidepanel/App.tsx) based on user requirements.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please do the following:
1. Install the testing dependencies:
   npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event

2. Create `vitest.config.ts` in the project root containing:
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
    css: false,
  },
});
```

3. Create `src/setupTests.ts` in the src directory containing:
```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock scrollTo since JSDOM does not implement it
window.scrollTo = vi.fn();

// Mock alert
window.alert = vi.fn();

// Keep track of active message listeners to trigger them inside tests
const mockListeners = new Set<(message: any, sender: any, sendResponse: any) => void>();

globalThis.chrome = {
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://mock-extension-id/${path}`),
    sendMessage: vi.fn((message, callback) => {
      if (callback) {
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

// Helper to trigger messages in tests
(globalThis as any).triggerChromeMessage = (message: any) => {
  mockListeners.forEach((listener) => listener(message, {}, () => {}));
};

// Mock createObjectURL & revokeObjectURL
globalThis.URL.createObjectURL = vi.fn((blob: Blob) => 'blob:mock-screenshot-url');
globalThis.URL.revokeObjectURL = vi.fn();

// Mock exporters
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

// Mock repository
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

4. Edit `package.json` to add `"test": "vitest run"` to the `scripts` section.

5. Create `tests/App.test.tsx` containing at least 40 test cases covering:
   - Tier 1: Feature Coverage (5 tests for /h, 5 tests for /p, 5 tests for multi-line placeholder)
   - Tier 2: Boundary & Corner Cases (5 tests for /h, 5 tests for /p, 5 tests for placeholder)
   - Tier 3: Cross-Feature Combinations (5 tests on interactions between slash commands and placeholder toggle)
   - Tier 4: Real-World Scenarios (5 tests on continuous typing, typing at various offsets, pasting)

6. Run the tests using `npm run test` (or `npx vitest run`). Since the features are not yet implemented in App.tsx, the tests are expected to fail. This is correct and expected. Verify that the test runner executes successfully, outputs test failures, and does not crash on setup or missing browser/chrome APIs. Record the test run output.

7. Create and write `TEST_READY.md` at the project root (`/Users/iamsparsh00321/Desktop/01 Projects/Extensions/extensionproject/TEST_READY.md`) with:
   - Test Runner command: `npm run test`
   - Feature Inventory (Slash command /h, Slash command /p, Multi-line placeholder)
   - Coverage checklist showing tiers and test counts.

8. Once complete, write your handoff report to `/Users/iamsparsh00321/Desktop/01 Projects/Extensions/extensionproject/.agents/worker_e2e_1/handoff.md` and send a message back to sub_orch_e2e (conversation ID: 61bf42c4-e75e-4cc3-acff-4c999242dfe7).
