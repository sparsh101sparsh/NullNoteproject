/**
 * NullNote Export Engine V2 — PDF Renderer
 *
 * Pure jsPDF-based renderer. Takes the Export Document Model and
 * PageLayout[] from the layout engine, renders directly to PDF
 * with no DOM dependency whatsoever.
 *
 * Typography: Helvetica (built into jsPDF, always available)
 * with Courier for timestamps (monospace).
 */

import { jsPDF } from 'jspdf';
import { formatSeconds } from '@/utils/format';
import { getTimestampUrl } from '@/utils/youtube-url';
import type { ExportDocument, PageLayout, MeasuredBlock } from './types';
import {
  PDF_PAGE,
  PDF_MARGIN,
  PDF_CONTENT,
  PDF_SPACING,
  PDF_FONT,
  PDF_COLOR,
  PDF_LOGO,
} from './types';

// ─── Rendering Helpers ──────────────────────────────────────────────────────

function setColor(pdf: jsPDF, color: readonly [number, number, number]): void {
  pdf.setTextColor(color[0], color[1], color[2]);
}

function setDrawColor(pdf: jsPDF, color: readonly [number, number, number]): void {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function setFillColor(pdf: jsPDF, color: readonly [number, number, number]): void {
  pdf.setFillColor(color[0], color[1], color[2]);
}

/**
 * Convert Uint8Array to base64 data URL for jsPDF.addImage
 */
function uint8ArrayToDataUrl(data: Uint8Array, mime: string = 'image/png'): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

// ─── Header Renderer ────────────────────────────────────────────────────────

/**
 * Render the professional header on page 1.
 *
 * Layout:
 * [Logo 18px] Created with NullNote                16 Jun 2026
 * ─────────────────────────────────────────────────────────────
 *
 * Video Title (Large, Bold, Hero)
 * https://youtube.com/watch?v=...
 */
function renderHeader(pdf: jsPDF, doc: ExportDocument): number {
  let y = PDF_MARGIN.TOP;

  // ── Branding Row ──────────────────────────────────────────────
  const brandingY = y;

  // Logo
  if (doc.logoData && doc.logoData.length > 0) {
    try {
      const logoDataUrl = uint8ArrayToDataUrl(doc.logoData, 'image/png');
      pdf.addImage(
        logoDataUrl,
        'PNG',
        PDF_MARGIN.LEFT,
        brandingY,
        PDF_LOGO.WIDTH,
        PDF_LOGO.HEIGHT
      );
    } catch (e) {
      console.error('[NullNote] PDF logo render failed:', e);
    }
  }

  // "Created with NullNote" — cap-height matched to logo
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(PDF_FONT.BRANDING_SIZE);
  setColor(pdf, PDF_COLOR.PRIMARY);
  const brandingX = PDF_MARGIN.LEFT + PDF_LOGO.WIDTH + 8;
  // Vertically center text with logo: logo bottom - text baseline offset
  const brandingTextY = brandingY + PDF_LOGO.HEIGHT - 4;
  pdf.text('Created with NullNote', brandingX, brandingTextY);

  // Export date — right-aligned, same vertical position
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(PDF_FONT.DATE_SIZE);
  setColor(pdf, PDF_COLOR.TERTIARY);
  const dateWidth = pdf.getTextWidth(doc.exportDate);
  const dateX = PDF_PAGE.WIDTH - PDF_MARGIN.RIGHT - dateWidth;
  pdf.text(doc.exportDate, dateX, brandingTextY);

  y = brandingY + PDF_LOGO.HEIGHT + PDF_SPACING.HEADER_LINE_OFFSET;

  // ── Separator Line ────────────────────────────────────────────
  setDrawColor(pdf, PDF_COLOR.SEPARATOR);
  pdf.setLineWidth(0.5);
  pdf.line(PDF_MARGIN.LEFT, y, PDF_PAGE.WIDTH - PDF_MARGIN.RIGHT, y);
  y += 1 + PDF_SPACING.AFTER_HEADER;

  // ── Video Title (Hero Element) ────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(PDF_FONT.TITLE_SIZE);
  setColor(pdf, PDF_COLOR.PRIMARY);

  // Word-wrap title to content width
  const titleLines = pdf.splitTextToSize(doc.title, PDF_CONTENT.WIDTH);
  const titleLineHeight = PDF_FONT.TITLE_SIZE * 1.3;
  for (const line of titleLines) {
    pdf.text(line, PDF_MARGIN.LEFT, y + PDF_FONT.TITLE_SIZE);
    y += titleLineHeight;
  }

  // ── Video URL ─────────────────────────────────────────────────
  if (doc.videoUrl) {
    y += 6; // gap
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(PDF_FONT.URL_SIZE);
    setColor(pdf, PDF_COLOR.ACCENT);

    // Truncate URL if too long
    let displayUrl = doc.videoUrl;
    const maxUrlWidth = PDF_CONTENT.WIDTH;
    while (pdf.getTextWidth(displayUrl) > maxUrlWidth && displayUrl.length > 20) {
      displayUrl = displayUrl.slice(0, -1);
    }
    if (displayUrl !== doc.videoUrl) {
      displayUrl += '...';
    }

    pdf.textWithLink(displayUrl, PDF_MARGIN.LEFT, y + PDF_FONT.URL_SIZE, {
      url: doc.videoUrl,
    });
    y += PDF_FONT.URL_SIZE * 1.4;
  }

  y += PDF_SPACING.AFTER_TITLE_BLOCK;

  return y;
}

// ─── Block Renderers ────────────────────────────────────────────────────────

/**
 * Render a timestamp line with bullet dot.
 * Returns new Y position.
 */
function renderTimestamp(pdf: jsPDF, timestamp: number, y: number, videoUrl?: string, markerIconData?: Uint8Array): number {
  y += PDF_SPACING.BEFORE_TIMESTAMP;

  const formatted = formatSeconds(timestamp);
  const dotRadius = 3;
  const dotX = PDF_MARGIN.LEFT + dotRadius;
  const dotY = y + PDF_FONT.TIMESTAMP_SIZE / 2;

  // Draw dot
  setFillColor(pdf, PDF_COLOR.TIMESTAMP_DOT);
  pdf.circle(dotX, dotY, dotRadius, 'F');

  // Timestamp text
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(PDF_FONT.TIMESTAMP_SIZE);
  
  const textX = PDF_MARGIN.LEFT + dotRadius * 2 + 8;
  const textY = y + PDF_FONT.TIMESTAMP_SIZE - 1;

  if (videoUrl) {
    setColor(pdf, PDF_COLOR.ACCENT);
    const timestampUrl = getTimestampUrl(videoUrl, timestamp);
    pdf.textWithLink(formatted, textX, textY, {
      url: timestampUrl,
    });
  } else {
    setColor(pdf, PDF_COLOR.SECONDARY);
    pdf.text(formatted, textX, textY);
  }

  y += PDF_FONT.TIMESTAMP_SIZE + PDF_SPACING.AFTER_TIMESTAMP;

  return y;
}

/**
 * Render an image centered in the content area.
 * Returns new Y position.
 */
function renderImage(
  pdf: jsPDF,
  imageData: Uint8Array,
  width: number,
  height: number,
  mime: 'JPEG' | 'PNG',
  y: number
): number {
  try {
    const dataUrl = uint8ArrayToDataUrl(imageData, mime === 'PNG' ? 'image/png' : 'image/jpeg');

    // Center horizontally
    const x = PDF_MARGIN.LEFT + (PDF_CONTENT.WIDTH - width) / 2;

    pdf.addImage(dataUrl, mime, x, y, width, height);

    y += height + PDF_SPACING.AFTER_IMAGE;
  } catch (e) {
    console.error('[NullNote] Failed to render image in PDF:', e);
    y += 20; // skip space on failure
  }

  return y;
}

/**
 * Render a text block with word wrapping.
 * Returns new Y position.
 */
function renderTextBlock(pdf: jsPDF, text: string, y: number): number {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(PDF_FONT.BODY_SIZE);
  setColor(pdf, PDF_COLOR.PRIMARY);

  const lineHeight = PDF_FONT.BODY_SIZE * PDF_FONT.BODY_LINE_HEIGHT;
  const lines = pdf.splitTextToSize(text, PDF_CONTENT.WIDTH);

  for (const line of lines) {
    pdf.text(line, PDF_MARGIN.LEFT, y + PDF_FONT.BODY_SIZE);
    y += lineHeight;
  }

  y += PDF_SPACING.AFTER_TEXT;

  return y;
}

// ─── Main PDF Renderer ──────────────────────────────────────────────────────

/**
 * Render an ExportDocument to PDF and trigger download.
 *
 * Flow:
 * 1. Create jsPDF instance (A4 portrait)
 * 2. Render header on page 1
 * 3. Iterate through paginated blocks
 * 4. For each page > 1, add a new PDF page
 * 5. Render each block at calculated coordinates
 * 6. Save as download
 */
export async function renderPdf(
  doc: ExportDocument,
  pages: PageLayout[]
): Promise<void> {
  const pdf = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  });

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];

    if (pageIndex > 0) {
      pdf.addPage();
    }

    // Starting Y position
    let y: number;

    if (pageIndex === 0) {
      // Page 1: render header first
      y = renderHeader(pdf, doc);
    } else {
      y = PDF_MARGIN.TOP;
    }

    // Render each block on this page
    for (const mb of page.blocks) {
      const block = mb.block;

      switch (block.type) {
        case 'text': {
          y = renderTextBlock(pdf, block.text || '', y);
          break;
        }

        case 'marker': {
          // Render timestamp line
          y = renderTimestamp(pdf, block.timestamp || 0, y, doc.videoUrl, block.markerIconData);

          // Render screenshot if present
          if (block.hasScreenshot && block.screenshotData && mb.imageWidth && mb.imageHeight) {
            y = renderImage(
              pdf,
              block.screenshotData,
              mb.imageWidth,
              mb.imageHeight,
              block.screenshotMime || 'JPEG',
              y
            );
          }
          break;
        }

        case 'screenshot': {
          // Render timestamp line
          y = renderTimestamp(pdf, block.timestamp || 0, y, doc.videoUrl);

          // Render screenshot
          if (block.screenshotData && mb.imageWidth && mb.imageHeight) {
            y = renderImage(
              pdf,
              block.screenshotData,
              mb.imageWidth,
              mb.imageHeight,
              block.screenshotMime || 'JPEG',
              y
            );
          }
          break;
        }
      }
    }
  }

  // ── Save ──────────────────────────────────────────────────────
  const filename = `${(doc.title || 'NullNote_Export').replace(/\s+/g, '_')}.pdf`;
  pdf.save(filename);
}
