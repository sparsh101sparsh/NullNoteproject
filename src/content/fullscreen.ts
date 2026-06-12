/**
 * FullscreenManager — NullNote
 *
 * Handles ESC key interception to close the workspace overlay.
 */

export interface FullscreenCallbacks {
  /** Called when the Escape key is used to toggle the overlay */
  onToggle: () => void;
  /** Returns whether the overlay is currently open — used for ESC interception */
  isOverlayOpen: () => boolean;
}

export class FullscreenManager {
  private callbacks: FullscreenCallbacks | null = null;
  private escListener: ((e: KeyboardEvent) => void) | null = null;

  /** Wire up Escape key handler. Call once after page is ready. */
  init(callbacks: FullscreenCallbacks): void {
    this.callbacks = callbacks;

    // ESC interception — capture phase runs before YouTube's listener
    this.escListener = this._handleEscape.bind(this);
    document.addEventListener('keydown', this.escListener, true);
  }

  destroy(): void {
    if (this.escListener) {
      document.removeEventListener('keydown', this.escListener, true);
      this.escListener = null;
    }
  }

  private _handleEscape(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (this.callbacks?.isOverlayOpen()) {
      // Stop YouTube/browser from handling this ESC — we consume it to close the overlay
      e.stopImmediatePropagation();
      e.preventDefault();
      this.callbacks.onToggle(); // close overlay
    }
  }
}
