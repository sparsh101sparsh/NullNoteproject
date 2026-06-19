/**
 * NullNote Export Engine V2 — Export Document Model
 *
 * This is the single structured data model consumed by both the PDF and DOCX
 * renderers.  Every field is resolved (binary data, dimensions, timestamps)
 * before it reaches a renderer — no renderer ever touches the DOM, IndexedDB,
 * or the network.
 */

// ─── Block Types ────────────────────────────────────────────────────────────

export type ExportBlockType = 'text' | 'marker' | 'screenshot';

export interface ExportBlock {
  type: ExportBlockType;

  /** Plain text content (for 'text' blocks) */
  text?: string;

  /** Video timestamp in seconds */
  timestamp?: number;

  /** Marker icon key, e.g. 'MarkIcon1' */
  markerIcon?: string;

  /** Pre-resolved marker icon as raw bytes */
  markerIconData?: Uint8Array;

  /** Pre-resolved screenshot image as raw bytes */
  screenshotData?: Uint8Array;

  /** Original screenshot pixel width */
  screenshotWidth?: number;

  /** Original screenshot pixel height */
  screenshotHeight?: number;

  /** Screenshot MIME type (for jsPDF addImage) */
  screenshotMime?: 'JPEG' | 'PNG';

  /** Whether this marker has an attached screenshot */
  hasScreenshot?: boolean;
}

// ─── Export Document ────────────────────────────────────────────────────────

export interface ExportDocument {
  /** Video title — hero element of the export */
  title: string;

  /** Human-readable export date, e.g. "16 Jun 2026" */
  exportDate: string;

  /** YouTube video URL */
  videoUrl?: string;

  /** Ordered list of content blocks */
  blocks: ExportBlock[];

  /** NullNote logo as raw PNG bytes */
  logoData: Uint8Array;
}

// ─── Layout Engine Types ────────────────────────────────────────────────────

export interface MeasuredBlock {
  block: ExportBlock;

  /** Total height this block requires in PDF points */
  requiredHeight: number;

  /** Rendered image width in PDF points (if applicable) */
  imageWidth?: number;

  /** Rendered image height in PDF points (if applicable) */
  imageHeight?: number;
}

export interface PageLayout {
  /** Page number (1-indexed) */
  pageNumber: number;

  /** Blocks assigned to this page with their measurements */
  blocks: MeasuredBlock[];
}

// ─── PDF Layout Constants ───────────────────────────────────────────────────

/** A4 page dimensions in PDF points (72 points = 1 inch) */
export const PDF_PAGE = {
  WIDTH: 595.28,   // 210mm
  HEIGHT: 841.89,  // 297mm
} as const;

export const PDF_MARGIN = {
  TOP: 40,
  BOTTOM: 40,
  LEFT: 40,
  RIGHT: 40,
} as const;

/** Usable content area after margins */
export const PDF_CONTENT = {
  WIDTH: PDF_PAGE.WIDTH - PDF_MARGIN.LEFT - PDF_MARGIN.RIGHT,   // ~515.28pt
  HEIGHT: PDF_PAGE.HEIGHT - PDF_MARGIN.TOP - PDF_MARGIN.BOTTOM, // ~761.89pt
} as const;

/** Spacing constants in PDF points */
export const PDF_SPACING = {
  /** Space after header separator line */
  AFTER_HEADER: 20,
  /** Space after title block (title + URL) */
  AFTER_TITLE_BLOCK: 24,
  /** Space before a timestamp line */
  BEFORE_TIMESTAMP: 14,
  /** Space after timestamp (before image) */
  AFTER_TIMESTAMP: 8,
  /** Space after an image */
  AFTER_IMAGE: 20,
  /** Space after a text block */
  AFTER_TEXT: 10,
  /** Header separator line position offset */
  HEADER_LINE_OFFSET: 6,
} as const;

/** Typography sizes in PDF points */
export const PDF_FONT = {
  /** "Created with NullNote" branding */
  BRANDING_SIZE: 10,
  /** Export date */
  DATE_SIZE: 9,
  /** Video title — hero element */
  TITLE_SIZE: 22,
  /** Video URL */
  URL_SIZE: 10,
  /** Timestamp labels */
  TIMESTAMP_SIZE: 11,
  /** Body text */
  BODY_SIZE: 11,
  /** Body text line height multiplier */
  BODY_LINE_HEIGHT: 1.6,
} as const;

/** Colors (RGB arrays) */
export const PDF_COLOR = {
  /** Primary text — near-black */
  PRIMARY: [15, 23, 42] as const,      // #0f172a
  /** Secondary text — slate */
  SECONDARY: [71, 85, 105] as const,   // #475569
  /** Tertiary text — light slate */
  TERTIARY: [100, 116, 139] as const,  // #64748b
  /** Accent — amber for URLs */
  ACCENT: [245, 158, 11] as const,     // #f59e0b
  /** Separator line */
  SEPARATOR: [226, 232, 240] as const, // #e2e8f0
  /** Timestamp dot */
  TIMESTAMP_DOT: [71, 85, 105] as const, // #475569
} as const;

/** Logo dimensions in PDF points */
export const PDF_LOGO = {
  WIDTH: 18,
  HEIGHT: 18,
} as const;
