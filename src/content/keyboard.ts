// Keyboard shortcut system for NullNote content script

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  
  // Standard form inputs
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  
  // ContentEditable elements (YouTube comments, our own editor, etc.)
  if (target.isContentEditable) return true;
  
  // YouTube's search box uses a custom element
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'yt-formatted-string' && target.getAttribute('contenteditable') === 'true') return true;
  
  // Check if inside the NullNote panel iframe (shouldn't reach here since iframe has its own window, but safety check)
  if (target.closest('#nullnote-inpage-panel')) return true;
  
  // YouTube's search input
  if (target.closest('ytd-searchbox') || target.closest('#search-input')) return true;
  
  return false;
}

export function attachKeyboardShortcuts(
  video: HTMLVideoElement,
  onQuickHighlight: () => void,
  onQuickScreenshot: () => void,
  onToggleAutoSnap: () => void,
  onOpenNotebook: () => void
) {
  const downHandler = (event: KeyboardEvent) => {
    // Skip if user is typing in any editable element
    if (isEditableElement(event.target) || event.isComposing) {
      return;
    }

    // Skip if any modifier key is held (except for the Ctrl+Shift+S shortcut)
    if (event.altKey || event.metaKey) {
      return;
    }

    const key = event.key.toLowerCase();

    if ((key === 'h' || key === 'p' || key === 'a') && !event.ctrlKey && !event.shiftKey) {
      // Prevent default browser behavior and YouTube shortcuts
      event.preventDefault();
      event.stopPropagation();
      console.log(`[NullNote] Shortcut ${key.toUpperCase()} detected`);

      if (key === 'h') {
        console.log('[NullNote] Marker triggered');
        onQuickHighlight();
      } else if (key === 'p') {
        console.log('[NullNote] Screenshot triggered');
        onQuickScreenshot();
      } else if (key === 'a') {
        console.log('[NullNote] AutoSnap toggled');
        onToggleAutoSnap();
      }
    }

    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      console.log('[NullNote] Open/Close notebook detected');
      onOpenNotebook();
    }
  };

  document.addEventListener('keydown', downHandler, true);

  return () => {
    document.removeEventListener('keydown', downHandler, true);
  };
}
