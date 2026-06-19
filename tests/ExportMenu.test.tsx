import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import App from '@/sidepanel/App';
import * as repository from '@/storage/repository';
import { renderPdf } from '@/export/pdf-renderer';
import { renderDocx } from '@/export/docx-renderer';

describe('Export Menu Component Tests (R1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mountApp = async () => {
    const { container } = render(<App />);
    // Wait for repository load
    await waitFor(() => {
      expect(repository.getDocument).toHaveBeenCalled();
    });
    return { container };
  };

  it('should render the export dropdown menu when clicking the Export button and verify it contains PDF & DOCX but no MD option', async () => {
    const { container } = await mountApp();

    // Find export button
    const exportBtn = screen.getByRole('button', { name: /export/i });
    expect(exportBtn).toBeInTheDocument();

    // Initially, options shouldn't be visible
    expect(screen.queryByText('PDF')).not.toBeInTheDocument();
    expect(screen.queryByText('DOCX')).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(exportBtn);

    // Options should be visible
    await waitFor(() => {
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });
    expect(screen.getByText('DOCX')).toBeInTheDocument();

    // Verify "MD" or "Markdown" options are strictly not present
    const bodyText = container.textContent || '';
    expect(bodyText).not.toContain('Export as MD');
    
    // Find all buttons inside the container and verify none mention MD or Markdown
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      const text = btn.textContent || '';
      expect(text).not.toMatch(/\bMD\b/i);
      expect(text).not.toContain('Markdown');
    });
  });

  it('should call exportToPdf when PDF option is clicked', async () => {
    await mountApp();

    const exportBtn = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportBtn);

    const pdfBtn = await screen.findByText('PDF');
    expect(pdfBtn).toBeInTheDocument();
    
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(renderPdf).toHaveBeenCalled();
    });
  });

  it('should call exportToDocs when DOCX option is clicked', async () => {
    await mountApp();

    const exportBtn = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportBtn);

    const docxBtn = await screen.findByText('DOCX');
    expect(docxBtn).toBeInTheDocument();

    fireEvent.click(docxBtn);

    await waitFor(() => {
      expect(renderDocx).toHaveBeenCalled();
    });
  });
});
