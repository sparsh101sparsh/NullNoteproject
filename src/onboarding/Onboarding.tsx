import React, { useState, useEffect } from 'react';
import { STORAGE_MESSAGE_TYPES } from '@/utils/constants';

export default function Onboarding() {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check initial state
    chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.googleDrive.getState }, (res) => {
      if (res?.success && res.state?.connected) {
        setConnected(true);
        setAccount(res.state.account);
      }
    });
  }, []);

  const handleConnect = () => {
    setConnecting(true);
    setError(null);
    chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.googleDrive.connect }, (res) => {
      if (res?.success) {
        // Also ensure root folder
        chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.googleDrive.ensureRootFolder }, (folderRes) => {
          setConnecting(false);
          if (folderRes?.success) {
            setConnected(true);
            setAccount(res.state.account);
          } else {
            setError(folderRes?.error || 'Failed to setup Google Drive folder.');
          }
        });
      } else {
        setConnecting(false);
        setError(res?.error || 'Failed to connect to Google Drive.');
      }
    });
  };

  const closeTab = () => {
    chrome.tabs.getCurrent((tab) => {
      if (tab?.id) chrome.tabs.remove(tab.id);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden w-full max-w-md">
        <div className="p-8 flex flex-col items-center text-center">
          {!connected ? (
            <>
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-6">
                <img src="/icons/newmainicon.png" alt="NullNote Logo" className="w-12 h-12" />
              </div>
              <h1 className="text-3xl font-extrabold text-slate-900 mb-2">NullNote</h1>
              <p className="text-slate-500 mb-8 font-medium">Your Notes. Everywhere.</p>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg w-full mb-4">
                  {error}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white rounded-xl font-bold transition-all shadow-md flex justify-center items-center gap-2"
              >
                {connecting ? 'Connecting...' : 'Connect Google Drive'}
              </button>

              <button
                onClick={closeTab}
                className="mt-6 text-sm text-slate-400 hover:text-slate-600 font-medium"
              >
                Skip for now
              </button>
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 text-emerald-600 text-3xl">
                ✓
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Google Drive Connected</h1>
              <p className="text-slate-500 mb-6 text-sm">Your NullNote folder is ready.</p>
              
              {account && (
                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 w-full mb-8 text-left">
                  {account.picture ? (
                    <img src={account.picture} alt="Avatar" className="w-12 h-12 rounded-full shadow-sm" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg shadow-sm">
                      {account.name?.charAt(0) || account.email?.charAt(0)}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-slate-900 truncate">{account.name}</span>
                    <span className="text-xs text-slate-500 truncate">{account.email}</span>
                  </div>
                </div>
              )}

              <button
                onClick={closeTab}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-sm"
              >
                Continue to NullNote
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
