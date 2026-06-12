/**
 * LayoutManager — NullNote Fixed Workspace Mode
 *
 * Implements a pure DOM relocation pattern without touching the browser's 
 * Fullscreen API. The workspace is a `position: fixed` overlay that covers
 * the viewport, forcing YouTube's native ResizeObserver to seamlessly handle
 * the player scaling internally.
 */

const WORKSPACE_ID = 'nullnote-fs-workspace';

export class LayoutManager {
  private workspace: HTMLElement | null = null;
  private videoHost: HTMLElement | null = null;
  private sidebarHost: HTMLElement | null = null;

  private player: HTMLElement | null = null;
  private originalParent: HTMLElement | null = null;
  private originalNextSibling: Node | null = null;

  private _isOpen = false;

  isOpen(): boolean {
    return this._isOpen;
  }

  show(): void {
    if (this._isOpen) return;

    this.player = document.getElementById('movie_player');
    if (!this.player || !this.player.parentElement) {
      console.warn('[NullNote] Player element not found or has no parent');
      return;
    }

    this._isOpen = true;

    if (!document.getElementById('nullnote-workspace-styles')) {
      this._injectStyles();
    }

    // 1. Cache original DOM location
    this.originalParent = this.player.parentElement;
    this.originalNextSibling = this.player.nextSibling;

    // 2. Build the fixed workspace
    if (!this.workspace) {
      this._buildWorkspace();
    }

    // 3. Move the YouTube player into the video host
    this.videoHost?.appendChild(this.player);

    // 4. Prevent body scrolling
    document.body.style.overflow = 'hidden';

    // 5. Force YouTube's native layout engine to recalculate constraints
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);

    console.log('[NullNote] Workspace active — player relocated natively into fixed viewport');
  }

  hide(): void {
    if (!this._isOpen) return;
    this._isOpen = false;

    // 1. Safely restore YouTube player to its original DOM location
    if (this.player && this.originalParent) {
      // Ensure the original parent is still in the document (YouTube SPA safety)
      if (document.body.contains(this.originalParent)) {
        if (this.originalNextSibling && this.originalParent.contains(this.originalNextSibling)) {
          this.originalParent.insertBefore(this.player, this.originalNextSibling);
        } else {
          this.originalParent.appendChild(this.player);
        }
      } else {
        // Fallback if YouTube tore down the tree while we were in workspace
        const container = document.getElementById('player-container-inner') || document.getElementById('ytd-player');
        container?.appendChild(this.player);
      }
    }

    // 2. Restore body scrolling
    document.body.style.overflow = '';

    // 3. Trigger resize to let YouTube natively restore its layout
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);

    // 4. Cleanup
    this.workspace?.remove();
    this.workspace = null;
    this.videoHost = null;
    this.sidebarHost = null;
    this.originalParent = null;
    this.originalNextSibling = null;
    this.player = null;

    console.log('[NullNote] Workspace closed — DOM restored');
  }

  toggle(): void {
    if (this._isOpen) this.hide(); else this.show();
  }

  destroy(): void {
    this.hide();
    document.getElementById('nullnote-workspace-styles')?.remove();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _buildWorkspace(): void {
    this.workspace = document.createElement('div');
    this.workspace.id = WORKSPACE_ID;

    this.videoHost = document.createElement('div');
    this.videoHost.className = 'nullnote-video-host';

    this.sidebarHost = document.createElement('div');
    this.sidebarHost.className = 'nullnote-sidebar-host';

    // ── Header bar ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'nullnote-fs-header';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'nullnote-fs-close';
    closeBtn.title = 'Close Workspace (ESC)';
    closeBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>`;
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });

    header.appendChild(closeBtn);

    // ── Iframe ──────────────────────────────────────────────────────────────
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('src/sidepanel/index.html');
    iframe.title = 'NullNote';
    iframe.className = 'nullnote-fs-iframe';
    iframe.setAttribute('allow', 'clipboard-write');

    this.sidebarHost.appendChild(header);
    this.sidebarHost.appendChild(iframe);

    this.workspace.appendChild(this.videoHost);
    this.workspace.appendChild(this.sidebarHost);

    // Append workspace to body
    document.body.appendChild(this.workspace);
  }

  private _injectStyles(): void {
    const style = document.createElement('style');
    style.id = 'nullnote-workspace-styles';
    style.textContent = `
      :root {
        --nullnote-sidebar-width: 440px;
      }

      /* Compact mode for narrower screens */
      @media (max-width: 1200px) {
        :root {
          --nullnote-sidebar-width: 340px;
        }
      }

      /* ---- FIXED WORKSPACE (Zero Native Fullscreen) ---- */
      #nullnote-fs-workspace {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: grid;
        grid-template-columns: 1fr var(--nullnote-sidebar-width);
        background: #000;
        z-index: 2147483647; /* Absolute maximum z-index allowed by browsers */
      }

      .nullnote-video-host {
        width: 100%;
        height: 100%;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
      }

      /* Ensure the moved YouTube player exactly fills the host container natively */
      .nullnote-video-host #movie_player {
        width: 100% !important;
        height: 100% !important;
        position: relative !important;
      }

      /* Prevent user from accidentally triggering native fullscreen over our workspace */
      .nullnote-video-host .ytp-fullscreen-button {
        display: none !important;
      }

      .nullnote-sidebar-host {
        width: var(--nullnote-sidebar-width);
        flex-shrink: 0;
        height: 100%;
        background: #fff;
        border-left: 1px solid rgba(0,0,0,0.1);
        display: flex;
        flex-direction: column;
        position: relative;
      }

      /* Header */
      .nullnote-fs-header {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 8px 14px 4px;
        background: #fff;
        border-bottom: none;
        flex-shrink: 0;
      }
      .nullnote-fs-close {
        width: 28px;
        height: 28px;
        background: rgba(0,0,0,0.07);
        border: none;
        border-radius: 7px;
        color: #475569;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }
      .nullnote-fs-close:hover {
        background: rgba(0,0,0,0.14);
        color: #0f172a;
      }
      .nullnote-fs-iframe {
        flex: 1;
        width: 100%;
        border: none;
        background: #fff;
        display: block;
      }
    `;
    document.head.appendChild(style);
  }
}
