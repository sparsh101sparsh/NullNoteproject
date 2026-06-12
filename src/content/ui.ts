
function createPlayerButton(iconName: string, title: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `ytp-button ${className}`;
  button.title = title;
  button.type = 'button';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.width = '36px';
  button.style.height = '36px';
  button.style.background = 'transparent';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.outline = 'none';
  button.style.padding = '0';
  button.style.margin = '0 2px';
  button.style.verticalAlign = 'middle';
  
  const img = document.createElement('img');
  img.src = chrome.runtime.getURL(`icons/${iconName}`);
  img.style.width = '18px';
  img.style.height = '18px';
  img.style.objectFit = 'contain';
  img.style.opacity = '0.85';
  img.style.transition = 'all 0.15s ease';
  
  button.addEventListener('mouseenter', () => {
    img.style.opacity = '1';
    img.style.transform = 'scale(1.08)';
  });
  button.addEventListener('mouseleave', () => {
    img.style.opacity = '0.85';
    img.style.transform = 'scale(1)';
  });

  button.appendChild(img);
  return button;
}

export function createCaptureButton() {
  return createPlayerButton('capture.png', 'NullNote Capture Screenshot (P)', 'nullnote-player-capture');
}

export function createMarkerButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `ytp-button nullnote-player-marker`;
  button.title = 'NullNote Add Marker (H)';
  button.type = 'button';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.width = '36px';
  button.style.height = '36px';
  button.style.background = 'transparent';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.outline = 'none';
  button.style.padding = '0';
  button.style.margin = '0 2px';
  button.style.verticalAlign = 'middle';
  button.style.opacity = '0.85';
  button.style.transition = 'opacity 0.15s ease, transform 0.15s ease';

  // Inline bookmark SVG — no external file needed
  button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;

  button.addEventListener('mouseenter', () => {
    button.style.opacity = '1';
    button.style.transform = 'scale(1.08)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.opacity = '0.85';
    button.style.transform = 'scale(1)';
  });

  return button;
}


export function createAutoSnapButton() {
  return createPlayerButton('capture.png', 'NullNote Toggle AutoSnap', 'nullnote-player-autosnap');
}


export function updateAutoSnapButton(button: HTMLButtonElement, enabled: boolean) {
  const img = button.querySelector('img');
  if (img) {
    if (enabled) {
      img.style.filter = 'drop-shadow(0 0 6px #f59e0b) brightness(1.2) sepia(100%) hue-rotate(15deg) saturate(1000%)';
      img.style.opacity = '1';
    } else {
      img.style.filter = 'none';
      img.style.opacity = '0.85';
    }
  }
}

/**
 * The toggle button injected into YouTube's fullscreen controls.
 * Styled to match native YouTube buttons so it feels native — same size,
 * opacity, transitions, and hover behaviour as other .ytp-button elements.
 *
 * Uses the NullNote logo as the icon (white-filtered for the dark controls bar).
 */
export function createFullscreenPanelButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytp-button nullnote-fs-toggle-btn';
  button.title = 'Open NullNote';
  button.setAttribute('aria-label', 'Open NullNote sidebar');
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: transparent;
    border: none;
    cursor: pointer;
    outline: none;
    padding: 0;
    margin: 0 2px;
    vertical-align: middle;
    position: relative;
  `;

  const img = document.createElement('img');
  img.src = chrome.runtime.getURL('icons/icon-128.png');
  img.alt = 'NullNote';
  img.style.cssText = `
    width: 20px;
    height: 20px;
    object-fit: contain;
    opacity: 0.85;
    filter: brightness(10);
    transition: opacity 0.15s ease, transform 0.15s ease;
    pointer-events: none;
  `;

  button.addEventListener('mouseenter', () => {
    img.style.opacity = '1';
    img.style.transform = 'scale(1.1)';
  });
  button.addEventListener('mouseleave', () => {
    img.style.opacity = '0.85';
    img.style.transform = 'scale(1)';
  });

  button.appendChild(img);
  return button;
}

