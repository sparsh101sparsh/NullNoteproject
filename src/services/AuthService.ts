export class AuthService {
  /**
   * Gets an OAuth2 token using chrome.identity.
   * If interactive is true, prompts the user to log in if not already logged in.
   */
  static async getAuthToken(interactive: boolean = false): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!token) {
          return reject(new Error('Failed to obtain auth token.'));
        }
        resolve(token);
      });
    });
  }

  /**
   * Removes a cached auth token. Useful when a token has expired or becomes invalid.
   */
  static async removeCachedAuthToken(token: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        resolve();
      });
    });
  }

  /**
   * Clears all cached auth tokens. Used during disconnect.
   */
  static async clearAllCachedAuthTokens(): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.identity.clearAllCachedAuthTokens(() => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  /**
   * Fetches the user's Google account info (email, name, picture)
   */
  static async getUserInfo(token: string): Promise<any> {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
