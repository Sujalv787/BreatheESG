import React, { useState, useEffect, useRef } from 'react';
import client from '../api/client';
import StatusBadge from '../components/StatusBadge';
import {
  UploadCloud, FileSpreadsheet, CheckCircle, AlertTriangle,
  Play, Calendar, ChevronRight, Zap, Info,
  Database, Cpu, Globe
} from 'lucide-react';

const SOURCE_CONFIG = {
  SAP: {
    label:    'SAP Flat File',
    sub:      'Fuel & procurement — Scope 1 & 3',
    icon:     Cpu,
    color:    'from-blue-500/20 to-blue-600/10 border-blue-500/25',
    accent:   'text-blue-400',
    dot:      'bg-blue-400',
    endpoint: '/api/ingest/sap/',
    columns:  'WERKS, MATNR, MENGE, MEINS, BUDAT, KOSTL, TXZ01',
  },
  UTILITY: {
    label:    'Utility Portal',
    sub:      'Grid electricity — Scope 2',
    icon:     Database,
    color:    'from-violet-500/20 to-violet-600/10 border-violet-500/25',
    accent:   'text-violet-400',
    dot:      'bg-violet-400',
    endpoint: '/api/ingest/utility/',
    columns:  'meter_id, site_name, billing_period_start, billing_period_end, kwh_consumption, tariff_code, supplier',
  },
  TRAVEL: {
    label:    'Concur Travel',
    sub:      'Business travel — Scope 3',
    icon:     Globe,
    color:    'from-teal-500/20 to-teal-600/10 border-teal-500/25',
    accent:   'text-teal-400',
    dot:      'bg-teal-400',
    endpoint: '/api/ingest/travel/',
    columns:  'trip_id, traveler_email, travel_date, origin, destination, transport_type, distance_km, nights',
  },
};

const Upload = ({ onNavigate }) => {
  const [activeTab,  setActiveTab]  = useState('SAP');
  const [file,       setFile]       = useState(null);
  const [uploading,  setUploading]  = useState(false);
  const [lastRuns,   setLastRuns]   = useState({ SAP: null, UTILITY: null, TRAVEL: null });
  const [dragActive, setDragActive] = useState(false);
  const [feedback,   setFeedback]   = useState(null);
  const fileInputRef = useRef(null);

  const fetchLastRuns = async () => {
    try {
      const res = await client.get('/api/runs/');
      const runs = Array.isArray(res.data) ? res.data : (res.data.results || []);
      const latest = { SAP: null, UTILITY: null, TRAVEL: null };
      for (const run of runs) {
        if (latest[run.source_type] === null) latest[run.source_type] = run;
      }
      setLastRuns(latest);
    } catch {}
  };

  useEffect(() => { fetchLastRuns(); }, []);

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f?.name.endsWith('.csv')) { setFile(f); setFeedback(null); }
    else setFeedback({ type: 'error', message: 'Only CSV files are supported.' });
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f?.name.endsWith('.csv')) { setFile(f); setFeedback(null); }
    else setFeedback({ type: 'error', message: 'Only CSV files are supported.' });
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setFeedback(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await client.post(SOURCE_CONFIG[activeTab].endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data;
      setFeedback({
        type: 'success',
        message: `Ingested "${d.file_name}" — ${d.row_count - d.error_count} records saved, ${d.error_count} errors.`
      });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchLastRuns();
    } catch (e) {
      setFeedback({ type: 'error', message: e.response?.data?.error || 'Upload failed. Check the file and try again.' });
    } finally {
      setUploading(false);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab); setFile(null); setFeedback(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const cfg = SOURCE_CONFIG[activeTab];
  const SrcIcon = cfg.icon;
  const currentRun = lastRuns[activeTab];

  return (
    <div className="space-y-6 animate-slide-up">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Ingestion Console</h1>
          <p className="text-sm text-slate-500 mt-1">Upload raw emissions data from enterprise data streams</p>
        </div>
        <button onClick={() => onNavigate('review')} className="btn-primary">
          <Zap className="h-4 w-4" />
          Open Review
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Source selector tabs ── */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(SOURCE_CONFIG).map(([key, c]) => {
          const Icon = c.icon;
          const run  = lastRuns[key];
          const active = key === activeTab;
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className={`relative text-left p-4 rounded-2xl border transition-all duration-200
                ${active
                  ? `bg-gradient-to-br ${c.color} shadow-lg`
                  : 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/60 hover:border-slate-600/60'
                }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center
                  ${active ? 'bg-white/10' : 'bg-slate-700/60'}`}>
                  <Icon className={`h-4.5 w-4.5 ${active ? c.accent : 'text-slate-400'}`} />
                </div>
                {run && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold
                    ${run.status === 'DONE'   ? 'bg-emerald-500/20 text-emerald-400' :
                      run.status === 'FAILED' ? 'bg-red-500/20 text-red-400' :
                                                'bg-slate-600/60 text-slate-400'}`}>
                    {run.status}
                  </span>
                )}
              </div>
              <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-slate-300'}`}>{c.label}</p>
              <p className={`text-xs mt-0.5 ${active ? 'text-slate-300' : 'text-slate-500'}`}>{c.sub}</p>
              {active && (
                <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rotate-45 border-r border-b ${c.color.split(' ').find(c => c.startsWith('border-'))}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Main upload area ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Drop zone + actions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-6 space-y-5">
            {/* Column reference */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/40">
              <Info className={`h-4 w-4 ${cfg.accent} shrink-0 mt-0.5`} />
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-1">Required CSV columns</p>
                <p className={`text-xs font-mono ${cfg.accent} opacity-80`}>{cfg.columns}</p>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300
                ${dragActive
                  ? 'drop-zone-active border-emerald-500/60'
                  : file
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-slate-700/60 hover:border-slate-600/80 bg-slate-800/20 hover:bg-slate-800/40'
                }`}
            >
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
              <div className="flex flex-col items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
                  ${file ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-slate-700/60 border border-slate-600/40'}`}>
                  {file
                    ? <FileSpreadsheet className="h-7 w-7 text-emerald-400" />
                    : <UploadCloud className="h-7 w-7 text-slate-400" />
                  }
                </div>
                {file ? (
                  <div>
                    <p className="font-semibold text-white text-sm">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-slate-200 text-sm">Drop your CSV here</p>
                    <p className="text-xs text-slate-500 mt-1">or click to browse · CSV files only</p>
                  </div>
                )}
              </div>
            </div>

            {/* Feedback */}
            {feedback && (
              <div className={`flex gap-3 p-4 rounded-xl border text-sm animate-fade-in
                ${feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/25 text-red-400'}`}>
                {feedback.type === 'success'
                  ? <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400" />
                  : <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
                }
                <p className="font-medium">{feedback.message}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleUpload}
                disabled={uploading || !file}
                className="btn-primary flex-1 justify-center py-3"
              >
                {uploading ? (
                  <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>Processing...</>
                ) : (
                  <><Play className="h-4 w-4" />Upload &amp; Ingest</>
                )}
              </button>
              {file && (
                <button onClick={() => { setFile(null); setFeedback(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="btn-secondary">
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Last run status */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Last {cfg.label} Run</p>
          {currentRun ? (
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className="text-sm font-semibold text-white">{currentRun.source_type}</span>
                </div>
                <StatusBadge status={currentRun.status} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/40">
                  <p className="text-2xl font-black text-white font-mono">{currentRun.row_count}</p>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase mt-1">Rows</p>
                </div>
                <div className={`rounded-xl p-3 text-center border
                  ${currentRun.error_count > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-800/60 border-slate-700/40'}`}>
                  <p className={`text-2xl font-black font-mono ${currentRun.error_count > 0 ? 'text-red-400' : 'text-white'}`}>
                    {currentRun.error_count}
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase mt-1">Errors</p>
                </div>
              </div>

              {/* Progress bar */}
              {currentRun.row_count > 0 && (
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                    <span>Parse success rate</span>
                    <span className="text-emerald-400 font-semibold">
                      {(((currentRun.row_count - currentRun.error_count) / currentRun.row_count) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                    <div
                      className="progress-bar h-full"
                      style={{ width: `${((currentRun.row_count - currentRun.error_count) / currentRun.row_count) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-1 border-t border-slate-700/40 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>File</span>
                  <span className="text-slate-300 font-medium truncate max-w-[140px]" title={currentRun.file_name}>{currentRun.file_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Date</span>
                  <span className="font-mono text-[10px] text-slate-400">{new Date(currentRun.created_at).toLocaleString()}</span>
                </div>
              </div>

              <button onClick={() => onNavigate('review')} className="btn-secondary w-full justify-center text-xs">
                View in Dashboard <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="glass-card p-8 text-center border-dashed">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center mx-auto mb-3">
                <SrcIcon className="h-6 w-6 text-slate-600" />
              </div>
              <p className="text-sm font-medium text-slate-500">No {activeTab} runs yet</p>
              <p className="text-xs text-slate-600 mt-1">Upload a file to get started</p>
            </div>
          )}

          {/* Other sources summary */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-1">Other Sources</p>
            {Object.entries(SOURCE_CONFIG)
              .filter(([k]) => k !== activeTab)
              .map(([key, c]) => {
                const run = lastRuns[key];
                const Icon = c.icon;
                return (
                  <button
                    key={key}
                    onClick={() => switchTab(key)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/50 transition-all"
                  >
                    <Icon className={`h-4 w-4 ${c.accent} shrink-0`} />
                    <span className="text-xs font-medium text-slate-400 flex-1 text-left">{c.label}</span>
                    {run
                      ? <span className={`text-[10px] font-bold ${run.status === 'DONE' ? 'text-emerald-400' : 'text-slate-500'}`}>{run.status}</span>
                      : <span className="text-[10px] text-slate-600">No data</span>
                    }
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Upload;
