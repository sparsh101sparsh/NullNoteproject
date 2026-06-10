/**
 * OverlayManager — NullNote (v3, JS-forced inline styles)
 *
 * Previous attempts failed because:
 *   v1: padding-right on parent → ignored by position:absolute children
 *   v2: CSS class with right:440px !important → YouTube's own JS (ResizeObserver)
 *       re-applies its own inline styles AFTER our stylesheet rule, overriding it.
 *
 * Definitive fix:
 *   Use element.style.setProperty('right', '440px', 'important') in JavaScript.
 *   Inline styles set via setProperty with 'important' flag win over EVERYTHING —
 *   including YouTube's own !important rules set by their ResizeObserver callbacks.
 *   This is identical to what a devtools "Force value" does.
 *
 * Layout:
 *   ┌────────────────────────────────────────────┬──────────────┐
 *   │  .html5-video-container  (right:440px)     │  Our panel   │
 *   │  .ytp-chrome-bottom      (right:440px)     │  pos:abs     │
 *   │  .ytp-gradient-*         (right:440px)     │  right:0     │
 *   │                                            │  w:440px     │
 *   └────────────────────────────────────────────┴──────────────┘
 *   └──────────────── #movie_player (100vw × 100vh) ────────────┘
 */

const OVERLAY_ID  = 'nullnote-fs-overlay';
const PANEL_WIDTH = 440; // px

/** Selectors for every YouTube layer that needs its right edge pulled in */
const VIDEO_LAYERS = [
  '.html5-video-container',
  '.ytp-chrome-bottom',
  '.ytp-gradient-top',
  '.ytp-gradient-bottom',
  '.ytp-chrome-top',
  '.ytp-bezel-wrapper',
  '.ytp-spinner',
  '.iv-module-container',
] as const;

const TRANSITION = 'right 300ms cubic-bezier(0.4, 0, 0.2, 1)';

export class OverlayManager {
  private overlay: HTMLElement | null = null;
  private player:  HTMLElement | null = null;
  /** Stores original right values so we can restore them cleanly */
  private savedRights = new Map<HTMLElement, string>();
  private _isOpen = false;

  isOpen(): boolean { return this._isOpen; }

  show(): void {
    if (this._isOpen) return;

    // Locate the fullscreen player
    this.player =
      (document.fullscreenElement as HTMLElement | null) ??
      ((document as any).webkitFullscreenElement as HTMLElement | null) ??
      document.getElementById('movie_player');

    if (!this.player) {
      console.warn('[NullNote] Fullscreen player element not found');
      return;
    }

    // Ensure styles + panel exist
    if (!document.getElementById('nullnote-overlay-styles')) {
      this._injectStyles();
    }
    if (!this.overlay || !this.player.contains(this.overlay)) {
      this._build(this.player);
    }

    // ── Step 1: compress YouTube's internal layers via JS inline styles ──────
    this._pushLayersRight(PANEL_WIDTH);

    // ── Step 2: open panel (next frame → triggers CSS transition) ───────────
    requestAnimationFrame(() => {
      this.overlay?.classList.add('nullnote-open');
    });

    this._isOpen = true;
    console.log('[NullNote] FS overlay open — layers compressed via inline style');
  }

  hide(): void {
    if (!this._isOpen) return;

    // Slide panel out
    this.overlay?.classList.remove('nullnote-open');

    // Restore YouTube layers after animation
    setTimeout(() => {
      this._restoreLayers();
    }, 310);

    this._isOpen = false;
    console.log('[NullNote] FS overlay closed — layers restored');
  }

  toggle(): void {
    if (this._isOpen) this.hide(); else this.show();
  }

  destroy(): void {
    this._restoreLayers();
    this.overlay?.remove();
    this.overlay = null;
    this.player = null;
    document.getElementById('nullnote-overlay-styles')?.remove();
    this._isOpen = false;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Force-set right:Npx on every YouTube layer using JS setProperty('important').
   * Also forces the video element to fit its new container (YouTube's JS sets
   * explicit pixel dimensions that overflow the resized container otherwise).
   */
  private _pushLayersRight(rightPx: number): void {
    if (!this.player) return;
    this.savedRights.clear();

    VIDEO_LAYERS.forEach(selector => {
      const el = this.player!.querySelector<HTMLElement>(selector);
      if (!el) return;
      this.savedRights.set(el, el.style.right);
      el.style.setProperty('transition', TRANSITION, 'important');
      el.style.setProperty('right', `${rightPx}px`, 'important');
      // Prevent video from overflowing the narrowed container
      if (selector === '.html5-video-container') {
        el.style.setProperty('overflow', 'hidden', 'important');
      }
    });

    // Force the <video> element to scale within the narrowed container.
    // YouTube's JS sets explicit px width/height — override with 100%/contain.
    const video = this.player.querySelector<HTMLVideoElement>('video');
    if (video) {
      this.savedRights.set(video, video.style.right);
      video.style.setProperty('width',       '100%',    'important');
      video.style.setProperty('height',      '100%',    'important');
      video.style.setProperty('max-width',   '100%',    'important');
      video.style.setProperty('max-height',  '100%',    'important');
      video.style.setProperty('left',        '0',       'important');
      video.style.setProperty('top',         '0',       'important');
      video.style.setProperty('object-fit',  'contain', 'important');
      video.style.setProperty('position',    'absolute','important');
    }

    // Trigger YouTube's resize handler so it recalculates player dimensions
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
  }

  /** Remove our inline overrides — YouTube's own code re-takes control */
  private _restoreLayers(): void {
    this.savedRights.forEach((originalRight, el) => {
      el.style.removeProperty('right');
      el.style.removeProperty('transition');
      el.style.removeProperty('overflow');
      // Video-specific overrides
      if (el.tagName === 'VIDEO') {
        el.style.removeProperty('width');
        el.style.removeProperty('height');
        el.style.removeProperty('max-width');
        el.style.removeProperty('max-height');
        el.style.removeProperty('left');
        el.style.removeProperty('top');
        el.style.removeProperty('object-fit');
        el.style.removeProperty('position');
      }
      if (originalRight) el.style.right = originalRight;
    });
    this.savedRights.clear();
    // Let YouTube recalculate original layout
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  }


  private _build(player: HTMLElement): void {
    this.overlay = document.createElement('div');
    this.overlay.id = OVERLAY_ID;
    this.overlay.className = 'nullnote-fs-panel';

    // ── Header bar ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'nullnote-fs-header';

    const brand = document.createElement('div');
    brand.className = 'nullnote-fs-brand';

    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('icons/icon-128.png');
    logo.alt = '';
    logo.className = 'nullnote-fs-logo';

    const label = document.createElement('span');
    label.textContent = 'NullNote';
    brand.appendChild(logo);
    brand.appendChild(label);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'nullnote-fs-close';
    closeBtn.title = 'Close (ESC)';
    closeBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>`;
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });

    header.appendChild(brand);
    header.appendChild(closeBtn);

    // ── Iframe ──────────────────────────────────────────────────────────────
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('src/sidepanel/index.html');
    iframe.title = 'NullNote';
    iframe.className = 'nullnote-fs-iframe';
    iframe.setAttribute('allow', 'clipboard-write');

    this.overlay.appendChild(header);
    this.overlay.appendChild(iframe);

    // Must be inside the fullscreen element to be visible in fullscreen
    player.appendChild(this.overlay);
  }

  private _injectStyles(): void {
    const W = PANEL_WIDTH;
    const style = document.createElement('style');
    style.id = 'nullnote-overlay-styles';
    style.textContent = `
      /* Panel — position:absolute inside #movie_player, right side */
      .nullnote-fs-panel {
        position: absolute !important;
        top: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: ${W}px !important;
        background: #fff !important;
        border-left: 1px solid rgba(0,0,0,0.10) !important;
        box-shadow: -8px 0 28px rgba(0,0,0,0.22) !important;
        display: flex !important;
        flex-direction: column !important;
        z-index: 9999 !important;
        transform: translateX(100%) !important;
        transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1) !important;
        will-change: transform !important;
        overflow: hidden !important;
        pointer-events: auto !important;
      }
      .nullnote-fs-panel.nullnote-open {
        transform: translateX(0) !important;
      }

      /* Header */
      .nullnote-fs-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 10px 14px !important;
        background: #f8fafc !important;
        border-bottom: 1px solid #e8ecf0 !important;
        flex-shrink: 0 !important;
      }
      .nullnote-fs-brand {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        font-weight: 800 !important;
        font-size: 14px !important;
        color: #0f172a !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      }
      .nullnote-fs-logo {
        width: 22px !important;
        height: 22px !important;
        border-radius: 6px !important;
        object-fit: contain !important;
      }
      .nullnote-fs-close {
        width: 28px !important;
        height: 28px !important;
        background: rgba(0,0,0,0.07) !important;
        border: none !important;
        border-radius: 7px !important;
        color: #475569 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: background 0.15s !important;
      }
      .nullnote-fs-close:hover {
        background: rgba(0,0,0,0.14) !important;
        color: #0f172a !important;
      }
      .nullnote-fs-iframe {
        flex: 1 !important;
        width: 100% !important;
        border: none !important;
        background: #fff !important;
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  }
}
