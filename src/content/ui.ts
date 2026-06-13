

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
  button.title = 'Toggle NullNote Workspace';
  button.setAttribute('aria-label', 'Toggle NullNote Workspace');
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

