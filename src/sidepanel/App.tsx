import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getDocument,
  saveDocument,
  saveVideoTitle,
  getScreenshotsForVideo,
  saveScreenshotBlob,
  saveMarkerRecord,
  pruneOrphanedRecords,
  getAutoCaptureEnabled,
  setAutoCaptureEnabled,
  getAutoCaptureInterval,
  setAutoCaptureInterval,
  getSelectedMarkerIcon,
  setSelectedMarkerIcon as setSelectedMarkerIconInDb,
  getImageOutlineEnabled,
  getAllDocuments,
  deleteDocument
} from '@/storage/repository';
import { formatSeconds } from '@/utils/format';
import { compileExportDocument } from '@/export/compiler';
import { layoutDocument } from '@/export/layout';
import { renderPdf } from '@/export/pdf-renderer';
import { renderDocx } from '@/export/docx-renderer';
import { MARKER_ICONS, DEFAULT_MARKER_ICON } from '@/utils/constants';
import Logo from '@/components/Logo';

// Map marker icon keys to their corresponding border colors
function getMarkerColor(iconKey?: string): string {
  switch (iconKey) {
    case 'MarkIcon1': return '#facc15'; // yellow
    case 'MarkIcon2': return '#f87171'; // red
    case 'MarkIcon3': return '#60a5fa'; // blue
    default: return '#facc15'; // fallback yellow
  }
}

// ─── MARKER ICON PICKER ────────────────────────────────────────────────────

interface MarkerIconPickerProps {
  selected: string;
  onChange: (key: string) => void;
  iconUrl: (path: string) => string;
  isSegmented?: boolean;
}

function MarkerIconPicker({ selected, onChange, iconUrl, isSegmented }: MarkerIconPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedDef = MARKER_ICONS.find(m => m.key === selected) ?? MARKER_ICONS[0];

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: isSegmented ? 'flex' : 'inline-block', alignItems: isSegmented ? 'stretch' : 'initial' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Change Marker Color"
        style={isSegmented ? {
          width: '30px',
          height: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: open ? '#fffbeb' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          outline: 'none',
          transition: 'background 0.15s',
          borderTopRightRadius: '6px',
          borderBottomRightRadius: '6px'
        } : {
          width: '30px',
          height: '30px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1.5px solid #e8ecf0',
          background: '#fff',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
        onMouseEnter={e => { if (isSegmented) e.currentTarget.style.background = '#fffbeb'; }}
        onMouseLeave={e => { if (isSegmented) e.currentTarget.style.background = open ? '#fffbeb' : 'transparent'; }}
      >
        <img
          src={iconUrl('icons/' + selectedDef.file)}
          alt={selectedDef.label}
          style={{ width: '18px', height: '18px', objectFit: 'contain' }}
        />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            background: '#fff',
            border: '1.5px solid #e8ecf0',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
            padding: '4px',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            minWidth: '120px',
          }}
        >
          {MARKER_ICONS.map(icon => (
            <button
              key={icon.key}
              type="button"
              onClick={() => {
                onChange(icon.key);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 8px',
                borderRadius: '8px',
                border: 'none',
                background: selected === icon.key ? '#f8fafc' : 'transparent',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                color: '#374151',
                textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = selected === icon.key ? '#f8fafc' : 'transparent'}
            >
              <img
                src={iconUrl('icons/' + icon.file)}
                alt=""
                style={{ width: '18px', height: '18px', objectFit: 'contain' }}
              />
              <span>{icon.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [selectedMarkerIcon, setSelectedMarkerIconState] = useState<string>(DEFAULT_MARKER_ICON);
  const [imageOutlineEnabled, setImageOutlineEnabled] = useState<boolean>(false);
  const [notesListOpen, setNotesListOpen] = useState<boolean>(false);
  const [savedNotes, setSavedNotes] = useState<any[]>([]);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportDropdownPos, setExportDropdownPos] = useState<{top:number; right:number} | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const videoIdRef = useRef<string>('');
  const videoTitleRef = useRef<string>('Untitled Lecture');
  const videoUrlRef = useRef<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedMarkerIconRef = useRef<string>(DEFAULT_MARKER_ICON);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // CRITICAL: Keep refs in sync with state so closures always see latest values
  useEffect(() => { videoIdRef.current = videoId; }, [videoId]);
  useEffect(() => { videoTitleRef.current = videoTitle; }, [videoTitle]);
  useEffect(() => { videoUrlRef.current = videoUrl; }, [videoUrl]);
  useEffect(() => { selectedMarkerIconRef.current = selectedMarkerIcon; }, [selectedMarkerIcon]);

  // Click-outside listener: closes the export dropdown when user clicks anywhere else
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Exclude clicks inside the export button and inside the dropdown itself
      if (exportBtnRef.current?.contains(target)) return;
      if (exportDropdownRef.current?.contains(target)) return;
      setExportMenuOpen(false);
      setExportDropdownPos(null);
    };
    document.addEventListener('mousedown', onClickOutside, true);
    return () => document.removeEventListener('mousedown', onClickOutside, true);
  }, [exportMenuOpen]);

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


  const fetchSavedNotes = useCallback(async () => {
    try {
      const docs = await getAllDocuments();
      // Sort documents so the latest updated note is first
      docs.sort((a, b) => b.updatedAt - a.updatedAt);
      setSavedNotes(docs);
    } catch (err) {
      console.error('[NullNote] Failed to fetch saved notes:', err);
    }
  }, []);

  useEffect(() => {
    if (notesListOpen) {
      fetchSavedNotes();
    }
  }, [notesListOpen, fetchSavedNotes]);

  // ─── INITIALIZATION ────────────────────────────────────────────────────────

  useEffect(() => {
    document.body.classList.remove('dark');
    document.body.classList.add('light');

    // Force reset horizontal scroll state on mount/open/restore to left edge
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    const resetScroll = () => {
      window.scrollTo(0, window.scrollY);
      if (document.documentElement) document.documentElement.scrollLeft = 0;
      if (document.body) document.body.scrollLeft = 0;
    };
    resetScroll();
    const t1 = setTimeout(resetScroll, 0);
    const t2 = setTimeout(resetScroll, 100);
    const t3 = setTimeout(resetScroll, 300);

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
    getSelectedMarkerIcon().then(setSelectedMarkerIconState);
    getImageOutlineEnabled().then(setImageOutlineEnabled);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      revokeObjectUrls();
    };
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
        insertMarkerInline(message.timestamp, message.imageData, message.icon);
      } else if (message.type === 'insert-screenshot') {
        insertScreenshotInline(message.timestamp, message.imageData);
      } else if (message.type === 'autoCaptureCommand') {
        setAutoCaptureEnabledState(Boolean(message.enabled));
      } else if (message.type === 'autoCaptureIntervalCommand') {
        setAutoCaptureIntervalState(Number(message.interval) || 30);
      } else if (message.type === 'imageOutlineCommand') {
        setImageOutlineEnabled(Boolean(message.enabled));
      } else if (message.type === 'selectedMarkerIconChanged') {
        setSelectedMarkerIconState(message.icon || DEFAULT_MARKER_ICON);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []); // EMPTY deps — stable listener, uses refs internally

  // ─── EDITOR UTILITIES ──────────────────────────────────────────────────────

  const extractMarkers = (el: HTMLElement) => {
    const badges = el.querySelectorAll('.marker-badge[data-timestamp]');
    const markers: { timestamp: number; note: string; icon?: string }[] = [];
    badges.forEach(badge => {
      const ts = Number(badge.getAttribute('data-timestamp'));
      const markerIcon = badge.getAttribute('data-marker-icon') || undefined;
      if (!isNaN(ts)) {
        markers.push({ timestamp: ts, note: 'Marker', icon: markerIcon });
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
      const markers: { timestamp: number; note: string; icon?: string }[] = [];
      editorRef.current.querySelectorAll('.marker-badge[data-marker-id]').forEach(badge => {
        const markerId = badge.getAttribute('data-marker-id');
        const ts = Number(badge.getAttribute('data-timestamp'));
        const markerIcon = badge.getAttribute('data-marker-icon') || undefined;
        if (!markerId || isNaN(ts)) return;
        markers.push({ timestamp: ts, note: 'Marker', icon: markerIcon });
        saveMarkerRecord(markerId, currentVideoId, ts, 'Marker', markerIcon).catch(e =>
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

  const checkForSlashCommands = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    // Verify cursor is collapsed and in a text node
    if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
      const textNode = range.startContainer;
      const offset = range.startOffset;
      const textContent = textNode.textContent || '';

      if (offset >= 2) {
        const triggerText = textContent.slice(offset - 2, offset).toLowerCase();
        if (triggerText === '/h' || triggerText === '/p') {
          // 1. Trigger action
          if (triggerText === '/h') {
            handleMarker();
          } else {
            handleSnap();
          }

          // 2. Delete slash command characters from the text node
          const before = textContent.slice(0, offset - 2);
          const after = textContent.slice(offset);
          textNode.textContent = before + after;

          // 3. Move caret to where "/" was typed
          const newRange = document.createRange();
          newRange.setStart(textNode, offset - 2);
          newRange.collapse(true);

          selection.removeAllRanges();
          selection.addRange(newRange);

          // 4. Update the saved selection range reference
          savedRangeRef.current = newRange;
        }
      }
    }
  };

  const handleInput = () => {
    checkForSlashCommands();
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
    setIsEditorEmpty(false);

    const container = document.createElement('div');
    container.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node: ChildNode | null;
    let lastNode: ChildNode | null = null;
    while ((node = container.firstChild)) {
      lastNode = frag.appendChild(node);
    }

    // Check if we have a saved selection inside the editor
    const sel = window.getSelection();
    let range = savedRangeRef.current;

    if (range && editorRef.current.contains(range.commonAncestorContainer)) {
      // Insert at saved cursor position
      range.collapse(false);
      range.insertNode(frag);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.setEndAfter(lastNode);
      }
      savedRangeRef.current = range;
    } else {
      // No saved cursor — append to end of editor without focusing
      editorRef.current.appendChild(frag);
      // Update savedRange to point to end
      const newRange = document.createRange();
      if (lastNode) {
        newRange.setStartAfter(lastNode);
        newRange.setEndAfter(lastNode);
      } else {
        newRange.selectNodeContents(editorRef.current);
        newRange.collapse(false);
      }
      savedRangeRef.current = newRange;
    }

    // Debounced save after insertion
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(triggerSaveAndMarkerUpdate, 500);
  };

  // ─── MARKER PIPELINE ─────────────────────────────────────────────────────
  // Markers optionally carry imageData — when they do, a screenshot is saved
  // alongside the marker and the block renders both the timestamp and the frame.

  const insertMarkerInline = async (timestamp: number, imageData?: string, icon?: string) => {
    const markerIcon = icon || selectedMarkerIconRef.current;
    if (editorRef.current) {
      const existing = editorRef.current.querySelector(`.marker-badge[data-timestamp="${timestamp}"][data-marker-icon="${markerIcon}"]`);
      if (existing) {
        console.log(`[NullNote] Marker with icon ${markerIcon} already exists at timestamp ${timestamp}. Skipping duplicate.`);
        return;
      }
    }

    const formatted = formatSeconds(timestamp);
    const currentVideoId = videoIdRef.current;
    const currentVideoUrl = videoUrlRef.current;
    const markerId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

    const iconDef = MARKER_ICONS.find(m => m.key === markerIcon) ?? MARKER_ICONS[0];
    const borderColor = getMarkerColor(markerIcon);

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
      await saveMarkerRecord(markerId, currentVideoId, timestamp, 'Marker', markerIcon);
      console.log('[NullNote] Marker saved — id:', markerId, 'icon:', markerIcon);
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
        screenshotHtml = `<img src="${objectUrl}" loading="lazy" data-screenshot-id="${scrId}" style="width:100%;display:block;border-radius:8px;border:3px solid ${borderColor};box-sizing:border-box;margin-top:6px;" class="screenshot-img" />`;
        console.log('[NullNote] Marker frame saved — scrId:', scrId);
      } catch (e) {
        console.error('[NullNote] Failed to save marker screenshot:', e);
      }
    }

    const html = `
      <div
        class="marker-badge"
        data-timestamp="${timestamp}"
        data-marker-id="${markerId}"
        data-marker-icon="${markerIcon}"
        data-video-url="${deepLink}"
        data-video-id="${currentVideoId}"
        contenteditable="false"
        style="margin:6px 0;padding:0;user-select:none;display:flex;flex-direction:column;gap:2px;"
      >
        <a href="${deepLink}" target="_blank" class="timestamp-link" style="display:flex;align-items:center;text-decoration:none;font-family:ui-monospace,'JetBrains Mono','Fira Code',monospace;font-size:15px;color:#94a3b8;font-weight:600;letter-spacing:0.02em;line-height:1;margin:0;padding:0;cursor:pointer;"><img src="${chrome.runtime.getURL('icons/' + iconDef.file)}" style="width:26px;height:26px;margin-right:6px;" />${formatted}</a>
        ${screenshotHtml}
      </div>
      <p><br></p>
    `;
    insertHtml(html);
    console.log('[NullNote] Marker inserted', imageData ? '(with screenshot)' : '(text only)');
    await triggerSaveAndMarkerUpdate();
  };

  // ─── SCREENSHOT PIPELINE ───────────────────────────────────────────────────

  const insertScreenshotInline = async (timestamp: number, imageData: string) => {
    if (editorRef.current) {
      const existing = editorRef.current.querySelector(`[data-timestamp="${timestamp}"]`);
      if (existing && (existing.classList.contains('screenshot-block') || existing.querySelector('img.screenshot-img'))) {
        console.log(`[NullNote] Screenshot already exists at timestamp ${timestamp}. Skipping duplicate.`);
        return;
      }
    }

    const formatted = formatSeconds(timestamp);
    const currentVideoId = videoIdRef.current;
    const currentVideoUrl = videoUrlRef.current;
    const id = 'scr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

    const markerIcon = selectedMarkerIconRef.current;
    const borderColor = getMarkerColor(markerIcon);

    const deepLink = currentVideoUrl
      ? (() => {
          try {
            const u = new URL(currentVideoUrl);
            u.searchParams.set('t', String(timestamp));
            return u.toString();
          } catch { return ''; }
        })()
      : '';

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
      <div
        class="screenshot-block marker-badge"
        data-timestamp="${timestamp}"
        data-screenshot-id="${id}"
        data-video-url="${deepLink}"
        data-video-id="${currentVideoId}"
        contenteditable="false"
        style="margin:12px 0;padding:0;user-select:none;display:flex;flex-direction:column;gap:2px;"
      >
        <a href="${deepLink}" target="_blank" class="timestamp-link" style="display:flex;align-items:center;text-decoration:none;font-family:ui-monospace,'JetBrains Mono','Fira Code',monospace;font-size:15px;color:#94a3b8;font-weight:600;letter-spacing:0.02em;line-height:1;margin:0;padding:0;cursor:pointer;"><span style="font-size:20px;margin-right:6px;">📷</span>${formatted}</a>
        <img
          src="${objectUrl}"
          loading="lazy"
          data-screenshot-id="${id}"
          style="width:100%;display:block;border-radius:8px;border:3px solid ${borderColor};box-sizing:border-box;margin-top:6px;"
          class="screenshot-img"
        />
      </div>
      <p><br></p>
    `;
    insertHtml(html);
    console.log('[NullNote] Screenshot inserted into editor');
    await triggerSaveAndMarkerUpdate();
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
    // Only seek when clicking the specific timestamp link, not the whole badge/image
    const link = (e.target as HTMLElement).closest('.timestamp-link');
    if (link) {
      e.preventDefault(); // Prevent navigating to the href on standard left click
      const badge = link.closest('.marker-badge');
      if (badge) {
        const ts = Number(badge.getAttribute('data-timestamp'));
        if (!isNaN(ts)) {
          seekVideo(ts);
        }
      }
    }
  };

  const handleSnap = () => {
    console.log('[NullNote] Snap button clicked');
    sendToContentScript({ type: 'manualCapture' });
  };

  const handleMarker = () => {
    console.log('[NullNote] Marker button clicked — icon:', selectedMarkerIconRef.current);
    sendToContentScript({ type: 'manualMarker', icon: selectedMarkerIconRef.current });
  };

  const handleMarkerIconChange = async (icon: string) => {
    setSelectedMarkerIconState(icon);
    await setSelectedMarkerIconInDb(icon);
    chrome.runtime.sendMessage({ type: 'selectedMarkerIconChanged', icon });
    console.log('[NullNote] Marker icon changed:', icon);
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

  const handleExport = async (format: 'pdf' | 'docs') => {
    if (isExporting) return;
    setIsExporting(true);
    setExportMenuOpen(false);
    setExportDropdownPos(null);
    setExportError(null);
    setExportSuccess(null);

    // Safety timeout — reset the lock if export hangs for over 45 seconds
    const lockTimeout = window.setTimeout(() => {
      setIsExporting(false);
      setExportError('Export timed out. Please try again.');
    }, 45000);

    try {
      if (!editorRef.current) {
        console.warn('[NullNote] Export skipped — editor ref not ready');
        return;
      }

      const exportVideoId = videoIdRef.current || videoId;
      const exportTitle = videoTitleRef.current || videoTitle || 'Untitled Notes';
      const exportVideoUrl = videoUrlRef.current || videoUrl || '';

      console.log('[NullNote] Export triggered:', format, '| videoId:', exportVideoId || '(none)');

      await triggerSaveAndMarkerUpdate();

      const exportDoc = await compileExportDocument(exportVideoId, exportTitle, exportVideoUrl);

      if (format === 'pdf') {
        const pages = layoutDocument(exportDoc);
        await renderPdf(exportDoc, pages);
      } else if (format === 'docs') {
        await renderDocx(exportDoc);
      }

      const labels: Record<string, string> = { pdf: 'PDF', docs: 'DOCX' };
      setExportSuccess(`${labels[format] || format} exported successfully!`);
      setTimeout(() => setExportSuccess(null), 4000);

      console.log('[NullNote] Export completed:', format);
    } catch (e: any) {
      console.error('[NullNote] Export failed:', e);
      setExportError(`Export failed: ${e.message || String(e)}`);
    } finally {
      clearTimeout(lockTimeout);
      setIsExporting(false);
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  const captureIconUrl = iconUrl('icons/capture.png');
  const logoUrl = iconUrl('icons/newmainicon.png');

  const searchIconSvg = (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );

  return (
    <main
      className={`h-screen overflow-hidden flex flex-col select-none bg-white text-slate-900 ${imageOutlineEnabled ? 'image-outline-enabled' : 'image-outline-disabled'}`}
      style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden', minWidth: 0 }}
    >
      <style>{`
        /* Box-sizing fix: every element stays within its parent */
        *, *::before, *::after { box-sizing: border-box; }
        /* Global overflow guard: no child ever causes horizontal scroll */
        body, main, header, section, div { max-width: 100%; }
        /* Global override to disable screenshot outlines retroactively */
        .image-outline-disabled .screenshot-img { border-width: 0px !important; }
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
        .editor-sheet p { margin-top: 0; margin-bottom: 6px; }
        .editor-sheet .marker-badge { margin: 6px 0 !important; }
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
      <header style={{ borderBottom: '1px solid #e8ecf0', background: '#fff', minWidth: 0 }}>

        {/* Row 1: Brand + Actions */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 12px 6px', minWidth:0, overflow:'visible' }}>
          {/* Logo + Name */}
          <Logo size={26} />
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
              ref={exportBtnRef}
              type="button"
              className="tool-btn"
              style={{ padding:'5px 10px', fontSize:11.5, opacity: isExporting ? 0.6 : 1, cursor: isExporting ? 'not-allowed' : 'pointer' }}
              onClick={() => {
                if (isExporting) return;
                if (exportMenuOpen) {
                  setExportMenuOpen(false);
                  setExportDropdownPos(null);
                } else {
                  const rect = exportBtnRef.current?.getBoundingClientRect();
                  if (rect) {
                    setExportDropdownPos({
                      top: rect.bottom + 6,
                      right: window.innerWidth - rect.right
                    });
                  }
                  setExportMenuOpen(true);
                }
              }}
              disabled={isExporting}
              title={isExporting ? 'Export in progress...' : 'Export Notes'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
            {exportMenuOpen && exportDropdownPos && (
              <div
                ref={exportDropdownRef}
                style={{
                  position: 'fixed',
                  top: exportDropdownPos.top,
                  right: exportDropdownPos.right,
                  width: 160,
                  borderRadius: 12,
                  border: '1.5px solid #e8ecf0',
                  background: '#fff',
                  padding: '4px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 99999,
                  animation: 'slideDown 0.12s ease'
                }}
              >
                {([ { label:'PDF', color:'#ef4444', bg:'#fef2f2', fmt:'pdf' as const },
                    { label:'DOCX', color:'#3b82f6', bg:'#eff6ff', fmt:'docs' as const }]
                ).map(opt => (
                  <button
                    key={opt.fmt}
                    type="button"
                    disabled={isExporting}
                    onClick={() => {
                      if (!isExporting) {
                        setExportMenuOpen(false);
                        setExportDropdownPos(null);
                        handleExport(opt.fmt);
                      }
                    }}
                    style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'7px 10px', borderRadius:8, border:'none', background:'transparent', cursor: isExporting ? 'not-allowed' : 'pointer', fontSize:12, fontWeight:600, color:'#374151' }}
                    onMouseEnter={e => { if (!isExporting) { (e.currentTarget as HTMLButtonElement).style.background = opt.bg; (e.currentTarget as HTMLButtonElement).style.color = opt.color; } }}
                    onMouseLeave={e => { if (!isExporting) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; } }}
                  >
                    <span style={{ fontWeight:800, color:opt.color, minWidth:32 }}>{opt.label}</span>
                    <span>Export as {opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Close button — closes the in-page panel */}
          <button
            type="button"
            className="icon-btn"
            title="Close NullNote"
            onClick={() => {
              chrome.runtime.sendMessage({ type: 'toggleInPagePanel', forceClose: true }, () => {
                if (chrome.runtime.lastError) { /* panel may already be closed */ }
              });
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Row 2: Video title + Notes List Button */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'2px 12px 6px', minWidth:0, overflow:'hidden' }}>
          <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center' }}>
            {isEditingTitle ? (
              <input
                value={editedTitle}
                onChange={e => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
                autoFocus
                style={{ width:'100%', minWidth: 0, boxSizing: 'border-box', background:'transparent', border:'none', borderBottom:'1.5px solid #f59e0b', outline:'none', fontSize:13, fontWeight:700, color:'#0f172a', padding:'2px 0' }}
              />
            ) : (
              <h1
                onClick={handleTitleClick}
                title="Click to rename"
                style={{
                  margin:0,
                  fontSize:13,
                  fontWeight:700,
                  color:'#374151',
                  cursor:'pointer',
                  overflow:'hidden',
                  textOverflow:'ellipsis',
                  whiteSpace:'nowrap',
                  padding:'2px 4px 4px 4px',
                  borderRadius:0,
                  lineHeight:1.4,
                  borderBottom:'1.5px solid #f59e0b',
                  maxWidth:'100%'
                }}
              >
                {videoTitle}
              </h1>
            )}
          </div>

          <button
            type="button"
            className={`icon-btn ${notesListOpen ? 'active' : ''}`}
            title="View saved notes"
            style={{ width: 30, height: 30 }}
            onMouseDown={(e) => {
              // Prevent title input blur before the click is processed
              e.preventDefault();
            }}
            onClick={async () => {
              if (isEditingTitle) {
                await handleTitleSave();
              }
              setNotesListOpen(!notesListOpen);
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: notesListOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Notes List Drawer */}
        {notesListOpen && (
          <div style={{
            background: '#f8fafc',
            borderTop: '1px solid #e8ecf0',
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.03)',
            animation: 'slideDown 0.15s ease'
          }} className="custom-scrollbar">
            {savedNotes.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: '11.5px', color: '#94a3b8' }}>
                No other saved notes found.
              </div>
            ) : (
              savedNotes.map(note => {
                const isActive = note.videoId === videoId;
                return (
                  <div
                    key={note.videoId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      background: isActive ? '#fff' : 'transparent',
                      borderRadius: '6px',
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                      borderLeft: isActive ? '3px solid #f59e0b' : '3px solid transparent',
                      transition: 'all 0.1s ease',
                      padding: 0
                    }}
                    onMouseEnter={e => {
                      if (!isActive) e.currentTarget.style.background = '#f1f5f9';
                    }}
                    onMouseLeave={e => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setVideoId(note.videoId);
                        setVideoTitle(note.videoTitle);
                        setNotesListOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flex: 1,
                        padding: '8px 10px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        outline: 'none',
                        minWidth: 0
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: isActive ? '#f59e0b' : '#64748b', flexShrink: 0 }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span style={{
                        fontSize: '11.5px',
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#0f172a' : '#374151',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}>
                        {note.videoTitle || 'Untitled Note'}
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Delete Note"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete the note "${note.videoTitle || 'Untitled Note'}"?`)) {
                          await deleteDocument(note.videoId);
                          if (note.videoId === (videoIdRef.current || videoId)) {
                            // If they delete the active note, reload a clean document
                            const newDoc = await getDocument(note.videoId, note.videoTitle);
                            if (editorRef.current) {
                              editorRef.current.innerHTML = newDoc.documentContent;
                              setIsEditorEmpty(true);
                            }
                          }
                          fetchSavedNotes();
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '6px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ef4444',
                        borderRadius: '4px',
                        marginRight: '6px',
                        opacity: 0.6,
                        transition: 'opacity 0.15s, background-color 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#fee2e2'; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

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

      {exportError && (
        <div style={{
          background: '#fee2e2',
          borderBottom: '1.5px solid #fca5a5',
          color: '#991b1b',
          fontSize: '12px',
          fontWeight: 600,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: 'slideDown 0.15s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{exportError}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#991b1b',
              cursor: 'pointer',
              fontWeight: 800,
              padding: '2px 6px',
              fontSize: '11px',
              borderRadius: '4px',
              transition: 'background 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fecaca'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            Dismiss
          </button>
        </div>
      )}

      {exportSuccess && (
        <div style={{
          background: '#dcfce7',
          borderBottom: '1.5px solid #86efac',
          color: '#166534',
          fontSize: '12px',
          fontWeight: 600,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: 'slideDown 0.15s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 6 9 17l-5-5"/>
            </svg>
            <span>{exportSuccess}</span>
          </div>
          <button type="button" onClick={() => setExportSuccess(null)}
            style={{ background: 'transparent', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 800, padding: '2px 6px', fontSize: '11px', borderRadius: '4px' }}>
            ✕
          </button>
        </div>
      )}

      {/* ── TOOLBAR ───────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderBottom:'1px solid #e8ecf0', background:'#f8fafc', flexWrap:'wrap', minWidth:0, boxSizing:'border-box', position:'relative', zIndex:10 }}>

        {/* Snap */}
        <button type="button" className="tool-btn" onClick={handleSnap} title="Snap Screenshot (P)">
          <img src={captureIconUrl} alt="" style={{ width:14, height:14, objectFit:'contain' }} />
          Snap
        </button>

        {/* Auto Snap */}
        <div style={{ display:'flex', alignItems:'stretch', borderRadius:8, border:`1.5px solid ${autoCaptureEnabled ? '#f59e0b' : '#e8ecf0'}`, overflow:'hidden', background: autoCaptureEnabled ? '#fef3c7' : '#fff' }}>
          <button type="button" onClick={handleToggleAutoSnap}
            title="Auto Capture (A)"
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

        {/* Marker & Icon Picker Segmented Control */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 8, border: '1.5px solid #e8ecf0', background: '#fff' }}>
          <button
            type="button"
            onClick={handleMarker}
            title="Add Marker (H)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              fontSize: '11.5px',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              color: '#374151',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
              outline: 'none',
              borderTopLeftRadius: '6px',
              borderBottomLeftRadius: '6px'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fffbeb'; e.currentTarget.style.color = '#b45309'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#374151'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            Marker
          </button>
          
          <div style={{ width: '1px', background: '#e8ecf0', margin: '4px 0' }} />

          <MarkerIconPicker selected={selectedMarkerIcon} onChange={handleMarkerIconChange} iconUrl={iconUrl} isSegmented={true} />
        </div>
      </div>

      {/* ── EDITOR ────────────────────────────────────────────────── */}
      <div style={{ flex:1, position:'relative', display:'flex', flexDirection:'column', minHeight:0, background:'#fff' }}>
        {isEditorEmpty && (
          <div style={{ position:'absolute', top:16, left:16, right:16, pointerEvents:'none', userSelect:'none', zIndex:10, display:'flex', alignItems:'flex-start', gap:8 }}>
            <Logo size={16} style={{ opacity:0.3, marginTop:2, border:'none', boxShadow:'none', background:'transparent' }} />
            <span style={{ fontSize:13.5, color:'#94a3b8', lineHeight:1.6, whiteSpace:'pre-wrap' }}>
              Start capturing knowledge{"\n"}
              Shortcuts:{"\n"}
              - <strong style={{color:'#f59e0b'}}>H</strong>: Marker{"\n"}
              - <strong style={{color:'#f59e0b'}}>P</strong>: Screenshot{"\n"}
              - <strong style={{color:'#f59e0b'}}>A</strong>: AutoSnap{"\n"}
              - <strong style={{color:'#f59e0b'}}>Ctrl+Shift+S</strong>: Toggle Panel{"\n"}
              - Inside editor: <strong style={{color:'#f59e0b'}}>/h</strong> (marker) or <strong style={{color:'#f59e0b'}}>/p</strong> (screenshot)
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
          className="editor-sheet custom-scrollbar"
          style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'8px 16px 14px', outline:'none', whiteSpace:'pre-wrap', wordBreak:'break-word' }}
        />
      </div>
    </main>
  );
}
