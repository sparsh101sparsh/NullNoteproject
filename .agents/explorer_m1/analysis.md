# Analysis Report: Milestone 1 — Slash Commands Interception

## 1. Observations on Existing Code Structure around `handleInput`

- **Trigger Source**: The main `contentEditable` editor is located in `src/sidepanel/App.tsx` (lines 1187-1199). The `onInput` attribute triggers `handleInput` whenever text is typed, pasted, or modified inside the `#document-editor` div.
- **Input Handling**: The `handleInput` function (lines 396-404) performs two main tasks:
  1. Checks if the text content is empty and has no media (like image elements or marker badges), and updates `isEditorEmpty` accordingly.
  2. Debounces the save logic by clearing the existing timeout and setting a new timeout of 1 second to trigger `triggerSaveAndMarkerUpdate`.
- **Selection Preservation**: Selection and range inside the editor are saved using `saveSelection()` (lines 407-415) on events `onKeyUp`, `onMouseUp`, and `onBlur`. This saves the range to `savedRangeRef.current` (line 154).
- **Inline HTML Insertion**: Functions `insertMarkerInline` (line 467) and `insertScreenshotInline` (line 534) format HTML templates and call `insertHtml` (line 417). `insertHtml` attempts to insert the HTML document fragment at `savedRangeRef.current` if it exists and resides within the editor, collapsing it and setting the start/end ranges immediately after the inserted content.

---

## 2. Proposed Code Changes for `src/sidepanel/App.tsx`

We propose adding the helper function `checkForSlashCommands` immediately above `handleInput` and invoking it at the start of `handleInput`.

### Before Code Block (`src/sidepanel/App.tsx` lines 395-405)
```tsx
  const handleInput = () => {
    if (editorRef.current) {
      const textVal = editorRef.current.textContent?.trim() || '';
      const hasMedia = editorRef.current.querySelectorAll('img, .marker-badge').length > 0;
      setIsEditorEmpty(textVal === '' && !hasMedia);
    }
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(triggerSaveAndMarkerUpdate, 1000);
  };
```

### After Code Block
```tsx
  const checkForSlashCommands = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    // Verify cursor is collapsed and in a text node
    if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
      const textNode = range.startContainer;
      const offset = range.startOffset;
      const textContent = textNode.textContent || '';

      if (offset >= 2) {
        const triggerText = textContent.slice(offset - 2, offset).toLowerCase();
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

  const handleInput = () => {
    checkForSlashCommands();
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

## 3. Verification Steps

### 3.1 Syntax and Compilation Check
To verify that the proposed changes are syntactically valid and compile correctly:
1. Run `npm run typecheck` to verify no TypeScript compilation errors.
2. Run `npm run build` to confirm Vite is able to bundle the sidepanel app successfully.

### 3.2 Manual Runtime Verification Checklist
1. **Command Interception (/h)**:
   - Type text inside the editor, then type `/h`.
   - Confirm that `/h` disappears immediately.
   - Confirm that a Marker badge is inserted at the cursor's previous `/` position.
2. **Command Interception (/p)**:
   - Type text, then type `/p`.
   - Confirm that `/p` disappears immediately.
   - Confirm that a Screenshot block is inserted at the cursor's previous `/` position.
3. **Caret Stability**:
   - Verify that the cursor is placed immediately after the inserted badge/screenshot block, allowing the user to type continuously without manual refocusing or cursor jumping.
4. **Boundary Checks**:
   - Type `/h` on an empty editor sheet (only text node). Confirm it triggers, cleans up, and does not cause errors or caret jumping.
