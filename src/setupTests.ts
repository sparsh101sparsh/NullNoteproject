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

// Mock exporters (V2 API surface)
vi.mock('@/export/compiler', () => ({
  compileExportDocument: vi.fn(async () => ({
    title: 'Mock Video Title',
    exportDate: '16 Jun 2026',
    videoUrl: 'https://youtube.com/...',
    blocks: [],
    logoData: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  })),
}));

vi.mock('@/export/layout', () => ({
  layoutDocument: vi.fn(() => []),
}));

vi.mock('@/export/pdf-renderer', () => ({
  renderPdf: vi.fn(async () => {}),
}));

vi.mock('@/export/docx-renderer', () => ({
  renderDocx: vi.fn(async () => {}),
}));

// Mock exporters (V1 fallback)
vi.mock('@/export/exporters', () => ({
  exportToPdf: vi.fn(async () => {}),
  exportToDocs: vi.fn(async () => {}),
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
    deleteDocument: vi.fn(async () => {}),
    getVisibilitySettings: vi.fn(async () => ({ showMarkers: true, showManualScreenshots: true, showAutoScreenshots: true })),
    setVisibilitySetting: vi.fn(async () => {}),
    getOnboardingCompleted: vi.fn(async () => true),
    setOnboardingCompleted: vi.fn(async () => {}),
  };
});
