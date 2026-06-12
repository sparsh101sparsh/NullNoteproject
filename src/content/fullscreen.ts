/**
 * FullscreenManager — NullNote
 *
 * Owns ALL fullscreen detection and lifecycle logic.
 *
 * Design decisions:
 * - Listens to both standard `fullscreenchange` and webkit-prefixed variant
 *   for Safari compatibility.
 * - Uses capture-phase keydown listener to intercept ESC before YouTube's
 *   handler runs, so first ESC closes sidebar and second ESC exits fullscreen.
 * - Injects the sidebar toggle button into `.ytp-right-controls` before the
 *   settings button — same position YouTube uses for its Gemini button.
 * - The MutationObserver re-injects the button if YouTube wipes the controls
 *   (happens during ads, quality changes, etc.).
 */

import { createFullscreenPanelButton } from './ui';

export interface FullscreenCallbacks {
  /** Called when fullscreen is entered — overlay should be prepared */
  onEnter: () => void;
  /** Called when fullscreen is exited — overlay should be hidden/destroyed */
  onExit: () => void;
  /** Called when the injected button is clicked — should toggle overlay */
  onToggle: () => void;
  /** Returns whether the overlay is currently open — used for ESC interception */
  isOverlayOpen: () => boolean;
}

const FS_BUTTON_CLASS = 'nullnote-fs-toggle-btn';

export class FullscreenManager {
  private callbacks: FullscreenCallbacks | null = null;
  private controlsObserver: MutationObserver | null = null;
  private escListener: ((e: KeyboardEvent) => void) | null = null;
  private fsChangeListener: (() => void) | null = null;
  private _isActive = false;

  /** Wire up fullscreen detection. Call once after page is ready. */
  init(callbacks: FullscreenCallbacks): void {
    this.callbacks = callbacks;

    this.fsChangeListener = this._handleFullscreenChange.bind(this);
    document.addEventListener('fullscreenchange', this.fsChangeListener);
    document.addEventListener('webkitfullscreenchange', this.fsChangeListener);

    // ESC interception — capture phase runs before YouTube's listener
    this.escListener = this._handleEscape.bind(this);
    document.addEventListener('keydown', this.escListener, true);
  }

  isActive(): boolean {
    return this._isActive;
  }

  /** Force-check current fullscreen state (useful after SPA navigation or controls mutation) */
  checkState(): void {
    const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
    const isNowFullscreen = Boolean(fsEl);
    if (isNowFullscreen) {
      if (!this._isActive) {
        this._isActive = true;
        this.callbacks?.onEnter();
      }
      this.injectButton();
      this._watchControls();
    } else {
      if (this._isActive) {
        this._onExit();
      }
    }
  }

  /** Remove all listeners and observers. Call on SPA navigation cleanup. */
  destroy(): void {
    if (this.fsChangeListener) {
      document.removeEventListener('fullscreenchange', this.fsChangeListener);
      document.removeEventListener('webkitfullscreenchange', this.fsChangeListener);
      this.fsChangeListener = null;
    }
    if (this.escListener) {
      document.removeEventListener('keydown', this.escListener, true);
      this.escListener = null;
    }
    this._disconnectControlsObserver();
    this.removeButton();
    this._isActive = false;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _handleFullscreenChange(): void {
    const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
    if (fsEl) {
      this._onEnter();
    } else {
      this._onExit();
    }
  }

  private _onEnter(): void {
    this._isActive = true;
    this.callbacks?.onEnter();
    // Delay slightly — YouTube finishes rendering controls after fullscreen transition
    setTimeout(() => {
      this.injectButton();
      this._watchControls();
    }, 400);
  }

  private _onExit(): void {
    this._isActive = false;
    this._disconnectControlsObserver();
    this.removeButton();
    this.callbacks?.onExit();
  }

  /** Inject the NullNote toggle button into YouTube's right controls */
  injectButton(): void {
    if (!this._isActive) return;

    // Idempotent — never inject twice
    if (document.querySelector(`.${FS_BUTTON_CLASS}`)) return;

    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) {
      console.warn('[NullNote] .ytp-right-controls not found — will retry via observer');
      return;
    }

    const btn = createFullscreenPanelButton();
    btn.classList.add(FS_BUTTON_CLASS);
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent YouTube from intercepting click
      this.callbacks?.onToggle();
    });

    // Insert before the settings button (same position as Gemini)
    const settingsBtn = rightControls.querySelector('.ytp-settings-button');
    if (settingsBtn && settingsBtn.parentNode === rightControls) {
      rightControls.insertBefore(btn, settingsBtn);
    } else {
      rightControls.appendChild(btn);
    }

    console.log('[NullNote] Fullscreen button injected');
  }

  removeButton(): void {
    document.querySelectorAll(`.${FS_BUTTON_CLASS}`).forEach(el => el.remove());
  }

  /**
   * Watch `.ytp-right-controls` for mutations.
   * YouTube recreates these elements during ads, quality changes, etc.
   * If our button disappears, we re-inject it.
   */
  private _watchControls(): void {
    this._disconnectControlsObserver();

    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    let debounceTimer: number | null = null;

    this.controlsObserver = new MutationObserver(() => {
      if (!this._isActive) return;
      // Debounce — YouTube can fire many rapid mutations
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        if (!document.querySelector(`.${FS_BUTTON_CLASS}`)) {
          console.log('[NullNote] Fullscreen button missing — re-injecting');
          this.injectButton();
        }
      }, 150);
    });

    this.controlsObserver.observe(rightControls, {
      childList: true,
      subtree: false,
    });
  }

  private _disconnectControlsObserver(): void {
    if (this.controlsObserver) {
      this.controlsObserver.disconnect();
      this.controlsObserver = null;
    }
  }

  /**
   * Capture-phase ESC listener.
   *
   * Priority:
   *   1. Overlay open + fullscreen active → close overlay, keep fullscreen
   *   2. Overlay closed + fullscreen active → let YouTube exit fullscreen
   */
  private _handleEscape(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (!this._isActive) return;
    if (this.callbacks?.isOverlayOpen()) {
      // Stop YouTube from handling this ESC — we consume it to close the overlay
      e.stopImmediatePropagation();
      this.callbacks.onToggle(); // close overlay
    }
    // else: let ESC propagate so YouTube exits fullscreen normally
  }
}
