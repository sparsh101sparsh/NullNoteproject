export const STORAGE_DB_NAME = 'NullNoteDB';
export const STORAGE_DB_VERSION = 1;
export const DOCUMENTS_STORE = 'documents';
export const SCREENSHOTS_STORE = 'screenshots';
export const MARKERS_STORE = 'markers';
export const SETTINGS_STORE = 'settings';

export const ENABLE_GOOGLE_DRIVE = false;

export const AUTO_CAPTURE_KEY = 'autoCaptureEnabled';
export const AUTO_CAPTURE_INTERVAL_KEY = 'autoCaptureInterval';

export const SETTINGS_DEFAULT_EXPORT_FORMAT = 'defaultExportFormat';
export const SETTINGS_INCLUDE_TIMESTAMPS = 'includeTimestamps';
export const SETTINGS_INCLUDE_SCREENSHOTS = 'includeScreenshots';
export const SETTINGS_AUTOSNAP_ON_OPEN = 'autosnapOnOpen';
export const SETTINGS_SELECTED_MARKER_ICON = 'selectedMarkerIcon';
export const SETTINGS_IMAGE_OUTLINE = 'imageOutlineEnabled';
export const SETTINGS_GOOGLE_DRIVE_STATE = 'googleDriveState';

export const DEFAULT_CAPTURE_INTERVAL = 30;
export const DEFAULT_MARKER_ICON = 'MarkIcon1';
export const MARKER_ICONS = [
  { key: 'MarkIcon1', file: 'mark_icon1.png', label: 'Yellow Pin' },
  { key: 'MarkIcon2', file: 'mark_icon2.png', label: 'Red Pin' },
  { key: 'MarkIcon3', file: 'mark_icon3.png', label: 'Blue Pin' },
] as const;
export type MarkerIconKey = typeof MARKER_ICONS[number]['key'];
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
  googleDrive: {
    getState: 'googleDrive.getState',
    connect: 'googleDrive.connect',
    disconnect: 'googleDrive.disconnect',
    ensureRootFolder: 'googleDrive.ensureRootFolder'
  }
} as const;

export const SIDE_PANEL_TITLE = 'NullNote';
