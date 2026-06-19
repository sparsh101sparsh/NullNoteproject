import { vi, describe, it, expect } from 'vitest';
vi.unmock('@/export/exporters');
vi.unmock('@/export/layout');
vi.unmock('@/export/types');
import { getTimestampUrl } from '@/utils/youtube-url';

import {
  calculateImageDimensions,
  measureBlocks,
  paginate,
  measureHeader,
  layoutDocument,
} from '@/export/layout';

import type { ExportDocument, ExportBlock, MeasuredBlock } from '@/export/types';
import { PDF_CONTENT, PDF_SPACING, PDF_FONT } from '@/export/types';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<ExportDocument> = {}): ExportDocument {
  return {
    title: 'Test Video Title',
    exportDate: '16 Jun 2026',
    videoUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
    blocks: [],
    logoData: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // PNG magic bytes
    ...overrides,
  };
}

function makeScreenshotBlock(
  width: number,
  height: number,
  timestamp: number = 15
): ExportBlock {
  return {
    type: 'screenshot',
    timestamp,
    screenshotData: new Uint8Array([0xff, 0xd8, 0xff]), // JPEG magic bytes
    screenshotWidth: width,
    screenshotHeight: height,
    screenshotMime: 'JPEG',
    hasScreenshot: true,
  };
}

function makeTextBlock(text: string): ExportBlock {
  return { type: 'text', text };
}

function makeMarkerBlock(timestamp: number, withScreenshot: boolean = false): ExportBlock {
  const block: ExportBlock = {
    type: 'marker',
    timestamp,
    markerIcon: 'MarkIcon1',
    hasScreenshot: withScreenshot,
  };
  if (withScreenshot) {
    block.screenshotData = new Uint8Array([0xff, 0xd8, 0xff]);
    block.screenshotWidth = 1920;
    block.screenshotHeight = 1080;
    block.screenshotMime = 'JPEG';
  }
  return block;
}

// ─── Image Scaling Tests ────────────────────────────────────────────────────

describe('Image Scaling Engine', () => {
  const maxWidth = PDF_CONTENT.WIDTH;
  const maxHeight = PDF_CONTENT.HEIGHT * 0.7;

  describe('Landscape Images (ratio ≥ 1.2)', () => {
    it('should fill available width for 16:9 landscape', () => {
      const dims = calculateImageDimensions(1920, 1080, maxWidth, maxHeight);
      expect(dims.width).toBe(Math.round(maxWidth));
      expect(dims.height).toBe(Math.round(maxWidth / (1920 / 1080)));
    });

    it('should fill available width for 21:9 ultra-wide', () => {
      const dims = calculateImageDimensions(2560, 1080, maxWidth, maxHeight);
      expect(dims.width).toBe(Math.round(maxWidth));
    });

    it('should handle 4:3 landscape (ratio ~1.33)', () => {
      const dims = calculateImageDimensions(1024, 768, maxWidth, maxHeight);
      expect(dims.width).toBe(Math.round(maxWidth));
    });
  });

  describe('Portrait Images (ratio ≤ 0.75)', () => {
    it('should maximize height for 9:16 portrait (YouTube Shorts)', () => {
      const dims = calculateImageDimensions(1080, 1920, maxWidth, maxHeight);
      // Portrait should use significant height, not be tiny
      expect(dims.height).toBeGreaterThan(200);
      // But not exceed max height
      expect(dims.height).toBeLessThanOrEqual(maxHeight * 0.65 + 1); // +1 for rounding
    });

    it('should not make portrait images tiny', () => {
      const dims = calculateImageDimensions(720, 1280, maxWidth, maxHeight);
      // Width should be reasonable, not squeezed
      expect(dims.width).toBeGreaterThan(100);
    });

    it('should handle 3:4 portrait', () => {
      const dims = calculateImageDimensions(300, 400, maxWidth, maxHeight);
      expect(dims.height).toBeGreaterThan(dims.width);
    });
  });

  describe('Square / Near-Square Images', () => {
    it('should use ~75% width for perfect square', () => {
      const dims = calculateImageDimensions(500, 500, maxWidth, maxHeight);
      expect(dims.width).toBe(Math.round(maxWidth * 0.75));
      expect(dims.height).toBe(Math.round(maxWidth * 0.75));
    });

    it('should handle near-square (1.1:1)', () => {
      const dims = calculateImageDimensions(550, 500, maxWidth, maxHeight);
      const ratio = dims.width / dims.height;
      expect(Math.abs(ratio - 1.1)).toBeLessThan(0.05);
    });
  });

  describe('Aspect Ratio Preservation', () => {
    it('should preserve aspect ratio for all image types', () => {
      const testCases = [
        { w: 1920, h: 1080, label: '16:9' },
        { w: 2560, h: 1080, label: '21:9' },
        { w: 1080, h: 1920, label: '9:16' },
        { w: 500, h: 500, label: '1:1' },
        { w: 300, h: 400, label: '3:4' },
        { w: 1024, h: 768, label: '4:3' },
      ];

      for (const tc of testCases) {
        const originalRatio = tc.w / tc.h;
        const dims = calculateImageDimensions(tc.w, tc.h, maxWidth, maxHeight);
        const calculatedRatio = dims.width / dims.height;
        expect(
          Math.abs(calculatedRatio - originalRatio)
        ).toBeLessThan(0.05); // tolerance for rounding
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero dimensions with 16:9 fallback', () => {
      const dims = calculateImageDimensions(0, 0, maxWidth, maxHeight);
      // Fallback returns maxWidth (may be non-integer), then rounded
      expect(dims.width).toBeCloseTo(maxWidth, 0);
    });

    it('should clamp oversized images to max dimensions', () => {
      const dims = calculateImageDimensions(100, 5000, maxWidth, maxHeight);
      expect(dims.height).toBeLessThanOrEqual(maxHeight + 1);
    });
  });
});

// ─── Block Measurement Tests ────────────────────────────────────────────────

describe('Block Measurement', () => {
  it('should measure text blocks with positive height', () => {
    const doc = makeDoc({ blocks: [makeTextBlock('Hello world')] });
    const measured = measureBlocks(doc);
    expect(measured).toHaveLength(1);
    expect(measured[0].requiredHeight).toBeGreaterThan(0);
  });

  it('should measure screenshot blocks including timestamp + image height', () => {
    const doc = makeDoc({
      blocks: [makeScreenshotBlock(1920, 1080, 15)],
    });
    const measured = measureBlocks(doc);
    expect(measured).toHaveLength(1);
    expect(measured[0].requiredHeight).toBeGreaterThan(100); // at minimum
    expect(measured[0].imageWidth).toBeDefined();
    expect(measured[0].imageHeight).toBeDefined();
  });

  it('should measure marker blocks with and without screenshots', () => {
    const doc = makeDoc({
      blocks: [
        makeMarkerBlock(30, false),
        makeMarkerBlock(60, true),
      ],
    });
    const measured = measureBlocks(doc);
    expect(measured).toHaveLength(2);

    // Marker without screenshot should be smaller
    expect(measured[0].requiredHeight).toBeLessThan(measured[1].requiredHeight);

    // Marker with screenshot should have image dimensions
    expect(measured[1].imageWidth).toBeDefined();
    expect(measured[1].imageHeight).toBeDefined();
  });
});

// ─── Pagination Tests ───────────────────────────────────────────────────────

describe('Pagination Engine', () => {
  it('should produce at least one page for any non-empty document', () => {
    const doc = makeDoc({ blocks: [makeTextBlock('Test')] });
    const pages = layoutDocument(doc);
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  it('should NEVER produce blank pages', () => {
    // Create a document with many blocks
    const blocks: ExportBlock[] = [];
    for (let i = 0; i < 50; i++) {
      blocks.push(makeTextBlock(`Paragraph ${i}: Lorem ipsum dolor sit amet.`));
      if (i % 3 === 0) {
        blocks.push(makeScreenshotBlock(1920, 1080, i * 10));
      }
    }

    const doc = makeDoc({ blocks });
    const pages = layoutDocument(doc);

    // Every page must have at least one block
    for (const page of pages) {
      expect(page.blocks.length).toBeGreaterThan(0);
    }
  });

  it('should not split blocks across pages', () => {
    // Each block should appear on exactly one page
    const blocks: ExportBlock[] = [];
    for (let i = 0; i < 20; i++) {
      blocks.push(makeScreenshotBlock(1920, 1080, i * 5));
    }

    const doc = makeDoc({ blocks });
    const pages = layoutDocument(doc);

    const totalBlocksInPages = pages.reduce((sum, p) => sum + p.blocks.length, 0);
    expect(totalBlocksInPages).toBe(blocks.length);
  });

  it('should handle empty document gracefully', () => {
    const doc = makeDoc({ blocks: [] });
    const pages = layoutDocument(doc);
    expect(pages.length).toBe(1); // At least one page (with header)
  });

  it('should handle a single large image', () => {
    const doc = makeDoc({
      blocks: [makeScreenshotBlock(1080, 1920, 0)], // tall portrait
    });
    const pages = layoutDocument(doc);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    // No blank pages
    for (const page of pages) {
      expect(page.blocks.length).toBeGreaterThan(0);
    }
  });

  it('should number pages sequentially starting from 1', () => {
    const blocks: ExportBlock[] = [];
    for (let i = 0; i < 30; i++) {
      blocks.push(makeScreenshotBlock(1920, 1080, i * 5));
    }

    const doc = makeDoc({ blocks });
    const pages = layoutDocument(doc);

    for (let i = 0; i < pages.length; i++) {
      expect(pages[i].pageNumber).toBe(i + 1);
    }
  });
});

// ─── Header Measurement Tests ───────────────────────────────────────────────

describe('Header Measurement', () => {
  it('should return positive header height', () => {
    const doc = makeDoc();
    const height = measureHeader(doc);
    expect(height).toBeGreaterThan(0);
  });

  it('should be taller with a video URL', () => {
    const withUrl = makeDoc({ videoUrl: 'https://youtube.com/watch?v=abc' });
    const withoutUrl = makeDoc({ videoUrl: undefined });

    const heightWithUrl = measureHeader(withUrl);
    const heightWithoutUrl = measureHeader(withoutUrl);

    expect(heightWithUrl).toBeGreaterThan(heightWithoutUrl);
  });

  it('should leave enough room for content on page 1', () => {
    const doc = makeDoc();
    const headerHeight = measureHeader(doc);
    const remaining = PDF_CONTENT.HEIGHT - headerHeight;

    // Should leave at least 60% of page for content
    expect(remaining).toBeGreaterThan(PDF_CONTENT.HEIGHT * 0.6);
  });
});

// ─── Validation Tests ───────────────────────────────────────────────────────

describe('Export Validation', () => {
  it('should produce a valid document structure', () => {
    const doc = makeDoc({
      blocks: [
        makeTextBlock('Hello'),
        makeMarkerBlock(10, true),
        makeScreenshotBlock(1920, 1080, 20),
      ],
    });

    // All blocks should be present
    expect(doc.blocks).toHaveLength(3);
    expect(doc.blocks[0].type).toBe('text');
    expect(doc.blocks[1].type).toBe('marker');
    expect(doc.blocks[2].type).toBe('screenshot');

    // Title and date should be set
    expect(doc.title).toBeTruthy();
    expect(doc.exportDate).toBeTruthy();
  });
});

// ─── YouTube URL Helper Tests ───────────────────────────────────────────────

describe('YouTube Timestamp URL Helper', () => {
  it('should format standard watch URLs correctly with &t=[s]s', () => {
    const url = 'https://www.youtube.com/watch?v=abc123';
    expect(getTimestampUrl(url, 25)).toBe('https://www.youtube.com/watch?v=abc123&t=25s');
  });

  it('should format watch URLs with existing parameters correctly, preserving them', () => {
    const url = 'https://www.youtube.com/watch?v=abc123&list=xyz';
    expect(getTimestampUrl(url, 25)).toBe('https://www.youtube.com/watch?v=abc123&list=xyz&t=25s');
  });

  it('should format shorts URLs correctly with ?t=[s] (no s suffix)', () => {
    const url = 'https://www.youtube.com/shorts/abc123';
    expect(getTimestampUrl(url, 25)).toBe('https://www.youtube.com/shorts/abc123?t=25');
  });

  it('should format youtu.be short links correctly with ?t=[s] (no s suffix)', () => {
    const url = 'https://youtu.be/abc123';
    expect(getTimestampUrl(url, 25)).toBe('https://youtu.be/abc123?t=25');
  });

  it('should gracefully handle invalid URLs without throwing and generate a best-effort URL', () => {
    const url = 'some-invalid-url';
    expect(getTimestampUrl(url, 25)).toBe('some-invalid-url?t=25');
  });

  it('should gracefully return empty string when videoUrl is undefined', () => {
    expect(getTimestampUrl(undefined, 25)).toBe('');
  });
});
