/**
 * Centralized raw DOM logo element builder.
 * Creates a wrapped image element with identical proportion-based rounded corners,
 * centering, aspect ratio constraints, and overflow-hidden rules.
 */
export function createLogoElement(size: number): HTMLDivElement {
  const container = document.createElement('div');
  const borderRadius = Math.round(size * 0.22); // Consistent 22% corner language
  container.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: ${size}px;
    height: ${size}px;
    border-radius: ${borderRadius}px;
    overflow: hidden;
    flex-shrink: 0;
    box-sizing: border-box;
    background: transparent;
  `;

  const img = document.createElement('img');
  img.src = chrome.runtime.getURL('icons/newmainicon.png');
  img.alt = 'NullNote';
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  `;

  container.appendChild(img);
  return container;
}

export function createFullscreenPanelButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytp-button nullnote-fs-toggle-btn';
  button.setAttribute('aria-label', 'NullNote');
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

  const logoContainer = createLogoElement(20);
  const img = logoContainer.querySelector('img') as HTMLImageElement;
  img.style.opacity = '0.85';
  img.style.transition = 'opacity 0.15s ease, transform 0.15s ease';

  button.appendChild(logoContainer);

  // Hover triggers
  button.addEventListener('mouseenter', () => {
    img.style.opacity = '1';
    img.style.transform = 'scale(1.1)';
  });

  button.addEventListener('mouseleave', () => {
    img.style.opacity = '0.85';
    img.style.transform = 'scale(1)';
  });

  // Keyboard focus triggers
  button.addEventListener('focus', () => {
    img.style.opacity = '1';
    img.style.transform = 'scale(1.1)';
  });

  button.addEventListener('blur', () => {
    img.style.opacity = '0.85';
    img.style.transform = 'scale(1)';
  });

  // Escape key handler when focused
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      button.blur();
    }
  });

  return button;
}
