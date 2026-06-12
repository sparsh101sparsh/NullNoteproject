export type EntryType = 'highlight' | 'screenshot' | 'autoCapture';

export interface VideoRecord {
  id: string;
  url: string;
  title: string;
  duration: number;
  thumbnail?: string;
  lastUpdatedAt: number;
  createdAt: number;
}

export interface HighlightRecord {
  id: string;
  videoId: string;
  videoUrl: string;
  videoTitle: string;
  timestamp: number;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScreenshotRecord {
  id: string;
  videoId: string;
  videoUrl: string;
  videoTitle: string;
  timestamp: number;
  imageData: string;
  note?: string;
  ocrText: string;
  source: 'manual' | 'auto';
  createdAt: number;
}

export interface SettingRecord {
  id: string;
  value: string | number | boolean;
}

export interface NotebookEntry {
  id: string;
  entryType: EntryType;
  videoId: string;
  videoUrl: string;
  videoTitle: string;
  timestamp: number;
  note?: string;
  icon?: string;
  imageData?: string;
  ocrText?: string;
  source?: 'manual' | 'auto';
  createdAt: number;
}

