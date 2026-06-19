# Scope: NullNote Editor Implementation Track

## Architecture
- **NullNote sidepanel App**: The main React component in `src/sidepanel/App.tsx` containing the contentEditable note editor and hotkey/runtime listeners.
- **Slash Commands Interception**: Intercepted in `handleInput()` inside `src/sidepanel/App.tsx` by checking the selection caret and text node content.
- **Placeholder Rendering**: Styled empty state rendered dynamically in `src/sidepanel/App.tsx` when `isEditorEmpty` is true.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Milestone 1: Slash Commands | Implement `/h` and `/p` slash commands in the editor, clear trigger text, position caret, trigger action. | None | PLANNED |
| 2 | Milestone 2: Placeholder | Update editor empty state placeholder text and style to render multi-line shortcuts. | Milestone 1 | PLANNED |
| 3 | Milestone 3: Verification & E2E | Run and pass E2E tests, run Forensic Auditor, and perform Adversarial Coverage Hardening. | Milestone 2 | PLANNED |

## Interface Contracts
- **Slash Commands**:
  - Input: User typing `/h` or `/p` in the contentEditable `#document-editor` div.
  - Action: Trigger marker action (`handleMarker()`) or screenshot capture (`handleSnap()`).
  - Side-effect: Remove `/h` or `/p` from the text node and reset the caret position.
- **Editor Empty State**:
  - `isEditorEmpty` (boolean): true when text is empty and no images/markers exist, triggering the multi-line placeholder.
