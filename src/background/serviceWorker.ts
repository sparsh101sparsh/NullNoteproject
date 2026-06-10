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

  // Relay: video-changed — from content script → sidepanel needs to know
  if (message.type === 'video-changed') {
    // The sidepanel iframe listens on chrome.runtime.onMessage and receives this automatically
    // No explicit relay needed — Chrome broadcasts to all extension contexts in the same profile
    return false;
  }

  // CRITICAL FIX: insert-marker and insert-screenshot come FROM the content script.
  // They must reach the sidepanel iframe. The sidepanel IS an extension page and receives
  // chrome.runtime messages automatically. We do NOT need to relay — but we must NOT
  // return early before Chrome has a chance to dispatch. Return false to allow dispatch.
  // The previous code had a wrong comment and was effectively working, but the real bug
  // is that content script was NOT sending these to background at all (it was using
  // sendMessageToSidepanel which was gated by isSidepanelReady). Now content script
  // sends directly to background always, and background passes through here.
  if (message.type.startsWith('insert-')) {
    // Pass-through: Chrome automatically delivers runtime messages to all extension pages
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
