import { openNullNoteDB } from './db';
import { SETTINGS_STORE, SETTINGS_GOOGLE_DRIVE_STATE } from '@/utils/constants';

export interface GoogleAccountInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface DriveConnectionState {
  connected: boolean;
  account?: GoogleAccountInfo;
  rootFolderId?: string;
  rootFolderName: 'NullNote';
  connectedAt?: number;
  updatedAt?: number;
  lastError?: string;
}

const DEFAULT_STATE: DriveConnectionState = {
  connected: false,
  rootFolderName: 'NullNote',
};

export async function getDriveConnectionState(): Promise<DriveConnectionState> {
  const db = await openNullNoteDB();
  const state = await db.get(SETTINGS_STORE, SETTINGS_GOOGLE_DRIVE_STATE);
  return (state as DriveConnectionState) || DEFAULT_STATE;
}

export async function setDriveConnectionState(state: Partial<DriveConnectionState>): Promise<DriveConnectionState> {
  const current = await getDriveConnectionState();
  const newState = { ...current, ...state, updatedAt: Date.now() };
  const db = await openNullNoteDB();
  await db.put(SETTINGS_STORE, newState, SETTINGS_GOOGLE_DRIVE_STATE);
  return newState;
}

export async function clearDriveConnectionState(): Promise<void> {
  const db = await openNullNoteDB();
  await db.put(SETTINGS_STORE, DEFAULT_STATE, SETTINGS_GOOGLE_DRIVE_STATE);
}
