import { AuthService } from './AuthService';

export class GoogleDriveService {
  /**
   * Helper to perform a REST call with an access token.
   * If a 401 Unauthorized occurs, it attempts to clear the cached token and retry once.
   */
  static async request(url: string, options: RequestInit = {}): Promise<Response> {
    let token = await AuthService.getAuthToken(false);
    
    let res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });

    // If unauthorized, the token might be expired. Remove it from cache and retry once.
    if (res.status === 401) {
      await AuthService.removeCachedAuthToken(token);
      token = await AuthService.getAuthToken(true); // Retry interactively just in case
      res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`
        }
      });
    }

    return res;
  }

  /**
   * Wrapper for parsing JSON response from a Drive API call
   */
  static async requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
    const res = await this.request(url, options);
    if (!res.ok) {
      let errorData = '';
      try {
        const errJson = await res.json();
        errorData = JSON.stringify(errJson);
      } catch {
        errorData = await res.text();
      }
      throw new Error(`Drive API Error: ${res.status} ${res.statusText} - ${errorData}`);
    }
    return res.json();
  }
}
