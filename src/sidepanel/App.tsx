import { useEffect, useRef, useState, useCallback } from 'react';
import { getDocument, saveDocument, saveVideoTitle, getScreenshotsForVideo, saveScreenshotBlob, saveMarkerRecord, pruneOrphanedRecords, getAutoCaptureEnabled, setAutoCaptureEnabled, getAutoCaptureInterval, setAutoCaptureInterval } from '@/storage/repository';
import { formatSeconds } from '@/utils/format';
import { exportToPdf, exportToDocs, exportToMarkdown, prepareSelfContainedHtml } from '@/export/exporters';

export default function App() {
  const [videoId, setVideoId] = useState<string>('');
  const [videoTitle, setVideoTitle] = useState<string>('Untitled Lecture');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editedTitle, setEditedTitle] = useState<string>('');
  const [autoCaptureEnabled, setAutoCaptureEnabledState] = useState<boolean>(false);
  const [autoCaptureInterval, setAutoCaptureIntervalState] = useState<number>(30);
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditorEmpty, setIsEditorEmpty] = useState<boolean>(true);

  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const videoIdRef = useRef<string>('');
  const videoTitleRef = useRef<string>('Untitled Lecture');
  const videoUrlRef = useRef<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // CRITICAL: Keep refs in sync with state so closures always see latest values
  useEffect(() => { videoIdRef.current = videoId; }, [videoId]);
  useEffect(() => { videoTitleRef.current = videoTitle; }, [videoTitle]);
  useEffect(() => { videoUrlRef.current = videoUrl; }, [videoUrl]);

  const iconUrl = useCallback((path: string) => {
    try { return chrome.runtime.getURL(path); } catch { return path; }
  }, []);

  const base64ToBlob = (base64: string, mimeType = 'image/jpeg'): Blob => {
    const parts = base64.split(',');
    const byteCharacters = atob(parts[1] || parts[0]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  };

  const revokeObjectUrls = () => {
    objectUrlsRef.current.forEach(url => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } });
    objectUrlsRef.current = [];
  };

  const sendToContentScript = useCallback((message: any) => {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) { /* suppress */ }
    });
  }, []);

  // ─── INITIALIZATION ────────────────────────────────────────────────────────

  useEffect(() => {
    document.body.classList.remove('dark');
    document.body.classList.add('light');

    // Detect current video from active tab
    try {
      chrome.tabs?.query?.({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) return;
        const tab = tabs?.[0];
        if (tab?.url && (tab.url.includes('youtube.com') || tab.url.includes('youtu.be'))) {
          try {
            const url = new URL(tab.url);
            const v = url.searchParams.get('v');
            if (v) {
              setVideoId(v);
              setVideoUrl(tab.url);
              setVideoTitle((tab.title || '').replace(' - YouTube', '').trim() || 'Untitled Lecture');
            }
          } catch { /* invalid URL */ }
        }
      });
    } catch { /* chrome.tabs not available */ }

    // Notify content script that sidepanel is ready
    chrome.runtime.sendMessage({ type: 'sidepanel-ready' }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });

    getAutoCaptureEnabled().then(setAutoCaptureEnabledState);
    getAutoCaptureInterval().then(setAutoCaptureIntervalState);

    return () => { revokeObjectUrls(); };
  }, []);

  // ─── DOCUMENT LOAD ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!videoId) return;

    const loadDoc = async () => {
      revokeObjectUrls();
      const doc = await getDocument(videoId, videoTitle);
      setVideoTitle(doc.videoTitle);

      const screenshots = await getScreenshotsForVideo(videoId);
      const urls: Record<string, string> = {};
      screenshots.forEach(s => {
        const url = URL.createObjectURL(s.imageBlob);
        urls[s.id] = url;
        objectUrlsRef.current.push(url);
      });

      if (editorRef.current) {
        const isPlaceholder = doc.documentContent === '<p>Start typing your lecture notes here...</p>';
        editorRef.current.innerHTML = isPlaceholder ? '' : (doc.documentContent || '');

        const textVal = editorRef.current.textContent?.trim() || '';
        const hasMedia = editorRef.current.querySelectorAll('img, .marker-badge').length > 0;
        setIsEditorEmpty(textVal === '' && !hasMedia);

        // Restore screenshot blobs from IndexedDB into img srcs
        editorRef.current.querySelectorAll<HTMLImageElement>('img[data-screenshot-id]').forEach(img => {
          const id = img.getAttribute('data-screenshot-id');
          if (id && urls[id]) img.src = urls[id];
        });

        sendMarkersToContentScript(extractMarkers(editorRef.current));
      }
    };

    loadDoc().catch(e => console.error('[NullNote] Failed to load document:', e));
  }, [videoId]);

  // ─── MESSAGE LISTENER ──────────────────────────────────────────────────────
  // CRITICAL FIX: No [videoId] dependency — listener is stable for the entire lifetime.
  // We use refs (videoIdRef, videoTitleRef) inside to always access current values.
  // This prevents stale closures and gaps during re-registration.

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (!message?.type) return;

      console.log('[NullNote] Sidepanel received message:', message.type);

      if (message.type === 'video-changed') {
        setVideoId(message.videoId);
        setVideoTitle(message.videoTitle || 'Untitled Lecture');
        if (message.videoUrl) setVideoUrl(message.videoUrl);
      } else if (message.type === 'insert-marker') {
        // imageData is optionally included when marker was triggered alongside a screenshot
        insertMarkerInline(message.timestamp, message.imageData);
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
  }, []); // EMPTY deps — stable listener, uses refs internally

  // ─── EDITOR UTILITIES ──────────────────────────────────────────────────────

  const extractMarkers = (el: HTMLElement) => {
    const badges = el.querySelectorAll('.marker-badge[data-timestamp]');
    const markers: { timestamp: number; note: string }[] = [];
    badges.forEach(badge => {
      const ts = Number(badge.getAttribute('data-timestamp'));
      if (!isNaN(ts)) {
        markers.push({ timestamp: ts, note: 'Marker' });
      }
    });
    return markers;
  };

  const sendMarkersToContentScript = (markers: any[]) => {
    sendToContentScript({ type: 'update-seekbar-markers', markers });
  };

  const triggerSaveAndMarkerUpdate = useCallback(async () => {
    const currentVideoId = videoIdRef.current;
    const currentVideoTitle = videoTitleRef.current;
    if (!editorRef.current || !currentVideoId) return;

    try {
      // Gather active IDs from the live editor DOM
      const activeScreenshotIds = Array.from(editorRef.current.querySelectorAll('[data-screenshot-id]'))
        .map(el => el.getAttribute('data-screenshot-id')!).filter(Boolean);
      const activeMarkerIds = Array.from(editorRef.current.querySelectorAll('[data-marker-id]'))
        .map(el => el.getAttribute('data-marker-id')!).filter(Boolean);

      // Prune orphaned records
      await pruneOrphanedRecords(currentVideoId, activeScreenshotIds, activeMarkerIds);

      // Build markers list for seekbar
      const markers: { timestamp: number; note: string }[] = [];
      editorRef.current.querySelectorAll('.marker-badge[data-marker-id]').forEach(badge => {
        const markerId = badge.getAttribute('data-marker-id');
        const ts = Number(badge.getAttribute('data-timestamp'));
        if (!markerId || isNaN(ts)) return;
        markers.push({ timestamp: ts, note: 'Marker' });
        saveMarkerRecord(markerId, currentVideoId, ts, 'Marker').catch(e =>
          console.error('[NullNote] Failed to save marker:', e)
        );
      });

      // Persist document HTML
      const html = editorRef.current.innerHTML;
      await saveDocument(currentVideoId, currentVideoTitle, html);
      sendMarkersToContentScript(markers);
    } catch (e) {
      console.error('[NullNote] Save failed:', e);
    }
  }, []);

  const handleInput = () => {
    if (editorRef.current) {
      const textVal = editorRef.current.textContent?.trim() || '';
      const hasMedia = editorRef.current.querySelectorAll('img, .marker-badge').length > 0;
      setIsEditorEmpty(textVal === '' && !hasMedia);
    }
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(triggerSaveAndMarkerUpdate, 1000);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorRef.current?.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range;
      }
    }
  };

  const insertHtml = (html: string) => {
    if (!editorRef.current) return;
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

    range.collapse(false);

    const container = document.createElement('div');
    container.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node: ChildNode | null;
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

    // Debounced save after insertion
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(triggerSaveAndMarkerUpdate, 500);
  };

  // ─── MARKER PIPELINE ─────────────────────────────────────────────────────
  // Markers optionally carry imageData — when they do, a screenshot is saved
  // alongside the marker and the block renders both the timestamp and the frame.

  const insertMarkerInline = async (timestamp: number, imageData?: string) => {
    const formatted = formatSeconds(timestamp);
    const currentVideoId = videoIdRef.current;
    const currentVideoUrl = videoUrlRef.current;
    const markerId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

    // Build a YouTube deep-link to this exact timestamp
    const deepLink = currentVideoUrl
      ? (() => {
          try {
            const u = new URL(currentVideoUrl);
            u.searchParams.set('t', String(timestamp));
            return u.toString();
          } catch { return ''; }
        })()
      : '';

    try {
      await saveMarkerRecord(markerId, currentVideoId, timestamp, 'Marker');
      console.log('[NullNote] Marker saved — id:', markerId);
    } catch (e) {
      console.error('[NullNote] Failed to save marker:', e);
    }

    // If imageData was provided, save the screenshot blob and embed it
    let screenshotHtml = '';
    if (imageData) {
      const scrId = 'scr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      try {
        const blob = base64ToBlob(imageData);
        await saveScreenshotBlob(scrId, currentVideoId, timestamp, blob);
        const objectUrl = URL.createObjectURL(blob);
        objectUrlsRef.current.push(objectUrl);
        screenshotHtml = `<img src="${objectUrl}" loading="lazy" data-screenshot-id="${scrId}" style="width:100%;display:block;border-radius:8px;margin:10px 0 6px;" class="screenshot-img" />`;
        console.log('[NullNote] Marker frame saved — scrId:', scrId);
      } catch (e) {
        console.error('[NullNote] Failed to save marker screenshot:', e);
      }
    }

    const html = `
      <div class="marker-badge" data-marker-id="${markerId}" data-timestamp="${timestamp}"
        data-video-url="${deepLink}" data-video-id="${currentVideoId}"
        contenteditable="false"
        style="margin:14px 0;border-radius:10px;border:1.5px solid #fcd34d;background:#fffbeb;padding:10px 12px;cursor:pointer;user-select:none;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:7px;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:#f59e0b;flex-shrink:0;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </span>
            <span style="font-weight:700;font-size:13px;color:#92400e;">Marker</span>
          </div>
          <span style="font-family:monospace;font-size:12px;font-weight:600;color:#b45309;background:#fef3c7;padding:2px 8px;border-radius:20px;border:1px solid #fcd34d;">${formatted}</span>
        </div>
        ${screenshotHtml}
        ${deepLink ? `<div style="margin-top:8px;font-size:11px;color:#b45309;opacity:0.7;">🔗 Click to seek to ${formatted}</div>` : ''}
      </div>
      <p><br></p>
    `;
    insertHtml(html);
    console.log('[NullNote] Marker inserted', imageData ? '(with screenshot)' : '(text only)');
  };

  // ─── SCREENSHOT PIPELINE ───────────────────────────────────────────────────

  const insertScreenshotInline = async (timestamp: number, imageData: string) => {
    const formatted = formatSeconds(timestamp);
    const currentVideoId = videoIdRef.current;
    const id = 'scr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

    let blob: Blob;
    try {
      blob = base64ToBlob(imageData);
    } catch (e) {
      console.error('[NullNote] Failed to decode screenshot image data:', e);
      return;
    }

    try {
      await saveScreenshotBlob(id, currentVideoId, timestamp, blob);
      console.log('[NullNote] Screenshot saved to IndexedDB — id:', id);
    } catch (e) {
      console.error('[NullNote] Failed to save screenshot to IndexedDB:', e);
    }

    const objectUrl = URL.createObjectURL(blob);
    objectUrlsRef.current.push(objectUrl);

    const html = `
      <div class="screenshot-block marker-badge" data-timestamp="${timestamp}" data-screenshot-id="${id}" contenteditable="false" style="margin:16px 0;padding:12px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;cursor:pointer;user-select:none;">
        <img src="${objectUrl}" loading="lazy" data-screenshot-id="${id}" style="width:100%;display:block;margin-bottom:8px;" class="screenshot-img" />
        <div style="font-family:monospace;font-size:13px;color:#64748b;">Timestamp: ${formatted}</div>
      </div>
      <p><br></p>
    `;
    insertHtml(html);
    console.log('[NullNote] Screenshot inserted into editor');
  };

  // ─── HANDLERS ──────────────────────────────────────────────────────────────

  const handleTitleClick = () => { setEditedTitle(videoTitle); setIsEditingTitle(true); };

  const handleTitleSave = async () => {
    setIsEditingTitle(false);
    if (editedTitle.trim() && editedTitle !== videoTitle) {
      setVideoTitle(editedTitle);
      if (videoId) await saveVideoTitle(videoId, editedTitle).catch(e => console.error('[NullNote] Title save failed:', e));
    }
  };

  const seekVideo = (timestamp: number) => {
    sendToContentScript({ type: 'seekVideo', timestamp });
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    saveSelection();
    const badge = (e.target as HTMLElement).closest('.marker-badge');
    if (badge) {
      const ts = Number(badge.getAttribute('data-timestamp'));
      if (!isNaN(ts)) {
        // Primary: seek video in the active tab
        seekVideo(ts);
      }
    }
  };

  const handleSnap = () => {
    console.log('[NullNote] Snap button clicked');
    sendToContentScript({ type: 'manualCapture' });
  };

  const handleMarker = () => {
    console.log('[NullNote] Marker button clicked');
    sendToContentScript({ type: 'manualMarker' });
  };

  const handleToggleAutoSnap = async () => {
    const next = !autoCaptureEnabled;
    setAutoCaptureEnabledState(next);
    await setAutoCaptureEnabled(next);
    chrome.runtime.sendMessage({ type: 'toggleAutoCapture', payload: next }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
    console.log('[NullNote] AutoSnap toggled via UI:', next);
  };

  const handleIntervalChange = async (interval: number) => {
    setAutoCaptureIntervalState(interval);
    await setAutoCaptureInterval(interval);
    chrome.runtime.sendMessage({ type: 'setAutoCaptureInterval', payload: interval }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
  };

  // ─── SEARCH ────────────────────────────────────────────────────────────────

  const performSearch = (query: string) => {
    if (!editorRef.current) return;

    // Clear previous highlights
    editorRef.current.querySelectorAll('.search-highlight').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });

    if (!query.trim()) return;

    const q = query.trim().toLowerCase();
    const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT, null);

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

    // Process backwards to preserve text node indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const { node, index } = matches[i];
      try {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + q.length);
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.style.cssText = 'background:#fef08a;border-radius:2px;padding:0 1px;';
        range.surroundContents(mark);
        if (i === 0) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch { /* skip if range is invalid */ }
    }
  };

  // ─── EXPORT ────────────────────────────────────────────────────────────────

  const handleExport = async (format: 'pdf' | 'docs' | 'markdown') => {
    setExportMenuOpen(false);

    if (!editorRef.current) {
      console.warn('[NullNote] Export skipped — editor ref not ready');
      return;
    }

    // Use ref as fallback so export works even if videoId state hasn't been set yet
    const exportVideoId = videoIdRef.current || videoId;
    const exportTitle = videoTitleRef.current || videoTitle || 'Untitled Notes';

    console.log('[NullNote] Export triggered:', format, '| videoId:', exportVideoId || '(none)');

    // Always autosave before export
    await triggerSaveAndMarkerUpdate();

    // Convert any temporary Object URLs → self-contained Base64 data URLs
    // so images survive in the exported document
    const selfContainedHtml = await prepareSelfContainedHtml(
      editorRef.current.innerHTML,
      exportVideoId
    );

    if (format === 'pdf') {
      exportToPdf(exportTitle, selfContainedHtml);
    } else if (format === 'docs') {
      exportToDocs(exportTitle, selfContainedHtml);
    } else if (format === 'markdown') {
      exportToMarkdown(exportTitle, selfContainedHtml);
    }

    console.log('[NullNote] Export completed:', format);
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  const captureIconUrl = iconUrl('icons/capture.png');
  const logoUrl = iconUrl('icons/icon-128.png');

  const searchIconSvg = (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );

  return (
    <main className="h-screen overflow-hidden flex flex-col select-none bg-white text-slate-900">
      <style>{`
        :root {
          --accent: #f59e0b;
          --accent-dark: #b45309;
          --border: #e8ecf0;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 99px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
        .editor-sheet { font-family: 'Inter', system-ui, sans-serif; font-size: 14.5px; line-height: 1.7; color: #1e293b; }
        .editor-sheet img { max-width: 100%; border-radius: 8px; }
        .editor-sheet p { margin-bottom: 6px; }
        .tool-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 600;
          border: 1.5px solid #e8ecf0; background: #fff; color: #374151;
          cursor: pointer; transition: all 0.15s;
          white-space: nowrap;
        }
        .tool-btn:hover { border-color: #f59e0b; color: #b45309; background: #fffbeb; }
        .tool-btn.active { background: #fef3c7; border-color: #f59e0b; color: #b45309; }
        .icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 8px;
          border: 1.5px solid #e8ecf0; background: #fff; color: #64748b;
          cursor: pointer; transition: all 0.15s; flex-shrink: 0;
        }
        .icon-btn:hover { border-color: #f59e0b; color: #b45309; background: #fffbeb; }
        .icon-btn.active { border-color: #f59e0b; color: #b45309; background: #fef3c7; }
        @keyframes slideDown { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
        .search-bar { animation: slideDown 0.15s ease; }
      `}</style>

      {/* ── HEADER ────────────────────────────────────────────────── */}
      <header style={{ borderBottom: '1px solid #e8ecf0', background: '#fff' }}>

        {/* Row 1: Brand + Actions */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 12px 6px' }}>
          {/* Logo + Name */}
          <img src={logoUrl} alt="NullNote" style={{ width:26, height:26, borderRadius:7, objectFit:'contain', flexShrink:0 }} />
          <span style={{ fontWeight:800, fontSize:15, letterSpacing:'-0.3px', color:'#0f172a', flexShrink:0 }}>NullNote</span>

          {/* Spacer */}
          <div style={{ flex:1 }} />

          {/* Search icon */}
          <button
            type="button"
            className={`icon-btn ${searchOpen ? 'active' : ''}`}
            title="Search notes"
            onClick={() => {
              const next = !searchOpen;
              setSearchOpen(next);
              if (!next) { setSearchQuery(''); performSearch(''); }
              else setTimeout(() => searchInputRef.current?.focus(), 80);
            }}
          >
            {searchIconSvg}
          </button>

          {/* Export */}
          <div style={{ position:'relative' }}>
            <button
              type="button"
              className="tool-btn"
              style={{ padding:'5px 10px', fontSize:11.5 }}
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </button>
            {exportMenuOpen && (
              <>
                <div style={{ position:'fixed', inset:0, zIndex:40 }} onClick={() => setExportMenuOpen(false)} />
                <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', width:168, borderRadius:12, border:'1.5px solid #e8ecf0', background:'#fff', padding:'4px', boxShadow:'0 8px 24px rgba(0,0,0,0.10)', zIndex:50 }}>
                  {[{ label:'PDF', color:'#ef4444', bg:'#fef2f2', fmt:'pdf' as const },
                    { label:'DOCX', color:'#3b82f6', bg:'#eff6ff', fmt:'docs' as const },
                    { label:'MD', color:'#f59e0b', bg:'#fffbeb', fmt:'markdown' as const }]
                    .map(opt => (
                      <button key={opt.fmt} type="button" onClick={() => handleExport(opt.fmt)}
                        style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'7px 10px', borderRadius:8, border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:600, color:'#374151' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = opt.bg; (e.currentTarget as HTMLButtonElement).style.color = opt.color; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
                      >
                        <span style={{ fontWeight:800, color:opt.color, minWidth:32 }}>{opt.label}</span>
                        <span>Export as {opt.label}</span>
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Video title */}
        <div style={{ padding:'0 12px 8px' }}>
          {isEditingTitle ? (
            <input
              value={editedTitle}
              onChange={e => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
              autoFocus
              style={{ width:'100%', background:'transparent', border:'none', borderBottom:'2px solid #f59e0b', outline:'none', fontSize:13, fontWeight:700, color:'#0f172a', padding:'2px 0' }}
            />
          ) : (
            <h1
              onClick={handleTitleClick}
              title="Click to rename"
              style={{ margin:0, fontSize:13, fontWeight:700, color:'#374151', cursor:'pointer', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', padding:'2px 4px', borderRadius:5, lineHeight:1.4 }}
            >
              {videoTitle}
            </h1>
          )}
        </div>

        {/* Inline search bar — shown only when searchOpen */}
        {searchOpen && (
          <div className="search-bar" style={{ padding:'0 12px 10px', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ position:'relative', flex:1 }}>
              <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}>
                {searchIconSvg}
              </span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search notes, markers, timestamps…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); performSearch(e.target.value); }}
                style={{ width:'100%', paddingLeft:32, paddingRight:10, paddingTop:6, paddingBottom:6, borderRadius:8, border:'1.5px solid #e8ecf0', background:'#f8fafc', fontSize:12, outline:'none', color:'#0f172a', boxSizing:'border-box' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#f59e0b'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e8ecf0'; }}
              />
            </div>
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(''); performSearch(''); }}
                style={{ fontSize:11, color:'#94a3b8', background:'none', border:'none', cursor:'pointer', padding:'4px 6px' }}>
                Clear
              </button>
            )}
          </div>
        )}
      </header>

      {/* ── TOOLBAR ───────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderBottom:'1px solid #e8ecf0', background:'#f8fafc', flexWrap:'wrap' }}>

        {/* Snap */}
        <button type="button" className="tool-btn" onClick={handleSnap} title="Snap Screenshot (P)">
          <img src={captureIconUrl} alt="" style={{ width:14, height:14, objectFit:'contain' }} />
          Snap
        </button>

        {/* Auto Snap */}
        <div style={{ display:'flex', alignItems:'stretch', borderRadius:8, border:`1.5px solid ${autoCaptureEnabled ? '#f59e0b' : '#e8ecf0'}`, overflow:'hidden', background: autoCaptureEnabled ? '#fef3c7' : '#fff' }}>
          <button type="button" onClick={handleToggleAutoSnap}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', fontSize:11.5, fontWeight:600, background:'transparent', border:'none', color: autoCaptureEnabled ? '#b45309' : '#374151', cursor:'pointer' }}
          >
            <img src={captureIconUrl} alt="" style={{ width:14, height:14, objectFit:'contain' }} />
            Auto
          </button>
          {autoCaptureEnabled && (
            <select value={autoCaptureInterval} onChange={e => handleIntervalChange(Number(e.target.value))}
              style={{ borderLeft:'1px solid #fcd34d', background:'transparent', fontSize:10.5, fontWeight:700, color:'#b45309', outline:'none', cursor:'pointer', padding:'0 6px' }}>
              <option value={10}>10s</option>
              <option value={20}>20s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={120}>2m</option>
              <option value={300}>5m</option>
            </select>
          )}
        </div>

        {/* Marker */}
        <button type="button" className="tool-btn" onClick={handleMarker} title="Add Marker (H)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Marker
        </button>

        {/* Keyboard hints */}
        <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
          {[['H','Marker'],['P','Snap'],['A','Auto']].map(([key, label]) => (
            <span key={key} title={label} style={{ fontSize:9.5, fontWeight:700, color:'#94a3b8', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:4, padding:'1px 5px', letterSpacing:'0.3px' }}>{key}</span>
          ))}
        </div>
      </div>

      {/* ── EDITOR ────────────────────────────────────────────────── */}
      <div style={{ flex:1, position:'relative', display:'flex', flexDirection:'column', minHeight:0, background:'#fff' }}>
        {isEditorEmpty && (
          <div style={{ position:'absolute', top:16, left:16, right:16, pointerEvents:'none', userSelect:'none', zIndex:10, display:'flex', alignItems:'flex-start', gap:8 }}>
            <img src={logoUrl} alt="" style={{ width:16, height:16, objectFit:'contain', opacity:0.3, marginTop:2 }} />
            <span style={{ fontSize:13.5, color:'#94a3b8', lineHeight:1.5 }}>Start capturing knowledge — press <strong style={{color:'#f59e0b'}}>H</strong> for marker, <strong style={{color:'#f59e0b'}}>P</strong> for screenshot.</span>
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
          className="editor-sheet custom-scrollbar"
          style={{ flex:1, overflowY:'auto', padding:'14px 16px', outline:'none', whiteSpace:'pre-wrap', wordBreak:'break-word' }}
        />
      </div>
    </main>
  );
}
