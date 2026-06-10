import { openDB, type IDBPDatabase } from 'idb';
import { STORAGE_DB_NAME, STORAGE_DB_VERSION, DOCUMENTS_STORE, SCREENSHOTS_STORE, MARKERS_STORE, SETTINGS_STORE } from '@/utils/constants';

export interface NullNoteDB extends IDBPDatabase<unknown> {
  readonly name: string;
  readonly version: number;
}

export async function openNullNoteDB() {
  const db = await openDB<NullNoteDB>(STORAGE_DB_NAME, STORAGE_DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(DOCUMENTS_STORE)) {
        database.createObjectStore(DOCUMENTS_STORE, { keyPath: 'videoId' });
      }
      if (!database.objectStoreNames.contains(SCREENSHOTS_STORE)) {
        const screenshotStore = database.createObjectStore(SCREENSHOTS_STORE, { keyPath: 'id' });
        screenshotStore.createIndex('videoId', 'videoId');
      }
      if (!database.objectStoreNames.contains(MARKERS_STORE)) {
        const markerStore = database.createObjectStore(MARKERS_STORE, { keyPath: 'id' });
        markerStore.createIndex('videoId', 'videoId');
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
      }
    },
  });

  return db;
}
