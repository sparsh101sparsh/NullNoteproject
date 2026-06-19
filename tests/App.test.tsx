import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import App from '@/sidepanel/App';
import * as repository from '@/storage/repository';

describe('NullNote E2E Component Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mountApp = async () => {
    const { container } = render(<App />);
    const editor = container.querySelector('#document-editor') as HTMLDivElement;
    expect(editor).toBeInTheDocument();
    // Wait for the async loading effect to complete
    await waitFor(() => {
      expect(repository.getDocument).toHaveBeenCalled();
    });
    return { container, editor };
  };

  const simulateTyping = (editor: HTMLDivElement, text: string, caretOffset: number) => {
    editor.focus();
    editor.innerHTML = '';
    const textNode = document.createTextNode(text);
    editor.appendChild(textNode);

    const range = document.createRange();
    range.setStart(textNode, caretOffset);
    range.collapse(true);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    fireEvent.input(editor);
  };

  // ==========================================
  // TIER 1: Feature Coverage (15+ Tests)
  // ==========================================
  describe('Tier 1: Feature Coverage', () => {
    // --- Slash Command /h (5 Tests) ---
    it('1.1 should trigger marker action when typing /h in an empty editor', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '/h', 2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
    });

    it('1.2 should trigger marker and clean up /h at the end of some text', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, 'hello/h', 7);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
      expect(editor.textContent).toBe('hello');
    });

    it('1.3 should remove /h from the text content immediately', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '/h', 2);
      expect(editor.textContent).toBe('');
    });

    it('1.4 should trigger database save after typing /h', async () => {
      const { editor } = await mountApp();
      vi.useFakeTimers();
      simulateTyping(editor, '/h', 2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(repository.saveDocument).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('1.5 should set selection/caret to correct position after /h', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, 'hello/h', 7);
      const selection = window.getSelection();
      expect(selection?.rangeCount).toBeGreaterThan(0);
      const range = selection?.getRangeAt(0);
      expect(range?.startOffset).toBe(5);
    });

    // --- Slash Command /p (5 Tests) ---
    it('1.6 should trigger screenshot capture when typing /p in an empty editor', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '/p', 2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
    });

    it('1.7 should trigger screenshot capture and clean up /p at the end of some text', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, 'hello/p', 7);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
      expect(editor.textContent).toBe('hello');
    });

    it('1.8 should remove /p from the text content immediately', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '/p', 2);
      expect(editor.textContent).toBe('');
    });

    it('1.9 should trigger database save after typing /p', async () => {
      const { editor } = await mountApp();
      vi.useFakeTimers();
      simulateTyping(editor, '/p', 2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(repository.saveDocument).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('1.10 should set selection/caret to correct position after /p', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, 'hello/p', 7);
      const selection = window.getSelection();
      expect(selection?.rangeCount).toBeGreaterThan(0);
      const range = selection?.getRangeAt(0);
      expect(range?.startOffset).toBe(5);
    });

    // --- Multi-line Placeholder (5 Tests) ---
    it('1.11 should display placeholder overlay when editor is completely empty', async () => {
      const { container } = await mountApp();
      const placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).toBeInTheDocument();
    });

    it('1.12 should contain heading text Start capturing knowledge in placeholder', async () => {
      await mountApp();
      expect(screen.getByText(/Start capturing knowledge/i)).toBeInTheDocument();
    });

    it('1.13 should contain shortcut line - H: Marker in placeholder', async () => {
      await mountApp();
      expect(screen.getByText((content, el) => el?.tagName === 'SPAN' && el.textContent.includes('- H: Marker'))).toBeInTheDocument();
    });

    it('1.14 should contain shortcut line - P: Screenshot in placeholder', async () => {
      await mountApp();
      expect(screen.getByText((content, el) => el?.tagName === 'SPAN' && el.textContent.includes('- P: Screenshot'))).toBeInTheDocument();
    });

    it('1.15 should contain slash command instruction line in placeholder', async () => {
      await mountApp();
      expect(screen.getByText((content, el) => el?.tagName === 'SPAN' && el.textContent.includes('/h (marker)'))).toBeInTheDocument();
    });
  });

  // ==========================================
  // TIER 2: Boundary & Corner Cases (15+ Tests)
  // ==========================================
  describe('Tier 2: Boundary & Corner Cases', () => {
    // --- /h boundary cases (5 Tests) ---
    it('2.1 should trigger marker case-insensitively when typing /H', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '/H', 2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
    });

    it('2.2 should trigger /h in the middle of text', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, 'abc/h', 5);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
      expect(editor.textContent).toBe('abc');
    });

    it('2.3 should NOT trigger marker when typing single slash /', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '/', 1);
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
    });

    it('2.4 should NOT trigger marker if caret position is not at the end of /h', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '/h', 1); // caret before 'h'
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
    });

    it('2.5 should handle consecutive slashes like //h and keep the extra slash', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '//h', 3);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
      expect(editor.textContent).toBe('/');
    });

    // --- /p boundary cases (5 Tests) ---
    it('2.6 should trigger screenshot case-insensitively when typing /P', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '/P', 2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
    });

    it('2.7 should trigger /p in the middle of text', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, 'abc/p', 5);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
      expect(editor.textContent).toBe('abc');
    });

    it('2.8 should NOT trigger screenshot when typing p alone without slash', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, 'p', 1);
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
    });

    it('2.9 should trigger /p correctly at the start of a new line', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, 'line1\n/p', 8);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
      expect(editor.textContent).toBe('line1\n');
    });

    it('2.10 should NOT trigger screenshot if caret position is not at the end of /p', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '/p', 1); // caret before 'p'
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
    });

    // --- Placeholder boundary cases (5 Tests) ---
    it('2.11 should show placeholder if editor contains only whitespace', async () => {
      const { container, editor } = await mountApp();
      editor.innerHTML = '   \n  ';
      fireEvent.input(editor);
      const placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).toBeInTheDocument();
    });

    it('2.12 should show placeholder if editor contains single space', async () => {
      const { container, editor } = await mountApp();
      editor.innerHTML = ' ';
      fireEvent.input(editor);
      const placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).toBeInTheDocument();
    });

    it('2.13 should NOT show placeholder if editor has an image badge even if there is no text', async () => {
      const { container, editor } = await mountApp();
      editor.innerHTML = '<img src="test.jpg" />';
      fireEvent.input(editor);
      const placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).not.toBeInTheDocument();
    });

    it('2.14 should NOT show placeholder if editor has a marker badge even if there is no text', async () => {
      const { container, editor } = await mountApp();
      editor.innerHTML = '<span class="marker-badge">Badge</span>';
      fireEvent.input(editor);
      const placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).not.toBeInTheDocument();
    });

    it('2.15 should restore placeholder when all text and media are deleted', async () => {
      const { container, editor } = await mountApp();
      editor.innerHTML = 'some text';
      fireEvent.input(editor);
      let placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).not.toBeInTheDocument();

      editor.innerHTML = '';
      fireEvent.input(editor);
      placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).toBeInTheDocument();
    });
  });

  // ==========================================
  // TIER 3: Cross-Feature Combinations (6 Tests)
  // ==========================================
  describe('Tier 3: Cross-Feature Combinations', () => {
    it('3.1 typing /h in empty editor should call marker action and eventually hide placeholder', async () => {
      const { container, editor } = await mountApp();
      simulateTyping(editor, '/h', 2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
      editor.innerHTML = '<span class="marker-badge">Marker</span>';
      fireEvent.input(editor);
      const placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).not.toBeInTheDocument();
    });

    it('3.2 typing /p in empty editor should call screenshot action and eventually hide placeholder', async () => {
      const { container, editor } = await mountApp();
      simulateTyping(editor, '/p', 2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
      editor.innerHTML = '<img src="snap.jpg" />';
      fireEvent.input(editor);
      const placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).not.toBeInTheDocument();
    });

    it('3.3 typing /h followed by text, then clearing the editor completely restores the placeholder', async () => {
      const { container, editor } = await mountApp();
      simulateTyping(editor, '/h', 2);
      editor.innerHTML = 'hello';
      fireEvent.input(editor);
      let placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).not.toBeInTheDocument();

      editor.innerHTML = '';
      fireEvent.input(editor);
      placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).toBeInTheDocument();
    });

    it('3.4 should show multi-line placeholder with correct slash command info text inside empty state', async () => {
      await mountApp();
      expect(screen.getByText((content, el) => el?.tagName === 'SPAN' && el.textContent.includes('/p (screenshot)'))).toBeInTheDocument();
    });

    it('3.5 should keep placeholder hidden when editor contains text and typing /h is completed', async () => {
      const { container, editor } = await mountApp();
      simulateTyping(editor, 'hello/h', 7);
      const placeholder = container.querySelector('[style*="position: absolute"]');
      expect(placeholder).not.toBeInTheDocument();
    });

    it('3.6 should respect the selected marker icon in MarkerIconPicker when typing /h', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '/h', 2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
    });
  });

  // ==========================================
  // TIER 4: Real-World Scenarios (7 Tests)
  // ==========================================
  describe('Tier 4: Real-World Scenarios', () => {
    it('4.1 should handle continuous typing with /h and immediately other text', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, 'hello/h world', 7);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
      expect(editor.textContent).toBe('hello world');
    });

    it('4.2 should support typing /p at various offsets', async () => {
      const { editor } = await mountApp();

      // Offset 2
      simulateTyping(editor, '/p', 2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );

      // Offset 12
      simulateTyping(editor, 'some text /p', 12);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
    });

    it('4.3 should not trigger commands if /h or /p is part of pasted text spanning different selection ranges', async () => {
      const { editor } = await mountApp();
      
      editor.focus();
      editor.innerHTML = 'pasted /h content';
      const textNode = editor.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 17);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      fireEvent.input(editor);

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
    });

    it('4.4 should trigger /h correctly when typed inside a nested HTML element in the editor', async () => {
      const { container, editor } = await mountApp();
      editor.innerHTML = '<p id="nested-p">nest/h</p>';
      const nestedP = container.querySelector('#nested-p') as HTMLParagraphElement;
      const textNode = nestedP.firstChild as Text;
      
      const range = document.createRange();
      range.setStart(textNode, 6);
      range.collapse(true);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      fireEvent.input(editor);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
      expect(nestedP.textContent).toBe('nest');
    });

    it('4.5 should handle sequential slash commands (/h followed by /p)', async () => {
      const { editor } = await mountApp();
      
      simulateTyping(editor, '/h', 2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
      
      simulateTyping(editor, '/p', 2);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
    });

    it('4.6 should only modify the target paragraph when typing /h inside multi-paragraph content', async () => {
      const { container, editor } = await mountApp();
      editor.innerHTML = '<p>first paragraph</p><p id="target-p">second/h</p>';
      const targetP = container.querySelector('#target-p') as HTMLParagraphElement;
      const textNode = targetP.firstChild as Text;
      
      const range = document.createRange();
      range.setStart(textNode, 8); // caret at the end of second/h
      range.collapse(true);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      fireEvent.input(editor);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualMarker' }),
        expect.any(Function)
      );
      expect(targetP.textContent).toBe('second');
      expect(editor.firstElementChild?.textContent).toBe('first paragraph');
    });

    it('4.7 should not trigger /p if surrounded by non-whitespace/special characters on both sides without boundaries', async () => {
      const { editor } = await mountApp();
      simulateTyping(editor, '(/p)', 4);
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'manualCapture' }),
        expect.any(Function)
      );
    });
  });
});
