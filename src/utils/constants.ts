export const STORAGE_DB_NAME = 'NullNoteDB';
export const STORAGE_DB_VERSION = 1;
export const DOCUMENTS_STORE = 'documents';
export const SCREENSHOTS_STORE = 'screenshots';
export const MARKERS_STORE = 'markers';
export const SETTINGS_STORE = 'settings';

export const AUTO_CAPTURE_KEY = 'autoCaptureEnabled';
export const AUTO_CAPTURE_INTERVAL_KEY = 'autoCaptureInterval';

export const SETTINGS_DEFAULT_EXPORT_FORMAT = 'defaultExportFormat';
export const SETTINGS_INCLUDE_TIMESTAMPS = 'includeTimestamps';
export const SETTINGS_INCLUDE_SCREENSHOTS = 'includeScreenshots';
export const SETTINGS_PANEL_WIDTH = 'panelWidth';
export const SETTINGS_FONT_SIZE = 'fontSize';
export const SETTINGS_AUTOSNAP_ON_OPEN = 'autosnapOnOpen';

export const DEFAULT_CAPTURE_INTERVAL = 30;
export const CAPTURE_INTERVAL_OPTIONS = [10, 20, 30, 60, 120, 300] as const;

export const STORAGE_MESSAGE_TYPES = {
  saveHighlight: 'saveHighlight',
  saveScreenshot: 'saveScreenshot',
  syncVideoMeta: 'syncVideoMeta',
  toggleAutoCapture: 'toggleAutoCapture',
  setAutoCaptureInterval: 'setAutoCaptureInterval',
  queryVideoEntries: 'queryVideoEntries',
  getAutoCaptureState: 'getAutoCaptureState',
  captureVisibleTab: 'captureVisibleTab',
  exportData: 'exportData',
  openSidePanel: 'openSidePanel',
} as const;

export const SIDE_PANEL_TITLE = 'NullNote';
