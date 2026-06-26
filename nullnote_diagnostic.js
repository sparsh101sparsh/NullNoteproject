/**
 * NullNote Auto-Capture Diagnostic Script
 * 
 * INSTRUCTIONS:
 * 1. Open a YouTube video page: https://youtube.com/watch?v=dQw4w9WgXcQ
 * 2. Open Chrome DevTools (F12 / Cmd+Option+I)
 * 3. Go to Console tab
 * 4. Paste the entire contents of this file and press Enter
 * 5. Read the diagnostic output
 * 
 * This script tests the auto-capture pipeline end-to-end.
 */

(async function nullnoteDiagnostic() {
  console.log('=== NullNote Auto-Capture Diagnostic ===');
  
  // 1. Check content script initialized
  const initialized = (window).__NULLNOTE_INITIALIZED__;
  console.log('[1] Content script initialized:', initialized ? '✅ YES' : '❌ NO (try reloading the page)');
  
  if (!initialized) {
    console.warn('Content script not loaded. Reload YouTube page with extension active.');
    return;
  }
  
  // 2. Check video element
  const video = document.querySelector('video');
  console.log('[2] Video element found:', video ? '✅ YES' : '❌ NO');
  if (video) {
    console.log('    - readyState:', video.readyState, '(need >= 2)');
    console.log('    - videoWidth:', video.videoWidth, '/ videoHeight:', video.videoHeight, '(need > 0)');
    console.log('    - paused:', video.paused);
    console.log('    - ended:', video.ended);
    console.log('    - currentTime:', Math.round(video.currentTime), 's');
    console.log('    - isConnected:', video.isConnected);
  }
  
  // 3. Check page type
  const isWatchPage = window.location.pathname === '/watch' && !!new URLSearchParams(window.location.search).get('v');
  const isShorts = window.location.pathname.startsWith('/shorts');
  console.log('[3] Page type check:');
  console.log('    - isWatchPage:', isWatchPage ? '✅ YES' : '❌ NO');
  console.log('    - isShorts:', isShorts ? '⚠️ YES (auto-capture disabled on Shorts)' : '✅ NO');
  
  // 4. Check ads
  const moviePlayer = document.getElementById('movie_player');
  const adShowing = moviePlayer?.classList.contains('ad-showing') || !!document.querySelector('.ad-showing');
  console.log('[4] Ad showing:', adShowing ? '⚠️ YES (captures will be skipped)' : '✅ NO');
  
  // 5. Test chrome.runtime messaging (check background reachability)
  console.log('[5] Testing background messaging...');
  const bgResponse = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ success: false, error: 'timeout' }), 3000);
    try {
      chrome.runtime.sendMessage({ type: 'getAutoCaptureState' }, (resp) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp);
        }
      });
    } catch (e) {
      clearTimeout(timeout);
      resolve({ success: false, error: e.message });
    }
  });
  
  if (bgResponse.success) {
    console.log('    ✅ Background reachable. Auto-capture state:', bgResponse);
    console.log('    - enabled:', bgResponse.enabled, '| interval:', bgResponse.interval, 'seconds');
  } else {
    console.log('    ❌ Background NOT reachable:', bgResponse.error);
    console.log('    This means service worker may be sleeping. Try again.');
  }
  
  // 6. Simulate a toggle via background and check if content script receives it
  console.log('[6] Testing toggle relay to content script...');
  console.log('    Sending toggleAutoCapture via background...');
  
  const toggleResponse = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ success: false, error: 'timeout' }), 5000);
    try {
      chrome.runtime.sendMessage({ type: 'toggleAutoCapture', payload: true }, (resp) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp);
        }
      });
    } catch (e) {
      clearTimeout(timeout);
      resolve({ success: false, error: e.message });
    }
  });
  
  console.log('    Toggle response from background:', toggleResponse);
  
  // Wait 1 second to let the relay fire
  await new Promise(r => setTimeout(r, 1000));
  
  // 7. Check auto-capture state again
  const stateAfter = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ success: false, error: 'timeout' }), 3000);
    chrome.runtime.sendMessage({ type: 'getAutoCaptureState' }, (resp) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(resp);
      }
    });
  });
  
  console.log('[7] Auto-capture state after toggle:', stateAfter);
  if (stateAfter.enabled) {
    console.log('    ✅ Auto-capture IS enabled in storage');
  } else {
    console.log('    ❌ Auto-capture still shows disabled in storage!');
  }
  
  // 8. Check in-page panel
  const panel = document.getElementById('nullnote-inpage-panel');
  console.log('[8] NullNote panel DOM element:', panel ? '✅ Found' : '❌ Not in DOM');
  
  // 9. Try manual canvas frame capture
  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    console.log('[9] Testing canvas frame capture...');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      if (dataUrl && dataUrl.length > 100) {
        console.log('    ✅ Canvas capture works. Size:', Math.round(dataUrl.length / 1024), 'KB');
      } else {
        console.log('    ❌ Canvas capture returned empty/small data:', dataUrl?.length, 'bytes');
      }
    } catch (e) {
      console.log('    ❌ Canvas capture threw error:', e.message);
    }
  } else {
    console.log('[9] ⚠️ Skipping canvas test — video not ready');
  }
  
  // Turn auto-capture back off
  await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'toggleAutoCapture', payload: false }, () => resolve());
  });
  console.log('[10] Cleaned up: auto-capture set back to false');
  
  console.log('=== Diagnostic Complete ===');
  console.log('Filter console with: [NullNote] to see live auto-capture logs');
})();
