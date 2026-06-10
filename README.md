# LectureSnap

LectureSnap is a production-ready Chrome extension scaffold for YouTube lecture annotation, screenshot capture, OCR, and notebook export.

## Architecture Overview

### Platform
- Chrome Extension Manifest V3
- Content script injection on YouTube lecture pages
- Background service worker for storage, OCR, and command orchestration
- Side panel React app for notebook review

### Tech Stack
- React + TypeScript
- TailwindCSS + Framer Motion
- IndexedDB via `idb`
- Tesseract.js for OCR
- Vite for build tooling

## Folder Structure

```
/extensionproject
  /public
    manifest.json
    /icons
      icon-16.svg
      icon-48.svg
      icon-128.svg
  /src
    /background
      serviceWorker.ts
    /content
      index.ts
      keyboard.ts
      screenshot.ts
      timeline.ts
      ui.ts
    /sidepanel
      index.html
      main.tsx
      App.tsx
    /components
      (optional future shared components)
    /hooks
      useNotebookData.ts
      useDebouncedValue.ts
    /storage
      db.ts
      repository.ts
    /export
      exporters.ts
    /styles
      tailwind.css
    /utils
      constants.ts
      format.ts
      id.ts
      types.ts
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.js
```

## Data Models

- `VideoRecord`
  - `id`, `url`, `title`, `duration`, `createdAt`, `lastUpdatedAt`
- `HighlightRecord`
  - `id`, `videoId`, `videoUrl`, `videoTitle`, `timestamp`, `note`, `createdAt`, `updatedAt`
- `ScreenshotRecord`
  - `id`, `videoId`, `videoUrl`, `videoTitle`, `timestamp`, `imageData`, `note?`, `ocrText`, `source`, `createdAt`
- `SettingRecord`
  - `id`, `value`

## IndexedDB Schema

- `videos` store
  - keyPath: `id`
  - index: `url`
- `notes` store
  - keyPath: `id`
  - indexes: `videoId`, `createdAt`
- `screenshots` store
  - keyPath: `id`
  - indexes: `videoId`, `createdAt`, `ocrText`
- `settings` store
  - keyPath: `id`

## UI and Feature Design

### Side Panel Notebook
- Search across notes, timestamps, and OCR text
- Filters for Notes, Screenshots, Auto Captures
- Sorting by Newest, Oldest, Timeline Order
- Export actions for PDF, HTML, Markdown, JSON

### Content Script UI
- Injects timeline markers above YouTube seek bar
- Adds an auto-capture toggle button into YouTube controls
- Supports keyboard-first workflow:
  - `H`: quick highlight
  - `Hold H`: highlight with note
  - `P`: quick screenshot
  - `Hold P`: screenshot with note
  - `Ctrl+Shift+S`: open notebook side panel
  - `Ctrl+Shift+A`: toggle auto capture

### OCR Pipeline
- Every screenshot is sent to background service worker
- Tesseract.js extracts visible text
- OCR text is stored with screenshot data
- Search includes OCR content

## Installation

```bash
cd /Users/iamsparsh00321/Desktop/extensionproject
npm install
npm run build
```

### Load in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Choose the `dist` folder

## Development

- `npm run dev` — start Vite dev server
- `npm run build` — build extension output
- `npm run typecheck` — run TypeScript checks

## Roadmap

1. Add rich note editor and markdown support
2. Build OCR text selector/highlight preview
3. Enable cloud sync and authentication
4. Add flashcard generation and AI summarization
5. Add Notion/Obsidian export connectors
6. Add full chapter detection and lecture outline extraction

## Notes

- Storage is intentionally IndexedDB-based for performance and scale
- The architecture is modular for future extension of AI features, sync, plugin export, and mobile companion experiences
- The current build target is optimized for polished UI and maintainability
