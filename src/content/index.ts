import { captureVideoFrame } from './screenshot';
import { createTimelineOverlay, renderTimelineMarkers, findProgressContainer } from './timeline';
import { attachKeyboardShortcuts } from './keyboard';
import { createCaptureButton, createMarkerButton, createAutoSnapButton, updateAutoSnapButton, createFullscreenPanelButton } from './ui';
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
  updateAutoCaptureButtonAuto();
  if (state.autoCaptureEnabled) {
    startAutoCaptureLoop();
  } else {
    stopAutoCaptureLoop();
  }
  // Sync the AutoSnap status to sidebar React app
  chrome.runtime.sendMessage({ type: 'autoCaptureCommand', enabled: state.autoCaptureEnabled });
}

function updateAutoCaptureButtonAuto() {
  const button = document.querySelector<HTMLButtonElement>('.nullnote-player-autosnap');
  if (button) {
    updateAutoSnapButton(button, state.autoCaptureEnabled);
  }
}

function attachPlayerControls() {
  const rightControls = document.querySelector('.ytp-right-controls');
  if (!rightControls) {
    return;
  }

  const settingsButton = rightControls.querySelector('.ytp-settings-button');
  if (!settingsButton) {
    return;
  }

  // Remove any pre-existing instances of our custom buttons to avoid duplicates
  document.querySelectorAll('.nullnote-player-capture').forEach(el => el.remove());
  document.querySelectorAll('.nullnote-player-marker').forEach(el => el.remove());
  document.querySelectorAll('.nullnote-player-autosnap').forEach(el => el.remove());
  document.querySelectorAll('.nullnote-fs-toggle-btn').forEach(el => el.remove());

  const captureBtn = createCaptureButton();
  const markerBtn = createMarkerButton();
  const autoSnapBtn = createAutoSnapButton();
  const workspaceBtn = createFullscreenPanelButton();

  captureBtn.addEventListener('click', () => {
    captureScreenshotForVideo('manual');
  });

  markerBtn.addEventListener('click', () => {
    addQuickHighlight();
  });

  autoSnapBtn.addEventListener('click', () => {
    toggleAutoCapture();
  });

  workspaceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    layoutManager.toggle();
  });

  updateAutoSnapButton(autoSnapBtn, state.autoCaptureEnabled);

  // Safe insertion with parent validation
  const parent = settingsButton.parentNode;
  if (parent && parent.contains(settingsButton)) {
    parent.insertBefore(captureBtn, settingsButton);
    parent.insertBefore(markerBtn, settingsButton);
    parent.insertBefore(autoSnapBtn, settingsButton);
    parent.insertBefore(workspaceBtn, settingsButton);
  } else {
    rightControls.appendChild(captureBtn);
    rightControls.appendChild(markerBtn);
    rightControls.appendChild(autoSnapBtn);
    rightControls.appendChild(workspaceBtn);
  }
}

// ── Native YouTube Action Button ────────────────────────────────────────────
// Injected into the YouTube actions row (Like → Dislike → [NullNote] → Share → Save)
// Matches native YouTube button styling so it feels like a YouTube feature.

function createNullNoteActionButton(): HTMLElement {
  const btn = document.createElement('div');
  btn.id = 'nullnote-yt-action-btn';
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('aria-label', 'Open NullNote');
  btn.setAttribute('title', 'Open NullNote');

  btn.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 16px;
    border-radius: 18px;
    cursor: pointer;
    font-family: "Roboto","Arial",sans-serif;
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    user-select: none;
    flex-shrink: 0;
    transition: background 0.1s ease;
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05));
    color: var(--yt-spec-text-primary, inherit);
    border: none;
    outline: none;
  `;

  // NullNote logo icon
  const iconImg = document.createElement('img');
  iconImg.src = chrome.runtime.getURL('icons/page_icon.png');
  // Add CSS filter so the black icon appears white in dark mode, like YouTube icons
  iconImg.style.cssText = 'width:18px;height:18px;object-fit:contain;margin-right:4px;filter:var(--yt-spec-icon-filter, none);';


  const labelEl = document.createElement('span');
  labelEl.textContent = 'NullNote';

  btn.appendChild(iconImg);
  btn.appendChild(labelEl);

  // Hover effect using yt-spec variables
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(0,0,0,0.10))';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05))';
  });
  btn.addEventListener('mousedown', () => {
    btn.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(0,0,0,0.15))';
  });
  btn.addEventListener('mouseup', () => {
    btn.style.background = 'var(--yt-spec-button-chip-background-hover, rgba(0,0,0,0.10))';
  });

  btn.addEventListener('click', () => {
    toggleInPagePanel(false);
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleInPagePanel(false);
    }
  });

  return btn;
}

function injectNullNoteActionButton() {
  // Already injected
  if (document.getElementById('nullnote-yt-action-btn')) return;

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

  const btn = createNullNoteActionButton();

  // Wrap in a flex container element matching YouTube's button renderer
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;margin-left:8px;';
  wrapper.appendChild(btn);

  // Insert after the "Like/Dislike" segment
  const likeBtnGroup = actionsRow.querySelector('ytd-segment-like-dislike-button-view-model') ||
    actionsRow.querySelector('like-button-view-model') ||
    actionsRow.querySelector('ytd-toggle-button-renderer:first-child');

  if (likeBtnGroup && likeBtnGroup.nextElementSibling) {
    actionsRow.insertBefore(wrapper, likeBtnGroup.nextElementSibling);
  } else {
    // Fallback: prepend to beginning or append to end
    const shareBtn = actionsRow.querySelector('ytd-button-renderer[button-next]') ||
      actionsRow.querySelector('yt-button-view-model') ||
      null;

    if (shareBtn && actionsRow.contains(shareBtn)) {
      actionsRow.insertBefore(wrapper, shareBtn);
    } else {
      actionsRow.appendChild(wrapper);
    }
  }

  console.log('[NullNote] Action button injected');
}

function waitForActionsRowAndInject() {
  // Try immediately
  injectNullNoteActionButton();
  if (document.getElementById('nullnote-yt-action-btn')) return;

  // Use MutationObserver to wait for the actions row to appear
  let attempts = 0;
  const observer = new MutationObserver(() => {
    attempts++;
    injectNullNoteActionButton();
    if (document.getElementById('nullnote-yt-action-btn') || attempts > 40) {
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
      resolve();
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

  console.log('[NullNote] Screenshot triggered — timestamp:', Math.round(video.currentTime));

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

  const { timestamp } = getVideoMetadata();
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
      return;
    }
    // Close panel and restore recommendations
    existing.remove();
    hiddenNodes.forEach(node => { node.style.display = ''; });
    hiddenNodes.clear();
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
  panel.style.width = '100%';
  panel.style.minWidth = '380px';
  panel.style.maxWidth = '440px';
  panel.style.height = 'calc(100vh - 24px)';
  panel.style.background = '#ffffff';
  panel.style.border = '1px solid rgba(0,0,0,0.08)';
  panel.style.borderRadius = '12px';
  panel.style.overflow = 'hidden';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.zIndex = '100';
  panel.style.boxShadow = '0 4px 24px rgba(0,0,0,0.08)';

  const header = document.createElement('div');
  header.style.padding = '10px 14px';
  header.style.display = 'flex';
  header.style.justifyContent = 'flex-end';
  header.style.alignItems = 'center';
  header.style.background = '#f8fafc';
  header.style.borderBottom = '1px solid rgba(0,0,0,0.07)';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeButton.title = 'Close NullNote';
  closeButton.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:rgba(0,0,0,0.06);border:none;border-radius:7px;color:#64748b;cursor:pointer;transition:background 0.15s;';
  closeButton.addEventListener('mouseenter', () => { closeButton.style.background = 'rgba(0,0,0,0.12)'; });
  closeButton.addEventListener('mouseleave', () => { closeButton.style.background = 'rgba(0,0,0,0.06)'; });
  closeButton.addEventListener('click', () => {
    panel.remove();
    hiddenNodes.forEach(node => { node.style.display = ''; });
    hiddenNodes.clear();
  });

  header.appendChild(closeButton);

  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('src/sidepanel/index.html');
  frame.title = 'NullNote';
  frame.style.width = '100%';
  frame.style.flex = '1';
  frame.style.border = '0';
  frame.style.background = '#ffffff';
  frame.setAttribute('allow', 'clipboard-write');

  panel.appendChild(header);
  panel.appendChild(frame);

  // Safe DOM insertion with fallback
  if (secondaryInner.firstChild && secondaryInner.contains(secondaryInner.firstChild)) {
    secondaryInner.insertBefore(panel, secondaryInner.firstChild);
  } else {
    secondaryInner.appendChild(panel);
  }
}

function attachMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // PING/ALIVE heartbeat — respond immediately
    if (message?.type === 'NULLNOTE_PING') {
      sendResponse('NULLNOTE_ALIVE');
      return true;
    }

    if (message?.type === 'toggleInPagePanel') {
      toggleInPagePanel(false);
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
      updateAutoCaptureButtonAuto();
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

  const observer = new MutationObserver(() => {
    attachPlayerControls();
    const progress = findProgressContainer();
    if (progress && !state.overlay) {
      state.overlay = createTimelineOverlay(progress);
      renderTimeline();
    }
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
  updateAutoCaptureButtonAuto();

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

  // Re-inject player controls after the workspace closes and restores the DOM.
  window.addEventListener('nullnote-workspace-closed', () => {
    window.setTimeout(() => {
      attachPlayerControls();
      const progress = findProgressContainer();
      if (progress && !state.overlay) {
        state.overlay = createTimelineOverlay(progress);
        renderTimeline();
      }
    }, 150);
  });

  handleSPARouting();
  renderTimeline();

  // Auto-open panel on initial page load (not shorts)
  setTimeout(() => autoOpenPanelIfNeeded(), 1500);

  console.log('[NullNote] Initialized — videoId:', state.videoId);
}

initialize().catch(console.error);
