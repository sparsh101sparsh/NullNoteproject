import { captureVideoFrame } from './screenshot';
import { createTimelineOverlay, renderTimelineMarkers, findProgressContainer } from './timeline';
import { attachKeyboardShortcuts } from './keyboard';
import { createCaptureButton, createMarkerButton, createAutoSnapButton, updateAutoSnapButton } from './ui';
import { STORAGE_MESSAGE_TYPES } from '@/utils/constants';
import type { NotebookEntry } from '@/utils/types';
import { FullscreenManager } from './fullscreen';
import { OverlayManager } from './overlay';

interface PageState {
  video: HTMLVideoElement | null;
  overlay: HTMLElement | null;
  videoId: string;
  highlights: NotebookEntry[];
  autoCaptureEnabled: boolean;
  autoCaptureInterval: number;
  captureTimer?: number;
  lastAutoCaptureTimestamp: number;
}

const state: PageState = {
  video: null,
  overlay: null,
  videoId: '',
  highlights: [],
  autoCaptureEnabled: false,
  autoCaptureInterval: 30,
  lastAutoCaptureTimestamp: 0,
};

// Singleton managers — created once per content script lifecycle
const fullscreenManager = new FullscreenManager();
const overlayManager = new OverlayManager();

function getVideoIdFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('v') || parsed.pathname || url;
  } catch {
    return url;
  }
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
    imageData,          // undefined if capture failed — sidepanel handles gracefully
    source: 'content',
  });
  console.log('[NullNote] Marker message sent');
}

async function sendAutoCaptureMessage(enabled: boolean) {
  chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.toggleAutoCapture, payload: enabled }).catch(() => {});
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
  if (!rightControls || document.querySelector('.nullnote-player-autosnap')) {
    return;
  }

  const settingsButton = rightControls.querySelector('.ytp-settings-button');
  if (!settingsButton) {
    return;
  }

  const captureBtn = createCaptureButton();
  const markerBtn = createMarkerButton();
  const autoSnapBtn = createAutoSnapButton();

  captureBtn.addEventListener('click', () => {
    captureScreenshotForVideo('manual');
  });

  markerBtn.addEventListener('click', () => {
    addQuickHighlight();
  });

  autoSnapBtn.addEventListener('click', () => {
    toggleAutoCapture();
  });

  updateAutoSnapButton(autoSnapBtn, state.autoCaptureEnabled);

  // Safe insertion with parent validation
  const parent = settingsButton.parentNode;
  if (parent && parent.contains(settingsButton)) {
    parent.insertBefore(captureBtn, settingsButton);
    parent.insertBefore(markerBtn, settingsButton);
    parent.insertBefore(autoSnapBtn, settingsButton);
  } else {
    rightControls.appendChild(captureBtn);
    rightControls.appendChild(markerBtn);
    rightControls.appendChild(autoSnapBtn);
  }
}

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
  const markerUrl = chrome.runtime.getURL('icons/icon-128.png');
  renderTimelineMarkers(state.overlay, state.highlights, state.video.duration || 1, (timestamp) => {
    if (state.video) {
      state.video.currentTime = timestamp;
    }
  }, markerUrl);
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

  const header = document.createElement('div');
  header.style.padding = '10px 14px';
  header.style.display = 'flex';
  header.style.justifyContent = 'flex-end';
  header.style.alignItems = 'center';
  header.style.background = '#f8fafc';
  header.style.borderBottom = '1px solid rgba(0,0,0,0.08)';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '✕';
  closeButton.style.cssText = 'background:transparent;border:none;color:#64748b;cursor:pointer;font-size:14px;padding:4px 8px;';
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
        entryType: 'highlight',
        videoId: state.videoId,
        videoUrl: window.location.href,
        videoTitle: document.title,
        timestamp: m.timestamp,
        note: m.note || '',
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
      addQuickHighlight();
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
      }).catch(() => {});
      console.log('[NullNote] Video changed:', state.videoId, newTitle);
    }

    // Re-inject player controls after SPA navigation clears the DOM
    setTimeout(() => {
      attachPlayerControls();
      // Re-check fullscreen state — YouTube may stay fullscreen between SPA navs
      fullscreenManager.checkState();
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

  // ── Fullscreen Integration ──────────────────────────────────────────────
  // Init the FullscreenManager. It handles:
  //   - fullscreenchange detection
  //   - injecting the toggle button into .ytp-right-controls
  //   - ESC interception (first ESC closes overlay, second exits fullscreen)
  //   - re-injection if YouTube wipes the controls
  fullscreenManager.init({
    onEnter: () => {
      // Hide normal inline panel when entering fullscreen
      // (the overlay takes its place)
      const normalPanel = document.getElementById('nullnote-inpage-panel');
      if (normalPanel) normalPanel.style.display = 'none';
      console.log('[NullNote] Fullscreen entered');
    },
    onExit: () => {
      // Destroy overlay and restore normal panel (if it was open)
      overlayManager.destroy();
      const normalPanel = document.getElementById('nullnote-inpage-panel');
      if (normalPanel) normalPanel.style.display = 'flex';
      console.log('[NullNote] Fullscreen exited');
    },
    onToggle: () => {
      overlayManager.toggle();
    },
    isOverlayOpen: () => overlayManager.isOpen(),
  });

  handleSPARouting();
  renderTimeline();

  console.log('[NullNote] Initialized — videoId:', state.videoId);
}

initialize().catch(console.error);
