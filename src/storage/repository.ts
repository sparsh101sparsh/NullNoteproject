import { openNullNoteDB } from './db';
import { DOCUMENTS_STORE, SCREENSHOTS_STORE, MARKERS_STORE, SETTINGS_STORE, AUTO_CAPTURE_KEY, AUTO_CAPTURE_INTERVAL_KEY, DEFAULT_CAPTURE_INTERVAL, SETTINGS_DEFAULT_EXPORT_FORMAT, SETTINGS_INCLUDE_TIMESTAMPS, SETTINGS_INCLUDE_SCREENSHOTS, SETTINGS_AUTOSNAP_ON_OPEN, SETTINGS_SELECTED_MARKER_ICON, DEFAULT_MARKER_ICON, SETTINGS_IMAGE_OUTLINE, SETTINGS_ONBOARDING_COMPLETED, SETTINGS_ONBOARDING_DISMISSED } from '@/utils/constants';


export interface DocumentRecord {
  videoId: string;
  videoTitle: string;
  documentContent: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScreenshotRecord {
  id: string;
  videoId: string;
  timestamp: number;
  imageBlob: Blob;
  note?: string;
  createdAt: number;
}

export interface MarkerRecord {
  id: string;
  videoId: string;
  timestamp: number;
  note: string;
  icon?: string;
  createdAt: number;
}

export async function getDocument(videoId: string, defaultTitle = 'Untitled Video'): Promise<DocumentRecord> {
  const db = await openNullNoteDB();
  const doc = await db.get(DOCUMENTS_STORE, videoId);
  if (doc) {
    return doc as DocumentRecord;
  }

  // Create new document automatically
  const newDoc: DocumentRecord = {
    videoId,
    videoTitle: defaultTitle,
    documentContent: '<p>Start typing your lecture notes here...</p>',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await db.put(DOCUMENTS_STORE, newDoc);
  return newDoc;
}

export async function saveDocument(videoId: string, title: string, content: string): Promise<void> {
  const db = await openNullNoteDB();
  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite');
  const store = tx.objectStore(DOCUMENTS_STORE);
  const doc = await store.get(videoId);
  
  if (doc) {
    doc.videoTitle = title;
    doc.documentContent = content;
    doc.updatedAt = Date.now();
    await store.put(doc);
  } else {
    await store.put({
      videoId,
      videoTitle: title,
      documentContent: content,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  await tx.done;
}

export async function saveVideoTitle(videoId: string, title: string) {
  const db = await openNullNoteDB();
  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite');
  const store = tx.objectStore(DOCUMENTS_STORE);
  const doc = await store.get(videoId);
  if (doc) {
    doc.videoTitle = title;
    doc.updatedAt = Date.now();
    await store.put(doc);
  }
  await tx.done;
}

export async function saveScreenshotBlob(id: string, videoId: string, timestamp: number, blob: Blob, note?: string): Promise<void> {
  const db = await openNullNoteDB();
  const record: ScreenshotRecord = {
    id,
    videoId,
    timestamp,
    imageBlob: blob,
    note,
    createdAt: Date.now()
  };
  await db.put(SCREENSHOTS_STORE, record);
}

export async function getScreenshotsForVideo(videoId: string): Promise<ScreenshotRecord[]> {
  const db = await openNullNoteDB();
  const screenshots = await db.getAllFromIndex(SCREENSHOTS_STORE, 'videoId', videoId);
  return screenshots as ScreenshotRecord[];
}

export async function saveMarkerRecord(id: string, videoId: string, timestamp: number, note: string, icon?: string): Promise<void> {
  const db = await openNullNoteDB();
  const record: MarkerRecord = {
    id,
    videoId,
    timestamp,
    note,
    icon,
    createdAt: Date.now()
  };
  await db.put(MARKERS_STORE, record);
}

export async function getMarkersForVideo(videoId: string): Promise<MarkerRecord[]> {
  const db = await openNullNoteDB();
  const markers = await db.getAllFromIndex(MARKERS_STORE, 'videoId', videoId);
  return markers as MarkerRecord[];
}

export async function pruneOrphanedRecords(videoId: string, activeScreenshotIds: string[], activeMarkerIds: string[]): Promise<void> {
  const db = await openNullNoteDB();

  // Prune Screenshots
  const txS = db.transaction(SCREENSHOTS_STORE, 'readwrite');
  const storeS = txS.objectStore(SCREENSHOTS_STORE);
  const screenshots = await storeS.index('videoId').getAll(videoId);
  for (const s of screenshots) {
    if (!activeScreenshotIds.includes(s.id)) {
      await storeS.delete(s.id);
    }
  }
  await txS.done;

  // Prune Markers
  const txM = db.transaction(MARKERS_STORE, 'readwrite');
  const storeM = txM.objectStore(MARKERS_STORE);
  const markers = await storeM.index('videoId').getAll(videoId);
  for (const m of markers) {
    if (!activeMarkerIds.includes(m.id)) {
      await storeM.delete(m.id);
    }
  }
  await txM.done;
}

export async function getAutoCaptureEnabled(): Promise<boolean> {
  const db = await openNullNoteDB();
  const setting = await db.get(SETTINGS_STORE, AUTO_CAPTURE_KEY);
  return setting?.value === true;
}

export async function setAutoCaptureEnabled(enabled: boolean): Promise<void> {
  const db = await openNullNoteDB();
  await db.put(SETTINGS_STORE, { id: AUTO_CAPTURE_KEY, value: enabled });
}

export async function getAutoCaptureInterval(): Promise<number> {
  const db = await openNullNoteDB();
  const setting = await db.get(SETTINGS_STORE, AUTO_CAPTURE_INTERVAL_KEY);
  return typeof setting?.value === 'number' ? setting.value : DEFAULT_CAPTURE_INTERVAL;
}

export async function setAutoCaptureInterval(interval: number): Promise<void> {
  const db = await openNullNoteDB();
  await db.put(SETTINGS_STORE, { id: AUTO_CAPTURE_INTERVAL_KEY, value: interval });
}

export async function getSelectedMarkerIcon(): Promise<string> {
  return getSetting<string>(SETTINGS_SELECTED_MARKER_ICON, DEFAULT_MARKER_ICON);
}

export async function setSelectedMarkerIcon(icon: string): Promise<void> {
  return setSetting(SETTINGS_SELECTED_MARKER_ICON, icon);
}

// ─── GENERIC SETTINGS HELPER ───────────────────────────────────────────────

async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const db = await openNullNoteDB();
  const setting = await db.get(SETTINGS_STORE, key);
  return setting?.value !== undefined ? (setting.value as T) : defaultValue;
}

async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await openNullNoteDB();
  await db.put(SETTINGS_STORE, { id: key, value });
}

// ─── SETTINGS PAGE ACCESSORS ───────────────────────────────────────────────


export async function getDefaultExportFormat(): Promise<'pdf' | 'docs'> {
  return getSetting<'pdf' | 'docs'>(SETTINGS_DEFAULT_EXPORT_FORMAT, 'pdf');
}
export async function setDefaultExportFormat(v: 'pdf' | 'docs') {
  return setSetting(SETTINGS_DEFAULT_EXPORT_FORMAT, v);
}

export async function getIncludeTimestamps(): Promise<boolean> {
  return getSetting<boolean>(SETTINGS_INCLUDE_TIMESTAMPS, true);
}
export async function setIncludeTimestamps(v: boolean) {
  return setSetting(SETTINGS_INCLUDE_TIMESTAMPS, v);
}

export async function getIncludeScreenshots(): Promise<boolean> {
  return getSetting<boolean>(SETTINGS_INCLUDE_SCREENSHOTS, true);
}
export async function setIncludeScreenshots(v: boolean) {
  return setSetting(SETTINGS_INCLUDE_SCREENSHOTS, v);
}

export async function getImageOutlineEnabled(): Promise<boolean> {
  return getSetting<boolean>(SETTINGS_IMAGE_OUTLINE, true);
}
export async function setImageOutlineEnabled(v: boolean) {
  return setSetting(SETTINGS_IMAGE_OUTLINE, v);
}

export async function getAutosnapOnOpen(): Promise<boolean> {
  return getSetting<boolean>(SETTINGS_AUTOSNAP_ON_OPEN, false);
}
export async function setAutosnapOnOpen(v: boolean) {
  return setSetting(SETTINGS_AUTOSNAP_ON_OPEN, v);
}

// ─── DATA MANAGEMENT ───────────────────────────────────────────────────────

export async function getStorageStats(): Promise<{ documents: number; screenshots: number; markers: number }> {
  const db = await openNullNoteDB();
  const [documents, screenshots, markers] = await Promise.all([
    db.count(DOCUMENTS_STORE),
    db.count(SCREENSHOTS_STORE),
    db.count(MARKERS_STORE),
  ]);
  return { documents, screenshots, markers };
}

export async function clearAllData(): Promise<void> {
  const db = await openNullNoteDB();
  await Promise.all([
    db.clear(DOCUMENTS_STORE),
    db.clear(SCREENSHOTS_STORE),
    db.clear(MARKERS_STORE),
  ]);
}

export async function exportAllDataAsJson(): Promise<string> {
  const db = await openNullNoteDB();
  const [documents, markers] = await Promise.all([
    db.getAll(DOCUMENTS_STORE),
    db.getAll(MARKERS_STORE),
  ]);
  // Screenshots are binary blobs — export metadata only
  const screenshotsMeta = await db.getAll(SCREENSHOTS_STORE);
  const screenshotsClean = screenshotsMeta.map(s => ({
    id: s.id, videoId: s.videoId, timestamp: s.timestamp, note: s.note, createdAt: s.createdAt
  }));
  return JSON.stringify({ exportedAt: new Date().toISOString(), documents, markers, screenshots: screenshotsClean }, null, 2);
}

export async function getAllDocuments(): Promise<DocumentRecord[]> {
  const db = await openNullNoteDB();
  const docs = await db.getAll(DOCUMENTS_STORE);
  return docs as DocumentRecord[];
}

export async function deleteDocument(videoId: string): Promise<void> {
  const db = await openNullNoteDB();
  const tx = db.transaction([DOCUMENTS_STORE, SCREENSHOTS_STORE, MARKERS_STORE], 'readwrite');
  
  // Delete the document record itself
  await tx.objectStore(DOCUMENTS_STORE).delete(videoId);
  
  // Delete all screenshots associated with this videoId
  const storeS = tx.objectStore(SCREENSHOTS_STORE);
  const screenshots = await storeS.index('videoId').getAll(videoId);
  for (const s of screenshots) {
    await storeS.delete(s.id);
  }
  
  // Delete all markers associated with this videoId
  const storeM = tx.objectStore(MARKERS_STORE);
  const markers = await storeM.index('videoId').getAll(videoId);
  for (const m of markers) {
    await storeM.delete(m.id);
  }
  
  await tx.done;
}

export async function getVisibilitySettings(): Promise<{ showMarkers: boolean; showManualScreenshots: boolean; showAutoScreenshots: boolean }> {
  const [showMarkers, showManualScreenshots, showAutoScreenshots] = await Promise.all([
    getSetting<boolean>('showMarkers', true),
    getSetting<boolean>('showManualScreenshots', true),
    getSetting<boolean>('showAutoScreenshots', true)
  ]);
  return { showMarkers, showManualScreenshots, showAutoScreenshots };
}

export async function setVisibilitySetting(key: 'showMarkers' | 'showManualScreenshots' | 'showAutoScreenshots', value: boolean): Promise<void> {
  return setSetting(key, value);
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────

export async function getOnboardingCompleted(): Promise<boolean> {
  return getSetting<boolean>(SETTINGS_ONBOARDING_COMPLETED, false);
}

export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  return setSetting(SETTINGS_ONBOARDING_COMPLETED, completed);
}

export async function getOnboardingDismissed(): Promise<boolean> {
  return getSetting<boolean>(SETTINGS_ONBOARDING_DISMISSED, false);
}

export async function setOnboardingDismissed(dismissed: boolean): Promise<void> {
  return setSetting(SETTINGS_ONBOARDING_DISMISSED, dismissed);
}

