import { useEffect } from 'react';
import { STORAGE_MESSAGE_TYPES } from '@/utils/constants';
import Logo from '@/components/Logo';

export default function PopupApp() {
  useEffect(() => {
    document.body.classList.remove('dark');
    document.body.classList.add('light');
  }, []);

  const openNullNote = () => {
    chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.openSidePanel }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
    window.close();
  };

  const openSettings = () => {
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
      }
    } catch (e) {
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    }
  };

  return (
    <main className="w-[320px] bg-slate-50 p-4 text-slate-900 antialiased select-none">
      <div className="flex flex-col gap-4">
        {/* Top Branding Card */}
        <section className="flex items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
          <Logo size={44} />
          <div className="flex flex-col">
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              NullNote
            </h1>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              Capture. Annotate. Remember.
            </p>
          </div>
        </section>

        {/* Compact Actions Layout */}
        <div className="flex flex-col gap-2.5">
          {/* Primary Action: Open NullNote */}
          <button
            type="button"
            onClick={openNullNote}
            className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 transition-all duration-200 active:scale-[0.98] shadow-[0_4px_12px_rgba(245,158,11,0.12)] hover:shadow-[0_6px_16px_rgba(245,158,11,0.2)]"
          >
            <span className="text-base transition-transform group-hover:scale-110 duration-200">📒</span>
            <span>Open NullNote</span>
          </button>

          {/* Secondary Action: Settings */}
          <button
            type="button"
            onClick={openSettings}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 active:scale-[0.98]"
          >
            <span className="text-base">⚙</span>
            <span>Settings</span>
          </button>
        </div>
      </div>
    </main>
  );
}
