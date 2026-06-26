import { STORAGE_MESSAGE_TYPES, ENABLE_GOOGLE_DRIVE } from '@/utils/constants';
import { setAutoCaptureEnabled, getAutoCaptureEnabled, getAutoCaptureInterval, setAutoCaptureInterval, getSelectedMarkerIcon } from '@/storage/repository';
import { AuthService } from '@/services/AuthService';
import { FolderService } from '@/services/FolderService';
import { getDriveConnectionState, setDriveConnectionState, clearDriveConnectionState } from '@/storage/DriveStorageProvider';

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

chrome.runtime.onInstalled.addListener((details) => {
  setAutoCaptureEnabled(false).catch(() => undefined);
  if (details.reason === 'install' && ENABLE_GOOGLE_DRIVE) {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') });
  }
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

  // Relay: seekVideo, manualCapture, manualMarker, update-seekbar-markers, selectedMarkerIconChanged, toggleInPagePanel, restorePlayerFocus
  if (['seekVideo', 'manualCapture', 'manualMarker', 'update-seekbar-markers', 'selectedMarkerIconChanged', 'toggleInPagePanel', 'restorePlayerFocus'].includes(message.type)) {
    sendToActiveYouTubeTab(message);
    return false;
  }

  // Relay: video-changed — from content script → sidepanel needs to know
  if (message.type === 'video-changed') {
    // The sidepanel iframe listens on chrome.runtime.onMessage and receives this automatically
    // No explicit relay needed — Chrome broadcasts to all extension contexts in the same profile
    return false;
  }

  // insert-screenshot and insert-marker come FROM the content script and must reach
  // the sidepanel iframe. The sidepanel listens on chrome.runtime.onMessage, so we
  // must re-broadcast the message via chrome.runtime.sendMessage here in the background.
  // NOTE: chrome.runtime.sendMessage from a content script reaches ONLY the background —
  // it does NOT automatically forward to other extension pages. The background must
  // explicitly relay it.
  if (message.type.startsWith('insert-')) {
    chrome.runtime.sendMessage(message).catch(() => {});
    return false;
  }

  // === STORAGE & SETTINGS HANDLERS (async) ===

  if (message.type === STORAGE_MESSAGE_TYPES.toggleAutoCapture) {
    void (async () => {
      const enabled = message.payload as boolean;
      await setAutoCaptureEnabled(enabled);
      // 1. Relay to content script in all YouTube tabs via tabs.sendMessage
      //    (tabs.sendMessage reaches content scripts, NOT extension pages)
      // CRITICAL: Always relay unconditionally — sender.tab IS populated when sidepanel
      //           is an iframe inside the YouTube tab, making !sender.tab?.id always false.
      sendToAllYouTubeTabs({ type: 'autoCaptureCommand', enabled });
      // 2. Also broadcast via runtime.sendMessage so the sidepanel iframe's
      //    chrome.runtime.onMessage listener receives the state change for UI sync.
      //    (runtime.sendMessage broadcasts to all extension contexts, not tabs)
      chrome.runtime.sendMessage({ type: 'autoCaptureCommand', enabled }).catch(() => {});
      respond?.({ success: true, enabled });
    })();
    return true; // Keep message channel open for async respond
  }

  if (message.type === STORAGE_MESSAGE_TYPES.setAutoCaptureInterval) {
    void (async () => {
      const interval = Number(message.payload);
      await setAutoCaptureInterval(interval);
      // Broadcast to all YouTube tabs
      sendToAllYouTubeTabs({ type: 'autoCaptureIntervalCommand', interval });
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

  // NOTE: 'autoCaptureCommand' messages from the content script do NOT need relaying.
  // Chrome runtime.onMessage automatically delivers to all extension pages (sidepanel iframe).
  // Re-relaying them to the tab would create an echo loop: content → background → content → ...
  // The sidepanel already receives the message directly from Chrome's broadcast.
  //
  // NOTE: 'toggleAutoCapture' and 'setAutoCaptureInterval' raw string literals are intentionally
  // removed here — STORAGE_MESSAGE_TYPES.toggleAutoCapture === 'toggleAutoCapture' and
  // STORAGE_MESSAGE_TYPES.setAutoCaptureInterval === 'setAutoCaptureInterval', so those
  // canonical handlers above already handle these messages. Duplicate handlers caused double-fire.

  if (message.type === 'openOptionsPage') {
    chrome.runtime.openOptionsPage();
    respond?.({ success: true });
    return false;
  }

  if (message.type === 'getSelectedMarkerIcon') {
    void (async () => {
      const icon = await getSelectedMarkerIcon();
      respond?.({ success: true, icon });
    })();
    return true;
  }

  // === GOOGLE DRIVE HANDLERS ===
  if (message.type === STORAGE_MESSAGE_TYPES.googleDrive.getState) {
    void (async () => {
      const state = await getDriveConnectionState();
      respond?.({ success: true, state });
    })();
    return true;
  }

  if (message.type === STORAGE_MESSAGE_TYPES.googleDrive.connect) {
    void (async () => {
      try {
        const token = await AuthService.getAuthToken(true);
        const userInfo = await AuthService.getUserInfo(token);
        const state = await setDriveConnectionState({
          connected: true,
          account: {
            id: userInfo.id,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
          },
          connectedAt: Date.now(),
          lastError: undefined,
        });
        respond?.({ success: true, state });
      } catch (err: any) {
        await setDriveConnectionState({ connected: false, lastError: err.message });
        respond?.({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === STORAGE_MESSAGE_TYPES.googleDrive.disconnect) {
    void (async () => {
      try {
        await AuthService.clearAllCachedAuthTokens();
        await clearDriveConnectionState();
        const state = await getDriveConnectionState();
        respond?.({ success: true, state });
      } catch (err: any) {
        respond?.({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === STORAGE_MESSAGE_TYPES.googleDrive.ensureRootFolder) {
    void (async () => {
      try {
        const folder = await FolderService.ensureNullNoteRootFolder();
        const state = await setDriveConnectionState({ rootFolderId: folder.id });
        respond?.({ success: true, folder, state });
      } catch (err: any) {
        respond?.({ success: false, error: err.message });
      }
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
      // 1. Broadcast to content script in ALL YouTube tabs
      sendToAllYouTubeTabs({ type: 'autoCaptureCommand', enabled: next });
      // 2. Broadcast to sidepanel iframe via runtime.sendMessage
      //    Keyboard shortcut has no response callback, so the sidepanel's
      //    runtime.onMessage listener is the ONLY way it learns of the change.
      chrome.runtime.sendMessage({ type: 'autoCaptureCommand', enabled: next }).catch(() => {});
    })();
  }
});
