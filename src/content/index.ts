import { captureVideoFrame } from './screenshot';
import { createTimelineOverlay, renderTimelineMarkers, findProgressContainer } from './timeline';
import { attachKeyboardShortcuts } from './keyboard';
import { createFullscreenPanelButton, createLogoElement } from './ui';
import { STORAGE_MESSAGE_TYPES, DEFAULT_MARKER_ICON } from '@/utils/constants';
import type { NotebookEntry } from '@/utils/types';
import { FullscreenManager } from './fullscreen';
import { LayoutManager } from './layoutManager';

interface PageState {
  video: HTMLVideoElement | null;
  overlay: HTMLElement | null;
  videoId: string;
  highlights: NotebookEntry[];
  autoCaptureEnabled: boolean;
  autoCaptureInterval: number;
  /** Monotonically-increasing session counter. Every tick checks its own session against
   * this value — if they differ the tick was spawned by a stale loop and self-terminates.
   * This is the single mechanism that prevents zombie parallel loops after rapid toggles
   * or async restarts. */
  autoCaptureSessionId: number;
  captureTimer?: number;
  lastAutoCaptureTimestamp: number;
  selectedMarkerIcon: string;
  sidebarOpen: boolean;
  fullscreenWorkspaceOpen: boolean;
  captureInFlight: boolean;
  autoRemainingMs: number;
  autoLastWallClockMs: number;
  autoLastVideoTime: number | null;
  autoLastVideoTime: number | null;
}

const state: PageState = {
  video: null,
  overlay: null,
  videoId: '',
  highlights: [],
  autoCaptureEnabled: false,
  autoCaptureInterval: 30,
  autoCaptureSessionId: 0,
  lastAutoCaptureTimestamp: -1,
  selectedMarkerIcon: DEFAULT_MARKER_ICON,
  sidebarOpen: false,
  fullscreenWorkspaceOpen: false,
  captureInFlight: false,
  autoRemainingMs: 30_000,
  autoLastWallClockMs: 0,
  autoLastVideoTime: null,
};

// Singleton managers — created once per content script lifecycle
const fullscreenManager = new FullscreenManager();
const layoutManager = new LayoutManager();
const FRAME_CAPTURE_TIMEOUT_MS = 5000;
const AUTO_CAPTURE_TICK_MS = 500;
const AUTO_CAPTURE_SEEK_THRESHOLD_SECONDS = 2;

function getVideoIdFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('v') || parsed.pathname || url;
  } catch {
    return url;
  }
}

function isYouTubeShorts(): boolean {
  return window.location.pathname.startsWith('/shorts');
}

function isWatchPage(): boolean {
  return window.location.pathname === '/watch' && !!new URL(window.location.href).searchParams.get('v');
}

function isFrameCaptureReady(video: HTMLVideoElement | null): video is HTMLVideoElement {
  return Boolean(
    video &&
    video.isConnected &&
    video.readyState >= 2 &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  );
}

function getVideoVisibleArea(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  return width * height;
}

function scoreVideoElement(video: HTMLVideoElement): number {
  let score = getVideoVisibleArea(video) * 10;
  if (!video.paused && !video.ended) score += 50_000_000;
  if (video.readyState >= 2) score += 5_000_000;
  if (video.videoWidth > 0 && video.videoHeight > 0) score += Math.min(video.videoWidth * video.videoHeight, 5_000_000);
  if (video.classList.contains('html5-main-video')) score += 1_000_000;
  return score;
}

function getCurrentVideoElement(): HTMLVideoElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLVideoElement>('video'))
    .filter(video => video.isConnected)
    .sort((a, b) => scoreVideoElement(b) - scoreVideoElement(a));

  const nextVideo = candidates[0] ?? null;
  state.video = nextVideo;
  return nextVideo;
}

function isYouTubeAdShowing(): boolean {
  const player = document.getElementById('movie_player');
  return Boolean(
    player?.classList.contains('ad-showing') || 
    document.querySelector('.ad-showing') || 
    document.querySelector('.ytp-ad-player-overlay')
  );
}

function showToast(message: string) {
  let toast = document.getElementById('nullnote-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nullnote-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      z-index: 9999999;
      pointer-events: none;
      transition: opacity 0.3s ease-in-out;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';

  if ((toast as any)._timeout) clearTimeout((toast as any)._timeout);
  (toast as any)._timeout = setTimeout(() => {
    toast!.style.opacity = '0';
  }, 3000);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: number | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => {
      if (timer !== undefined) window.clearTimeout(timer);
    });
  });
}

function emitAutoDebug(event: 'skipped' | 'capturing' | 'captured' | 'error', detail?: Record<string, unknown>) {
  console.debug('[NullNote] AutoSnap', event, detail ?? {});
}

function autoOpenPanelIfNeeded() {
  if (!isWatchPage() || isYouTubeShorts()) return;
  if (document.getElementById('nullnote-inpage-panel')) return;

  // YouTube's sidebar loads asynchronously — retry until it's available
  let attempts = 0;
  const maxAttempts = 15;

  const tryOpen = () => {
    // Already opened by a previous attempt or user action
    if (document.getElementById('nullnote-inpage-panel')) return;

    const sidebar = document.querySelector('#secondary-inner') ||
      document.querySelector('#secondary') ||
      document.querySelector('#related');

    if (sidebar) {
      toggleInPagePanel(true);
      console.log('[NullNote] Auto-opened panel for video');
      return;
    }

    attempts++;
    if (attempts < maxAttempts) {
      setTimeout(tryOpen, 500);
    } else {
      // Last resort — open anyway (will fall back to body)
      toggleInPagePanel(true);
      console.log('[NullNote] Auto-opened panel (fallback)');
    }
  };

  tryOpen();
}

function getVideoMetadata(videoOverride?: HTMLVideoElement | null) {
  const video = videoOverride ?? getCurrentVideoElement();
  return {
    videoId: state.videoId,
    videoUrl: window.location.href,
    videoTitle: document.title.replace(' - YouTube', '').trim(),
    duration: video?.duration || 0,
    timestamp: Math.round(video?.currentTime || 0),
  };
}

// Send message to background (which delivers to all extension pages including sidepanel iframe)
function sendToBus(message: any) {
  console.log('[NullNote] sendToBus:', message.type, message.timestamp, message.source);
  chrome.runtime.sendMessage(message).catch((err) => {
    console.error('[NullNote] sendToBus failed:', err);
  });
}

/**
 * Deliver `message` to the sidepanel reliably.
 * Opens the panel if not already open, then sends the message via the background bus.
 * The background now correctly relays insert-* messages to all extension pages.
 * An optional shouldSend guard is checked immediately before sending.
 */
function ensurePanelOpenAndSend(message: any, shouldSend: () => boolean = () => true) {
  const panel = document.getElementById('nullnote-inpage-panel');
  if (!panel) {
    // Panel just opened — give React a brief moment to mount its message listener.
    // 600ms is generous; the iframe typically loads in ~200-400ms.
    toggleInPagePanel(true);
    setTimeout(() => {
      if (shouldSend()) sendToBus(message);
    }, 600);
  } else {
    if (shouldSend()) sendToBus(message);
  }
}

async function addQuickHighlight() {
  if (isYouTubeAdShowing()) {
    showToast('NullNote markers are unavailable during ads.');
    return;
  }
  const video = getCurrentVideoElement();
  const meta = getVideoMetadata(video);

  const captureId = crypto.randomUUID();

  const message = {
    type: 'insert-marker',
    captureId,
    timestamp: meta.timestamp,
    videoId: meta.videoId,
    icon: state.selectedMarkerIcon,
    source: 'content',
  };

  console.log('[NullNote] Marker triggered — timestamp:', meta.timestamp);

  // Capture a frame from the video at this exact moment to embed in the marker
  let imageData: string | undefined;
  if (isFrameCaptureReady(video)) {
    try {
      imageData = await withTimeout(
        captureVideoFrame(video),
        FRAME_CAPTURE_TIMEOUT_MS,
        'Marker frame capture timed out.'
      );
      console.log('[NullNote] Marker frame captured');
    } catch {
      // Screenshot failed — marker will still be created without image
      console.warn('[NullNote] Marker frame capture failed — creating text-only marker');
    }
  }

  ensurePanelOpenAndSend({ ...message, imageData });
  console.log('[NullNote] Marker message sent with icon:', state.selectedMarkerIcon);
}

async function sendAutoCaptureMessage(enabled: boolean) {
  chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.toggleAutoCapture, payload: enabled }).catch(() => { });
}

async function toggleAutoCapture() {
  state.autoCaptureEnabled = !state.autoCaptureEnabled;
  console.log('[NullNote] AutoSnap toggled:', state.autoCaptureEnabled);
  // Notify background to persist the new state and relay autoCaptureCommand to all tabs.
  // The background will broadcast autoCaptureCommand back to this content script, which
  // will then start/stop the loop via the message handler.
  // DO NOT call startAutoCaptureLoop/stopAutoCaptureLoop here — doing so races with the
  // incoming broadcast and causes duplicate parallel loops.
  sendAutoCaptureMessage(state.autoCaptureEnabled);
  // Eagerly stop immediately to prevent extra captures while waiting for the roundtrip.
  if (!state.autoCaptureEnabled) {
    stopAutoCaptureLoop();
  }
}

function findYouTubeSettingsButton(rightControls: Element): Element | null {
  // Strategy 1: standard selector
  let btn = rightControls.querySelector('.ytp-settings-button');
  if (btn) return btn;

  // Strategy 2: search by aria-label or title (Settings)
  const buttons = rightControls.querySelectorAll('button');
  for (const button of Array.from(buttons)) {
    const label = (button.getAttribute('aria-label') || '').toLowerCase();
    const title = (button.getAttribute('title') || '').toLowerCase();
    if (label.includes('settings') || title.includes('settings')) {
      return button;
    }
  }

  // Strategy 3: lookup by class match or SVG icon inside
  const svgIcons = rightControls.querySelectorAll('svg');
  for (const svg of Array.from(svgIcons)) {
    const useEl = svg.querySelector('use');
    if (useEl && (useEl.getAttribute('href') || '').includes('settings')) {
      const button = svg.closest('button');
      if (button) return button;
    }
  }

  // Strategy 4: fallback to traversal (Settings is usually next to fullscreen)
  const fsButton = rightControls.querySelector('.ytp-fullscreen-button');
  if (fsButton && fsButton.previousElementSibling) {
    return fsButton.previousElementSibling;
  }

  return null;
}

function attachPlayerControls() {
  const rightControls = document.querySelector('.ytp-right-controls');
  if (!rightControls) {
    return;
  }

  const settingsButton = findYouTubeSettingsButton(rightControls);
  if (!settingsButton) {
    return;
  }

  // Remove any pre-existing instances of our custom buttons to avoid duplicates
  document.querySelectorAll('.nullnote-fs-toggle-btn').forEach(el => el.remove());

  // Only show workspace button in native fullscreen mode or when the custom workspace is open
  if (!document.fullscreenElement && !layoutManager.isOpen()) {
    return;
  }

  const workspaceBtn = createFullscreenPanelButton();

  workspaceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    layoutManager.toggle();
  });

  // Safe insertion: always immediately to the right of the Settings button
  const parent = settingsButton.parentNode;
  if (parent && parent.contains(settingsButton)) {
    parent.insertBefore(workspaceBtn, settingsButton.nextSibling);
  } else {
    rightControls.appendChild(workspaceBtn);
  }
}

// ── Native YouTube Action Button ────────────────────────────────────────────
// Injected into the YouTube actions row (Like → Dislike → [NullNote] → Share → Save)
// Matches native YouTube button styling so it feels like a YouTube feature.

function createNullNoteActionButton(): HTMLElement {
  const btn = document.createElement('div');
  btn.id = 'nullnote-yt-action-btn';
  btn.setAttribute('role', 'group');
  btn.setAttribute('aria-label', 'NullNote Action Button');

  btn.style.cssText = `
    display: inline-flex;
    align-items: center;
    height: 36px;
    border-radius: 18px;
    font-family: "Roboto","Arial",sans-serif;
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    user-select: none;
    flex-shrink: 0;
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05));
    color: var(--yt-spec-text-primary, inherit);
    border: none;
    outline: none;
    position: relative;
  `;

  // Left action part: icon + "NullNote" text
  const mainPart = document.createElement('button');
  mainPart.style.cssText = `
    display: inline-flex;
    align-items: center;
    height: 100%;
    padding-left: 16px;
    padding-right: 6px;
    background: transparent;
    border: none;
    outline: none;
    cursor: pointer;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    transition: background 0.1s ease;
    border-top-left-radius: 18px;
    border-bottom-left-radius: 18px;
  `;
  mainPart.setAttribute('aria-label', 'Open NullNote');
  mainPart.setAttribute('title', 'Open NullNote');

  // NullNote logo icon
  const logoContainer = createLogoElement(18);
  logoContainer.style.marginRight = '4px';
  logoContainer.style.filter = 'var(--yt-spec-icon-filter, none)';

  const labelEl = document.createElement('span');
  labelEl.textContent = 'NullNote';

  mainPart.appendChild(logoContainer);
  mainPart.appendChild(labelEl);

  // Right settings part: ⋮ icon
  const menuPart = document.createElement('button');
  menuPart.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding-left: 4px;
    padding-right: 14px;
    background: transparent;
    border: none;
    outline: none;
    cursor: pointer;
    color: inherit;
    font-family: inherit;
    font-size: 15px;
    font-weight: bold;
    transition: background 0.1s ease;
    border-top-right-radius: 18px;
    border-bottom-right-radius: 18px;
  `;
  menuPart.textContent = '⋮';
  menuPart.setAttribute('aria-label', 'NullNote Settings');
  menuPart.setAttribute('title', 'NullNote Settings');

  // Hover effect for mainPart
  mainPart.addEventListener('mouseenter', () => {
    mainPart.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(0,0,0,0.05))';
  });
  mainPart.addEventListener('mouseleave', () => {
    mainPart.style.background = 'transparent';
  });
  mainPart.addEventListener('mousedown', () => {
    mainPart.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(0,0,0,0.10))';
  });
  mainPart.addEventListener('mouseup', () => {
    mainPart.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(0,0,0,0.05))';
  });

  // Hover effect for menuPart
  menuPart.addEventListener('mouseenter', () => {
    menuPart.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(0,0,0,0.05))';
  });
  menuPart.addEventListener('mouseleave', () => {
    menuPart.style.background = 'transparent';
  });
  menuPart.addEventListener('mousedown', () => {
    menuPart.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(0,0,0,0.10))';
  });
  menuPart.addEventListener('mouseup', () => {
    menuPart.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(0,0,0,0.05))';
  });

  // Click & Key events
  mainPart.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleInPagePanel(false);
  });
  mainPart.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggleInPagePanel(false);
    }
  });

  menuPart.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNullNoteContextMenu(menuPart);
  });
  menuPart.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggleNullNoteContextMenu(menuPart);
    }
  });

  btn.appendChild(mainPart);
  btn.appendChild(menuPart);

  return btn;
}

function toggleNullNoteContextMenu(anchorButton: HTMLElement) {
  const existing = document.getElementById('nullnote-context-menu');
  if (existing) {
    closeNullNoteContextMenu();
  } else {
    openNullNoteContextMenu(anchorButton);
  }
}

function openNullNoteContextMenu(anchorButton: HTMLElement) {
  closeNullNoteContextMenu();

  const parentContainer = anchorButton.parentElement;
  if (!parentContainer) return;

  const menu = document.createElement('div');
  menu.id = 'nullnote-context-menu';
  menu.style.cssText = `
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 6px;
    background: var(--yt-spec-raised-background, #fff);
    border: 1.5px solid var(--yt-spec-badge-chip-background, #e8ecf0);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    padding: 6px;
    z-index: 99999;
    min-width: 140px;
    display: flex;
    flex-direction: column;
    font-family: "Roboto","Arial",sans-serif;
    font-size: 13.5px;
    font-weight: 500;
  `;

  const settingsItem = document.createElement('button');
  settingsItem.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    border-radius: 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    color: var(--yt-spec-text-primary, #030303);
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    transition: background 0.1s ease;
  `;

  settingsItem.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
    <span>Settings</span>
  `;

  settingsItem.addEventListener('mouseenter', () => {
    settingsItem.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(0,0,0,0.05))';
  });
  settingsItem.addEventListener('mouseleave', () => {
    settingsItem.style.background = 'transparent';
  });
  settingsItem.addEventListener('click', (e) => {
    e.stopPropagation();
    closeNullNoteContextMenu();
    chrome.runtime.sendMessage({ type: 'openOptionsPage' });
  });

  menu.appendChild(settingsItem);
  parentContainer.appendChild(menu);

  const clickOutsideHandler = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node) && !anchorButton.contains(e.target as Node)) {
      closeNullNoteContextMenu();
    }
  };

  document.addEventListener('click', clickOutsideHandler, { capture: true });
  (menu as any)._clickOutsideHandler = clickOutsideHandler;
}

function closeNullNoteContextMenu() {
  const menu = document.getElementById('nullnote-context-menu');
  if (menu) {
    if ((menu as any)._clickOutsideHandler) {
      document.removeEventListener('click', (menu as any)._clickOutsideHandler, { capture: true });
    }
    menu.remove();
  }
}

function findYouTubeMoreActionsButton(actionsRow: Element): Element | null {
  // Try direct selectors
  let btn = actionsRow.querySelector('button[aria-label="More actions"]') ||
            actionsRow.querySelector('[aria-label="More actions"]') ||
            actionsRow.querySelector('ytd-menu-renderer ytd-button-renderer:last-child button') ||
            actionsRow.querySelector('yt-button-view-model:last-child button') ||
            actionsRow.querySelector('#button-shape button');

  if (btn) return btn;

  const buttons = actionsRow.querySelectorAll('button');
  for (const button of Array.from(buttons)) {
    const label = (button.getAttribute('aria-label') || '').toLowerCase();
    const title = (button.getAttribute('title') || '').toLowerCase();
    if (label.includes('more actions') || label === 'more' || title.includes('more actions')) {
      return button;
    }
  }

  return null;
}

function getTopLevelChild(actionsRow: Element, child: Element): Element {
  let curr = child;
  while (curr.parentElement && curr.parentElement !== actionsRow) {
    curr = curr.parentElement;
  }
  return curr;
}

function injectNullNoteActionButton() {
  // Try multiple selectors — YouTube's action bar varies by page variant
  const actionSelectors = [
    '#actions.ytd-watch-metadata',
    'ytd-watch-metadata #actions',
    '#actions-inner',
    '#menu-container #top-level-buttons-computed',
    '#top-level-buttons-computed',
  ];

  let actionsRow: Element | null = null;
  for (const sel of actionSelectors) {
    actionsRow = document.querySelector(sel);
    if (actionsRow) break;
  }

  if (!actionsRow) return;

  // Find native three-dot button
  const moreActionsBtn = findYouTubeMoreActionsButton(actionsRow);
  if (!moreActionsBtn) return; // Wait for it to appear!

  const anchor = getTopLevelChild(actionsRow, moreActionsBtn);
  if (!anchor) return;

  let wrapper = document.getElementById('nullnote-yt-action-wrapper');
  if (wrapper) {
    // If already injected, verify positioning: it must be immediately after the anchor
    if (anchor.nextElementSibling !== wrapper) {
      if (anchor.nextElementSibling) {
        actionsRow.insertBefore(wrapper, anchor.nextElementSibling);
      } else {
        actionsRow.appendChild(wrapper);
      }
    }
    return;
  }

  // Create button and wrapper
  const btn = createNullNoteActionButton();
  wrapper = document.createElement('div');
  wrapper.id = 'nullnote-yt-action-wrapper';
  wrapper.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;margin-left:8px;';
  wrapper.appendChild(btn);

  if (anchor.nextElementSibling) {
    actionsRow.insertBefore(wrapper, anchor.nextElementSibling);
  } else {
    actionsRow.appendChild(wrapper);
  }

  console.log('[NullNote] Action button injected after More Actions button');
}

function waitForActionsRowAndInject() {
  // Try immediately
  injectNullNoteActionButton();
  if (document.getElementById('nullnote-yt-action-wrapper')) return;

  // Use MutationObserver to wait for the actions row to appear
  let attempts = 0;
  const observer = new MutationObserver(() => {
    attempts++;
    injectNullNoteActionButton();
    if (document.getElementById('nullnote-yt-action-wrapper') || attempts > 40) {
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Fallback: stop observing after 10 seconds
  setTimeout(() => observer.disconnect(), 10000);
}

// ───────────────────────────────────────────────────────────────────────────

async function loadAutoCaptureSettings() {
  return new Promise<void>((resolve) => {
    chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.getAutoCaptureState }, (response) => {
      if (response?.success) {
        state.autoCaptureEnabled = Boolean(response.enabled);
        state.autoCaptureInterval = Number(response.interval) || state.autoCaptureInterval;
      }
      // Load initial selected marker icon
      chrome.runtime.sendMessage({ type: 'getSelectedMarkerIcon' }, (iconResp) => {
        if (iconResp?.success && iconResp.icon) {
          state.selectedMarkerIcon = iconResp.icon;
          console.log('[NullNote] Loaded selected marker icon:', state.selectedMarkerIcon);
        }
        resolve();
      });
    });
  });
}

function playShutterSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1500, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
    setTimeout(() => { audioCtx.close(); }, 100);
  } catch (e) {
    // Audio not critical — fail silently
  }
}

async function captureScreenshotForVideo(source: 'manual' | 'auto' = 'manual', videoOverride?: HTMLVideoElement): Promise<boolean> {
  if (isYouTubeAdShowing()) {
    if (source === 'manual') showToast('NullNote captures are unavailable during ads.');
    return false;
  }
  
  const video = videoOverride?.isConnected ? videoOverride : getCurrentVideoElement();
  if (!video) {
    console.warn('[NullNote] Screenshot failed: no video element found');
    return false;
  }

  const { timestamp } = getVideoMetadata(video);
  if (source === 'manual' && timestamp === state.lastManualCaptureTimestamp) {
    console.log('[NullNote] Screenshot already captured at timestamp:', timestamp, '— skipping duplicate');
    return false;
  }

  if (source === 'auto' && timestamp === state.lastAutoCaptureTimestamp) {
    console.log('[NullNote] Auto screenshot already captured at timestamp:', timestamp, '— skipping duplicate');
    return false;
  }

  if (source === 'auto' && !state.autoCaptureEnabled) {
    return false;
  }

  console.log('[NullNote] Screenshot triggered — timestamp:', timestamp);

  const captureId = crypto.randomUUID();

  let imageData = '';
  try {
    if (!isFrameCaptureReady(video)) {
      throw new Error('Video frame is not ready for capture.');
    }
    imageData = await withTimeout(
      captureVideoFrame(video),
      FRAME_CAPTURE_TIMEOUT_MS,
      'Video frame capture timed out.'
    );
  } catch {
    // Both manual and auto should fallback to captureVisibleTab if captureVideoFrame fails
    // (e.g. due to CORS canvas tainting from googlevideo.com)
    imageData = await captureVisibleTabFallback();
  }

  if (!imageData) {
    console.error('[NullNote] Screenshot failed: could not capture frame');
    return false;
  }

  if (source === 'auto' && !state.autoCaptureEnabled) {
    return false;
  }

  if (source === 'manual') {
    playShutterSound();
  }

  const message = {
    type: 'insert-screenshot',
    captureId,
    timestamp,
    videoId: state.videoId,
    imageData,
    source,
  };

  if (source === 'auto') {
    state.lastAutoCaptureTimestamp = timestamp;
  } else {
    state.lastManualCaptureTimestamp = timestamp;
  }

  if (source === 'manual') {
    ensurePanelOpenAndSend(message);
  } else {
    ensurePanelOpenAndSend(message, () => state.autoCaptureEnabled);
  }

  console.log('[NullNote] Screenshot message sent');
  return true;
}

async function captureVisibleTabFallback() {
  return new Promise<string>((resolve) => {
    chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.captureVisibleTab }, (response) => {
      resolve(response?.success ? response.imageData || '' : '');
    });
  });
}

function getAutoCaptureIntervalMs() {
  return Math.max(5, state.autoCaptureInterval) * 1000;
}

function getVideoCurrentTime(video: HTMLVideoElement | null): number | null {
  if (!video || !Number.isFinite(video.currentTime)) return null;
  return video.currentTime;
}

function resetAutoCaptureClock(reason: string, video: HTMLVideoElement | null = getCurrentVideoElement()) {
  state.autoRemainingMs = getAutoCaptureIntervalMs();
  state.autoLastWallClockMs = performance.now();
  state.autoLastVideoTime = getVideoCurrentTime(video);
  emitAutoDebug('skipped', {
    reason,
    remainingMs: Math.round(state.autoRemainingMs),
    videoTime: state.autoLastVideoTime,
  });
}

function scheduleAutoCaptureTick(sessionId: number, overrideMs?: number) {
  if (state.captureTimer) window.clearTimeout(state.captureTimer);
  const delay = overrideMs ?? getAutoCaptureIntervalMs();
  console.log('[AutoSnap DEBUG] scheduling timer for', delay, 'ms');
  state.captureTimer = window.setTimeout(() => runAutoCaptureTick(sessionId), delay);
}

function detectAutoCaptureSeek(video: HTMLVideoElement, now: number) {
  const currentVideoTime = getVideoCurrentTime(video);
  if (currentVideoTime === null || state.autoLastVideoTime === null || state.autoLastWallClockMs <= 0) {
    state.autoLastVideoTime = currentVideoTime;
    state.autoLastWallClockMs = now;
    return false;
  }

  const elapsedWallSeconds = Math.max(0, (now - state.autoLastWallClockMs) / 1000);
  const expectedVideoDelta = video.paused ? 0 : elapsedWallSeconds * Math.max(0, video.playbackRate || 1);
  const actualVideoDelta = currentVideoTime - state.autoLastVideoTime;
  const unexpectedDelta = actualVideoDelta - expectedVideoDelta;
  const seekDetected = Math.abs(unexpectedDelta) >= AUTO_CAPTURE_SEEK_THRESHOLD_SECONDS;

  state.autoLastVideoTime = currentVideoTime;
  state.autoLastWallClockMs = now;

  if (seekDetected) {
    resetAutoCaptureClock(unexpectedDelta > 0 ? 'forward-seek' : 'backward-seek', video);
  }

  return seekDetected;
}

function getAutoCaptureBlockReason(
  video: HTMLVideoElement | null,
  sessionId: number
): { reason: string; shouldFreezeCountdown: boolean } | null {
  if (sessionId !== state.autoCaptureSessionId) return { reason: 'stale-session', shouldFreezeCountdown: true };
  if (!state.autoCaptureEnabled) return { reason: 'disabled', shouldFreezeCountdown: true };
  if (state.captureInFlight) return { reason: 'capture-in-progress', shouldFreezeCountdown: true };
  if (!isWatchPage() || isYouTubeShorts()) return { reason: 'not-watch-page', shouldFreezeCountdown: true };
  if (isYouTubeAdShowing()) return { reason: 'ad-showing', shouldFreezeCountdown: true };
  
  if (!video) return { reason: 'no-video', shouldFreezeCountdown: true };
  if (!video.isConnected) return { reason: 'video-disconnected', shouldFreezeCountdown: true };
  if (video.paused) return { reason: 'paused', shouldFreezeCountdown: true };
  if (video.ended) return { reason: 'ended', shouldFreezeCountdown: true };
  if (!isFrameCaptureReady(video)) return { reason: 'frame-not-ready', shouldFreezeCountdown: true };

  const currentTime = Math.round(video.currentTime);
  if (!Number.isFinite(currentTime) || currentTime < 0) return { reason: 'invalid-timestamp', shouldFreezeCountdown: true };

  return null;
}

async function runAutoCaptureTick(sessionId: number) {
  console.log('[AutoSnap DEBUG] runAutoCaptureTick called for sessionId', sessionId);
  const now = performance.now();
  const previousWallClockMs = state.autoLastWallClockMs > 0 ? state.autoLastWallClockMs : now;
  const video = getCurrentVideoElement();

  const block = getAutoCaptureBlockReason(video, sessionId);
  if (block) {
    if (block.reason === 'stale-session') return; // Silent exit for stale sessions
    
    emitAutoDebug('skipped', { reason: block.reason, sessionId });
    if (block.shouldFreezeCountdown) {
      state.autoLastWallClockMs = now;
      state.autoLastVideoTime = getVideoCurrentTime(video);
    }
    scheduleAutoCaptureTick(sessionId);
    return;
  }

  // From here on, video is guaranteed valid
  if (detectAutoCaptureSeek(video!, now)) {
    scheduleAutoCaptureTick(sessionId);
    return;
  }

  const currentTime = Math.round(video!.currentTime);

  const elapsedPlaybackMs = Math.max(0, now - previousWallClockMs);
  state.autoRemainingMs = Math.min(
    getAutoCaptureIntervalMs(),
    Math.max(0, state.autoRemainingMs - elapsedPlaybackMs)
  );

  if (currentTime === state.lastAutoCaptureTimestamp) {
    emitAutoDebug('skipped', { reason: 'duplicate-timestamp', timestamp: currentTime });
    resetAutoCaptureClock('duplicate-timestamp', video!);
    scheduleAutoCaptureTick(sessionId);
    return;
  }

  if (state.autoRemainingMs > 0) {
    emitAutoDebug('skipped', {
      reason: 'countdown',
      remainingMs: Math.round(state.autoRemainingMs),
      timestamp: currentTime,
    });
    scheduleAutoCaptureTick(sessionId, Math.min(AUTO_CAPTURE_TICK_MS, state.autoRemainingMs));
    return;
  }

  state.captureInFlight = true;
  try {
    emitAutoDebug('capturing', { timestamp: currentTime, sessionId });
    const captured = await captureScreenshotForVideo('auto', video);
    if (captured) {
      emitAutoDebug('captured', { timestamp: currentTime, sessionId });
      resetAutoCaptureClock('captured', video);
    } else {
      emitAutoDebug('skipped', { reason: 'capture-failed', timestamp: currentTime });
      resetAutoCaptureClock('capture-failed', video);
    }
  } catch (error) {
    emitAutoDebug('error', {
      reason: 'capture-threw',
      error: error instanceof Error ? error.message : String(error),
    });
    resetAutoCaptureClock('capture-threw', video);
  } finally {
    state.captureInFlight = false;
    // Only reschedule if this session is still the active one.
    scheduleAutoCaptureTick(sessionId);
  }
}

function startAutoCaptureLoop() {
  console.log('[AutoSnap DEBUG] startAutoCaptureLoop called');
  // Increment session ID — this atomically invalidates ALL prior tick chains,
  // including any currently in-flight async captures whose finally blocks
  // would otherwise spawn a new rogue loop.
  const sessionId = ++state.autoCaptureSessionId;
  // Clear any pending timer (belt-and-suspenders alongside session ID).
  if (state.captureTimer) {
    window.clearTimeout(state.captureTimer);
    state.captureTimer = undefined;
  }
  state.captureInFlight = false;
  const intervalMs = getAutoCaptureIntervalMs();
  resetAutoCaptureClock('started');
  console.log('[NullNote] AutoSnap loop started, sessionId:', sessionId, 'interval:', intervalMs, 'ms');
  scheduleAutoCaptureTick(sessionId);
}

function stopAutoCaptureLoop() {
  // Increment session ID to invalidate any in-flight tick chain, even if
  // captureInFlight is true and the finally hasn't run yet.
  state.autoCaptureSessionId++;
  if (state.captureTimer) {
    window.clearTimeout(state.captureTimer);
    state.captureTimer = undefined;
    console.log('[NullNote] AutoSnap loop stopped, sessionId now:', state.autoCaptureSessionId);
  }
  state.captureInFlight = false;
  state.autoRemainingMs = getAutoCaptureIntervalMs();
  state.autoLastWallClockMs = 0;
  state.autoLastVideoTime = null;
}

function renderTimeline() {
  if (!state.overlay || !state.video) {
    return;
  }
  renderTimelineMarkers(state.overlay, state.highlights, state.video.duration || 1, (timestamp) => {
    if (state.video) {
      state.video.currentTime = timestamp;
    }
  });
}

const hiddenNodes = new Set<HTMLElement>();

function toggleInPagePanel(forceOpen = false) {
  const panelId = 'nullnote-inpage-panel';
  const existing = document.getElementById(panelId);

  if (existing) {
    if (forceOpen) {
      existing.style.display = 'flex';
      const iframe = existing.querySelector('iframe');
      if (iframe) iframe.focus();
      state.sidebarOpen = true;
      return;
    }
    // Close panel and restore recommendations
    existing.remove();
    hiddenNodes.forEach(node => { node.style.display = ''; });
    hiddenNodes.clear();
    state.sidebarOpen = false;
    return;
  }

  // Find YouTube's secondary/recommendations column with fallback chain
  const selectors = ['#secondary-inner', '#secondary', '#related', 'ytd-watch-flexy'];
  let secondaryInner: HTMLElement | null = null;
  for (const selector of selectors) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) {
      secondaryInner = el;
      break;
    }
  }
  if (!secondaryInner) {
    console.warn('[NullNote] Could not find YouTube recommendation column — appending to body');
    secondaryInner = document.body;
  }

  // Hide existing recommendations
  Array.from(secondaryInner.children).forEach(child => {
    if (child.id !== panelId) {
      hiddenNodes.add(child as HTMLElement);
      (child as HTMLElement).style.display = 'none';
    }
  });

  // Explicitly hide the playlist if it exists (so the panel bubbles to the top)
  const playlist = document.querySelector('#secondary #playlist');
  if (playlist && playlist.id !== panelId) {
    hiddenNodes.add(playlist as HTMLElement);
    (playlist as HTMLElement).style.display = 'none';
  }

  // Build panel container
  const panel = document.createElement('div');
  panel.id = panelId;
  panel.style.position = 'sticky';
  panel.style.top = '12px';
  panel.style.width = '440px';
  panel.style.maxWidth = '100%';
  panel.style.minWidth = '0';
  panel.style.boxSizing = 'border-box';
  panel.style.height = 'calc(100vh - 24px)';
  panel.style.background = '#ffffff';
  panel.style.border = '1px solid rgba(0,0,0,0.08)';
  panel.style.borderRadius = '12px';
  panel.style.overflow = 'hidden';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.zIndex = '100';
  panel.style.boxShadow = '0 4px 24px rgba(0,0,0,0.08)';
  panel.scrollLeft = 0; // ensure no horizontal offset on open


  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('src/sidepanel/index.html');
  frame.title = 'NullNote';
  frame.style.width = '100%';
  frame.style.flex = '1';
  frame.style.border = '0';
  frame.style.background = '#ffffff';
  frame.setAttribute('allow', 'clipboard-write');

  panel.appendChild(frame);

  // Safe DOM insertion with fallback
  if (secondaryInner.firstChild && secondaryInner.contains(secondaryInner.firstChild)) {
    secondaryInner.insertBefore(panel, secondaryInner.firstChild);
  } else {
    secondaryInner.appendChild(panel);
  }
  // Always reset horizontal scroll so sidebar opens from left edge
  secondaryInner.scrollLeft = 0;
  panel.scrollLeft = 0;
  state.sidebarOpen = true;
}

function attachMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // PING/ALIVE heartbeat — respond immediately
    if (message?.type === 'NULLNOTE_PING') {
      sendResponse('NULLNOTE_ALIVE');
      return true;
    }

    if (message?.type === 'toggleInPagePanel') {
      if (message.forceClose) {
        if (layoutManager.isOpen()) {
          layoutManager.hide();
        } else {
          const panelId = 'nullnote-inpage-panel';
          const existing = document.getElementById(panelId);
          if (existing) {
            existing.remove();
            hiddenNodes.forEach(node => { node.style.display = ''; });
            hiddenNodes.clear();
            state.sidebarOpen = false;
          }
        }
      } else {
        if (layoutManager.isOpen()) {
          layoutManager.hide();
        } else {
          toggleInPagePanel(false);
        }
      }
    }
    if (message?.type === 'openInPagePanel') {
      toggleInPagePanel(true);
    }
    if (message?.type === 'update-seekbar-markers' && Array.isArray(message.markers)) {
      state.highlights = message.markers.map((m: any) => ({
        id: `m_${m.timestamp}_${Math.random()}`,
        entryType: 'highlight' as const,
        videoId: state.videoId,
        videoUrl: window.location.href,
        videoTitle: document.title,
        timestamp: m.timestamp,
        note: m.note || '',
        icon: m.icon,
        createdAt: Date.now()
      }));
      renderTimeline();
    }
    if (message?.type === 'autoCaptureCommand') {
      console.log('[AutoSnap DEBUG] Received autoCaptureCommand:', message.enabled);
      state.autoCaptureEnabled = Boolean(message.enabled);
      console.log('[AutoSnap DEBUG] state.autoCaptureEnabled is now', state.autoCaptureEnabled);
      if (state.autoCaptureEnabled) {
        // Only start loop on eligible pages — avoids spinning on Shorts or non-watch pages
        const isWatch = isWatchPage();
        const isShorts = isYouTubeShorts();
        console.log('[AutoSnap DEBUG] isWatchPage:', isWatch, 'isYouTubeShorts:', isShorts);
        if (isWatch && !isShorts) {
          startAutoCaptureLoop();
        } else {
          console.log('[AutoSnap DEBUG] NOT starting loop because page is not a valid watch page');
        }
      } else {
        console.log('[AutoSnap DEBUG] stopAutoCaptureLoop called from autoCaptureCommand');
        stopAutoCaptureLoop();
      }
    }
    if (message?.type === 'autoCaptureIntervalCommand') {
      const newInterval = Number(message.interval);
      if (!newInterval || newInterval === state.autoCaptureInterval) return;

      const oldIntervalMs = getAutoCaptureIntervalMs();
      state.autoCaptureInterval = newInterval;
      const newIntervalMs = getAutoCaptureIntervalMs();
      
      if (state.autoCaptureEnabled) {
        // Smooth transition instead of full restart
        const elapsed = oldIntervalMs - state.autoRemainingMs;
        let newRemaining = newIntervalMs - elapsed;
        if (newRemaining < 0) newRemaining = 0; // Trigger immediately on next tick
        
        state.autoRemainingMs = newRemaining;
        
        // Restart the loop with smooth remaining time, preserving in-flight status
        const sessionId = ++state.autoCaptureSessionId;
        if (state.captureTimer) {
          window.clearTimeout(state.captureTimer);
          state.captureTimer = undefined;
        }
        
        console.log(`[NullNote] AutoSnap interval smoothly changed: ${oldIntervalMs}ms -> ${newIntervalMs}ms. Remaining: ${Math.round(newRemaining)}ms`);
        scheduleAutoCaptureTick(sessionId, newRemaining);
      }
    }
    if (message?.type === 'seekVideo' && state.video) {
      state.video.currentTime = Number(message.timestamp);
    }
    if (message?.type === 'manualCapture') {
      captureScreenshotForVideo('manual');
    }
    if (message?.type === 'manualMarker') {
      // Pick up icon from message if sidepanel sent it, else use state
      if (message.icon) state.selectedMarkerIcon = message.icon;
      addQuickHighlight();
    }
    if (message?.type === 'selectedMarkerIconChanged') {
      state.selectedMarkerIcon = message.icon || DEFAULT_MARKER_ICON;
    }
    if (message?.type === 'restorePlayerFocus') {
      setTimeout(() => {
        try {
          const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
          if (player && typeof (player as any).focus === 'function') {
            (player as HTMLElement).focus({ preventScroll: true });
            return;
          }

          const video = document.querySelector('.html5-main-video') || document.querySelector('video');
          if (video && typeof (video as any).focus === 'function') {
            (video as HTMLElement).focus({ preventScroll: true });
          }
        } catch (e) {
          console.error('[NullNote] Failed to restore player focus:', e);
        }
      }, 80);
    }
  });
}

function attachPlayerMutationObserver() {
  const player = document.getElementById('movie_player');
  if (!player) return;

  let debounceTimer: number | null = null;

  const observer = new MutationObserver(() => {
    const isFullscreen = !!document.fullscreenElement || layoutManager.isOpen();
    const progress = findProgressContainer();
    const needsOverlay = !!(progress && !state.overlay);

    // Check if the button is present and correctly positioned after the settings button
    let isButtonPositionCorrect = false;
    if (isFullscreen) {
      const rightControls = document.querySelector('.ytp-right-controls');
      const settingsButton = rightControls ? findYouTubeSettingsButton(rightControls) : null;
      const workspaceBtn = document.querySelector('.nullnote-fs-toggle-btn');
      if (settingsButton && workspaceBtn && settingsButton.nextSibling === workspaceBtn) {
        isButtonPositionCorrect = true;
      }
    }

    // If fullscreen state matches the presence/correct position of our button, AND we don't need timeline overlay, skip
    if ((isFullscreen === isButtonPositionCorrect) && !needsOverlay) return;

    // Debounce: wait 300ms of quiet before doing any DOM work
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;

      // CRITICAL: disconnect before touching the DOM to prevent re-entrant mutations
      observer.disconnect();

      attachPlayerControls();

      const progress = findProgressContainer();
      if (progress && !state.overlay) {
        state.overlay = createTimelineOverlay(progress);
        renderTimeline();
      }

      // Reconnect after our DOM work is done
      observer.observe(player, { childList: true, subtree: true });
    }, 300);
  });

  observer.observe(player, { childList: true, subtree: true });
}

function broadcastVideoChanged(videoId: string) {
  const getCleanTitle = () => document.title.replace(' - YouTube', '').trim();
  
  // 1. Send immediately to ensure sidepanel state transitions fast
  chrome.runtime.sendMessage({
    type: 'video-changed',
    videoId: videoId,
    videoTitle: getCleanTitle() || 'YouTube',
    videoUrl: window.location.href,
    source: 'content',
  }).catch(() => { });
  console.log('[NullNote] Video changed (initial):', videoId);

  // 2. YouTube updates document.title asynchronously. Poll for the real title.
  const oldTitle = document.title;
  let pollCount = 0;
  const maxPolls = 15; // 3s max wait
  
  const pollTitle = () => {
    pollCount++;
    const titleChanged = document.title !== oldTitle && document.title.includes('- YouTube');
    const isReady = titleChanged || (document.title && document.title !== 'YouTube') || pollCount >= maxPolls;

    if (isReady && titleChanged) {
      const finalTitle = getCleanTitle();
      chrome.runtime.sendMessage({
        type: 'video-changed',
        videoId: videoId, // Sending same ID acts as a patch for the title
        videoTitle: finalTitle,
        videoUrl: window.location.href,
        source: 'content',
      }).catch(() => { });
      console.log('[NullNote] Video title patched:', finalTitle);
    } else if (!isReady) {
      setTimeout(pollTitle, 200);
    }
  };
  
  setTimeout(pollTitle, 200);
}

function handleSPARouting() {
  // Single navigation handler — yt-navigate-finish is the canonical YouTube SPA event
  document.addEventListener('yt-navigate-finish', () => {
    const newVideoId = getVideoIdFromUrl(window.location.href);
    if (newVideoId && newVideoId !== state.videoId) {
      state.videoId = newVideoId;
      state.highlights = [];
      state.lastAutoCaptureTimestamp = -1;

      // Revalidate video reference — don't use stale DOM node
      state.video = getCurrentVideoElement();

      // REQUIREMENT: AutoSnap must stop when navigating to another video.
      // The user must explicitly re-enable it for the new video.
      if (state.autoCaptureEnabled) {
        console.log('[NullNote] SPA navigation — stopping AutoSnap for new video:', newVideoId);
        state.autoCaptureEnabled = false;
        stopAutoCaptureLoop();
        // Notify background to persist the disabled state and update the sidepanel UI.
        sendAutoCaptureMessage(false);
      }

      renderTimeline();
      broadcastVideoChanged(state.videoId);
    }

    // Re-inject player controls and action button after SPA navigation
    setTimeout(() => {
      attachPlayerControls();
      injectNullNoteActionButton();
      // Auto-open panel for watch pages (not shorts)
      autoOpenPanelIfNeeded();
    }, 1200);
  });
}

function restoreNormalWorkspaceLayout() {
  const wasSidebarOpen = state.sidebarOpen;

  // Restore DOM hierarchy and remove fullscreen workspace
  layoutManager.hide();

  // Restore the sidepanel according to state
  if (wasSidebarOpen) {
    toggleInPagePanel(true);
  } else {
    const panelId = 'nullnote-inpage-panel';
    if (document.getElementById(panelId)) {
      toggleInPagePanel(false);
    }
  }
}

async function initialize() {
  // Hard guard — only one instance ever
  if ((window as any).__NULLNOTE_INITIALIZED__) {
    return;
  }
  (window as any).__NULLNOTE_INITIALIZED__ = true;

  console.log('[NullNote] Initializing content script');

  attachMessageHandlers();

  // Wait up to 8s for video element to appear
  const waitForVideo = () =>
    new Promise<HTMLVideoElement | null>((resolve) => {
      const maybeVideo = document.querySelector('video');
      if (maybeVideo) return resolve(maybeVideo as HTMLVideoElement);
      const interval = window.setInterval(() => {
        const next = document.querySelector('video');
        if (next) {
          window.clearInterval(interval);
          resolve(next as HTMLVideoElement);
        }
      }, 500);
      setTimeout(() => {
        window.clearInterval(interval);
        resolve(document.querySelector('video') as HTMLVideoElement | null);
      }, 8000);
    });

  state.video = await waitForVideo();
  if (!state.video) {
    console.log('[NullNote] No video found — panel-only mode');
    handleSPARouting();
    return;
  }

  await loadAutoCaptureSettings();

  state.videoId = getVideoIdFromUrl(window.location.href);
  if (state.videoId) {
    broadcastVideoChanged(state.videoId);
  }

  const progress = findProgressContainer();
  state.overlay = progress ? createTimelineOverlay(progress) : null;

  attachPlayerMutationObserver();
  attachPlayerControls();

  if (state.autoCaptureEnabled) {
    startAutoCaptureLoop();
  }

  attachKeyboardShortcuts(
    state.video,
    addQuickHighlight,
    () => captureScreenshotForVideo('manual'),
    toggleAutoCapture,
    () => toggleInPagePanel()
  );

  // Inject native YouTube action button
  waitForActionsRowAndInject();

  // ── Fullscreen Integration ──────────────────────────────────────────────
  fullscreenManager.init({
    onToggle: () => layoutManager.toggle(),
    isOverlayOpen: () => layoutManager.isOpen(),
  });

  window.addEventListener('nullnote-workspace-opened', () => {
    state.fullscreenWorkspaceOpen = true;
    state.sidebarOpen = true;
  });

  window.addEventListener('nullnote-workspace-closed', () => {
    state.fullscreenWorkspaceOpen = false;
    state.sidebarOpen = false;
    window.setTimeout(() => {
      attachPlayerControls();
      const progress = findProgressContainer();
      if (progress && !state.overlay) {
        state.overlay = createTimelineOverlay(progress);
        renderTimeline();
      }
    }, 150);
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      if (state.fullscreenWorkspaceOpen) {
        restoreNormalWorkspaceLayout();
      }
    }
    attachPlayerControls();
    const progress = findProgressContainer();
    if (progress && !state.overlay) {
      state.overlay = createTimelineOverlay(progress);
      renderTimeline();
    }
  });

  handleSPARouting();
  renderTimeline();

  // Auto-open panel on initial page load (not shorts)
  setTimeout(() => autoOpenPanelIfNeeded(), 1500);

  console.log('[NullNote] Initialized — videoId:', state.videoId);
}

initialize().catch(console.error);
