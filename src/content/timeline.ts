import type { NotebookEntry } from '@/utils/types';
import { formatSeconds } from '@/utils/format';
import { MARKER_ICONS, DEFAULT_MARKER_ICON } from '@/utils/constants';

const OVERLAY_ID = 'lecturesnap-timeline-overlay';

export function createTimelineOverlay(container: HTMLElement) {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  // CRITICAL: height:0 + overflow:visible means ZERO layout impact.
  // The seekbar NEVER shifts. Markers float visually above via bottom positioning.
  // Do NOT set container.style.position — that caused the seekbar to shift upward.
  overlay.style.position = 'absolute';
  overlay.style.left = '0';
  overlay.style.right = '0';
  overlay.style.bottom = '0';
  overlay.style.height = '0';
  overlay.style.overflow = 'visible';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '10';
  container.appendChild(overlay);
  return overlay;
}

function getMarkerFile(iconKey?: string): string {
  const found = MARKER_ICONS.find(m => m.key === (iconKey || DEFAULT_MARKER_ICON));
  return found?.file ?? 'mark_icon1.png';
}

export function renderTimelineMarkers(
  overlay: HTMLElement,
  entries: NotebookEntry[],
  duration: number,
  onSeek: (timestamp: number) => void,
  _markerIconUrl?: string // kept for API compatibility, now unused
) {
  overlay.innerHTML = '';
  const clampedDuration = Math.max(duration, 1);

  entries.forEach((entry) => {
    const position = Math.min(100, Math.max(0, (entry.timestamp / clampedDuration) * 100));
    const file = getMarkerFile(entry.icon);

    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'lecturesnap-marker';
    marker.style.pointerEvents = 'auto';
    marker.style.position = 'absolute';
    marker.style.left = `${position}%`;
    marker.style.bottom = '4px';
    marker.style.transform = 'translateX(-50%)';
    marker.style.width = '28px';
    marker.style.height = '28px';
    marker.style.cursor = 'pointer';
    marker.style.border = 'none';
    marker.style.background = 'transparent';
    marker.style.padding = '0';
    marker.style.outline = 'none';
    marker.style.display = 'flex';
    marker.style.alignItems = 'center';
    marker.style.justifyContent = 'center';
    marker.style.fontSize = '14px';
    marker.style.lineHeight = '1';
    marker.style.filter = 'drop-shadow(0px 1px 3px rgba(0,0,0,0.5))';
    marker.style.transition = 'transform 0.12s ease';
    
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('icons/' + file);
    img.style.width = '22px';
    img.style.height = '22px';
    img.style.objectFit = 'contain';
    img.style.pointerEvents = 'none';
    marker.appendChild(img);

    // Tooltip — styled to match sidepanel theme
    const tooltip = document.createElement('div');
    tooltip.className = 'lecturesnap-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.bottom = '36px';
    tooltip.style.display = 'flex';
    tooltip.style.alignItems = 'center';
    tooltip.style.gap = '6px';

    // Match sidepanel card style: white bg, subtle border, soft shadow
    tooltip.style.background = '#ffffff';
    tooltip.style.border = '1.5px solid #e8ecf0';
    tooltip.style.borderRadius = '9px';
    tooltip.style.padding = '5px 10px 5px 7px';
    tooltip.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)';

    // Font matches sidepanel (Inter)
    tooltip.style.fontFamily = "'Inter', system-ui, sans-serif";
    tooltip.style.whiteSpace = 'nowrap';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
    tooltip.style.zIndex = '99999';

    // Small marker icon inside tooltip
    const tipIcon = document.createElement('img');
    tipIcon.src = chrome.runtime.getURL('icons/' + file);
    tipIcon.style.width = '14px';
    tipIcon.style.height = '14px';
    tipIcon.style.objectFit = 'contain';
    tipIcon.style.flexShrink = '0';
    tipIcon.style.pointerEvents = 'none';
    tooltip.appendChild(tipIcon);

    // Timestamp — amber accent, matches sidepanel marker timestamp color
    const tipTime = document.createElement('span');
    tipTime.textContent = formatSeconds(entry.timestamp);
    tipTime.style.fontSize = '12px';
    tipTime.style.fontWeight = '700';
    tipTime.style.color = '#f59e0b';
    tipTime.style.letterSpacing = '-0.2px';
    tooltip.appendChild(tipTime);

    // Note text if present
    if (entry.note) {
      const tipDot = document.createElement('span');
      tipDot.textContent = '·';
      tipDot.style.fontSize = '12px';
      tipDot.style.color = '#94a3b8';
      tipDot.style.margin = '0 1px';
      tooltip.appendChild(tipDot);

      const tipNote = document.createElement('span');
      tipNote.textContent = entry.note.length > 28 ? entry.note.slice(0, 28) + '…' : entry.note;
      tipNote.style.fontSize = '12px';
      tipNote.style.fontWeight = '500';
      tipNote.style.color = '#374151';
      tipNote.style.maxWidth = '160px';
      tipNote.style.overflow = 'hidden';
      tipNote.style.textOverflow = 'ellipsis';
      tipNote.style.whiteSpace = 'nowrap';
      tooltip.appendChild(tipNote);
    }

    // Clamp tooltip so it doesn't overflow off-screen at edges
    if (position < 10) {
      tooltip.style.left = '0';
      tooltip.style.transform = 'translateY(4px)';
    } else if (position > 90) {
      tooltip.style.right = '0';
      tooltip.style.left = 'auto';
      tooltip.style.transform = 'translateY(4px)';
    } else {
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%) translateY(4px)';
    }

    const tooltipShowTransform = position < 10
      ? 'translateY(0)'
      : position > 90
        ? 'translateY(0)'
        : 'translateX(-50%) translateY(0)';
    const tooltipHideTransform = position < 10
      ? 'translateY(4px)'
      : position > 90
        ? 'translateY(4px)'
        : 'translateX(-50%) translateY(4px)';

    marker.appendChild(tooltip);

    marker.addEventListener('mouseenter', () => {
      marker.style.transform = 'translateX(-50%) scale(1.2)';
      tooltip.style.opacity = '1';
      tooltip.style.transform = tooltipShowTransform;
    });
    marker.addEventListener('mouseleave', () => {
      marker.style.transform = 'translateX(-50%) scale(1)';
      tooltip.style.opacity = '0';
      tooltip.style.transform = tooltipHideTransform;
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
