/**
 * NullNote Export Engine V2 — Document Compiler
 *
 * Reads directly from IndexedDB storage and compiles a fully-resolved
 * ExportDocument.  No HTML parsing, no DOM dependency.
 *
 * Every image (screenshots, marker icons, logo) is pre-resolved to
 * Uint8Array before being passed to renderers.
 */

import { getScreenshotsForVideo, getDocument } from '@/storage/repository';
import { formatSeconds } from '@/utils/format';
import { MARKER_ICONS } from '@/utils/constants';
import type { ExportDocument, ExportBlock } from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a Blob to Uint8Array */
async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Convert a base64 data URL to Uint8Array */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(';base64,');
  const base64 = parts.length > 1 ? parts[1] : parts[0];
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Load an image blob's natural dimensions */
async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      URL.revokeObjectURL(url);
      resolve({ width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for dimensions'));
    };
    img.src = url;
  });
}

/** Fetch a chrome.runtime resource as Uint8Array */
async function fetchExtensionResource(path: string): Promise<Uint8Array> {
  const url = chrome.runtime.getURL(path);
  const response = await fetch(url);
  const blob = await response.blob();
  return blobToUint8Array(blob);
}

/** Format date as "16 Jun 2026" */
function formatExportDate(date: Date): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

// ─── HTML Content Parser ────────────────────────────────────────────────────

/**
 * Parse the editor's HTML content into structured ExportBlock[].
 *
 * The editor stores content as HTML with special elements:
 * - .screenshot-block[data-screenshot-id][data-timestamp]
 * - .marker-badge[data-timestamp][data-marker-icon]
 * - Regular <p>, <div>, <li>, <h1-h6> for text
 */
function parseEditorHtml(
  html: string,
  screenshotDataMap: Map<string, { data: Uint8Array; width: number; height: number; mime: 'JPEG' | 'PNG' }>,
  markerIconDataMap: Map<string, Uint8Array>
): ExportBlock[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks: ExportBlock[] = [];

  const processNode = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (el.classList.contains('screenshot-block')) {
        const scrId = el.getAttribute('data-screenshot-id') || '';
        const ts = Number(el.getAttribute('data-timestamp'));
        const scrData = screenshotDataMap.get(scrId);

        blocks.push({
          type: 'screenshot',
          timestamp: isNaN(ts) ? undefined : ts,
          screenshotData: scrData?.data,
          screenshotWidth: scrData?.width,
          screenshotHeight: scrData?.height,
          screenshotMime: scrData?.mime || 'JPEG',
          hasScreenshot: !!scrData,
        });
      } else if (el.classList.contains('marker-badge')) {
        const ts = Number(el.getAttribute('data-timestamp'));
        const markerIcon = el.getAttribute('data-marker-icon') || undefined;

        // Check for screenshot within marker
        const img = el.querySelector('img.screenshot-img');
        const scrId = img ? (img.getAttribute('data-screenshot-id') || '') : '';
        const scrData = scrId ? screenshotDataMap.get(scrId) : undefined;

        blocks.push({
          type: 'marker',
          timestamp: isNaN(ts) ? undefined : ts,
          markerIcon,
          markerIconData: markerIcon ? markerIconDataMap.get(markerIcon) : undefined,
          screenshotData: scrData?.data,
          screenshotWidth: scrData?.width,
          screenshotHeight: scrData?.height,
          screenshotMime: scrData?.mime || 'JPEG',
          hasScreenshot: !!scrData,
        });
      } else if (
        el.tagName === 'P' || el.tagName === 'DIV' ||
        el.tagName === 'LI' || /^H[1-6]$/.test(el.tagName)
      ) {
        if (el.querySelector('.marker-badge, .screenshot-block')) {
          el.childNodes.forEach(processNode);
        } else {
          const text = el.textContent?.trim();
          if (text) {
            blocks.push({ type: 'text', text });
          }
        }
      } else {
        el.childNodes.forEach(processNode);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        blocks.push({ type: 'text', text });
      }
    }
  };

  doc.body.childNodes.forEach(processNode);
  return blocks;
}

// ─── Main Compiler ──────────────────────────────────────────────────────────

/**
 * Compile a fully-resolved ExportDocument from storage data.
 *
 * After this function returns, every piece of binary data (images, icons, logo)
 * is resolved and the document is ready for any renderer.
 */
export async function compileExportDocument(
  videoId: string,
  fallbackTitle: string,
  videoUrl?: string
): Promise<ExportDocument> {
  // 1. Fetch document record and screenshots from IndexedDB
  const [docRecord, screenshots] = await Promise.all([
    getDocument(videoId, fallbackTitle),
    getScreenshotsForVideo(videoId),
  ]);

  // 2. Resolve all screenshot blobs → Uint8Array + dimensions
  const screenshotDataMap = new Map<string, { data: Uint8Array; width: number; height: number; mime: 'JPEG' | 'PNG' }>();

  await Promise.all(
    screenshots.map(async (s) => {
      if (!s.imageBlob) return;
      try {
        const [data, dims] = await Promise.all([
          blobToUint8Array(s.imageBlob),
          getImageDimensions(s.imageBlob),
        ]);
        // Detect MIME from blob type
        const mime: 'JPEG' | 'PNG' = s.imageBlob.type === 'image/png' ? 'PNG' : 'JPEG';
        screenshotDataMap.set(s.id, { data, width: dims.width, height: dims.height, mime });
      } catch (e) {
        console.error('[NullNote] Failed to resolve screenshot:', s.id, e);
      }
    })
  );

  // 3. Pre-load all marker icon PNGs
  const markerIconDataMap = new Map<string, Uint8Array>();

  await Promise.all(
    MARKER_ICONS.map(async (icon) => {
      try {
        const data = await fetchExtensionResource('icons/' + icon.file);
        markerIconDataMap.set(icon.key, data);
      } catch (e) {
        console.error(`[NullNote] Failed to load marker icon: ${icon.key}`, e);
      }
    })
  );

  // 4. Load NullNote logo
  let logoData: Uint8Array;
  try {
    logoData = await fetchExtensionResource('icons/newmainicon.png');
  } catch (e) {
    console.error('[NullNote] Failed to load logo:', e);
    logoData = new Uint8Array(0);
  }

  // 5. Parse editor HTML into structured blocks
  const blocks = parseEditorHtml(
    docRecord.documentContent || '',
    screenshotDataMap,
    markerIconDataMap
  );

  // 6. Validate — at minimum we need a title
  const title = docRecord.videoTitle || fallbackTitle || 'Untitled Notes';
  if (!title.trim()) {
    throw new Error('Export validation failed: document has no title.');
  }

  return {
    title,
    exportDate: formatExportDate(new Date()),
    videoUrl,
    blocks,
    logoData,
  };
}
