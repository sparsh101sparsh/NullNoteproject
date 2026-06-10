import { getScreenshotsForVideo } from '@/storage/repository';
import { formatSeconds } from '@/utils/format';

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Converts temporary Object URLs in HTML to self-contained Base64 data URLs using database Blobs
export async function prepareSelfContainedHtml(editorHtml: string, videoId: string): Promise<string> {
  if (!videoId) return editorHtml;

  try {
    const screenshots = await getScreenshotsForVideo(videoId);
    const base64Map: Record<string, string> = {};

    for (const s of screenshots) {
      if (s.imageBlob) {
        const base64 = await blobToBase64(s.imageBlob);
        base64Map[s.id] = base64;
      }
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(editorHtml, 'text/html');
    const imgs = doc.querySelectorAll('img[data-screenshot-id]');

    imgs.forEach((img) => {
      const id = img.getAttribute('data-screenshot-id');
      if (id && base64Map[id]) {
        img.setAttribute('src', base64Map[id]);
      }
    });

    return doc.body.innerHTML;
  } catch (e) {
    console.error('Error preparing self-contained HTML:', e);
    return editorHtml;
  }
}

export function convertHtmlToMarkdown(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const markdownLines: string[] = [];

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      markdownLines.push(node.textContent || '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

        if (el.classList.contains('marker-badge')) {
        markdownLines.push(`\n**Marker • ${el.querySelector('div:last-child')?.textContent?.trim() || ''}**\n`);
      } else if (el.classList.contains('screenshot-block')) {
        const timestampEl = el.querySelector('div');
        const img = el.querySelector('img');

        markdownLines.push('\n');
        if (img) {
          const src = img.getAttribute('src') || '';
          markdownLines.push(`![Screenshot](${src})\n`);
        }
        if (timestampEl) {
          markdownLines.push(`*${timestampEl.textContent?.trim()}*\n`);
        }
        markdownLines.push('\n');
      } else {
        el.childNodes.forEach(processNode);
        if (el.tagName === 'P' || el.tagName === 'DIV' || el.tagName === 'BR') {
          markdownLines.push('\n');
        }
      }
    }
  };

  doc.body.childNodes.forEach(processNode);
  return markdownLines.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export function exportToPdf(title: string, selfContainedHtml: string) {
  // window.open is blocked in iframe contexts (the sidepanel runs inside an iframe).
  // Instead, we build a self-contained HTML blob, create an Object URL,
  // and open it in a new tab via chrome.tabs.create.
  // The opened page auto-triggers window.print() so the user just saves as PDF.

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title || 'NullNote Export'}</title>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      padding: 40px;
      max-width: 860px;
      margin: 0 auto;
      line-height: 1.65;
    }
    h1 {
      font-size: 26px;
      margin-bottom: 4px;
      border-bottom: 3px solid #f59e0b;
      padding-bottom: 10px;
      margin-top: 0;
    }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 32px; }
    .marker-badge {
      border-top: 2px solid #f59e0b;
      border-bottom: 1px solid #e2e8f0;
      padding: 12px 0;
      margin: 20px 0;
      page-break-inside: avoid;
    }
    .screenshot-block {
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 0;
      margin: 20px 0;
      page-break-inside: avoid;
    }
    img { max-width: 100%; border-radius: 6px; display: block; margin-bottom: 8px; }
    p { margin-bottom: 8px; }
    @media print {
      body { padding: 20px; }
      .marker-badge, .screenshot-block { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${title || 'Untitled Lecture Notes'}</h1>
  <div class="meta">Exported from NullNote · ${new Date().toLocaleDateString()}</div>
  ${selfContainedHtml}
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 400);
    });
  <\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Try chrome.tabs.create first (works in extension context)
  try {
    chrome.tabs.create({ url }, () => {
      if (chrome.runtime.lastError) {
        // Fallback: direct anchor download
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  } catch {
    // Final fallback if chrome.tabs unavailable
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}


export function exportToDocs(title: string, selfContainedHtml: string) {
  const wordFriendlyHtml = selfContainedHtml
    .replace(/rgba?\(245,\s*158,\s*11,\s*0\.15\)/g, '#fef08a')
    .replace(/#f59e0b/g, '#854d0e')
    .replace(/#e2e8f0/g, '#334155');

  const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <title>${title || 'NullNote Export'}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.5; color: #333333; }
        h1 { font-size: 24pt; border-bottom: 2px solid #eab308; padding-bottom: 5px; }
        .meta { color: #666; font-size: 10pt; margin-bottom: 20px; }
        .marker-badge {
          font-weight: bold;
          font-size: 14pt;
          margin-bottom: 15px;
        }
        .screenshot-block {
          border-top: 1px solid #dddddd;
          border-bottom: 1px solid #dddddd;
          padding: 15px 0;
          margin-bottom: 20px;
        }
        .screenshot-img {
          width: 550px;
          display: block;
        }
        .screenshot-note {
          margin-top: 8px;
          font-size: 11pt;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h1>${title || 'Untitled Notes'}</h1>
      <p class="meta">Exported from NullNote on ${new Date().toLocaleDateString()}</p>
      <div class="editor-content">
        ${wordFriendlyHtml}
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'Lecture_Notes').replace(/\s+/g, '_')}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToMarkdown(title: string, selfContainedHtml: string) {
  const markdown = convertHtmlToMarkdown(selfContainedHtml);
  const header = `# ${title || 'Lecture Notes'}\n\nExported from NullNote on ${new Date().toLocaleDateString()}\n\n`;
  const blob = new Blob([header + markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'Lecture_Notes').replace(/\s+/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
