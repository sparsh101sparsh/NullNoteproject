import type { NotebookEntry } from '@/utils/types';
import { formatSeconds } from '@/utils/format';

const OVERLAY_ID = 'lecturesnap-timeline-overlay';

export function createTimelineOverlay(container: HTMLElement) {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.position = 'absolute';
  overlay.style.left = '0';
  overlay.style.right = '0';
  overlay.style.top = '-10px';
  overlay.style.height = '10px';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '10';
  container.style.position = 'relative';
  container.appendChild(overlay);
  return overlay;
}

export function renderTimelineMarkers(
  overlay: HTMLElement,
  entries: NotebookEntry[],
  duration: number,
  onSeek: (timestamp: number) => void,
  markerIconUrl?: string
) {
  overlay.innerHTML = '';
  const clampedDuration = Math.max(duration, 1);

  entries.forEach((entry) => {
    const position = Math.min(100, Math.max(0, (entry.timestamp / clampedDuration) * 100));
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'lecturesnap-marker';
    marker.style.pointerEvents = 'auto';
    marker.style.position = 'absolute';
    marker.style.left = `${position}%`;
    marker.style.top = '-6px';
    marker.style.transform = 'translateX(-50%)';
    marker.style.width = '16px';
    marker.style.height = '16px';
    marker.style.cursor = 'pointer';
    marker.style.border = 'none';
    marker.style.background = 'transparent';
    marker.style.padding = '0';
    marker.style.outline = 'none';
    marker.style.display = 'flex';
    marker.style.alignItems = 'center';
    marker.style.justifyContent = 'center';

    const iconImg = document.createElement('img');
    iconImg.src = markerIconUrl || chrome.runtime.getURL('icons/pin.png');
    iconImg.style.width = '14px';
    iconImg.style.height = '14px';
    iconImg.style.objectFit = 'contain';
    iconImg.style.filter = 'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.4))';
    iconImg.style.display = 'block';

    marker.appendChild(iconImg);

    // Premium custom note preview tooltip on hover
    const tooltip = document.createElement('div');
    tooltip.className = 'lecturesnap-tooltip';
    tooltip.textContent = `${formatSeconds(entry.timestamp)}${entry.note ? ` • ${entry.note}` : ''}`;
    tooltip.style.position = 'absolute';
    tooltip.style.bottom = '22px';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translateX(-50%) translateY(4px)';
    tooltip.style.background = '#1e293b';
    tooltip.style.color = '#f8fafc';
    tooltip.style.border = '1px solid rgba(255,255,255,0.08)';
    tooltip.style.borderRadius = '6px';
    tooltip.style.padding = '4px 8px';
    tooltip.style.fontSize = '11px';
    tooltip.style.fontWeight = '500';
    tooltip.style.whiteSpace = 'nowrap';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    tooltip.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
    tooltip.style.zIndex = '99999';

    marker.appendChild(tooltip);

    marker.addEventListener('mouseenter', () => {
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateX(-50%) translateY(0)';
    });

    marker.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateX(-50%) translateY(4px)';
    });

    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      onSeek(entry.timestamp);
    });
    overlay.appendChild(marker);
  });
}

export function findProgressContainer() {
  return document.querySelector('.ytp-progress-bar')?.parentElement as HTMLElement | null;
}
