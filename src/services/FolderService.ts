import { GoogleDriveService } from './GoogleDriveService';

export class FolderService {
  /**
   * Searches for a non-trashed folder named 'NullNote' using the Google Drive API.
   * If multiple folders exist, returns the oldest one based on creation time.
   * If none exist, returns null.
   */
  static async findNullNoteRootFolder(): Promise<any | null> {
    const query = "name = 'NullNote' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime`;
    
    const response = await GoogleDriveService.requestJson<any>(url);
    if (response.files && response.files.length > 0) {
      // Return the oldest one (first in the ascending list)
      return response.files[0];
    }
    return null;
  }

  /**
   * Creates a new folder named 'NullNote' in the root of the user's Drive.
   */
  static async createNullNoteRootFolder(): Promise<any> {
    const url = 'https://www.googleapis.com/drive/v3/files';
    const body = {
      name: 'NullNote',
      mimeType: 'application/vnd.google-apps.folder'
    };

    const response = await GoogleDriveService.requestJson<any>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    return response;
  }

  /**
   * Ensures the 'NullNote' root folder exists, reusing the oldest match if it does.
   */
  static async ensureNullNoteRootFolder(): Promise<any> {
    const existingFolder = await this.findNullNoteRootFolder();
    if (existingFolder) {
      return existingFolder;
    }
    return await this.createNullNoteRootFolder();
  }
}
