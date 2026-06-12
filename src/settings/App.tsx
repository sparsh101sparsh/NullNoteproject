import { useEffect, useState, useCallback } from 'react';
import {
  getAutoCaptureInterval, setAutoCaptureInterval,
  getAutosnapOnOpen, setAutosnapOnOpen,
  getDefaultExportFormat, setDefaultExportFormat,
  getIncludeTimestamps, setIncludeTimestamps,
  getIncludeScreenshots, setIncludeScreenshots,
  getImageOutlineEnabled, setImageOutlineEnabled,
  getStorageStats, clearAllData, exportAllDataAsJson,
} from '@/storage/repository';

// ─── TYPES ──────────────────────────────────────────────────────────────────

type ExportFormat = 'pdf' | 'docs' | 'markdown';

interface Stats {
  documents: number;
  screenshots: number;
  markers: number;
}

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 ${checked ? 'bg-amber-400' : 'bg-slate-200'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-4">
        <span className="text-xl">{icon}</span>
        <h2 className="text-[15px] font-bold text-slate-900 tracking-tight">{title}</h2>
      </div>
      <div className="px-6 py-5 flex flex-col gap-5">
        {children}
      </div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[13.5px] font-semibold text-slate-800">{label}</span>
        {description && <span className="text-[11.5px] text-slate-500 leading-relaxed">{description}</span>}
      </div>
      <div className="shrink-0 flex items-center">
        {children}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { label: string; value: T }[] }) {
  return (
    <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-slate-100 p-0.5 gap-0.5">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-[11.5px] font-semibold rounded-lg transition-all duration-150 ${
            value === opt.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────────────────────

export default function SettingsApp() {
  // AutoSnap
  const [captureInterval, setCaptureInterval] = useState(30);
  const [autosnapOnOpen, setAutosnapOnOpenState] = useState(false);

  // Export
  const [defaultFormat, setDefaultFormatState] = useState<ExportFormat>('pdf');
  const [includeTimestamps, setIncludeTimestampsState] = useState(true);
  const [includeScreenshots, setIncludeScreenshotsState] = useState(true);

  // Appearance
  const [imageOutlineEnabled, setImageOutlineEnabledState] = useState(true);

  // Data
  const [stats, setStats] = useState<Stats | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const logoUrl = (() => {
    try { return chrome.runtime.getURL('icons/icon-128.png'); } catch { return '/icons/icon-128.png'; }
  })();

  const manifest = (() => {
    try { return chrome.runtime.getManifest(); } catch { return { version: '0.1.0', name: 'NullNote' }; }
  })();

  // ─── LOAD ────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [interval, onOpen, fmt, ts, ss, io, st] = await Promise.all([
        getAutoCaptureInterval(),
        getAutosnapOnOpen(),
        getDefaultExportFormat(),
        getIncludeTimestamps(),
        getIncludeScreenshots(),
        getImageOutlineEnabled(),
        getStorageStats(),
      ]);
      setCaptureInterval(interval);
      setAutosnapOnOpenState(onOpen);
      setDefaultFormatState(fmt);
      setIncludeTimestampsState(ts);
      setIncludeScreenshotsState(ss);
      setImageOutlineEnabledState(io);
      setStats(st);
    }
    load().catch(console.error);
  }, []);

  // ─── SAVE HELPERS ────────────────────────────────────────────────────────

  const showToast = useCallback(() => {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  }, []);

  const save = useCallback(async (fn: () => Promise<void>) => {
    await fn();
    showToast();
  }, [showToast]);

  // ─── HANDLERS ────────────────────────────────────────────────────────────

  const handleClearData = async () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 4000);
      return;
    }
    await clearAllData();
    setClearConfirm(false);
    const fresh = await getStorageStats();
    setStats(fresh);
    showToast();
  };

  const handleExportJson = async () => {
    const json = await exportAllDataAsJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NullNote_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 font-['Inter',system-ui,sans-serif] antialiased">

      {/* Saved Toast */}
      {savedToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-white text-[13px] font-semibold shadow-lg animate-fade-in">
          <span>✓</span> Settings saved
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-3">
          <img src={logoUrl} alt="NullNote" className="h-9 w-9 rounded-xl object-contain shadow-sm border border-slate-100" />
          <div>
            <h1 className="text-[17px] font-bold text-slate-900 tracking-tight">NullNote Settings</h1>
            <p className="text-[11px] text-slate-400 font-medium">v{manifest.version}</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-6 py-8 flex flex-col gap-6">

        {/* ── AUTOSNAP ── */}
        <SectionCard title="AutoSnap" icon="📸">
          <Row
            label="Default capture interval"
            description="How often screenshots are taken when AutoSnap is enabled"
          >
            <SegmentedControl<string>
              value={String(captureInterval)}
              onChange={async (v) => {
                const n = Number(v);
                setCaptureInterval(n);
                await save(() => setAutoCaptureInterval(n));
              }}
              options={[
                { label: '10s', value: '10' },
                { label: '20s', value: '20' },
                { label: '30s', value: '30' },
                { label: '60s', value: '60' },
                { label: '2m', value: '120' },
                { label: '5m', value: '300' },
              ]}
            />
          </Row>
          <Row
            label="Enable AutoSnap when opening a video"
            description="AutoSnap will start automatically each time you open a YouTube video"
          >
            <Toggle
              id="autosnap-on-open"
              checked={autosnapOnOpen}
              onChange={async (v) => {
                setAutosnapOnOpenState(v);
                await save(() => setAutosnapOnOpen(v));
              }}
            />
          </Row>
        </SectionCard>

        {/* ── KEYBOARD SHORTCUTS ── */}
        <SectionCard title="Keyboard Shortcuts" icon="⌨️">
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            {[
              { key: 'H', action: 'Insert a Marker at current timestamp' },
              { key: 'P', action: 'Capture a Screenshot' },
              { key: 'A', action: 'Toggle AutoSnap on / off' },
              { key: 'Ctrl + Shift + S', action: 'Open / close NullNote panel' },
            ].map((row, i) => (
              <div key={row.key} className={`flex items-center justify-between px-4 py-3 ${i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
                <span className="text-[13px] text-slate-600">{row.action}</span>
                <kbd className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow-sm font-mono">
                  {row.key}
                </kbd>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500">Want to change Chrome command shortcuts?</span>
            <button
              type="button"
              onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
              className="text-[12px] font-semibold text-amber-600 hover:text-amber-700 underline underline-offset-2"
            >
              Open Chrome Shortcuts
            </button>
          </div>
        </SectionCard>

        {/* ── EXPORT DEFAULTS ── */}
        <SectionCard title="Export Defaults" icon="📤">
          <Row
            label="Default export format"
            description="Format used when exporting your notes"
          >
            <SegmentedControl<ExportFormat>
              value={defaultFormat}
              onChange={async (v) => {
                setDefaultFormatState(v);
                await save(() => setDefaultExportFormat(v));
              }}
              options={[
                { label: 'PDF', value: 'pdf' },
                { label: 'DOCX', value: 'docs' },
                { label: 'MD', value: 'markdown' },
              ]}
            />
          </Row>
          <Row
            label="Include timestamps in exports"
            description="Marker and screenshot timestamps are shown in exported documents"
          >
            <Toggle
              id="include-timestamps"
              checked={includeTimestamps}
              onChange={async (v) => {
                setIncludeTimestampsState(v);
                await save(() => setIncludeTimestamps(v));
              }}
            />
          </Row>
          <Row
            label="Include screenshots in exports"
            description="Screenshots are embedded as images in exported documents"
          >
            <Toggle
              id="include-screenshots"
              checked={includeScreenshots}
              onChange={async (v) => {
                setIncludeScreenshotsState(v);
                await save(() => setIncludeScreenshots(v));
              }}
            />
          </Row>
        </SectionCard>

        {/* ── APPEARANCE ── */}
        <SectionCard title="Appearance" icon="🎨">
          <Row
            label="Screenshot Outline"
            description="Show a colored border around screenshots that matches your selected marker icon"
          >
            <Toggle
              id="image-outline-enabled"
              checked={imageOutlineEnabled}
              onChange={async (v) => {
                setImageOutlineEnabledState(v);
                await save(() => setImageOutlineEnabled(v));
                chrome.runtime.sendMessage({ type: 'imageOutlineCommand', enabled: v });
              }}
            />
          </Row>
        </SectionCard>

        {/* ── DATA MANAGEMENT ── */}
        <SectionCard title="Data Management" icon="🗄️">

          {/* Storage Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Documents', count: stats.documents, icon: '📄' },
                { label: 'Screenshots', count: stats.screenshots, icon: '🖼️' },
                { label: 'Markers', count: stats.markers, icon: '📍' },
              ].map(s => (
                <div key={s.label} className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 border border-slate-100 py-4">
                  <span className="text-2xl">{s.icon}</span>
                  <span className="text-[22px] font-bold text-slate-900">{s.count}</span>
                  <span className="text-[11px] font-medium text-slate-500">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Export backup */}
          <Row
            label="Export data as JSON"
            description="Download a backup of all your notes and markers (screenshots excluded due to size)"
          >
            <button
              type="button"
              onClick={handleExportJson}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
            >
              Download JSON
            </button>
          </Row>

          {/* Clear all data */}
          <Row
            label="Clear all data"
            description="Permanently delete all documents, screenshots, and markers from this browser"
          >
            <button
              type="button"
              onClick={handleClearData}
              className={`rounded-xl px-4 py-2 text-[12px] font-semibold transition ${
                clearConfirm
                  ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-200'
                  : 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              {clearConfirm ? '⚠ Confirm — this cannot be undone' : 'Clear All Data'}
            </button>
          </Row>
        </SectionCard>

        {/* ── ABOUT ── */}
        <SectionCard title="About NullNote" icon="ℹ️">
          <div className="flex items-center gap-4">
            <img src={logoUrl} alt="NullNote" className="h-14 w-14 rounded-2xl object-contain border border-slate-100 shadow-sm" />
            <div>
              <p className="text-[15px] font-bold text-slate-900">NullNote</p>
              <p className="text-[12px] text-slate-500 mt-0.5">Capture. Annotate. Remember.</p>
              <p className="text-[11px] text-slate-400 mt-1">Version {manifest.version}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12px] font-semibold text-slate-700 hover:bg-white hover:border-slate-300 transition"
            >
              <span>⭐</span> GitHub
            </a>
            <button
              type="button"
              onClick={() => chrome.tabs.create({ url: `https://github.com/issues/new` })}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12px] font-semibold text-slate-700 hover:bg-white hover:border-slate-300 transition"
            >
              <span>🐛</span> Report a Bug
            </button>
          </div>
          <p className="text-[11.5px] text-slate-400 leading-relaxed">
            NullNote is a Chrome extension for capturing notes, screenshots, and markers directly from YouTube videos. All data is stored locally in your browser — nothing is sent to any server.
          </p>
        </SectionCard>

      </main>
    </div>
  );
}
