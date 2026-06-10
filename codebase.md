# NullNote Codebase

## src/background/serviceWorker.ts

```typescript
import { STORAGE_MESSAGE_TYPES } from '@/utils/constants';
import { setAutoCaptureEnabled, getAutoCaptureEnabled, getAutoCaptureInterval, setAutoCaptureInterval } from '@/storage/repository';

function sendToActiveYouTubeTab(message: any) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const active = tabs[0];
    if (!active?.id) {
      return;
    }

    const isYouTube = active.url && (active.url.includes('youtube.com') || active.url.includes('youtu.be'));
    if (isYouTube) {
      // Priority 1 & 2: PING/ALIVE Heartbeat System
      chrome.tabs.sendMessage(active.id, { type: 'NULLNOTE_PING' }, (response) => {
        if (chrome.runtime.lastError || response !== 'NULLNOTE_ALIVE') {
          // No response, content script is not active. Inject it.
          chrome.scripting.executeScript({
            target: { tabId: active.id! },
            files: ['content.js']
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('NullNote: Failed to inject content script:', chrome.runtime.lastError.message);
              return;
            }
            // Once injected, send the actual message
            setTimeout(() => {
              chrome.tabs.sendMessage(active.id!, message, () => {
                if (chrome.runtime.lastError) { /* ignore */ }
              });
            }, 150);
          });
        } else {
          // Content script is alive, send directly
          chrome.tabs.sendMessage(active.id!, message, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
          });
        }
      });
    } else {
      chrome.tabs.create({ url: 'https://www.youtube.com' });
    }
  });
}

function sendToAllYouTubeTabs(message: any) {
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      }
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setAutoCaptureEnabled(false).catch(() => undefined);
});

// NOTE: chrome.action.onClicked does NOT fire when default_popup is set in the manifest.
// The popup handles the "Open NullNote" action instead.

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message?.type) {
    return false;
  }

  // === RELAY MESSAGES FROM SIDEPANEL IFRAME → ACTIVE YOUTUBE TAB ===
  // The sidepanel iframe cannot use chrome.tabs API reliably,
  // so it sends messages via chrome.runtime.sendMessage and we relay them.

  // Sidepanel tells us it's ready — relay to the tab that contains it
  if (message.type === 'sidepanel-ready') {
    if (sender.tab?.id) {
      // Came from a content script — broadcast back (unusual path)
      chrome.tabs.sendMessage(sender.tab.id, message, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
    } else {
      // Came from the extension iframe (sidepanel) — relay to active YouTube tab
      sendToActiveYouTubeTab(message);
    }
    return false;
  }

  // Relay: seekVideo, manualCapture, manualMarker, update-seekbar-markers
  if (['seekVideo', 'manualCapture', 'manualMarker', 'update-seekbar-markers'].includes(message.type)) {
    sendToActiveYouTubeTab(message);
    return false;
  }

  // Relay: video-changed — from content script to all extension pages (they listen on runtime.onMessage)
  if (message.type === 'video-changed') {
    // Already handled by runtime.onMessage listeners in other extension contexts
    return false;
  }

  // Relay: insert-marker, insert-marker-with-note, insert-screenshot, insert-screenshot-with-note
  // These come from content script → need to reach the sidepanel iframe (which listens on runtime.onMessage)
  if (message.type.startsWith('insert-')) {
    // Already received by all extension pages via runtime.onMessage — no relay needed
    return false;
  }

  // === STORAGE & SETTINGS HANDLERS (async) ===

  if (message.type === STORAGE_MESSAGE_TYPES.toggleAutoCapture) {
    void (async () => {
      const enabled = message.payload as boolean;
      await setAutoCaptureEnabled(enabled);
      // Relay to content script if the message came from the sidepanel iframe
      if (!sender.tab?.id) {
        sendToActiveYouTubeTab({ type: 'autoCaptureCommand', enabled });
      }
      respond?.({ success: true, enabled });
    })();
    return true; // Keep message channel open for async respond
  }

  if (message.type === STORAGE_MESSAGE_TYPES.setAutoCaptureInterval) {
    void (async () => {
      const interval = Number(message.payload);
      await setAutoCaptureInterval(interval);
      sendToActiveYouTubeTab({ type: 'autoCaptureIntervalCommand', interval });
      respond?.({ success: true, interval });
    })();
    return true;
  }

  if (message.type === STORAGE_MESSAGE_TYPES.getAutoCaptureState) {
    void (async () => {
      const enabled = await getAutoCaptureEnabled();
      const interval = await getAutoCaptureInterval();
      respond?.({ success: true, enabled, interval });
    })();
    return true;
  }

  if (message.type === STORAGE_MESSAGE_TYPES.captureVisibleTab) {
    const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 85 }, (imageData) => {
      if (chrome.runtime.lastError || !imageData) {
        respond?.({ success: false, error: chrome.runtime.lastError?.message || 'Unable to capture tab' });
        return;
      }
      respond?.({ success: true, imageData });
    });
    return true;
  }

  if (message.type === STORAGE_MESSAGE_TYPES.openSidePanel) {
    sendToActiveYouTubeTab({ type: 'openInPagePanel' });
    respond?.({ success: true });
    return false;
  }

  // Relay: autoCaptureCommand from content script → reaches sidepanel via runtime.onMessage
  if (message.type === 'autoCaptureCommand') {
    // Already broadcast to all extension pages. If from sidepanel, relay to tab.
    if (!sender.tab?.id) {
      sendToActiveYouTubeTab(message);
    }
    return false;
  }

  // Relay: toggleAutoCapture from sidepanel (different from STORAGE_MESSAGE_TYPES version)
  if (message.type === 'toggleAutoCapture') {
    void (async () => {
      const enabled = message.payload as boolean;
      await setAutoCaptureEnabled(enabled);
      sendToActiveYouTubeTab({ type: 'autoCaptureCommand', enabled });
      respond?.({ success: true });
    })();
    return true;
  }

  if (message.type === 'setAutoCaptureInterval') {
    void (async () => {
      const interval = Number(message.payload);
      await setAutoCaptureInterval(interval);
      sendToActiveYouTubeTab({ type: 'autoCaptureIntervalCommand', interval });
      respond?.({ success: true });
    })();
    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-notebook') {
    sendToActiveYouTubeTab({ type: 'toggleInPagePanel' });
  }

  if (command === 'toggle-auto-capture') {
    void (async () => {
      const current = await getAutoCaptureEnabled();
      const next = !current;
      await setAutoCaptureEnabled(next);
      sendToActiveYouTubeTab({ type: 'autoCaptureCommand', enabled: next });
    })();
  }
});

```

## src/content/index.ts

```typescript
import { captureVideoFrame } from './screenshot';
import { createTimelineOverlay, renderTimelineMarkers, findProgressContainer } from './timeline';
import { attachKeyboardShortcuts } from './keyboard';
import { createFloatingNoteInput, createCaptureButton, createMarkerButton, createAutoSnapButton, updateAutoSnapButton } from './ui';
import { STORAGE_MESSAGE_TYPES } from '@/utils/constants';
import type { NotebookEntry } from '@/utils/types';

// Initialization lock is handled inside initialize()

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

let isSidepanelReady = false;
const pendingMessages: any[] = [];

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

function sendMessageToSidepanel(message: any, forceOpen = true) {
  const panel = document.getElementById('nullnote-inpage-panel');
  if (!panel) {
    if (!forceOpen) return;
    isSidepanelReady = false;
    toggleInPagePanel(true);
  }

  if (isSidepanelReady && document.getElementById('nullnote-inpage-panel')) {
    chrome.runtime.sendMessage(message);
  } else {
    pendingMessages.push(message);
  }
}

function addQuickHighlight() {
  const meta = getVideoMetadata();
  sendMessageToSidepanel({
    type: 'insert-marker',
    timestamp: meta.timestamp
  }, true);
}

async function sendAutoCaptureMessage(enabled: boolean) {
  chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.toggleAutoCapture, payload: enabled }).catch(() => {});
}

async function toggleAutoCapture() {
  state.autoCaptureEnabled = !state.autoCaptureEnabled;
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

  // Create standard control buttons
  const captureBtn = createCaptureButton();
  const markerBtn = createMarkerButton();
  const autoSnapBtn = createAutoSnapButton();

  // Button Action Click listeners
  captureBtn.addEventListener('click', () => {
    captureScreenshotForVideo('manual');
  });

  markerBtn.addEventListener('click', () => {
    addQuickHighlight();
  });

  autoSnapBtn.addEventListener('click', () => {
    toggleAutoCapture();
  });

  // Sync initial render states
  updateAutoSnapButton(autoSnapBtn, state.autoCaptureEnabled);

  // Injects controls directly next to YouTube settings button
  rightControls.insertBefore(captureBtn, settingsButton);
  rightControls.insertBefore(markerBtn, settingsButton);
  rightControls.insertBefore(autoSnapBtn, settingsButton);
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
    
    // Minimal camera click tone
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
    
    // High-pitched transient click
    const clickOsc = audioCtx.createOscillator();
    const clickGain = audioCtx.createGain();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(3000, audioCtx.currentTime);
    clickGain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.015);
    
    clickOsc.connect(clickGain);
    clickGain.connect(audioCtx.destination);
    clickOsc.start();
    clickOsc.stop(audioCtx.currentTime + 0.02);
    
    setTimeout(() => {
      audioCtx.close();
    }, 100);
  } catch (e) {
    console.error('AudioContext error:', e);
  }
}

async function captureScreenshotForVideo(source: 'manual' | 'auto' = 'manual') {
  const video = state.video;
  if (!video) {
    return;
  }

  let imageData = '';
  try {
    imageData = await captureVideoFrame(video);
  } catch {
    imageData = await captureVisibleTabFallback();
  }
  if (!imageData) {
    return;
  }

  if (source === 'manual') {
    playShutterSound();
  }

  const { timestamp } = getVideoMetadata();

  sendMessageToSidepanel({
    type: 'insert-screenshot',
    timestamp,
    imageData,
    source
  }, source === 'manual');
}

async function captureVisibleTabFallback() {
  return new Promise<string>((resolve) => {
    chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.captureVisibleTab }, (response) => {
      resolve(response?.success ? response.imageData || '' : '');
    });
  });
}

function startAutoCaptureLoop() {
  stopAutoCaptureLoop();
  const intervalMs = Math.max(5, state.autoCaptureInterval) * 1000;
  state.captureTimer = window.setInterval(async () => {
    const video = state.video;
    if (!video || video.paused || video.ended) {
      return;
    }
    const currentTime = Math.round(video.currentTime);
    if (currentTime === state.lastAutoCaptureTimestamp) {
      return;
    }
    state.lastAutoCaptureTimestamp = currentTime;
    await captureScreenshotForVideo('auto');
  }, intervalMs);
}

function stopAutoCaptureLoop() {
  if (state.captureTimer) {
    window.clearInterval(state.captureTimer);
    state.captureTimer = undefined;
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
    existing.remove();
    isSidepanelReady = false;
    
    // Restore YouTube recommendations
    hiddenNodes.forEach(node => {
      node.style.display = '';
    });
    hiddenNodes.clear();
    return;
  }

  // Robust fallback selector system for YouTube layout changes
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
    console.warn('NullNote: Could not find YouTube recommendation column. Attempting body append fallback.');
    secondaryInner = document.body;
  }

  // Hide existing recommendations
  Array.from(secondaryInner.children).forEach(child => {
    if (child.id !== panelId) {
      hiddenNodes.add(child as HTMLElement);
      (child as HTMLElement).style.display = 'none';
    }
  });

  // Inject into YouTube's secondary column layout flow
  const panel = document.createElement('div');
  panel.id = panelId;
  panel.style.position = 'sticky';
  panel.style.top = '12px'; // Scroll naturally then stick 12px from top
  panel.style.width = '100%';
  panel.style.minWidth = '380px';
  panel.style.maxWidth = '440px';
  panel.style.height = 'calc(100vh - 24px)'; // 12px top and bottom margin equivalent
  panel.style.background = '#ffffff';
  panel.style.border = '1px solid rgba(0,0,0,0.08)';
  panel.style.borderRadius = '12px';
  panel.style.overflow = 'hidden';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.zIndex = '100'; // Standard z-index so it doesn't overlap header

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
  closeButton.style.background = 'transparent';
  closeButton.style.border = 'none';
  closeButton.style.color = '#64748b';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '14px';
  closeButton.style.padding = '4px 8px';
  closeButton.style.transition = 'color 0.2s';
  closeButton.addEventListener('mouseenter', () => { closeButton.style.color = '#0f172a'; });
  closeButton.addEventListener('mouseleave', () => { closeButton.style.color = '#64748b'; });
  closeButton.addEventListener('click', () => {
    panel.remove();
    isSidepanelReady = false;
    // Restore YouTube recommendations
    hiddenNodes.forEach(node => {
      node.style.display = '';
    });
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

  // Prepend to ensure it's at the top of the secondary column
  if (secondaryInner.firstChild) {
    if (secondaryInner.contains(secondaryInner.firstChild)) {
      secondaryInner.insertBefore(panel, secondaryInner.firstChild);
    } else {
      secondaryInner.appendChild(panel);
    }
  } else {
    secondaryInner.appendChild(panel);
  }
}

function attachMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Priority 1 & 2: PING/ALIVE heartbeat
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
    if (message?.type === 'sidepanel-ready') {
      isSidepanelReady = true;
      while (pendingMessages.length > 0) {
        chrome.runtime.sendMessage(pendingMessages.shift());
      }
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
        startAutoCaptureLoop();
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
  if (!player) {
    return;
  }

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

function watchVideoChanges() {
  let lastHref = window.location.href;
  window.setInterval(async () => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      const newVideoId = getVideoIdFromUrl(lastHref);
      if (newVideoId && newVideoId !== state.videoId) {
        state.videoId = newVideoId;
        state.highlights = [];
        renderTimeline();

        const nextVideo = document.querySelector('video');
        if (nextVideo) {
          state.video = nextVideo;
        }

        const newTitle = document.title.replace(' - YouTube', '').trim();
        chrome.runtime.sendMessage({
          type: 'video-changed',
          videoId: state.videoId,
          videoTitle: newTitle
        }).catch(() => {});
      }
    }
  }, 1000);
}

function handleSPARouting() {
  document.addEventListener('yt-navigate-finish', () => {
    const newVideoId = getVideoIdFromUrl(window.location.href);
    if (newVideoId && newVideoId !== state.videoId) {
      state.videoId = newVideoId;
      state.highlights = [];
      const nextVideo = document.querySelector('video');
      if (nextVideo) state.video = nextVideo;
      
      renderTimeline();
      
      const newTitle = document.title.replace(' - YouTube', '').trim();
      chrome.runtime.sendMessage({
        type: 'video-changed',
        videoId: state.videoId,
        videoTitle: newTitle
      }).catch(() => {});
    }
    
    // Ensure controls are re-injected if YouTube's SPA router wiped them
    setTimeout(() => {
      attachPlayerControls();
    }, 1000);
  });
}

async function initialize() {
  if ((window as any).__NULLNOTE_INITIALIZED__) {
    return; // Silently exit to prevent "already injected" console errors
  }
  (window as any).__NULLNOTE_INITIALIZED__ = true;

  attachMessageHandlers();

  const waitForVideo = () =>
    new Promise<HTMLVideoElement | null>((resolve) => {
      const maybeVideo = document.querySelector('video');
      if (maybeVideo) {
        return resolve(maybeVideo as HTMLVideoElement);
      }
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
    console.log('NullNote: Video element not found. Running panel in standalone mode.');
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

  watchVideoChanges();
  handleSPARouting();
  renderTimeline();
}

initialize().catch(console.error);

```

## src/content/keyboard.ts

```typescript
const HOLD_DELAY = 500;

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  
  // Standard form inputs
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  
  // ContentEditable elements (YouTube comments, our own editor, etc.)
  if (target.isContentEditable) return true;
  
  // YouTube's search box uses a custom element
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'yt-formatted-string' && target.getAttribute('contenteditable') === 'true') return true;
  
  // Check if inside the NullNote panel iframe (shouldn't reach here since iframe has its own window, but safety check)
  if (target.closest('#nullnote-inpage-panel')) return true;
  
  // YouTube's search input
  if (target.closest('ytd-searchbox') || target.closest('#search-input')) return true;
  
  return false;
}

export function attachKeyboardShortcuts(
  video: HTMLVideoElement,
  onQuickHighlight: () => void,
  onQuickScreenshot: () => void,
  onToggleAutoSnap: () => void,
  onOpenNotebook: () => void
) {
  const downHandler = (event: KeyboardEvent) => {
    // Skip if user is typing in any editable element
    if (isEditableElement(event.target) || event.isComposing) {
      return;
    }

    // Skip if any modifier key is held (except for the Ctrl+Shift+S shortcut)
    if (event.altKey || event.metaKey) {
      return;
    }

    const key = event.key.toLowerCase();

    if ((key === 'h' || key === 'p' || key === 'a') && !event.ctrlKey && !event.shiftKey) {
      // Prevent default browser behavior and YouTube shortcuts
      event.preventDefault();
      event.stopPropagation();
      console.log(`[NullNote] Shortcut ${key.toUpperCase()} detected`);

      if (key === 'h') {
        console.log('[NullNote] Marker triggered');
        onQuickHighlight();
      } else if (key === 'p') {
        console.log('[NullNote] Screenshot triggered');
        onQuickScreenshot();
      } else if (key === 'a') {
        console.log('[NullNote] AutoSnap toggled');
        onToggleAutoSnap();
      }
    }

    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      console.log('[NullNote] Open/Close notebook detected');
      onOpenNotebook();
    }
  };

  document.addEventListener('keydown', downHandler, true);

  return () => {
    document.removeEventListener('keydown', downHandler, true);
  };
}

```

## src/content/screenshot.ts

```typescript
export async function captureVideoFrame(video: HTMLVideoElement): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create canvas context.');
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

```

## src/content/timeline.ts

```typescript
import type { NotebookEntry } from '@/utils/types';
import { formatSeconds } from '@/utils/format';

const OVERLAY_ID = 'lecturesnap-timeline-overlay';

export function createTimelineOverlay(container: HTMLElement) {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.position = 'absolute';
  overlay.style.left = '0';
  overlay.style.right = '0';
  overlay.style.top = '-10px';
  overlay.style.height = '10px';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '10';
  container.style.position = 'relative';
  container.appendChild(overlay);
  return overlay;
}

export function renderTimelineMarkers(
  overlay: HTMLElement,
  entries: NotebookEntry[],
  duration: number,
  onSeek: (timestamp: number) => void,
  markerIconUrl?: string
) {
  overlay.innerHTML = '';
  const clampedDuration = Math.max(duration, 1);

  entries.forEach((entry) => {
    const position = Math.min(100, Math.max(0, (entry.timestamp / clampedDuration) * 100));
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'lecturesnap-marker';
    marker.style.pointerEvents = 'auto';
    marker.style.position = 'absolute';
    marker.style.left = `${position}%`;
    marker.style.top = '-6px';
    marker.style.transform = 'translateX(-50%)';
    marker.style.width = '16px';
    marker.style.height = '16px';
    marker.style.cursor = 'pointer';
    marker.style.border = 'none';
    marker.style.background = 'transparent';
    marker.style.padding = '0';
    marker.style.outline = 'none';
    marker.style.display = 'flex';
    marker.style.alignItems = 'center';
    marker.style.justifyContent = 'center';

    const iconImg = document.createElement('img');
    iconImg.src = markerIconUrl || chrome.runtime.getURL('icons/pin.png');
    iconImg.style.width = '14px';
    iconImg.style.height = '14px';
    iconImg.style.objectFit = 'contain';
    iconImg.style.filter = 'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.4))';
    iconImg.style.display = 'block';

    marker.appendChild(iconImg);

    // Premium custom note preview tooltip on hover
    const tooltip = document.createElement('div');
    tooltip.className = 'lecturesnap-tooltip';
    tooltip.textContent = `${formatSeconds(entry.timestamp)}${entry.note ? ` • ${entry.note}` : ''}`;
    tooltip.style.position = 'absolute';
    tooltip.style.bottom = '22px';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translateX(-50%) translateY(4px)';
    tooltip.style.background = '#1e293b';
    tooltip.style.color = '#f8fafc';
    tooltip.style.border = '1px solid rgba(255,255,255,0.08)';
    tooltip.style.borderRadius = '6px';
    tooltip.style.padding = '4px 8px';
    tooltip.style.fontSize = '11px';
    tooltip.style.fontWeight = '500';
    tooltip.style.whiteSpace = 'nowrap';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    tooltip.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
    tooltip.style.zIndex = '99999';

    marker.appendChild(tooltip);

    marker.addEventListener('mouseenter', () => {
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateX(-50%) translateY(0)';
    });

    marker.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateX(-50%) translateY(4px)';
    });

    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      onSeek(entry.timestamp);
    });
    overlay.appendChild(marker);
  });
}

export function findProgressContainer() {
  return document.querySelector('.ytp-progress-bar')?.parentElement as HTMLElement | null;
}

```

## src/content/ui.ts

```typescript
export function createFloatingNoteInput(message: string) {
  const wrapper = document.createElement('div');
  wrapper.className = 'lecturesnap-note-prompt';
  wrapper.style.position = 'fixed';
  wrapper.style.left = '50%';
  wrapper.style.bottom = '14%';
  wrapper.style.transform = 'translateX(-50%)';
  wrapper.style.zIndex = '999999';
  wrapper.style.width = 'min(92vw, 520px)';
  wrapper.style.backdropFilter = 'blur(16px)';
  wrapper.style.background = 'rgba(255, 255, 255, 0.95)';
  wrapper.style.border = '1px solid rgba(0, 0, 0, 0.08)';
  wrapper.style.borderRadius = '16px';
  wrapper.style.boxShadow = '0 16px 48px rgba(0,0,0,0.18)';
  wrapper.style.padding = '14px 18px';

  const label = document.createElement('div');
  label.textContent = message;
  label.style.color = '#1e293b';
  label.style.fontSize = '0.9rem';
  label.style.fontWeight = '600';
  label.style.marginBottom = '8px';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Type a note and press Enter...';
  input.style.width = '100%';
  input.style.padding = '10px 14px';
  input.style.borderRadius = '10px';
  input.style.border = '1px solid #cbd5e1';
  input.style.background = '#ffffff';
  input.style.color = '#0f172a';
  input.style.fontSize = '0.95rem';
  input.style.outline = 'none';

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  document.body.appendChild(wrapper);

  input.focus();

  return { wrapper, input };
}

function createPlayerButton(iconName: string, title: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `ytp-button ${className}`;
  button.title = title;
  button.type = 'button';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.width = '36px';
  button.style.height = '36px';
  button.style.background = 'transparent';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.outline = 'none';
  button.style.padding = '0';
  button.style.margin = '0 2px';
  button.style.verticalAlign = 'middle';
  
  const img = document.createElement('img');
  img.src = chrome.runtime.getURL(`icons/${iconName}`);
  img.style.width = '18px';
  img.style.height = '18px';
  img.style.objectFit = 'contain';
  img.style.opacity = '0.85';
  img.style.transition = 'all 0.15s ease';
  
  button.addEventListener('mouseenter', () => {
    img.style.opacity = '1';
    img.style.transform = 'scale(1.08)';
  });
  button.addEventListener('mouseleave', () => {
    img.style.opacity = '0.85';
    img.style.transform = 'scale(1)';
  });

  button.appendChild(img);
  return button;
}

export function createCaptureButton() {
  return createPlayerButton('capture.png', 'NullNote Capture Screenshot (P)', 'nullnote-player-capture');
}

export function createMarkerButton() {
  return createPlayerButton('icon-128.png', 'NullNote Add Marker (H)', 'nullnote-player-marker');
}

export function createAutoSnapButton() {
  return createPlayerButton('capture.png', 'NullNote Toggle AutoSnap', 'nullnote-player-autosnap');
}

export function updateAutoSnapButton(button: HTMLButtonElement, enabled: boolean) {
  const img = button.querySelector('img');
  if (img) {
    if (enabled) {
      img.style.filter = 'drop-shadow(0 0 6px #f59e0b) brightness(1.2) sepia(100%) hue-rotate(15deg) saturate(1000%)';
      img.style.opacity = '1';
    } else {
      img.style.filter = 'none';
      img.style.opacity = '0.85';
    }
  }
}

```

## src/export/exporters.ts

```typescript
import { getScreenshotsForVideo } from '@/storage/repository';
import { formatSeconds } from '@/utils/format';

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Converts temporary Object URLs in HTML to self-contained Base64 data URLs using database Blobs
export async function prepareSelfContainedHtml(editorHtml: string, videoId: string): Promise<string> {
  if (!videoId) return editorHtml;

  try {
    const screenshots = await getScreenshotsForVideo(videoId);
    const base64Map: Record<string, string> = {};

    for (const s of screenshots) {
      if (s.imageBlob) {
        const base64 = await blobToBase64(s.imageBlob);
        base64Map[s.id] = base64;
      }
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(editorHtml, 'text/html');
    const imgs = doc.querySelectorAll('img[data-screenshot-id]');

    imgs.forEach((img) => {
      const id = img.getAttribute('data-screenshot-id');
      if (id && base64Map[id]) {
        img.setAttribute('src', base64Map[id]);
      }
    });

    return doc.body.innerHTML;
  } catch (e) {
    console.error('Error preparing self-contained HTML:', e);
    return editorHtml;
  }
}

export function convertHtmlToMarkdown(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const markdownLines: string[] = [];

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      markdownLines.push(node.textContent || '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

        if (el.classList.contains('marker-badge')) {
        markdownLines.push(`\n**Marker • ${el.querySelector('div:last-child')?.textContent?.trim() || ''}**\n`);
      } else if (el.classList.contains('screenshot-block')) {
        const timestampEl = el.querySelector('div');
        const img = el.querySelector('img');

        markdownLines.push('\n');
        if (img) {
          const src = img.getAttribute('src') || '';
          markdownLines.push(`![Screenshot](${src})\n`);
        }
        if (timestampEl) {
          markdownLines.push(`*${timestampEl.textContent?.trim()}*\n`);
        }
        markdownLines.push('\n');
      } else {
        el.childNodes.forEach(processNode);
        if (el.tagName === 'P' || el.tagName === 'DIV' || el.tagName === 'BR') {
          markdownLines.push('\n');
        }
      }
    }
  };

  doc.body.childNodes.forEach(processNode);
  return markdownLines.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export function exportToPdf(title: string, selfContainedHtml: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export to PDF');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title || 'NullNote Export'}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
          padding: 40px;
          line-height: 1.6;
        }
        h1 {
          font-size: 28px;
          margin-bottom: 5px;
          border-bottom: 2px solid #f59e0b;
          padding-bottom: 10px;
          margin-top: 0;
        }
        .meta {
          font-size: 13px;
          color: #64748b;
          margin-bottom: 30px;
        }
        .editor-sheet {
          font-size: 15px;
        }
        .marker-badge {
          font-weight: bold;
          font-size: 16px;
          margin-bottom: 15px;
        }
        .screenshot-block {
          border-top: 1px solid #e2e8f0;
          border-bottom: 1px solid #e2e8f0;
          padding: 15px 0;
          margin: 20px 0;
          page-break-inside: avoid;
        }
        .screenshot-img {
          width: 100%;
          border-radius: 8px;
          display: block;
        }
        .screenshot-note {
          margin-top: 10px;
          font-size: 14px;
          font-weight: 500;
          color: #1e293b;
        }
        @media print {
          body { padding: 0; }
          .screenshot-block { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <h1>${title || 'Untitled Lecture Notes'}</h1>
      <div class="meta">Exported from NullNote on ${new Date().toLocaleDateString()}</div>
      <div class="editor-sheet">
        ${selfContainedHtml}
      </div>

      <script>
        window.onload = function() {
          setTimeout(() => {
            window.print();
            window.close();
          }, 350);
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export function exportToDocs(title: string, selfContainedHtml: string) {
  const wordFriendlyHtml = selfContainedHtml
    .replace(/rgba?\(245,\s*158,\s*11,\s*0\.15\)/g, '#fef08a')
    .replace(/#f59e0b/g, '#854d0e')
    .replace(/#e2e8f0/g, '#334155');

  const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <title>${title || 'NullNote Export'}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.5; color: #333333; }
        h1 { font-size: 24pt; border-bottom: 2px solid #eab308; padding-bottom: 5px; }
        .meta { color: #666; font-size: 10pt; margin-bottom: 20px; }
        .marker-badge {
          font-weight: bold;
          font-size: 14pt;
          margin-bottom: 15px;
        }
        .screenshot-block {
          border-top: 1px solid #dddddd;
          border-bottom: 1px solid #dddddd;
          padding: 15px 0;
          margin-bottom: 20px;
        }
        .screenshot-img {
          width: 550px;
          display: block;
        }
        .screenshot-note {
          margin-top: 8px;
          font-size: 11pt;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h1>${title || 'Untitled Notes'}</h1>
      <p class="meta">Exported from NullNote on ${new Date().toLocaleDateString()}</p>
      <div class="editor-content">
        ${wordFriendlyHtml}
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'Lecture_Notes').replace(/\s+/g, '_')}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToMarkdown(title: string, selfContainedHtml: string) {
  const markdown = convertHtmlToMarkdown(selfContainedHtml);
  const header = `# ${title || 'Lecture Notes'}\n\nExported from NullNote on ${new Date().toLocaleDateString()}\n\n`;
  const blob = new Blob([header + markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'Lecture_Notes').replace(/\s+/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

```

## src/hooks/useDebouncedValue.ts

```typescript
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

```

## src/hooks/useNotebookData.ts

```typescript
// Deprecated: No longer used under the unified document-centric design.
export {};

```

## src/popup/App.tsx

```typescript
import { useEffect, useMemo } from 'react';
import { STORAGE_MESSAGE_TYPES } from '@/utils/constants';

export default function PopupApp() {
  useEffect(() => {
    document.body.classList.remove('dark');
    document.body.classList.add('light');
  }, []);

  const logoUrl = useMemo(() => {
    try {
      return chrome.runtime.getURL('icons/icon-128.png');
    } catch {
      return '/icons/icon-128.png';
    }
  }, []);

  const openNullNote = () => {
    chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.openSidePanel }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
    window.close();
  };

  const openSettings = () => {
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
      }
    } catch (e) {
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    }
  };

  return (
    <main className="w-[320px] bg-slate-50 p-4 text-slate-900 antialiased select-none">
      <div className="flex flex-col gap-4">
        {/* Top Branding Card */}
        <section className="flex items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
          <img
            src={logoUrl}
            alt="NullNote Logo"
            className="h-11 w-11 shrink-0 object-contain rounded-xl shadow-sm border border-slate-100"
          />
          <div className="flex flex-col">
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              NullNote
            </h1>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              Capture. Annotate. Remember.
            </p>
          </div>
        </section>

        {/* Compact Actions Layout */}
        <div className="flex flex-col gap-2.5">
          {/* Primary Action: Open NullNote */}
          <button
            type="button"
            onClick={openNullNote}
            className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 transition-all duration-200 active:scale-[0.98] shadow-[0_4px_12px_rgba(245,158,11,0.12)] hover:shadow-[0_6px_16px_rgba(245,158,11,0.2)]"
          >
            <span className="text-base transition-transform group-hover:scale-110 duration-200">📒</span>
            <span>Open NullNote</span>
          </button>

          {/* Secondary Action: Settings */}
          <button
            type="button"
            onClick={openSettings}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 active:scale-[0.98]"
          >
            <span className="text-base">⚙</span>
            <span>Settings</span>
          </button>
        </div>
      </div>
    </main>
  );
}

```

## src/popup/main.tsx

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import PopupApp from './App';
import '@/styles/tailwind.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<PopupApp />);

```

## src/sidepanel/App.tsx

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import { getDocument, saveDocument, saveVideoTitle, getScreenshotsForVideo, saveScreenshotBlob, saveMarkerRecord, pruneOrphanedRecords, getAutoCaptureEnabled, setAutoCaptureEnabled, getAutoCaptureInterval, setAutoCaptureInterval } from '@/storage/repository';
import { formatSeconds } from '@/utils/format';
import { exportToPdf, exportToDocs, exportToMarkdown, prepareSelfContainedHtml } from '@/export/exporters';

export default function App() {
  const [videoId, setVideoId] = useState<string>('');
  const [videoTitle, setVideoTitle] = useState<string>('Untitled Lecture');
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editedTitle, setEditedTitle] = useState<string>('');
  const [autoCaptureEnabled, setAutoCaptureEnabledState] = useState<boolean>(false);
  const [autoCaptureInterval, setAutoCaptureIntervalState] = useState<number>(30);
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditorEmpty, setIsEditorEmpty] = useState<boolean>(true);

  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const videoIdRef = useRef<string>('');

  // Keep ref in sync with state so callbacks/closures always have latest value
  useEffect(() => {
    videoIdRef.current = videoId;
  }, [videoId]);

  // Resolve extension-relative icon paths
  const iconUrl = useCallback((path: string) => {
    try {
      return chrome.runtime.getURL(path);
    } catch {
      return path;
    }
  }, []);

  // Convert Base64 string to Blob
  const base64ToBlob = (base64: string, mimeType = 'image/jpeg'): Blob => {
    const parts = base64.split(',');
    const byteCharacters = atob(parts[1] || parts[0]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const revokeObjectUrls = () => {
    objectUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Failed to revoke url:', url, e);
      }
    });
    objectUrlsRef.current = [];
  };

  // Send a message to the content script via background relay
  const sendToContentScript = useCallback((message: any) => {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Suppress "Could not establish connection" errors
      }
    });
  }, []);

  // Initialize settings and detect video details
  useEffect(() => {
    // Apply light theme
    document.body.classList.remove('dark');
    document.body.classList.add('light');

    // Try to detect current video from URL using chrome.tabs if available
    try {
      chrome.tabs?.query?.({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) return;
        const activeTab = tabs?.[0];
        if (activeTab && activeTab.url && (activeTab.url.includes('youtube.com') || activeTab.url.includes('youtu.be'))) {
          try {
            const url = new URL(activeTab.url);
            const v = url.searchParams.get('v');
            if (v) {
              setVideoId(v);
              const cleanTitle = (activeTab.title || '').replace(' - YouTube', '').trim();
              setVideoTitle(cleanTitle);
            }
          } catch { /* invalid URL */ }
        }
      });
    } catch {
      // chrome.tabs not available — video ID will come from content script message
    }

    // Notify content script that the sidepanel is loaded and ready
    // This goes to background which relays to the active YouTube tab
    chrome.runtime.sendMessage({ type: 'sidepanel-ready' }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });

    // Load auto capture settings
    getAutoCaptureEnabled().then(setAutoCaptureEnabledState);
    getAutoCaptureInterval().then(setAutoCaptureIntervalState);

    return () => {
      revokeObjectUrls();
    };
  }, []);

  // Load document HTML and sync title whenever the video ID changes
  useEffect(() => {
    if (!videoId) return;

    const loadDoc = async () => {
      revokeObjectUrls();

      // Retrieve or automatically create document in NullNoteDB
      const doc = await getDocument(videoId, videoTitle);
      setVideoTitle(doc.videoTitle);

      // Load screenshot Blobs and map them to temporary Object URLs
      const screenshots = await getScreenshotsForVideo(videoId);
      const urls: Record<string, string> = {};
      screenshots.forEach((s) => {
        const url = URL.createObjectURL(s.imageBlob);
        urls[s.id] = url;
        objectUrlsRef.current.push(url);
      });

      if (editorRef.current) {
        const cleanContent = (doc.documentContent === '<p>Start typing your lecture notes here...</p>' || !doc.documentContent) ? '' : doc.documentContent;
        editorRef.current.innerHTML = cleanContent;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cleanContent;
        const textVal = tempDiv.textContent?.trim() || '';
        const hasMedia = tempDiv.querySelectorAll('img, .marker-badge').length > 0;
        setIsEditorEmpty(textVal === '' && !hasMedia);
        
        // Populate Object URLs inside elements that contain data-screenshot-id
        const imgs = editorRef.current.querySelectorAll('img[data-screenshot-id]');
        for (const img of Array.from(imgs) as HTMLImageElement[]) {
          const id = img.getAttribute('data-screenshot-id');
          if (id && urls[id]) {
            img.src = urls[id];
          }
        }

        // Scan initial HTML content and synchronize markers with the YouTube seekbar
        const markers = extractMarkers(editorRef.current);
        sendMarkersToContentScript(markers);
      }
    };

    loadDoc().catch(console.error);
  }, [videoId]);

  // Handle incoming messages from the content script (via background relay)
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (!message?.type) return;
      
      if (message.type === 'video-changed') {
        setVideoId(message.videoId);
        setVideoTitle(message.videoTitle);
      } else if (message.type === 'insert-marker') {
        insertMarkerInline(message.timestamp);
      } else if (message.type === 'insert-screenshot') {
        insertScreenshotInline(message.timestamp, message.imageData);
      } else if (message.type === 'autoCaptureCommand') {
        setAutoCaptureEnabledState(Boolean(message.enabled));
      } else if (message.type === 'autoCaptureIntervalCommand') {
        setAutoCaptureIntervalState(Number(message.interval) || 30);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [videoId]);

  const handleTitleClick = () => {
    setEditedTitle(videoTitle);
    setIsEditingTitle(true);
  };

  const handleTitleSave = async () => {
    setIsEditingTitle(false);
    if (editedTitle.trim() && editedTitle !== videoTitle) {
      setVideoTitle(editedTitle);
      if (videoId) {
        await saveVideoTitle(videoId, editedTitle);
      }
    }
  };

  const seekVideo = (timestamp: number) => {
    sendToContentScript({ type: 'seekVideo', timestamp });
  };

  // Extract marker timestamps and text preview from editor HTML
  const extractMarkers = (el: HTMLElement) => {
    const badges = el.querySelectorAll('.marker-badge');
    const markers = [];

    for (const badge of Array.from(badges)) {
      const markerId = badge.getAttribute('data-marker-id');
      const timestampAttr = badge.getAttribute('data-timestamp');
      if (!timestampAttr || !markerId) continue;
      const timestamp = Number(timestampAttr);
      if (isNaN(timestamp)) continue;

      let noteText = '';
      const screenshotBlock = badge.closest('.screenshot-block');
      if (screenshotBlock) {
        const noteEl = screenshotBlock.querySelector('.screenshot-note');
        if (noteEl) {
          noteText = noteEl.textContent?.trim() || '';
        }
      }

      if (!noteText) {
        let siblingText = '';
        let next = badge.nextSibling;
        while (next && siblingText.length < 60) {
          if (next.nodeType === Node.TEXT_NODE) {
            siblingText += next.textContent || '';
          } else if (next.nodeType === Node.ELEMENT_NODE) {
            if ((next as HTMLElement).classList.contains('marker-badge')) break;
            siblingText += (next as HTMLElement).textContent || '';
          }
          next = next.nextSibling;
        }
        noteText = siblingText.trim().slice(0, 60);
      }

      markers.push({ timestamp, note: noteText || 'Marker' });
    }

    return markers;
  };

  const sendMarkersToContentScript = (markers: any[]) => {
    sendToContentScript({ type: 'update-seekbar-markers', markers });
  };

  // Debounced auto-save function (1000ms debounce)
  const triggerSaveAndMarkerUpdate = async () => {
    const currentVideoId = videoIdRef.current;
    if (!editorRef.current || !currentVideoId) return;

    // 1. Gather all active screenshot & marker IDs from the editor HTML
    const activeScreenshotIds = Array.from(editorRef.current.querySelectorAll('[data-screenshot-id]'))
      .map(el => el.getAttribute('data-screenshot-id')!)
      .filter(Boolean);
    const activeMarkerIds = Array.from(editorRef.current.querySelectorAll('[data-marker-id]'))
      .map(el => el.getAttribute('data-marker-id')!)
      .filter(Boolean);

    // 2. Prune any orphaned screenshots/markers from IndexedDB
    await pruneOrphanedRecords(currentVideoId, activeScreenshotIds, activeMarkerIds);

    // 3. Synchronize modified marker notes from the editor back to markers store
    const badges = editorRef.current.querySelectorAll('.marker-badge');
    const markers = [];
    for (const badge of Array.from(badges)) {
      const markerId = badge.getAttribute('data-marker-id');
      const timestampAttr = badge.getAttribute('data-timestamp');
      if (!timestampAttr || !markerId) continue;
      const timestamp = Number(timestampAttr);
      if (isNaN(timestamp)) continue;

      let noteText = '';
      const screenshotBlock = badge.closest('.screenshot-block');
      if (screenshotBlock) {
        const noteEl = screenshotBlock.querySelector('.screenshot-note');
        if (noteEl) {
          noteText = noteEl.textContent?.trim() || '';
        }
      }

      if (!noteText) {
        let siblingText = '';
        let next = badge.nextSibling;
        while (next && siblingText.length < 60) {
          if (next.nodeType === Node.TEXT_NODE) {
            siblingText += next.textContent || '';
          } else if (next.nodeType === Node.ELEMENT_NODE) {
            if ((next as HTMLElement).classList.contains('marker-badge')) break;
            siblingText += (next as HTMLElement).textContent || '';
          }
          next = next.nextSibling;
        }
        noteText = siblingText.trim().slice(0, 60);
      }

      if (markerId) {
        await saveMarkerRecord(markerId, currentVideoId, timestamp, noteText || 'Marker');
      }
      markers.push({ timestamp, note: noteText || 'Marker' });
    }

    // 4. Synchronize modified screenshot notes back to screenshots store
    const screenshotBlocks = editorRef.current.querySelectorAll('.screenshot-block');
    const screenshots = await getScreenshotsForVideo(currentVideoId);
    for (const block of Array.from(screenshotBlocks)) {
      const id = block.getAttribute('data-screenshot-id');
      const timestamp = Number(block.getAttribute('data-timestamp') || '0');
      const noteEl = block.querySelector('.screenshot-note');
      if (id && noteEl) {
        const noteText = noteEl.textContent?.trim() || '';
        const match = screenshots.find(s => s.id === id);
        if (match && match.note !== noteText) {
          await saveScreenshotBlob(id, currentVideoId, timestamp, match.imageBlob, noteText);
        }
      }
    }

    // 5. Persist the current document HTML content in IndexedDB
    const html = editorRef.current.innerHTML;
    await saveDocument(currentVideoId, videoTitle, html);

    // 6. Update seekbar markers in the content script
    sendMarkersToContentScript(markers);
  };

  const handleInput = () => {
    if (editorRef.current) {
      const textVal = editorRef.current.textContent?.trim() || '';
      const hasMedia = editorRef.current.querySelectorAll('img, .marker-badge').length > 0;
      setIsEditorEmpty(textVal === '' && !hasMedia);
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(triggerSaveAndMarkerUpdate, 1000);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range;
      }
    }
  };

  const insertHtml = (html: string) => {
    if (!editorRef.current) return;
    window.focus();
    editorRef.current.focus();
    setIsEditorEmpty(false);

    const sel = window.getSelection();
    let range = savedRangeRef.current;

    if (range && editorRef.current.contains(range.commonAncestorContainer)) {
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    // Collapse to end instead of deleting selected content
    range.collapse(false);
    
    const container = document.createElement('div');
    container.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node: ChildNode | null = null;
    let lastNode: ChildNode | null = null;

    while ((node = container.firstChild)) {
      lastNode = frag.appendChild(node);
    }

    range.insertNode(frag);

    if (lastNode) {
      range.setStartAfter(lastNode);
      range.setEndAfter(lastNode);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    savedRangeRef.current = range;
    triggerSaveAndMarkerUpdate();
  };

  const insertMarkerInline = async (timestamp: number) => {
    const formatted = formatSeconds(timestamp);
    const currentVideoId = videoIdRef.current;
    const id = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    
    await saveMarkerRecord(id, currentVideoId, timestamp, 'Marker');

    const html = `
      <div class="marker-badge" data-marker-id="${id}" data-timestamp="${timestamp}" contenteditable="false" style="margin: 16px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 12px 0; cursor: pointer; user-select: none;">
        <div style="font-weight: bold; font-size: 16px; color: #0f172a; margin-bottom: 4px;">Marker</div>
        <div style="font-family: monospace; font-size: 14px; color: #64748b;">
          ${formatted}
        </div>
      </div>
      <p><br></p>
    `;
    insertHtml(html);
  };

  const insertScreenshotInline = async (timestamp: number, imageData: string) => {
    const formatted = formatSeconds(timestamp);
    const currentVideoId = videoIdRef.current;
    const id = 'scr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    
    const blob = base64ToBlob(imageData);
    await saveScreenshotBlob(id, currentVideoId, timestamp, blob);
    
    const objectUrl = URL.createObjectURL(blob);
    objectUrlsRef.current.push(objectUrl);

    const html = `
      <div class="screenshot-block marker-badge" data-timestamp="${timestamp}" data-screenshot-id="${id}" contenteditable="false" style="margin: 16px 0; padding: 12px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; cursor: pointer; user-select: none;">
        <img src="${objectUrl}" loading="lazy" data-screenshot-id="${id}" style="width: 100%; display: block; margin-bottom: 8px;" class="screenshot-img" />
        <div style="font-family: monospace; font-size: 14px; color: #64748b;">
          Timestamp ${formatted}
        </div>
      </div>
      <p><br></p>
    `;
    insertHtml(html);
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    saveSelection();
    const target = e.target as HTMLElement;
    const badge = target.closest('.marker-badge');
    if (badge) {
      const timestamp = Number(badge.getAttribute('data-timestamp'));
      if (!isNaN(timestamp)) {
        seekVideo(timestamp);
      }
    }
  };

  const handleSnap = () => {
    sendToContentScript({ type: 'manualCapture' });
  };

  const handleMarker = () => {
    sendToContentScript({ type: 'manualMarker' });
  };

  const handleToggleAutoSnap = async () => {
    const next = !autoCaptureEnabled;
    setAutoCaptureEnabledState(next);
    await setAutoCaptureEnabled(next);
    // Send to background which relays to content script
    chrome.runtime.sendMessage({ type: 'toggleAutoCapture', payload: next }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
  };

  const handleIntervalChange = async (interval: number) => {
    setAutoCaptureIntervalState(interval);
    await setAutoCaptureInterval(interval);
    chrome.runtime.sendMessage({ type: 'setAutoCaptureInterval', payload: interval }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
  };

  const performSearch = (query: string) => {
    if (!editorRef.current) return;

    // Clear previous highlights
    const existing = editorRef.current.querySelectorAll('.search-highlight');
    existing.forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });

    if (!query.trim()) return;

    // Simple text search within editor
    const q = query.trim().toLowerCase();
    const walker = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    const matches: { node: Text; index: number }[] = [];
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      const text = textNode.textContent?.toLowerCase() || '';
      let startIndex = 0;
      let idx;
      while ((idx = text.indexOf(q, startIndex)) >= 0) {
        matches.push({ node: textNode, index: idx });
        startIndex = idx + q.length;
      }
    }

    if (matches.length > 0) {
      // Process backwards to avoid corrupting text node indices
      for (let i = matches.length - 1; i >= 0; i--) {
        const { node, index } = matches[i];
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + q.length);
        
        const highlight = document.createElement('mark');
        highlight.className = 'search-highlight';
        highlight.style.background = '#fef08a';
        highlight.style.borderRadius = '2px';
        highlight.style.padding = '0 1px';
        range.surroundContents(highlight);
        
        // Scroll to the first match in the document
        if (i === 0) {
          highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  };

  const handleExport = async (format: 'pdf' | 'docs' | 'markdown') => {
    setExportMenuOpen(false);
    if (!editorRef.current || !videoId) return;

    // Autosave immediately before export
    await triggerSaveAndMarkerUpdate();

    const selfContainedHtml = await prepareSelfContainedHtml(editorRef.current.innerHTML, videoId);

    if (format === 'pdf') {
      exportToPdf(videoTitle, selfContainedHtml);
    } else if (format === 'docs') {
      exportToDocs(videoTitle, selfContainedHtml);
    } else if (format === 'markdown') {
      exportToMarkdown(videoTitle, selfContainedHtml);
    }
  };

  // Resolve icon URLs for use in JSX
  const captureIconUrl = iconUrl('icons/capture.png');
  const pinIconUrl = iconUrl('icons/pin.png');
  const logoUrl = iconUrl('icons/icon-128.png');

  return (
    <main className="h-screen overflow-hidden flex flex-col select-none bg-[var(--bg)] text-[var(--text-primary)] transition-colors duration-200">
      <style>{`
        main {
          --bg: #f8fafc;
          --surface: #ffffff;
          --border: #e2e8f0;
          --text-primary: #0f172a;
          --text-secondary: #475569;
          --accent: #d97706;
          --editor-bg: #ffffff;
          --editor-border: #cbd5e1;
          --toolbar-bg: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(155, 155, 155, 0.2);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(155, 155, 155, 0.4);
        }
        .editor-sheet {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.65;
        }
        .editor-sheet img {
          max-width: 100%;
          border-radius: 8px;
        }
        .editor-sheet p {
          margin-bottom: 8px;
        }
      `}</style>

      {/* Top Header - 90px Layout */}
      <header className="flex flex-col border-b border-[var(--border)] bg-gradient-to-r from-slate-50 to-white px-3 py-2 z-30 shadow-sm min-h-[90px] justify-between">
        {/* Row 1: Brand */}
        <div className="flex items-center gap-2 mb-2">
          <img
            src={logoUrl}
            alt="NullNote Logo"
            className="h-7 w-7 shrink-0 object-contain rounded-md"
          />
          <span className="font-bold text-[15px] tracking-tight text-[var(--text-primary)]">NullNote</span>
        </div>

        {/* Row 2: Title, Search, Export */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0 relative">
            {isEditingTitle ? (
              <input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                autoFocus
                className="w-full bg-transparent border-b border-[var(--accent)] outline-none text-[13.5px] font-bold text-[var(--text-primary)]"
              />
            ) : (
              <h1
                onClick={handleTitleClick}
                className="text-[13.5px] font-bold tracking-tight text-[var(--text-primary)] cursor-pointer truncate hover:bg-slate-500/10 px-1.5 py-0.5 rounded transition"
                title="Click to rename document"
              >
                {videoTitle}
              </h1>
            )}
          </div>

          {/* Live Search Bar in Toolbar */}
          <div className="relative ml-auto w-full max-w-[130px]" title="Live search notes">
            <span className="absolute inset-y-0 left-0 flex items-center pl-1.5 text-slate-400 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                performSearch(e.target.value);
              }}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface)] pl-5 pr-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition"
            />
          </div>

          {/* Dropdown Export menu */}
          <div className="relative shrink-0 ml-2">
            <button
              type="button"
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--border)]/20 px-2 py-1 text-xs font-semibold text-[var(--text-primary)] transition"
            >
              <span>Export</span>
              <span>▼</span>
            </button>
            
            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl z-50">
                  <button
                    type="button"
                    onClick={() => handleExport('pdf')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-red-500/10 hover:text-red-500 transition"
                  >
                    <span className="text-red-500 font-bold w-6">PDF</span>
                    <span>Export to PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('docs')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-blue-500/10 hover:text-blue-500 transition"
                  >
                    <span className="text-blue-500 font-bold w-6">DOC</span>
                    <span>Export to Docs</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('markdown')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-amber-500/10 hover:text-[var(--accent)] transition"
                  >
                    <span className="text-amber-500 font-bold w-6">MD</span>
                    <span>Export to Markdown</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Editor Floating Tools Toolbar */}
      <section className="flex items-center gap-1.5 bg-[var(--toolbar-bg)] border-b border-[var(--border)] px-3 py-1 z-20">
        {/* Snap Button */}
        <button
          type="button"
          onClick={handleSnap}
          title="Snap Screenshot — Press 'P'"
          className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:text-[var(--accent)] px-2 py-1 text-[11px] font-semibold text-[var(--text-primary)] transition"
        >
          <img src={captureIconUrl} alt="" className="h-3.5 w-3.5 object-contain" />
          <span>Snap</span>
        </button>

        {/* Auto Snap Control */}
        <div className="flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)] overflow-hidden focus-within:border-[var(--accent)]" title="Auto Snap — Automatically capture screenshots at set intervals">
          <button
            type="button"
            onClick={handleToggleAutoSnap}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold transition ${
              autoCaptureEnabled
                ? 'bg-amber-100 text-[var(--accent)] font-bold'
                : 'text-[var(--text-primary)] hover:bg-slate-50'
            }`}
          >
            <img src={captureIconUrl} alt="" className="h-3.5 w-3.5 object-contain" />
            <span>Auto Snap</span>
          </button>
          
          {autoCaptureEnabled && (
            <select
              value={autoCaptureInterval}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              title="Auto Snap Interval"
              className="h-full border-l border-[var(--border)] bg-[var(--surface)] px-1 text-[10px] font-semibold text-[var(--accent)] outline-none cursor-pointer"
            >
              <option value={10}>10s</option>
              <option value={20}>20s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={120}>120s</option>
              <option value={300}>5m</option>
            </select>
          )}
        </div>

        {/* Marker Button */}
        <button
          type="button"
          onClick={handleMarker}
          title="Add Marker — Press 'H'"
          className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:text-[var(--accent)] px-2 py-1 text-[11px] font-semibold text-[var(--text-primary)] transition"
        >
          <img src={logoUrl} alt="" className="h-3.5 w-3.5 object-contain" />
          <span>Marker</span>
        </button>
      </section>

      {/* Editor Center Container */}
      <div className="flex-1 relative flex flex-col min-h-0 bg-[var(--editor-bg)]">
        {isEditorEmpty && (
          <div className="absolute top-3 left-4 pointer-events-none select-none z-10 flex items-start gap-2">
            <img src={logoUrl} alt="NullNote Logo" className="h-4 w-4 object-contain opacity-60 mt-0.5" />
            <span className="text-[14px] font-normal text-slate-400 opacity-60">
              Start capturing knowledge from this lecture.
            </span>
          </div>
        )}
        <div
          id="document-editor"
          ref={editorRef}
          contentEditable="true"
          onInput={handleInput}
          onClick={handleEditorClick}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onBlur={saveSelection}
          className="editor-sheet flex-1 overflow-y-auto px-4 py-3 outline-none custom-scrollbar"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        />
      </div>

    </main>
  );
}

```

## src/sidepanel/main.tsx

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@/styles/tailwind.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);

```

## src/storage/db.ts

```typescript
import { openDB, type IDBPDatabase } from 'idb';
import { STORAGE_DB_NAME, STORAGE_DB_VERSION, DOCUMENTS_STORE, SCREENSHOTS_STORE, MARKERS_STORE, SETTINGS_STORE } from '@/utils/constants';

export interface NullNoteDB extends IDBPDatabase<unknown> {
  readonly name: string;
  readonly version: number;
}

export async function openNullNoteDB() {
  const db = await openDB<NullNoteDB>(STORAGE_DB_NAME, STORAGE_DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(DOCUMENTS_STORE)) {
        database.createObjectStore(DOCUMENTS_STORE, { keyPath: 'videoId' });
      }
      if (!database.objectStoreNames.contains(SCREENSHOTS_STORE)) {
        const screenshotStore = database.createObjectStore(SCREENSHOTS_STORE, { keyPath: 'id' });
        screenshotStore.createIndex('videoId', 'videoId');
      }
      if (!database.objectStoreNames.contains(MARKERS_STORE)) {
        const markerStore = database.createObjectStore(MARKERS_STORE, { keyPath: 'id' });
        markerStore.createIndex('videoId', 'videoId');
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
      }
    },
  });

  return db;
}

```

## src/storage/repository.ts

```typescript
import { openNullNoteDB } from './db';
import { DOCUMENTS_STORE, SCREENSHOTS_STORE, MARKERS_STORE, SETTINGS_STORE, AUTO_CAPTURE_KEY, AUTO_CAPTURE_INTERVAL_KEY, DEFAULT_CAPTURE_INTERVAL } from '@/utils/constants';

export interface DocumentRecord {
  videoId: string;
  videoTitle: string;
  documentContent: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScreenshotRecord {
  id: string;
  videoId: string;
  timestamp: number;
  imageBlob: Blob;
  note?: string;
  createdAt: number;
}

export interface MarkerRecord {
  id: string;
  videoId: string;
  timestamp: number;
  note: string;
  createdAt: number;
}

export async function getDocument(videoId: string, defaultTitle = 'Untitled Video'): Promise<DocumentRecord> {
  const db = await openNullNoteDB();
  const doc = await db.get(DOCUMENTS_STORE, videoId);
  if (doc) {
    return doc as DocumentRecord;
  }

  // Create new document automatically
  const newDoc: DocumentRecord = {
    videoId,
    videoTitle: defaultTitle,
    documentContent: '<p>Start typing your lecture notes here...</p>',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await db.put(DOCUMENTS_STORE, newDoc);
  return newDoc;
}

export async function saveDocument(videoId: string, title: string, content: string): Promise<void> {
  const db = await openNullNoteDB();
  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite');
  const store = tx.objectStore(DOCUMENTS_STORE);
  const doc = await store.get(videoId);
  
  if (doc) {
    doc.videoTitle = title;
    doc.documentContent = content;
    doc.updatedAt = Date.now();
    await store.put(doc);
  } else {
    await store.put({
      videoId,
      videoTitle: title,
      documentContent: content,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  await tx.done;
}

export async function saveVideoTitle(videoId: string, title: string) {
  const db = await openNullNoteDB();
  const tx = db.transaction(DOCUMENTS_STORE, 'readwrite');
  const store = tx.objectStore(DOCUMENTS_STORE);
  const doc = await store.get(videoId);
  if (doc) {
    doc.videoTitle = title;
    doc.updatedAt = Date.now();
    await store.put(doc);
  }
  await tx.done;
}

export async function saveScreenshotBlob(id: string, videoId: string, timestamp: number, blob: Blob, note?: string): Promise<void> {
  const db = await openNullNoteDB();
  const record: ScreenshotRecord = {
    id,
    videoId,
    timestamp,
    imageBlob: blob,
    note,
    createdAt: Date.now()
  };
  await db.put(SCREENSHOTS_STORE, record);
}

export async function getScreenshotsForVideo(videoId: string): Promise<ScreenshotRecord[]> {
  const db = await openNullNoteDB();
  const screenshots = await db.getAllFromIndex(SCREENSHOTS_STORE, 'videoId', videoId);
  return screenshots as ScreenshotRecord[];
}

export async function saveMarkerRecord(id: string, videoId: string, timestamp: number, note: string): Promise<void> {
  const db = await openNullNoteDB();
  const record: MarkerRecord = {
    id,
    videoId,
    timestamp,
    note,
    createdAt: Date.now()
  };
  await db.put(MARKERS_STORE, record);
}

export async function getMarkersForVideo(videoId: string): Promise<MarkerRecord[]> {
  const db = await openNullNoteDB();
  const markers = await db.getAllFromIndex(MARKERS_STORE, 'videoId', videoId);
  return markers as MarkerRecord[];
}

export async function pruneOrphanedRecords(videoId: string, activeScreenshotIds: string[], activeMarkerIds: string[]): Promise<void> {
  const db = await openNullNoteDB();

  // Prune Screenshots
  const txS = db.transaction(SCREENSHOTS_STORE, 'readwrite');
  const storeS = txS.objectStore(SCREENSHOTS_STORE);
  const screenshots = await storeS.index('videoId').getAll(videoId);
  for (const s of screenshots) {
    if (!activeScreenshotIds.includes(s.id)) {
      await storeS.delete(s.id);
    }
  }
  await txS.done;

  // Prune Markers
  const txM = db.transaction(MARKERS_STORE, 'readwrite');
  const storeM = txM.objectStore(MARKERS_STORE);
  const markers = await storeM.index('videoId').getAll(videoId);
  for (const m of markers) {
    if (!activeMarkerIds.includes(m.id)) {
      await storeM.delete(m.id);
    }
  }
  await txM.done;
}

export async function getAutoCaptureEnabled(): Promise<boolean> {
  const db = await openNullNoteDB();
  const setting = await db.get(SETTINGS_STORE, AUTO_CAPTURE_KEY);
  return setting?.value === true;
}

export async function setAutoCaptureEnabled(enabled: boolean): Promise<void> {
  const db = await openNullNoteDB();
  await db.put(SETTINGS_STORE, { id: AUTO_CAPTURE_KEY, value: enabled });
}

export async function getAutoCaptureInterval(): Promise<number> {
  const db = await openNullNoteDB();
  const setting = await db.get(SETTINGS_STORE, AUTO_CAPTURE_INTERVAL_KEY);
  return typeof setting?.value === 'number' ? setting.value : DEFAULT_CAPTURE_INTERVAL;
}

export async function setAutoCaptureInterval(interval: number): Promise<void> {
  const db = await openNullNoteDB();
  await db.put(SETTINGS_STORE, { id: AUTO_CAPTURE_INTERVAL_KEY, value: interval });
}

export async function getThemeSetting(): Promise<'light' | 'dark'> {
  const db = await openNullNoteDB();
  const setting = await db.get(SETTINGS_STORE, 'theme');
  return (setting?.value as 'light' | 'dark') || 'dark';
}

export async function setThemeSetting(theme: 'light' | 'dark'): Promise<void> {
  const db = await openNullNoteDB();
  await db.put(SETTINGS_STORE, { id: 'theme', value: theme });
}

```

## src/utils/constants.ts

```typescript
export const STORAGE_DB_NAME = 'NullNoteDB';
export const STORAGE_DB_VERSION = 1;
export const DOCUMENTS_STORE = 'documents';
export const SCREENSHOTS_STORE = 'screenshots';
export const MARKERS_STORE = 'markers';
export const SETTINGS_STORE = 'settings';

export const AUTO_CAPTURE_KEY = 'autoCaptureEnabled';
export const AUTO_CAPTURE_INTERVAL_KEY = 'autoCaptureInterval';

export const DEFAULT_CAPTURE_INTERVAL = 30;
export const CAPTURE_INTERVAL_OPTIONS = [10, 20, 30, 60, 120, 300] as const;

export const STORAGE_MESSAGE_TYPES = {
  saveHighlight: 'saveHighlight',
  saveScreenshot: 'saveScreenshot',
  syncVideoMeta: 'syncVideoMeta',
  toggleAutoCapture: 'toggleAutoCapture',
  setAutoCaptureInterval: 'setAutoCaptureInterval',
  queryVideoEntries: 'queryVideoEntries',
  getAutoCaptureState: 'getAutoCaptureState',
  captureVisibleTab: 'captureVisibleTab',
  exportData: 'exportData',
  openSidePanel: 'openSidePanel',
} as const;

export const SIDE_PANEL_TITLE = 'NullNote';

```

## src/utils/format.ts

```typescript
export function formatSeconds(value: number): string {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

```

## src/utils/id.ts

```typescript
export function createId(prefix = 'ls') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

```

## src/utils/types.ts

```typescript
export type EntryType = 'highlight' | 'screenshot' | 'autoCapture';

export interface VideoRecord {
  id: string;
  url: string;
  title: string;
  duration: number;
  thumbnail?: string;
  lastUpdatedAt: number;
  createdAt: number;
}

export interface HighlightRecord {
  id: string;
  videoId: string;
  videoUrl: string;
  videoTitle: string;
  timestamp: number;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScreenshotRecord {
  id: string;
  videoId: string;
  videoUrl: string;
  videoTitle: string;
  timestamp: number;
  imageData: string;
  note?: string;
  ocrText: string;
  source: 'manual' | 'auto';
  createdAt: number;
}

export interface SettingRecord {
  id: string;
  value: string | number | boolean;
}

export interface NotebookEntry {
  id: string;
  entryType: EntryType;
  videoId: string;
  videoUrl: string;
  videoTitle: string;
  timestamp: number;
  note?: string;
  imageData?: string;
  ocrText?: string;
  source?: 'manual' | 'auto';
  createdAt: number;
}

```

