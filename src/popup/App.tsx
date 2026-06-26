import { useEffect } from 'react';
import Logo from '@/components/Logo';

export default function PopupApp() {
  useEffect(() => {
    document.body.classList.remove('dark');
    document.body.classList.add('light');
  }, []);

  const openSettings = () => {
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL('src/settings/index.html'));
      }
    } catch (e) {
      window.open(chrome.runtime.getURL('src/settings/index.html'));
    }
  };

  return (
    <main className="w-[320px] min-h-[200px] bg-gradient-to-br from-slate-900 via-slate-800 to-brand-700 p-6 text-white antialiased select-none relative overflow-hidden">
      {/* Decorative background effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-500 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-brand-700 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob animation-delay-2000"></div>
      </div>

      {/* Settings Button - Top Right */}
      <button
        type="button"
        onClick={openSettings}
        className="absolute top-4 right-4 z-50 flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/20 transition-all duration-300 active:scale-[0.95] backdrop-blur-md border border-white/10 text-white/80 hover:text-white cursor-pointer shadow-lg"
        title="Settings"
      >
        <span className="text-sm">⚙</span>
      </button>

      {/* Centered Logo and Branding */}
      <div className="flex flex-col items-center justify-center gap-5 h-full pt-3 relative z-10">
        <div className="relative group">
          <div className="absolute inset-0 bg-brand-500 blur-lg opacity-30 rounded-[22%] group-hover:opacity-50 transition-opacity duration-500"></div>
          <Logo size={72} className="relative z-10 shadow-2xl ring-1 ring-white/10 rounded-[22%] transition-transform duration-500 hover:scale-105" />
        </div>
        
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 drop-shadow-sm">
            NullNote
          </h1>
          <p className="text-[11px] font-semibold text-brand-100/70 mt-1.5 tracking-widest uppercase letter-spacing-2">
            Snap It. Mark It. Keep It.
          </p>
        </div>
      </div>
    </main>
  );
}
