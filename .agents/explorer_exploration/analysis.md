# Analysis Report: NullNote Editor Slash Commands and Multi-line Placeholder

## 1. Executive Summary
This report analyzes the current implementation of the NullNote text editor inside the sidepanel, shortcut registration, and placeholder rendering. It proposes a complete, read-only implementation strategy for:
- **R1**: Introducing `/h` and `/p` slash commands in the editor that trigger marker/screenshot actions and clean up command text while preserving the caret position.
- **R2**: Formatting the editor's empty placeholder to show a detailed, multi-line list of shortcuts and commands.

---

## 2. Current Implementation Analysis

### 2.1 The contentEditable Editor
The NullNote editor is a `div` element located in `src/sidepanel/App.tsx` (lines 1187-1199):
- **Element Definition**:
  ```tsx
  <div
    id="document-editor"
    ref={editorRef}
    contentEditable="true"
    onInput={handleInput}
    onClick={handleEditorClick}
    onKeyUp={saveSelection}
    onMouseUp={saveSelection}
    onBlur={saveSelection}
    className="editor-sheet custom-scrollbar"
    style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'8px 16px 14px', outline:'none', whiteSpace:'pre-wrap', wordBreak:'break-word' }}
  />
  ```
- **State and Synchronization**:
  - Content changes are handled in `handleInput()` (lines 396-404) and debounced-saved to IndexedDB via `triggerSaveAndMarkerUpdate()` (lines 359-394).
  - Caret/selection coordinates are captured in `saveSelection()` (lines 407-415) and saved to `savedRangeRef.current`.
  - Content insertion (such as screenshots or marker badges) is performed by `insertHtml(html)` (lines 417-461), which injects elements at `savedRangeRef.current` or appends them if no selection is active.

### 2.2 Keyboard Shortcut Registration and Handling
- **Location**: `src/content/keyboard.ts` (functions `attachKeyboardShortcuts` and `isEditableElement`).
- **Hooked Elements**: Keyboard events are captured at the document-level (`document.addEventListener('keydown', downHandler, true)`) in the YouTube page context via the content script `src/content/index.ts` (lines 1043-1049).
- **Conditioning**: Shortcuts (such as `H`, `P`, `A`) are active *only* when the user is NOT typing inside an editable element (checked via `isEditableElement` on `event.target`, which returns `true` for inputs, textareas, and any `isContentEditable` nodes).
- **Communication Flow**:
  - When a shortcut is pressed (e.g., `H` for Marker, `P` for Screenshot):
    1. Content script captures it.
    2. Content script captures the current video player state (e.g., video frame as base64, timestamp).
    3. Content script broadcasts a message via `chrome.runtime.sendMessage` (e.g., `{ type: 'insert-marker', ... }`).
    4. Sidepanel React app receives the message inside a stable `useEffect` listener (lines 311-339) and triggers `insertMarkerInline(...)` or `insertScreenshotInline(...)`.

### 2.3 Empty Placeholder Text Implementation and Styling
- **State Indicator**: `const [isEditorEmpty, setIsEditorEmpty] = useState<boolean>(true);`
- **Render Location**: `src/sidepanel/App.tsx` (lines 1181-1186):
  ```tsx
  {isEditorEmpty && (
    <div style={{ position:'absolute', top:16, left:16, right:16, pointerEvents:'none', userSelect:'none', zIndex:10, display:'flex', alignItems:'flex-start', gap:8 }}>
      <Logo size={16} style={{ opacity:0.3, marginTop:2, border:'none', boxShadow:'none', background:'transparent' }} />
      <span style={{ fontSize:13.5, color:'#94a3b8', lineHeight:1.5 }}>Start capturing knowledge — press <strong style={{color:'#f59e0b'}}>H</strong> for marker, <strong style={{color:'#f59e0b'}}>P</strong> for screenshot.</span>
    </div>
  )}
  ```
- **Updates**: `isEditorEmpty` is updated in `handleInput()` and when a document is initially loaded from IndexedDB, checking if the text content is empty and no images or marker badges are present (`!hasMedia`).

### 2.4 Build and Test Configurations
- **Build Command**: `npm run build`
  - Defined in `package.json` as: `vite build && vite build --config vite.content.config.ts && vite build --config vite.background.config.ts`
- **Test Commands/Runners**: None configured.
  - There are no testing scripts, frameworks (e.g., Vitest, Jest), or configurations inside `package.json`.

---

## 3. Implementation Plan & Proposed Code Changes

### 3.1 R1: Slash Commands (`/h` and `/p`) in Editor
To intercept `/h` and `/p` commands while the user is typing inside the contentEditable editor, we propose adding a checking step inside the `handleInput` function in `src/sidepanel/App.tsx`.

#### Logic Design
1. When `handleInput` is invoked on the `input` event:
   - Get the current DOM selection and range.
   - Confirm the cursor is collapsed (a caret position) and resides inside a `TEXT_NODE`.
   - Retrieve the last 2 characters before the caret offset.
   - If they match `/h` or `/p`:
     - Trigger the respective action (`handleMarker()` or `handleSnap()`).
     - Splice the text content of the node to remove the `/h` or `/p` command characters.
     - Move the cursor position to `offset - 2` (where the slash `/` started) to prevent any cursor jumping.
     - Save this new range directly to `savedRangeRef.current` so the returned badge inserts exactly where the slash command was typed.

#### Code Snippet Proposal
Add the helper function `checkForSlashCommands` and integrate it into `handleInput` inside `src/sidepanel/App.tsx`:

```tsx
  // Proposed helper function for R1 (to be added inside App component scope)
  const checkForSlashCommands = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    // Verify cursor is at a text node
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const textNode = range.startContainer;
      const offset = range.startOffset;
      const textContent = textNode.textContent || '';

      // Check if text has at least 2 characters before caret
      if (offset >= 2) {
        const triggerText = textContent.slice(offset - 2, offset);
        if (triggerText === '/h' || triggerText === '/p') {
          // 1. Trigger action
          if (triggerText === '/h') {
            handleMarker();
          } else {
            handleSnap();
          }

          // 2. Delete slash command characters from the text node
          const before = textContent.slice(0, offset - 2);
          const after = textContent.slice(offset);
          textNode.textContent = before + after;

          // 3. Move caret to where "/" was typed
          const newRange = document.createRange();
          newRange.setStart(textNode, offset - 2);
          newRange.collapse(true);

          selection.removeAllRanges();
          selection.addRange(newRange);

          // 4. Update the saved selection range reference
          savedRangeRef.current = newRange;
        }
      }
    }
  };

  // Modify handleInput to call our helper
  const handleInput = () => {
    checkForSlashCommands(); // Intercept and handle slash commands

    if (editorRef.current) {
      const textVal = editorRef.current.textContent?.trim() || '';
      const hasMedia = editorRef.current.querySelectorAll('img, .marker-badge').length > 0;
      setIsEditorEmpty(textVal === '' && !hasMedia);
    }
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(triggerSaveAndMarkerUpdate, 1000);
  };
```

---

### 3.2 R2: Multiple-line Placeholder Text Formatting
We will replace the single-line placeholder element with a multi-line styled container.

#### Code Snippet Proposal
In `src/sidepanel/App.tsx`, modify the placeholder rendering section:

```tsx
        {isEditorEmpty && (
          <div style={{ position:'absolute', top:16, left:16, right:16, pointerEvents:'none', userSelect:'none', zIndex:10, display:'flex', alignItems:'flex-start', gap:8 }}>
            <Logo size={16} style={{ opacity:0.3, marginTop:2, border:'none', boxShadow:'none', background:'transparent' }} />
            <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.5, whiteSpace:'pre-wrap' }}>
              <span style={{ fontWeight:600, color:'#64748b', display:'block', marginBottom:2 }}>Start capturing knowledge</span>
              Shortcuts:
              {"\n- "}
              <strong style={{color:'#f59e0b'}}>H</strong>
              {": Marker"}
              {"\n- "}
              <strong style={{color:'#f59e0b'}}>P</strong>
              {": Screenshot"}
              {"\n- "}
              <strong style={{color:'#f59e0b'}}>A</strong>
              {": AutoSnap"}
              {"\n- "}
              <strong style={{color:'#f59e0b'}}>Ctrl+Shift+S</strong>
              {": Toggle Panel"}
              {"\n- Inside editor: "}
              <strong style={{color:'#f59e0b'}}>/h</strong>
              {" (marker) or "}
              <strong style={{color:'#f59e0b'}}>/p</strong>
              {" (screenshot)"}
            </div>
          </div>
        )}
```

---

## 4. Verification Strategy

### 4.1 Manual Verification Steps
1. **R1: Slash Commands**:
   - Open a YouTube video with the sidepanel enabled.
   - Click inside the editor and type some text.
   - Type `/h`. Confirm:
     - The text `/h` immediately disappears.
     - A marker badge (with the current video timestamp) is inserted inline.
     - Caret position stays correct (user can type right after or before the marker).
   - Type `/p`. Confirm:
     - The text `/p` disappears.
     - A screenshot block (with outline if configured) is inserted inline.
   - Test typing `/h` in the middle of a string (e.g., `test/h`). Confirm it triggers and cleans up `test`.

2. **R2: Multi-line Placeholder**:
   - Clear all content from the editor (both text and badges).
   - Verify that the multi-line placeholder displays formatted list items with bullet/hyphen pointers:
     ```
     Start capturing knowledge
     Shortcuts:
     - H: Marker
     - P: Screenshot
     - A: AutoSnap
     - Ctrl+Shift+S: Toggle Panel
     - Inside editor: /h (marker) or /p (screenshot)
     ```
   - Verify it disappears immediately when you type any character.
