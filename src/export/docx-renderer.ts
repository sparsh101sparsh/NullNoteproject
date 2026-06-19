/**
 * NullNote Export Engine V2 — DOCX Renderer
 *
 * Consumes the same ExportDocument model as the PDF renderer.
 * Uses the `docx` library for programmatic DOCX generation.
 *
 * Structural parity with PDF output:
 * - Same title hierarchy
 * - Same image sizing philosophy
 * - Same marker/screenshot spacing
 */

import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  Packer,
  TabStopType,
  TabStopPosition,
  BorderStyle,
  PageBreak,
  ExternalHyperlink,
} from 'docx';
import { formatSeconds } from '@/utils/format';
import { getTimestampUrl } from '@/utils/youtube-url';
import { calculateImageDimensions } from './layout';
import type { ExportDocument, ExportBlock } from './types';

// ─── DOCX Constants ─────────────────────────────────────────────────────────

/** Maximum usable content width for A4 with 0.75-inch margins (in pixels for DOCX) */
const DOCX_MAX_WIDTH = 520;

/** Maximum image height in DOCX (prevents page overflow) */
const DOCX_MAX_IMAGE_HEIGHT = 600;

// ─── Render Functions ───────────────────────────────────────────────────────

/**
 * Build the header paragraph: [Logo] Created with NullNote    16 Jun 2026
 */
function buildHeaderParagraph(doc: ExportDocument): Paragraph {
  const headerChildren: (TextRun | ImageRun)[] = [];

  // Logo
  if (doc.logoData && doc.logoData.length > 0) {
    try {
      headerChildren.push(
        new ImageRun({
          data: doc.logoData,
          type: 'png',
          transformation: { width: 20, height: 20 },
        }),
        new TextRun({ text: '  ' })
      );
    } catch (e) {
      console.error('[NullNote] DOCX logo insertion failed:', e);
    }
  }

  // "Created with NullNote" — visually matching logo size
  headerChildren.push(
    new TextRun({
      text: 'Created with NullNote\t',
      bold: true,
      font: 'Helvetica',
      size: 20, // 10pt — matched to logo visual weight
      color: '0f172a',
    }),
    // Date — right-aligned via tab stop
    new TextRun({
      text: doc.exportDate,
      font: 'Helvetica',
      size: 18, // 9pt
      color: '64748b',
    })
  );

  return new Paragraph({
    children: headerChildren,
    tabStops: [
      {
        type: TabStopType.RIGHT,
        position: TabStopPosition.MAX,
      },
    ],
    spacing: { after: 300 },
    border: {
      bottom: {
        color: 'e2e8f0',
        space: 8,
        style: BorderStyle.SINGLE,
        size: 4,
      },
    },
  });
}

/**
 * Build the title paragraph.
 */
function buildTitleParagraph(doc: ExportDocument): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: doc.title,
        bold: true,
        font: 'Helvetica',
        size: 44, // 22pt — hero title
        color: '0f172a',
      }),
    ],
    spacing: { after: 80 },
  });
}

/**
 * Build the video URL paragraph.
 */
function buildUrlParagraph(url: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: url,
        font: 'Helvetica',
        size: 20, // 10pt
        color: 'f59e0b',
        underline: {},
      }),
    ],
    spacing: { after: 400 },
  });
}

/**
 * Build a timestamp paragraph with bullet prefix.
 */
function buildTimestampParagraph(timestamp: number, videoUrl?: string): Paragraph {
  const formatted = formatSeconds(timestamp);
  if (videoUrl) {
    const timestampUrl = getTimestampUrl(videoUrl, timestamp);
    return new Paragraph({
      children: [
        new TextRun({
          text: '●  ',
          bold: true,
          font: 'Courier New',
          size: 22, // 11pt
          color: '475569',
        }),
        new ExternalHyperlink({
          children: [
            new TextRun({
              text: formatted,
              bold: true,
              font: 'Courier New',
              size: 22, // 11pt
              color: 'f59e0b', // Accent link color
              underline: {},
            }),
          ],
          link: timestampUrl,
        }),
      ],
      spacing: { before: 200, after: 120 },
    });
  }

  return new Paragraph({
    children: [
      new TextRun({
        text: `●  ${formatted}`,
        bold: true,
        font: 'Courier New',
        size: 22, // 11pt
        color: '475569',
      }),
    ],
    spacing: { before: 200, after: 120 },
  });
}

/**
 * Build an image paragraph, centered.
 */
function buildImageParagraph(
  imageData: Uint8Array,
  origWidth: number,
  origHeight: number,
  mime: 'JPEG' | 'PNG'
): Paragraph | null {
  try {
    const dims = calculateImageDimensions(
      origWidth,
      origHeight,
      DOCX_MAX_WIDTH,
      DOCX_MAX_IMAGE_HEIGHT
    );

    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          data: imageData,
          type: mime === 'PNG' ? 'png' : 'jpg',
          transformation: {
            width: dims.width,
            height: dims.height,
          },
        }),
      ],
      spacing: { before: 80, after: 280 },
    });
  } catch (e) {
    console.error('[NullNote] DOCX image insertion failed:', e);
    return null;
  }
}

/**
 * Build a text paragraph.
 */
function buildTextParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: 'Helvetica',
        size: 22, // 11pt
        color: '334155',
      }),
    ],
    spacing: { after: 120, line: 360, lineRule: 'auto' as any },
  });
}

// ─── Main DOCX Renderer ────────────────────────────────────────────────────

/**
 * Render an ExportDocument to DOCX and trigger download.
 */
export async function renderDocx(doc: ExportDocument): Promise<void> {
  const children: Paragraph[] = [];

  // ── Header ────────────────────────────────────────────────────
  children.push(buildHeaderParagraph(doc));

  // ── Title ─────────────────────────────────────────────────────
  children.push(buildTitleParagraph(doc));

  // ── Video URL ─────────────────────────────────────────────────
  if (doc.videoUrl) {
    children.push(buildUrlParagraph(doc.videoUrl));
  }

  // ── Content Blocks ────────────────────────────────────────────
  for (const block of doc.blocks) {
    switch (block.type) {
      case 'text': {
        children.push(buildTextParagraph(block.text || ''));
        break;
      }

      case 'marker': {
        // Timestamp
        children.push(buildTimestampParagraph(block.timestamp || 0, doc.videoUrl));

        // Screenshot (if attached)
        if (block.hasScreenshot && block.screenshotData) {
          const imgPara = buildImageParagraph(
            block.screenshotData,
            block.screenshotWidth || 0,
            block.screenshotHeight || 0,
            block.screenshotMime || 'JPEG'
          );
          if (imgPara) children.push(imgPara);
        }
        break;
      }

      case 'screenshot': {
        // Timestamp
        children.push(buildTimestampParagraph(block.timestamp || 0, doc.videoUrl));

        // Screenshot
        if (block.screenshotData) {
          const imgPara = buildImageParagraph(
            block.screenshotData,
            block.screenshotWidth || 0,
            block.screenshotHeight || 0,
            block.screenshotMime || 'JPEG'
          );
          if (imgPara) children.push(imgPara);
        }
        break;
      }
    }
  }

  // ── Build Document ────────────────────────────────────────────
  const docxDocument = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,    // 0.5 inch
              bottom: 720,
              left: 1080,  // 0.75 inch
              right: 1080,
            },
          },
        },
        children,
      },
    ],
  });

  // ── Generate and Download ─────────────────────────────────────
  const blob = await Packer.toBlob(docxDocument);

  if (!blob || blob.size === 0) {
    throw new Error('Generated DOCX blob is empty.');
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  a.download = `${(doc.title || 'NullNote_Export').replace(/\s+/g, '_')}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
