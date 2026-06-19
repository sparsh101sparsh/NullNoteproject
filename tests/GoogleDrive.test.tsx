import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import Onboarding from '@/onboarding/Onboarding';
import SettingsApp from '@/settings/App';
import { AuthService } from '@/services/AuthService';
import { FolderService } from '@/services/FolderService';
import { GoogleDriveService } from '@/services/GoogleDriveService';
import { getDriveConnectionState, setDriveConnectionState, clearDriveConnectionState } from '@/storage/DriveStorageProvider';

vi.mock('@/storage/repository', () => ({
  getAutoCaptureInterval: vi.fn().mockResolvedValue(30),
  getAutosnapOnOpen: vi.fn().mockResolvedValue(false),
  getDefaultExportFormat: vi.fn().mockResolvedValue('pdf'),
  getIncludeTimestamps: vi.fn().mockResolvedValue(true),
  getIncludeScreenshots: vi.fn().mockResolvedValue(true),
  getImageOutlineEnabled: vi.fn().mockResolvedValue(true),
  getStorageStats: vi.fn().mockResolvedValue({ documents: 0, screenshots: 0, markers: 0 }),
}));

vi.mock('@/utils/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/constants')>();
  return {
    ...actual,
    ENABLE_GOOGLE_DRIVE: true, // Force true for tests
  };
});

// Mock chrome
const mockSendMessage = vi.fn();
(global as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    lastError: null,
    getManifest: () => ({ version: '0.1.0' }),
    getURL: () => 'icon.png'
  },
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn(),
    clearAllCachedAuthTokens: vi.fn()
  },
  tabs: {
    getCurrent: vi.fn()
  }
};

describe('Google Drive Phase 1 Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).fetch = vi.fn();
  });

  describe('AuthService', () => {
    it('getAuthToken succeeds', async () => {
      (chrome.identity.getAuthToken as any).mockImplementationOnce((opt: any, cb: any) => cb('mock-token'));
      const token = await AuthService.getAuthToken();
      expect(token).toBe('mock-token');
    });

    it('getAuthToken fails on chrome.runtime.lastError', async () => {
      chrome.runtime.lastError = { message: 'auth error' };
      (chrome.identity.getAuthToken as any).mockImplementationOnce((opt: any, cb: any) => cb(null));
      await expect(AuthService.getAuthToken()).rejects.toThrow('auth error');
      chrome.runtime.lastError = null;
    });

    it('getUserInfo fetches correctly', async () => {
      (global as any).fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '123', email: 'test@example.com' })
      });
      const info = await AuthService.getUserInfo('token');
      expect(info.email).toBe('test@example.com');
    });
  });

  describe('FolderService', () => {
    it('findNullNoteRootFolder returns oldest existing', async () => {
      vi.spyOn(AuthService, 'getAuthToken').mockResolvedValue('token');
      (global as any).fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [
            { id: 'folder1', createdTime: '2023-01-01' },
            { id: 'folder2', createdTime: '2023-01-02' }
          ]
        })
      });
      const folder = await FolderService.findNullNoteRootFolder();
      expect(folder.id).toBe('folder1');
    });

    it('ensureNullNoteRootFolder creates if not found', async () => {
      vi.spyOn(AuthService, 'getAuthToken').mockResolvedValue('token');
      // find returns empty
      (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) });
      // create returns new folder
      (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'new-folder' }) });
      
      const folder = await FolderService.ensureNullNoteRootFolder();
      expect(folder.id).toBe('new-folder');
    });
  });

  describe('Onboarding UI', () => {
    it('renders initial disconnected state', () => {
      mockSendMessage.mockImplementation((msg, cb) => {
        if (msg.type === 'googleDrive.getState') cb({ success: true, state: { connected: false } });
      });
      render(<Onboarding />);
      expect(screen.getByText('Your Notes. Everywhere.')).toBeInTheDocument();
      expect(screen.getByText('Connect Google Drive')).toBeInTheDocument();
    });

    it('shows connected state on success', async () => {
      mockSendMessage.mockImplementation((msg, cb) => {
        if (msg.type === 'googleDrive.getState') cb({ success: true, state: { connected: false } });
        if (msg.type === 'googleDrive.connect') cb({ success: true, state: { account: { email: 'a@b.c', name: 'Tester' } } });
        if (msg.type === 'googleDrive.ensureRootFolder') cb({ success: true, folder: { id: 'f' } });
      });
      render(<Onboarding />);
      fireEvent.click(screen.getByText('Connect Google Drive'));
      await waitFor(() => {
        expect(screen.getByText('Google Drive Connected')).toBeInTheDocument();
        expect(screen.getByText('a@b.c')).toBeInTheDocument();
      });
    });
  });

  describe('Settings UI', () => {
    it('renders connected state correctly', async () => {
      mockSendMessage.mockImplementation((msg, cb) => {
        if (msg.type === 'googleDrive.getState') {
          cb({ success: true, state: { connected: true, account: { email: 'test@example.com', name: 'Test User' } } });
        }
      });
      render(<SettingsApp />);
      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByText('✓ NullNote folder ready')).toBeInTheDocument();
        expect(screen.getByText('Disconnect')).toBeInTheDocument();
      });
    });
  });
});
