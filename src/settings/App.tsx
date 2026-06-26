import { useEffect, useState, useCallback } from 'react';
import { Camera, Cloud, Keyboard, Download, Palette, Database, Info, RotateCcw } from 'lucide-react';
import {
  getAutoCaptureInterval, setAutoCaptureInterval,
  getAutosnapOnOpen, setAutosnapOnOpen,
  getDefaultExportFormat, setDefaultExportFormat,
  getIncludeTimestamps, setIncludeTimestamps,
  getIncludeScreenshots, setIncludeScreenshots,
  getImageOutlineEnabled, setImageOutlineEnabled,
  getStorageStats, clearAllData, exportAllDataAsJson,
  setOnboardingCompleted,
} from '@/storage/repository';
import { STORAGE_MESSAGE_TYPES, ENABLE_GOOGLE_DRIVE } from '@/utils/constants';

// ─── TYPES ──────────────────────────────────────────────────────────────────

type ExportFormat = 'pdf' | 'docs';

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
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#030b14] ${checked ? 'bg-blue-600' : 'bg-[#1E3A5F]'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function SettingsCard({ title, icon, description, children }: { title: string; icon: React.ReactNode; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#0B1A2E]/60 border border-[#1E3A5F] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.5)] overflow-hidden flex flex-col backdrop-blur-xl transition-all hover:border-[#2C5282] duration-300">
      <div className="flex items-center gap-4 px-6 py-5 border-b border-[#1E3A5F] bg-[#081525]/60 group/header">
        <div 
          className="relative flex items-center justify-center w-10 h-10 rounded-[16px] shrink-0 group-hover/header:-translate-y-[1.5px] transition-all duration-200"
          style={{
            background: 'linear-gradient(180deg, rgba(20,35,65,0.95), rgba(10,20,40,0.95))',
            border: '1px solid rgba(80,140,255,0.15)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.03), 0 4px 20px rgba(20,100,255,0.08)'
          }}
        >
          <div 
            className="absolute -inset-[6px] rounded-[16px] opacity-70 group-hover/header:opacity-100 transition-opacity duration-200 pointer-events-none"
            style={{
              background: 'rgba(59,130,246,0.12)',
              filter: 'blur(10px)',
            }}
          />
          <div className="relative z-10 flex items-center justify-center text-[#BFD8FF]">
            {icon}
          </div>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <h2 className="text-[15px] font-bold text-slate-100 tracking-wide">{title}</h2>
          {description && <p className="text-[13px] text-slate-400 leading-snug truncate">{description}</p>}
        </div>
      </div>
      <div className="flex flex-col px-6 py-6 gap-6">
        {children}
      </div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1.5 min-w-0 pr-8">
        <span className="text-[14px] font-semibold text-slate-200">{label}</span>
        {description && <span className="text-[13px] text-slate-400 leading-relaxed">{description}</span>}
      </div>
      <div className="shrink-0 flex items-center mt-1">
        {children}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { label: string; value: T }[] }) {
  return (
    <div className="flex rounded-xl border border-[#1E3A5F] overflow-hidden bg-[#081525] p-1 gap-1 shadow-inner">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200 ${
            value === opt.value
              ? 'bg-blue-600 text-white shadow-md border border-blue-500/50'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#1E3A5F]/50 border border-transparent'
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

  // Google Drive
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveAccount, setDriveAccount] = useState<any>(null);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);

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

      // Load Drive state
      chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.googleDrive.getState }, (res) => {
        if (res?.success && res.state) {
          setDriveConnected(res.state.connected);
          setDriveAccount(res.state.account);
          setDriveFolderId(res.state.rootFolderId);
          setDriveError(res.state.lastError);
        }
      });
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

  const handleConnectDrive = () => {
    setDriveConnecting(true);
    setDriveError(null);
    chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.googleDrive.connect }, (res) => {
      if (res?.success) {
        chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.googleDrive.ensureRootFolder }, (folderRes) => {
          setDriveConnecting(false);
          if (folderRes?.success) {
            setDriveConnected(true);
            setDriveAccount(res.state.account);
            setDriveFolderId(folderRes.folder.id);
          } else {
            setDriveError(folderRes?.error || 'Failed to ensure NullNote folder.');
          }
        });
      } else {
        setDriveConnecting(false);
        setDriveError(res?.error || 'Failed to connect to Google Drive.');
      }
    });
  };

  const handleDisconnectDrive = () => {
    setDriveConnecting(true);
    setDriveError(null);
    chrome.runtime.sendMessage({ type: STORAGE_MESSAGE_TYPES.googleDrive.disconnect }, (res) => {
      setDriveConnecting(false);
      if (res?.success) {
        setDriveConnected(false);
        setDriveAccount(null);
        setDriveFolderId(null);
      } else {
        setDriveError(res?.error || 'Failed to disconnect.');
      }
    });
  };

  const handleRestartOnboarding = async () => {
    await setOnboardingCompleted(false);
    showToast();
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#030914] text-slate-300 font-['Inter',system-ui,sans-serif] antialiased bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-[#030b14] to-[#010409]">

      {/* Saved Toast */}
      {savedToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg bg-[#1E3A5F] px-4 py-3 text-white text-[13px] font-medium shadow-xl animate-fade-in border border-[#2C5282]">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
          Settings saved successfully
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[#1E3A5F] bg-[#030b14]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={logoUrl} alt="NullNote" className="h-9 w-9 rounded-xl object-contain border border-[#1E3A5F] bg-[#0B1A2E] shadow-sm" />
            <div className="flex flex-col">
              <h1 className="text-[17px] font-bold text-white tracking-tight">NullNote Settings</h1>
              <p className="text-[12px] text-slate-400 font-medium">Version {manifest.version}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-8 py-10 flex flex-col gap-8">

        {/* ── AUTOSNAP ── */}
        <SettingsCard title="AutoSnap" description="Configure automated screenshot capturing" icon={<Camera className="w-5 h-5" strokeWidth={2} />}>
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
        </SettingsCard>

        {/* ── APPEARANCE ── */}
        <SettingsCard title="NullNote Editor Appearance" description="Visual customization" icon={<Palette className="w-5 h-5" strokeWidth={2} />}>
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
        </SettingsCard>

        {/* ── EXPORT DEFAULTS ── */}
        <SettingsCard title="Export Defaults" description="Document format and content preferences" icon={<Download className="w-5 h-5" strokeWidth={2} />}>
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
        </SettingsCard>

        {/* ── KEYBOARD SHORTCUTS ── */}
        <SettingsCard title="Keyboard Shortcuts" description="Global hotkeys for quick actions" icon={<Keyboard className="w-5 h-5" strokeWidth={2} />}>
          <div className="rounded-xl border border-[#1E3A5F] overflow-hidden">
            {[
              { key: 'H', action: 'Insert a Marker at current timestamp' },
              { key: 'P', action: 'Capture a Screenshot' },
              { key: 'A', action: 'Toggle AutoSnap on / off' },
              { key: 'Ctrl + Shift + S', action: 'Open / close NullNote panel' },
            ].map((row, i) => (
              <div key={row.key} className={`flex items-center justify-between px-4 py-3 ${i % 2 === 0 ? 'bg-[#081525]/60' : 'bg-transparent'}`}>
                <span className="text-[13px] text-slate-300">{row.action}</span>
                <kbd className="rounded-lg border border-[#1E3A5F] bg-[#112745] px-2.5 py-1 text-[11px] font-bold text-blue-200 shadow-sm font-mono">
                  {row.key}
                </kbd>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-400">Want to change Chrome command shortcuts?</span>
            <button
              type="button"
              onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
              className="text-[12px] font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              Open Chrome Shortcuts
            </button>
          </div>
        </SettingsCard>

        {/* ── GOOGLE DRIVE ── */}
        <SettingsCard title="Google Drive" description="Cloud synchronization and storage" icon={<img src="/icons/googledriveicon.png" alt="" className="w-5 h-5 object-contain" />}>
          <div className="flex flex-col gap-4">
            {driveError && (
              <div className="text-red-400 bg-red-950/30 p-3 rounded-lg text-sm border border-red-900/50">
                {driveError}
              </div>
            )}
            {!ENABLE_GOOGLE_DRIVE ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Synchronize your NullNote workspace across devices.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">STATUS:</span>
                  <span className="text-xs font-bold text-amber-500">Coming Soon</span>
                </div>
                <button
                  disabled
                  className="self-start px-5 py-2.5 bg-[#112745] border border-[#1E3A5F] text-slate-500 text-sm font-semibold rounded-lg mt-4 cursor-not-allowed"
                >
                  Connect Google Drive
                </button>
                <p className="text-[11px] text-slate-500 mt-2">
                  Cloud synchronization is currently under final testing and will be enabled in a future update.
                </p>
              </div>
            ) : !driveConnected ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Connect Google Drive to store and sync your notes seamlessly across devices. (Sync coming in Phase 2)
                </p>
                <button
                  onClick={handleConnectDrive}
                  disabled={driveConnecting}
                  className="self-start px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-70 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm mt-2"
                >
                  {driveConnecting ? 'Connecting...' : 'Connect Google Drive'}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 p-4 bg-[#081525] border border-[#1E3A5F] rounded-xl shadow-inner">
                <div className="flex items-center gap-3 min-w-0">
                  {driveAccount?.picture ? (
                    <img src={driveAccount.picture} alt="Avatar" className="w-10 h-10 rounded-full shadow-sm" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#112745] text-blue-400 flex items-center justify-center font-bold text-sm shadow-sm shrink-0 border border-[#1E3A5F]">
                      {driveAccount?.name?.charAt(0) || driveAccount?.email?.charAt(0) || '?'}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-slate-200 truncate">{driveAccount?.name || 'Connected'}</span>
                    <span className="text-[11px] text-slate-400 truncate">{driveAccount?.email}</span>
                    <span className="text-[10px] text-emerald-400 font-semibold mt-0.5">✓ NullNote folder ready</span>
                  </div>
                </div>
                <button
                  onClick={handleDisconnectDrive}
                  disabled={driveConnecting}
                  className="shrink-0 px-3 py-1.5 border border-[#1E3A5F] hover:bg-[#112745] text-slate-300 text-xs font-semibold rounded-lg transition-colors"
                >
                  {driveConnecting ? '...' : 'Disconnect'}
                </button>
              </div>
            )}
          </div>
        </SettingsCard>

        {/* ── DATA MANAGEMENT ── */}
        <SettingsCard title="Data Management" description="Storage, backups, and cleanup" icon={<Database className="w-5 h-5" strokeWidth={2} />}>
          
          {/* Storage Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Documents', count: stats.documents },
                { label: 'Screenshots', count: stats.screenshots },
                { label: 'Markers', count: stats.markers },
              ].map(s => (
                <div key={s.label} className="flex flex-col items-center justify-center gap-1 rounded-xl bg-[#081525] border border-[#1E3A5F] py-6 shadow-inner">
                  <span className="text-[26px] font-bold text-white tracking-tight leading-none">{s.count}</span>
                  <span className="text-[12px] font-semibold text-blue-400/80 uppercase tracking-wide">{s.label}</span>
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
              className="rounded-xl border border-[#1E3A5F] bg-[#112745] px-4 py-2 text-[12px] font-semibold text-slate-300 hover:bg-[#1A365D] hover:border-[#2C5282] transition"
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
                  ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20'
                  : 'border border-red-900/50 bg-red-950/30 text-red-400 hover:bg-red-900/50'
              }`}
            >
              {clearConfirm ? '⚠ Confirm — this cannot be undone' : 'Clear All Data'}
            </button>
          </Row>
        </SettingsCard>

        {/* ── ABOUT ── */}
        <SettingsCard title="About NullNote" description="App information and resources" icon={<Info className="w-5 h-5" strokeWidth={2} />}>
          <div className="flex items-center gap-5">
            <img src={logoUrl} alt="NullNote" className="h-16 w-16 rounded-2xl object-contain border border-[#1E3A5F] bg-[#0B1A2E] shadow-sm" />
            <div className="flex flex-col">
              <p className="text-[18px] font-bold text-white tracking-tight">NullNote</p>
              <p className="text-[13px] font-medium text-slate-300 mt-0.5">Capture Knowledge, Not Just Screenshots.</p>
              <p className="text-[11px] font-semibold text-blue-400/80 mt-1.5 uppercase tracking-wider">Version {manifest.version}</p>
            </div>
          </div>
          <p className="text-[13px] text-slate-400 leading-relaxed max-w-lg">
            Save timestamps, screenshots, and markers while watching videos.<br />
            Build a personal library that grows with your learning.
          </p>
          <div className="flex flex-wrap gap-3 mt-1">
            <a
              href="https://github.com/sparsh101sparsh/NullNote"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-[#1E3A5F] bg-[#112745] px-4 py-2 text-[13px] font-medium text-slate-300 hover:bg-[#1A365D] hover:border-[#2C5282] hover:text-white transition shadow-sm"
            >
              GitHub
            </a>
            <button
              type="button"
              onClick={() => {
                const subject = encodeURIComponent('NullNote Bug Report');
                const body = encodeURIComponent(`NullNote Version: ${manifest.version}\n\nBrowser: ${navigator.userAgent}\n\nDescription of the issue:\n\nSteps to reproduce:\n\nExpected behavior:\n\nScreenshots (optional):\n`);
                chrome.tabs.create({ url: `mailto:09wojak09@gmail.com?subject=${subject}&body=${body}` });
              }}
              className="flex items-center gap-2 rounded-lg border border-[#1E3A5F] bg-[#112745] px-4 py-2 text-[13px] font-medium text-slate-300 hover:bg-[#1A365D] hover:border-[#2C5282] hover:text-white transition shadow-sm"
            >
              Report a Bug
            </button>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-[#1E3A5F]">
            <button
              type="button"
              onClick={handleRestartOnboarding}
              className="flex items-center gap-2 rounded-lg border border-[#1E3A5F] bg-[#112745] px-4 py-2 text-[13px] font-medium text-slate-300 hover:bg-[#1A365D] hover:border-[#2C5282] hover:text-white transition shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Restart Onboarding Tour
            </button>
          </div>
        </SettingsCard>

      </main>
    </div>
  );
}
