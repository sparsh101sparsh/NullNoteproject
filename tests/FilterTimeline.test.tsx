import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import App from '@/sidepanel/App';
import * as repository from '@/storage/repository';

describe('NullNote V9 Filter, Organize & Timeline View Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mountApp = async (docContent = '<p>Start typing...</p>') => {
    // Customize repository return content for test setup
    vi.mocked(repository.getDocument).mockImplementation(async (videoId, defaultTitle) => ({
      videoId,
      videoTitle: defaultTitle || 'Mock Video Title',
      documentContent: docContent,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));

    const { container } = render(<App />);
    const editor = container.querySelector('#document-editor') as HTMLDivElement;
    
    // Wait for App to load document
    await waitFor(() => {
      expect(repository.getDocument).toHaveBeenCalled();
    });

    return { container, editor };
  };

  it('1. should render the Filter & Organize dropdown button at the far right of the toolbar', async () => {
    const { container } = await mountApp();
    const dropdownBtn = screen.getByTitle('Filter & Organize');
    expect(dropdownBtn).toBeInTheDocument();
    
    // Verify it is placed last in the toolbar (right-most flex item)
    const toolbar = dropdownBtn.parentElement?.parentElement;
    expect(toolbar).toBeInTheDocument();
    const lastChild = toolbar?.lastChild;
    // The dropdown toggle button is wrapped in a container div which is the last child of toolbar
    expect(lastChild).toBe(dropdownBtn.parentElement);
  });

  it('2. should open the Filter & Organize dropdown and display counts & toggles', async () => {
    const docWithElements = `
      <div data-type="marker" data-element-id="m1" data-timestamp="10" class="marker-badge">Marker 1</div>
      <div data-type="screenshot" data-source="manual" data-element-id="s1" data-timestamp="20" class="screenshot-block marker-badge">Screenshot 1</div>
      <div data-type="screenshot" data-source="auto" data-element-id="s2" data-timestamp="30" class="screenshot-block marker-badge">Screenshot 2</div>
    `;
    const { container } = await mountApp(docWithElements);
    
    // Open dropdown
    const dropdownBtn = screen.getByTitle('Filter & Organize');
    fireEvent.click(dropdownBtn);

    // Verify visibility section heading
    expect(screen.getByText('Visibility')).toBeInTheDocument();

    // Verify toggles exist and show counts
    const markerToggle = screen.getByRole('button', { name: /Markers\s*1/ });
    const manualToggle = screen.getByRole('button', { name: /Manual Screenshots\s*1/ });
    const autoToggle = screen.getByRole('button', { name: /Auto Screenshots\s*1/ });

    expect(markerToggle).toBeInTheDocument();
    expect(manualToggle).toBeInTheDocument();
    expect(autoToggle).toBeInTheDocument();
  });

  it('3. should toggle visibility of markers via CSS class addition on click', async () => {
    const { editor } = await mountApp();
    const dropdownBtn = screen.getByTitle('Filter & Organize');
    fireEvent.click(dropdownBtn);

    const markerToggle = screen.getByRole('button', { name: /Markers\s*0/ });
    
    // Click to toggle off
    fireEvent.click(markerToggle);
    expect(editor).toHaveClass('hide-markers');
    expect(repository.setVisibilitySetting).toHaveBeenCalledWith('showMarkers', false);

    // Click to toggle back on
    fireEvent.click(markerToggle);
    expect(editor).not.toHaveClass('hide-markers');
    expect(repository.setVisibilitySetting).toHaveBeenCalledWith('showMarkers', true);
  });

  it('4. should apply yellowish active style on active toggles, and neutral on inactive', async () => {
    await mountApp();
    const dropdownBtn = screen.getByTitle('Filter & Organize');
    fireEvent.click(dropdownBtn);

    const markerToggle = screen.getByRole('button', { name: /Markers\s*0/ });
    
    // Active style (initial)
    expect(markerToggle.style.background).toBe('rgb(254, 243, 199)'); // hex #fef3c7
    expect(markerToggle.style.borderColor).toBe('#f59e0b');

    // Click to toggle off -> Inactive style
    fireEvent.click(markerToggle);
    expect(markerToggle.style.background).toBe('rgb(255, 255, 255)'); // hex #fff
    expect(markerToggle.style.borderColor).toBe('#e8ecf0');
  });

  it('5. should support Show All and Hide All quick actions', async () => {
    const { editor } = await mountApp();
    const dropdownBtn = screen.getByTitle('Filter & Organize');
    fireEvent.click(dropdownBtn);

    const hideAllBtn = screen.getByRole('button', { name: 'Hide All' });
    fireEvent.click(hideAllBtn);

    expect(editor).toHaveClass('hide-markers');
    expect(editor).toHaveClass('hide-manual-screenshots');
    expect(editor).toHaveClass('hide-auto-screenshots');

    const showAllBtn = screen.getByRole('button', { name: 'Show All' });
    fireEvent.click(showAllBtn);

    expect(editor).not.toHaveClass('hide-markers');
    expect(editor).not.toHaveClass('hide-manual-screenshots');
    expect(editor).not.toHaveClass('hide-auto-screenshots');
  });

  it('6. should toggle Timeline View and display sorted timeline items', async () => {
    const docWithElements = `
      <div data-type="screenshot" data-source="manual" data-element-id="s1" data-timestamp="20">Screenshot 1</div>
      <div data-type="marker" data-element-id="m1" data-timestamp="10">Marker 1</div>
    `;
    const { container, editor } = await mountApp(docWithElements);
    
    const dropdownBtn = screen.getByTitle('Filter & Organize');
    fireEvent.click(dropdownBtn);

    const timelineToggle = screen.getByRole('button', { name: 'Timeline View' });
    fireEvent.click(timelineToggle);

    // Timeline view hides the editor visually
    expect(editor.style.display).toBe('none');

    // Timeline view navigation header is shown
    expect(screen.getByText('Timeline Navigation')).toBeInTheDocument();

    // Verify chronological order rendering (10s before 20s)
    const timelineItems = container.querySelectorAll('.timeline-container div[style*="cursor: pointer"]');
    expect(timelineItems.length).toBe(2);
    expect(timelineItems[0].textContent).toContain('0:10');
    expect(timelineItems[1].textContent).toContain('0:20');
  });

  it('7. should order timeline items deterministically using timestamp ASC, then createdAt ASC as a tie breaker', async () => {
    const docWithElements = `
      <div data-type="screenshot" data-source="manual" data-element-id="s2" data-timestamp="10">S2</div>
      <div data-type="marker" data-element-id="m1" data-timestamp="10">M1</div>
    `;
    // We will spy on building index and verify deterministic sorting
    const { container } = await mountApp(docWithElements);
    
    const dropdownBtn = screen.getByTitle('Filter & Organize');
    fireEvent.click(dropdownBtn);

    const timelineToggle = screen.getByRole('button', { name: 'Timeline View' });
    fireEvent.click(timelineToggle);

    const timelineItems = container.querySelectorAll('.timeline-container div[style*="cursor: pointer"]');
    expect(timelineItems.length).toBe(2);
    // Since timestamp is equal (10s), the order defaults to DOM discovery order/createdAt order
    expect(timelineItems[0].textContent).toContain('Screenshot (manual)');
    expect(timelineItems[1].textContent).toContain('Marker');
  });

  it('8. should navigate, scroll, focus and highlight element on timeline item click', async () => {
    const docWithElements = `
      <div data-type="marker" data-element-id="m1" data-timestamp="10">Marker 1</div>
    `;
    const { container, editor } = await mountApp(docWithElements);
    vi.useFakeTimers();

    const scrollMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollMock;

    const dropdownBtn = screen.getByTitle('Filter & Organize');
    fireEvent.click(dropdownBtn);

    const timelineToggle = screen.getByRole('button', { name: 'Timeline View' });
    fireEvent.click(timelineToggle);

    const timelineItem = container.querySelector('.timeline-container div[style*="cursor: pointer"]') as HTMLDivElement;
    expect(timelineItem).toBeInTheDocument();

    // Click item
    fireEvent.click(timelineItem);

    // Timeline view exits
    expect(editor.style.display).toBe('block');

    // Run timeout handlers for scrolling and highlighting
    await vi.advanceTimersByTimeAsync(100);

    // Verify element scrollIntoView called
    expect(scrollMock).toHaveBeenCalled();

    // Element is highlighted
    const targetElement = editor.querySelector('[data-element-id="m1"]');
    expect(targetElement).toHaveClass('timeline-highlight');

    // Highlight is removed after 1500ms
    await vi.advanceTimersByTimeAsync(1500);
    expect(targetElement).not.toHaveClass('timeline-highlight');

    vi.useRealTimers();
  });

  it('9. should handle corrupted metadata safely by excluding items with missing, invalid or negative timestamps', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const docWithCorruptedElements = `
      <div data-type="marker" data-element-id="m1" data-timestamp="-5">Marker Negative</div>
      <div data-type="screenshot" data-source="manual" data-element-id="s1" data-timestamp="invalid">Screenshot NaN</div>
      <div data-type="marker" data-element-id="m2" data-timestamp="25">Marker Valid</div>
    `;
    
    const { container } = await mountApp(docWithCorruptedElements);
    
    const dropdownBtn = screen.getByTitle('Filter & Organize');
    fireEvent.click(dropdownBtn);

    const timelineToggle = screen.getByRole('button', { name: 'Timeline View' });
    fireEvent.click(timelineToggle);

    // Check timeline items
    const timelineItems = container.querySelectorAll('.timeline-container div[style*="cursor: pointer"]');
    // Only the valid one (m2) should be rendered
    expect(timelineItems.length).toBe(1);
    expect(timelineItems[0].textContent).toContain('0:25');

    // Warnings should be logged
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('10. should hide the editor placeholder/watermark when the Filter & Organize dropdown is opened', async () => {
    // Mount empty app so that the placeholder is shown
    await mountApp('');
    
    // Placeholder should be visible
    expect(screen.getByText(/Start capturing knowledge/i)).toBeInTheDocument();
    
    // Open dropdown
    const dropdownBtn = screen.getByTitle('Filter & Organize');
    fireEvent.click(dropdownBtn);
    
    // Placeholder should be hidden now
    expect(screen.queryByText(/Start capturing knowledge/i)).not.toBeInTheDocument();
    
    // Close dropdown
    fireEvent.click(dropdownBtn);
    
    // Placeholder should return
    expect(screen.getByText(/Start capturing knowledge/i)).toBeInTheDocument();
  });
});
