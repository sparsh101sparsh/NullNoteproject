# Handoff Report - explorer_exploration

## 1. Observation
- **Editor Location**: The contentEditable text editor is defined as a `div` element in `src/sidepanel/App.tsx` (lines 1187-1199):
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
- **Keyboard Shortcuts**: Defined in `src/content/keyboard.ts` (lines 25-75). They listen to document `keydown` events:
  ```typescript
  document.addEventListener('keydown', downHandler, true);
  ```
  It ignores elements where `isEditableElement(event.target)` is true (lines 3-23), preventing execution when typing inside the editor. Actions triggered (such as `addQuickHighlight` and `captureScreenshotForVideo('manual')` in `src/content/index.ts`) send Chrome runtime messages to the sidepanel.
- **Placeholder Text**: Defined in `src/sidepanel/App.tsx` (lines 1181-1186):
  ```tsx
  {isEditorEmpty && (
    <div style={{ position:'absolute', top:16, left:16, right:16, pointerEvents:'none', userSelect:'none', zIndex:10, display:'flex', alignItems:'flex-start', gap:8 }}>
      <Logo size={16} style={{ opacity:0.3, marginTop:2, border:'none', boxShadow:'none', background:'transparent' }} />
      <span style={{ fontSize:13.5, color:'#94a3b8', lineHeight:1.5 }}>Start capturing knowledge — press <strong style={{color:'#f59e0b'}}>H</strong> for marker, <strong style={{color:'#f59e0b'}}>P</strong> for screenshot.</span>
    </div>
  )}
  ```
- **Build and Test configuration**:
  - Build command in `package.json` (line 11): `"build": "vite build && vite build --config vite.content.config.ts && vite build --config vite.background.config.ts"`
  - Test command: None configured in `package.json`. No test runners or dependencies like Jest or Vitest are installed.

---

## 2. Logic Chain
1. Since the content script shortcut handler is disabled when typing inside the editor, keyboard events originating within `contentEditable` will bypass standard `H` and `P` shortcuts.
2. Therefore, to support `/h` and `/p` slash commands inside the editor itself (R1), we must intercept them during the editor's text entry cycle (`handleInput` in `src/sidepanel/App.tsx`).
3. By analyzing the current selection using `window.getSelection()`, we can check if the caret is inside a `TEXT_NODE` and immediately preceded by `/h` or `/p`.
4. Splicing the text node content removes the slash command characters cleanly without rebuilding the editor DOM.
5. Re-collapsing the selection at `offset - 2` keeps the cursor exactly where `/` was typed, preventing layout jumps.
6. Crucially, updating `savedRangeRef.current` with the new cursor position ensures that the asynchronously generated marker or screenshot HTML badge is inserted at the exact command insertion point.
7. To implement the multi-line placeholder (R2), modifying the absolute overlay layout in `src/sidepanel/App.tsx` using `whiteSpace: 'pre-wrap'` and a structured `div` correctly displays formatting on multiple lines.

---

## 3. Caveats
- No automated tests exist in the codebase. All testing must be conducted manually or by writing custom test scripts.
- Selection modifications (such as updating selection ranges programmatically) rely on standard browser APIs. If future migrations to richer editors (like Draft.js or Lexical) occur, this logic will need to be rewritten.

---

## 4. Conclusion
We have identified all codebase insertion points. R1 and R2 can be implemented entirely in `src/sidepanel/App.tsx` using native DOM selection manipulation and simple JSX style updates, with no modifications needed to the content scripts.

---

## 5. Verification Method
- **Verification Commands**: `npm run build` should be run to verify compile-time safety and package generation.
- **Manual Check**:
  - Verify `/h` and `/p` delete command text, preserve caret position, and trigger marker/screenshot capture.
  - Verify empty editor displays the multi-line formatted list matching R2.
