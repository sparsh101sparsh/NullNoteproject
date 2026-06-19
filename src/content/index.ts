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
  captureTimer?: number;
  lastAutoCaptureTimestamp: number;
  selectedMarkerIcon: string;
  sidebarOpen: boolean;
  fullscreenWorkspaceOpen: boolean;
}

const state: PageState = {
  video: null,
  overlay: null,
  videoId: '',
  highlights: [],
  autoCaptureEnabled: false,
  autoCaptureInterval: 30,
  lastAutoCaptureTimestamp: 0,
  selectedMarkerIcon: DEFAULT_MARKER_ICON,
  sidebarOpen: false,
  fullscreenWorkspaceOpen: false,
};

// Singleton managers — created once per content script lifecycle
const fullscreenManager = new FullscreenManager();
const layoutManager = new LayoutManager();

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

function getVideoMetadata() {
  const video = state.video;
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
  chrome.runtime.sendMessage(message, () => {
    // Suppress "Could not establish connection" errors — sidepanel may not be open
    if (chrome.runtime.lastError) { /* intentionally ignored */ }
  });
}

// Open panel if not open, then send message after iframe has time to load
function ensurePanelOpenAndSend(message: any) {
  const panel = document.getElementById('nullnote-inpage-panel');
  if (!panel) {
    // Open the panel
    toggleInPagePanel(true);
    // Wait for iframe to load before sending
    setTimeout(() => {
      sendToBus(message);
    }, 800);
  } else {
    // Panel already open, send directly
    sendToBus(message);
  }
}

async function addQuickHighlight() {
  const meta = getVideoMetadata();
  if (meta.timestamp === state.lastAutoCaptureTimestamp) {
    console.log('[NullNote] Marker/Screenshot already captured at timestamp:', meta.timestamp, '— skipping duplicate');
    return;
  }
  state.lastAutoCaptureTimestamp = meta.timestamp;

  console.log('[NullNote] Marker triggered — timestamp:', meta.timestamp);

  // Capture a frame from the video at this exact moment to embed in the marker
  let imageData: string | undefined;
  if (state.video) {
    try {
      imageData = await captureVideoFrame(state.video);
      console.log('[NullNote] Marker frame captured');
    } catch {
      // Screenshot failed — marker will still be created without image
      console.warn('[NullNote] Marker frame capture failed — creating text-only marker');
    }
  }

  ensurePanelOpenAndSend({
    type: 'insert-marker',
    timestamp: meta.timestamp,
    imageData,           // undefined if capture failed — sidepanel handles gracefully
    icon: state.selectedMarkerIcon,
    source: 'content',
  });
  console.log('[NullNote] Marker message sent with icon:', state.selectedMarkerIcon);
}

async function sendAutoCaptureMessage(enabled: boolean) {
  chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.toggleAutoCapture, payload: enabled }).catch(() => { });
}

async function toggleAutoCapture() {
  state.autoCaptureEnabled = !state.autoCaptureEnabled;
  console.log('[NullNote] AutoSnap toggled:', state.autoCaptureEnabled);
  sendAutoCaptureMessage(state.autoCaptureEnabled);
  if (state.autoCaptureEnabled) {
    startAutoCaptureLoop();
  } else {
    stopAutoCaptureLoop();
  }
  // Sync the AutoSnap status to sidebar React app
  chrome.runtime.sendMessage({ type: 'autoCaptureCommand', enabled: state.autoCaptureEnabled });
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

async function captureScreenshotForVideo(source: 'manual' | 'auto' = 'manual') {
  const video = state.video;
  if (!video) {
    console.warn('[NullNote] Screenshot failed: no video element found');
    return;
  }

  const { timestamp } = getVideoMetadata();
  if (timestamp === state.lastAutoCaptureTimestamp) {
    console.log('[NullNote] Screenshot already captured at timestamp:', timestamp, '— skipping duplicate');
    return;
  }

  console.log('[NullNote] Screenshot triggered — timestamp:', timestamp);

  let imageData = '';
  try {
    imageData = await captureVideoFrame(video);
  } catch {
    imageData = await captureVisibleTabFallback();
  }

  if (!imageData) {
    console.error('[NullNote] Screenshot failed: could not capture frame');
    return;
  }

  if (source === 'manual') {
    playShutterSound();
  }

  state.lastAutoCaptureTimestamp = timestamp;

  const message = {
    type: 'insert-screenshot',
    timestamp,
    imageData,
    source,
  };

  if (source === 'manual') {
    ensurePanelOpenAndSend(message);
  } else {
    // AutoSnap: panel must already be open, just send
    sendToBus(message);
  }

  console.log('[NullNote] Screenshot message sent');
}

async function captureVisibleTabFallback() {
  return new Promise<string>((resolve) => {
    chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.captureVisibleTab }, (response) => {
      resolve(response?.success ? response.imageData || '' : '');
    });
  });
}

function startAutoCaptureLoop() {
  stopAutoCaptureLoop(); // Always clear before starting — prevents duplicate intervals
  const intervalMs = Math.max(5, state.autoCaptureInterval) * 1000;
  console.log('[NullNote] AutoSnap loop started, interval:', intervalMs, 'ms');
  state.captureTimer = window.setInterval(async () => {
    const video = state.video;
    if (!video || video.paused || video.ended) {
      return; // Only capture while playing
    }
    const currentTime = Math.round(video.currentTime);
    if (currentTime === state.lastAutoCaptureTimestamp) {
      return; // Deduplicate same-second captures
    }
    state.lastAutoCaptureTimestamp = currentTime;
    await captureScreenshotForVideo('auto');
  }, intervalMs);
}

function stopAutoCaptureLoop() {
  if (state.captureTimer) {
    window.clearInterval(state.captureTimer);
    state.captureTimer = undefined;
    console.log('[NullNote] AutoSnap loop stopped');
  }
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
      state.autoCaptureEnabled = Boolean(message.enabled);
      if (state.autoCaptureEnabled) {
        startAutoCaptureLoop();
      } else {
        stopAutoCaptureLoop();
      }
    }
    if (message?.type === 'autoCaptureIntervalCommand') {
      state.autoCaptureInterval = Number(message.interval) || state.autoCaptureInterval;
      if (state.autoCaptureEnabled) {
        startAutoCaptureLoop(); // Restart with new interval
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

function handleSPARouting() {
  // Single navigation handler — yt-navigate-finish is the canonical YouTube SPA event
  document.addEventListener('yt-navigate-finish', () => {
    const newVideoId = getVideoIdFromUrl(window.location.href);
    if (newVideoId && newVideoId !== state.videoId) {
      state.videoId = newVideoId;
      state.highlights = [];
      state.lastAutoCaptureTimestamp = 0;

      // Revalidate video reference — don't use stale DOM node
      const nextVideo = document.querySelector('video');
      if (nextVideo) state.video = nextVideo as HTMLVideoElement;

      renderTimeline();

      const newTitle = document.title.replace(' - YouTube', '').trim();
      chrome.runtime.sendMessage({
        type: 'video-changed',
        videoId: state.videoId,
        videoTitle: newTitle,
        videoUrl: window.location.href,
        source: 'content',
      }).catch(() => { });
      console.log('[NullNote] Video changed:', state.videoId, newTitle);
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
