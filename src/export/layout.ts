/**
 * NullNote Export Engine V2 — Layout & Pagination Engine
 *
 * Measures every export block, calculates rendered dimensions,
 * and assigns blocks to pages deterministically.
 *
 * Rules:
 * - Every block measures itself before rendering
 * - If a block doesn't fit on the current page → new page
 * - Images are NEVER split across pages
 * - No blank pages are ever generated
 * - Portrait images use maximum height within page limits
 * - Landscape images fill available width
 */

import { formatSeconds } from '@/utils/format';
import type {
  ExportDocument,
  ExportBlock,
  MeasuredBlock,
  PageLayout,
} from './types';
import {
  PDF_CONTENT,
  PDF_SPACING,
  PDF_FONT,
  PDF_LOGO,
} from './types';

// ─── Image Scaling Engine ───────────────────────────────────────────────────

/**
 * Calculate optimal image dimensions for PDF rendering.
 *
 * Strategy:
 * - Landscape (ratio ≥ 1.2): Fill available page width
 * - Portrait (ratio ≤ 0.75): Scale to use maximum available height
 *   (capped at maxHeight), center horizontally
 * - Square/near-square: 75% of page width, centered
 *
 * All calculations preserve the original aspect ratio.
 */
export function calculateImageDimensions(
  origW: number,
  origH: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (!origW || !origH) {
    // Fallback: assume 16:9
    return { width: maxWidth, height: Math.round(maxWidth * (9 / 16)) };
  }

  const ratio = origW / origH;

  let width: number;
  let height: number;

  if (ratio >= 1.2) {
    // ─── Landscape ──────────────────────────────────────────────
    // Fill available width
    width = maxWidth;
    height = maxWidth / ratio;
  } else if (ratio <= 0.75) {
    // ─── Portrait (YouTube Shorts, vertical screenshots) ────────
    // Use maximum available height, derive width from ratio
    height = Math.min(maxHeight * 0.65, maxWidth / ratio);
    width = height * ratio;

    // But don't exceed max width
    if (width > maxWidth) {
      width = maxWidth;
      height = width / ratio;
    }
  } else {
    // ─── Square / Near-square ───────────────────────────────────
    // Use 75% of available width for balanced appearance
    width = maxWidth * 0.75;
    height = width / ratio;
  }

  // Final safety clamp
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

// ─── Block Measurement ──────────────────────────────────────────────────────

/**
 * Measure the height a text block will require.
 * Uses approximate character-per-line calculation.
 */
function measureTextBlock(text: string): number {
  const fontSize = PDF_FONT.BODY_SIZE;
  const lineHeight = fontSize * PDF_FONT.BODY_LINE_HEIGHT;
  const charsPerLine = Math.floor(PDF_CONTENT.WIDTH / (fontSize * 0.5));
  const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine));
  return lineCount * lineHeight + PDF_SPACING.AFTER_TEXT;
}

/**
 * Measure a timestamp line height.
 */
function measureTimestampLine(): number {
  return PDF_FONT.TIMESTAMP_SIZE + PDF_SPACING.BEFORE_TIMESTAMP + PDF_SPACING.AFTER_TIMESTAMP;
}

/**
 * Measure all blocks and return them with their required heights.
 */
export function measureBlocks(
  doc: ExportDocument,
  maxWidth: number = PDF_CONTENT.WIDTH,
  maxImageHeight: number = PDF_CONTENT.HEIGHT * 0.7
): MeasuredBlock[] {
  return doc.blocks.map((block) => {
    let requiredHeight = 0;
    let imageWidth: number | undefined;
    let imageHeight: number | undefined;

    switch (block.type) {
      case 'text': {
        requiredHeight = measureTextBlock(block.text || '');
        break;
      }

      case 'marker': {
        // Timestamp line
        requiredHeight += measureTimestampLine();

        // Optional screenshot
        if (block.hasScreenshot && block.screenshotData) {
          const dims = calculateImageDimensions(
            block.screenshotWidth || 0,
            block.screenshotHeight || 0,
            maxWidth,
            maxImageHeight
          );
          imageWidth = dims.width;
          imageHeight = dims.height;
          requiredHeight += dims.height + PDF_SPACING.AFTER_IMAGE;
        }
        break;
      }

      case 'screenshot': {
        // Timestamp line
        requiredHeight += measureTimestampLine();

        // Screenshot image
        if (block.screenshotData) {
          const dims = calculateImageDimensions(
            block.screenshotWidth || 0,
            block.screenshotHeight || 0,
            maxWidth,
            maxImageHeight
          );
          imageWidth = dims.width;
          imageHeight = dims.height;
          requiredHeight += dims.height + PDF_SPACING.AFTER_IMAGE;
        }
        break;
      }
    }

    return {
      block,
      requiredHeight,
      imageWidth,
      imageHeight,
    };
  });
}

// ─── Header Measurement ─────────────────────────────────────────────────────

/**
 * Calculate the total height consumed by the header area on page 1.
 * Includes: branding row, separator, title, URL, spacing.
 */
export function measureHeader(doc: ExportDocument): number {
  let height = 0;

  // Branding row: logo + text
  height += PDF_LOGO.HEIGHT;
  height += PDF_SPACING.HEADER_LINE_OFFSET;

  // Separator line (thin but needs spacing)
  height += 1;
  height += PDF_SPACING.AFTER_HEADER;

  // Title
  height += PDF_FONT.TITLE_SIZE * 1.3; // line height

  // URL (if present)
  if (doc.videoUrl) {
    height += 6; // gap between title and URL
    height += PDF_FONT.URL_SIZE * 1.4;
  }

  // Space after title block
  height += PDF_SPACING.AFTER_TITLE_BLOCK;

  return height;
}

// ─── Pagination Engine ──────────────────────────────────────────────────────

/**
 * Assign measured blocks to pages.
 *
 * Algorithm:
 * 1. Page 1 starts with reduced available height (header area)
 * 2. For each block, check if it fits in remaining space
 * 3. If it doesn't fit → start a new page
 * 4. Never split a block across pages
 *
 * This guarantees:
 * - No blank pages (we only create a page when there's content for it)
 * - No split images
 * - Deterministic layout regardless of viewport
 */
export function paginate(
  doc: ExportDocument,
  measuredBlocks: MeasuredBlock[]
): PageLayout[] {
  const pages: PageLayout[] = [];
  let currentPage: PageLayout = { pageNumber: 1, blocks: [] };
  pages.push(currentPage);

  // Page 1 has less available space due to header
  const headerHeight = measureHeader(doc);
  let remainingHeight = PDF_CONTENT.HEIGHT - headerHeight;

  for (const mb of measuredBlocks) {
    if (mb.requiredHeight <= 0) continue; // skip empty blocks

    if (mb.requiredHeight > remainingHeight) {
      // Block doesn't fit on current page
      // Only create a new page if current page has content
      // (prevents blank pages)
      if (currentPage.blocks.length > 0) {
        currentPage = {
          pageNumber: pages.length + 1,
          blocks: [],
        };
        pages.push(currentPage);
        remainingHeight = PDF_CONTENT.HEIGHT;
      }

      // If a single block is taller than a full page, we still place it
      // (it will overflow but won't create a blank page)
      if (mb.requiredHeight > PDF_CONTENT.HEIGHT) {
        // Scale down oversized images to fit one page
        if (mb.imageHeight && mb.imageHeight > PDF_CONTENT.HEIGHT * 0.8) {
          const scale = (PDF_CONTENT.HEIGHT * 0.7) / mb.imageHeight;
          mb.imageHeight = Math.round(mb.imageHeight * scale);
          mb.imageWidth = mb.imageWidth ? Math.round(mb.imageWidth * scale) : undefined;
          mb.requiredHeight = measureTimestampLine() + mb.imageHeight + PDF_SPACING.AFTER_IMAGE;
        }
      }
    }

    currentPage.blocks.push(mb);
    remainingHeight -= mb.requiredHeight;
  }

  // Remove any trailing empty pages (safety net)
  while (pages.length > 1 && pages[pages.length - 1].blocks.length === 0) {
    pages.pop();
  }

  return pages;
}

/**
 * Full layout pipeline: measure → paginate.
 */
export function layoutDocument(doc: ExportDocument): PageLayout[] {
  const measured = measureBlocks(doc);
  return paginate(doc, measured);
}
