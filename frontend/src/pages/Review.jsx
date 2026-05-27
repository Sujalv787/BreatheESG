import React, { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import RecordTable from '../components/RecordTable';
import StatusBadge from '../components/StatusBadge';
import {
  RefreshCw, Filter, CheckSquare, TrendingUp,
  Database, Clock, AlertTriangle, CheckCircle2,
  X, UploadCloud, Flame, Zap, Globe2,
  ChevronDown, BarChart2
} from 'lucide-react';

/* ── Animated counter ── */
const AnimatedNumber = ({ value, decimals = 0 }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    let start = 0;
    const step = target / 40;
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setDisplay(target); clearInterval(timer); }
      else setDisplay(start);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
};

/* ── Metric card ── */
const MetricCard = ({ title, value, unit, sub, icon: Icon, gradient, glow }) => (
  <div className={`relative overflow-hidden glass-card p-5 ${glow} group hover:scale-[1.02] transition-all duration-200`}>
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
    <div className="relative">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{title}</p>
        <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700/40 flex items-center justify-center">
          <Icon className="h-4 w-4 text-slate-400 group-hover:text-white transition-colors" />
        </div>
      </div>
      <p className="text-3xl font-black text-white font-mono leading-none">
        <AnimatedNumber value={value} decimals={0} />
      </p>
      {unit && <p className="text-xs text-slate-500 mt-1 font-medium">{unit}</p>}
      {sub  && <p className="text-xs text-slate-600 mt-2">{sub}</p>}
    </div>
  </div>
);

/* ── Scope bar ── */
const ScopeBar = ({ by_scope }) => {
  const total = Object.values(by_scope).reduce((a, b) => a + Number(b), 0) || 1;
  const scopes = [
    { key: '1', label: 'Scope 1', color: 'bg-blue-500',   textColor: 'text-blue-400',   icon: Flame,  desc: 'Direct combustion' },
    { key: '2', label: 'Scope 2', color: 'bg-violet-500', textColor: 'text-violet-400', icon: Zap,    desc: 'Grid electricity' },
    { key: '3', label: 'Scope 3', color: 'bg-teal-500',   textColor: 'text-teal-400',   icon: Globe2, desc: 'Value chain' },
  ];

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-white">Scope Breakdown</p>
        </div>
        <p className="text-xs text-slate-500 font-mono">{total.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg CO₂e total</p>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-slate-800">
        {scopes.map(({ key, color }) => {
          const pct = (Number(by_scope[key]) / total) * 100;
          return pct > 0 ? (
            <div
              key={key}
              className={`${color} h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${pct}%` }}
              title={`Scope ${key}: ${pct.toFixed(1)}%`}
            />
          ) : null;
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-3">
        {scopes.map(({ key, label, color, textColor, icon: Icon, desc }) => {
          const val = Number(by_scope[key]) || 0;
          const pct = ((val / total) * 100).toFixed(1);
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                <Icon className={`h-3 w-3 ${textColor}`} />
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
              </div>
              <p className={`text-base font-black font-mono ${textColor}`}>
                {val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[10px] text-slate-600">{pct}% · {desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── Action modal ── */
const ActionModal = ({ modal, onClose, onSubmit }) => {
  const [note,       setNote]       = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (modal.isOpen) { setNote(''); setFlagReason(''); } }, [modal.isOpen]);

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit({ note, flagReason });
    setSubmitting(false);
  };

  const isBulk    = modal.recordId === null;
  const isFlagging= modal.targetStatus === 'FLAGGED';
  const canSubmit = !isFlagging || flagReason.trim().length > 0;

  const statusStyle = {
    APPROVED: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
    REJECTED: 'bg-red-500/10 border-red-500/25 text-red-400',
    FLAGGED:  'bg-amber-500/10 border-amber-500/25 text-amber-400',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="glass-card w-full max-w-md animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700/50">
          <div>
            <h3 className="font-bold text-white">
              {isBulk ? `Bulk Approve ${modal.count} Records` : `Change Status`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isBulk ? 'All selected records will be marked as approved' : `Record #${modal.recordId}`}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {!isBulk && modal.targetStatus && (
            <div className={`px-4 py-2.5 rounded-xl border text-xs font-semibold ${statusStyle[modal.targetStatus] || ''}`}>
              Setting status to: <strong className="text-sm">{modal.targetStatus}</strong>
            </div>
          )}

          {isFlagging && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">
                Flag Reason <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={flagReason}
                onChange={e => setFlagReason(e.target.value)}
                placeholder="e.g. Non-standard billing period, unrecognized unit..."
                className="input-field"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Analyst Note <span className="text-slate-600">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Describe your review rationale..."
              rows={3}
              className="input-field resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 bg-slate-900/40 border-t border-slate-700/50">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="btn-primary"
          >
            {submitting
              ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>Saving...</>
              : <><CheckCircle2 className="h-4 w-4" />Confirm</>
            }
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   REVIEW PAGE
───────────────────────────────────────────────────────────── */
const Review = ({ onNavigate }) => {
  const [records,    setRecords]    = useState([]);
  const [summary,    setSummary]    = useState({
    total_records: 0, total_co2e_overall: 0,
    by_scope: { '1': 0, '2': 0, '3': 0 },
    by_status: { PENDING: 0, APPROVED: 0, REJECTED: 0, FLAGGED: 0 }
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [filters,     setFilters]     = useState({ source_type: '', scope: '', status: '' });
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [modal,       setModal]       = useState({ isOpen: false, recordId: null, targetStatus: '', count: 0 });

  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const params = {};
      if (filters.source_type) params.source_type = filters.source_type;
      if (filters.scope)       params.scope        = filters.scope;
      if (filters.status)      params.status       = filters.status;

      const [recRes, sumRes] = await Promise.all([
        client.get('/api/records/', { params }),
        client.get('/api/records/summary/', { params }),
      ]);
      const data = Array.isArray(recRes.data) ? recRes.data : (recRes.data.results || []);
      setRecords(data);
      setSummary(sumRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filters]);

  useEffect(() => { setLoading(true); fetchAll(); }, [filters]);

  const hasFilters = filters.source_type || filters.scope || filters.status;
  const openModal  = (id, status) => setModal({ isOpen: true, recordId: id, targetStatus: status, count: id === null ? selectedIds.length : 1 });
  const closeModal = () => setModal({ isOpen: false, recordId: null, targetStatus: '', count: 0 });

  const submitAction = async ({ note, flagReason }) => {
    try {
      if (modal.recordId === null) {
        await client.post('/api/records/bulk-approve/', { ids: selectedIds, note: note || 'Bulk approved.' });
        setSelectedIds([]);
      } else {
        const payload = { status: modal.targetStatus };
        if (note) payload.note = note;
        if (modal.targetStatus === 'FLAGGED') payload.flag_reason = flagReason;
        await client.patch(`/api/records/${modal.recordId}/`, payload);
      }
      closeModal();
      await fetchAll(true);
    } catch (e) {
      alert(e.response?.data?.error || 'Action failed.');
      closeModal();
    }
  };

  const fmtNum = (n, d = 0) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="space-y-6 animate-slide-up">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Review Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Audit and approve emission records before external certification</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchAll(true)} disabled={refreshing} className="btn-secondary">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh
          </button>
          <button onClick={() => onNavigate('upload')} className="btn-primary">
            <UploadCloud className="h-4 w-4" />
            Upload Data
          </button>
        </div>
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Emissions"
          value={fmtNum(summary.total_co2e_overall)}
          unit="kg CO₂e across all scopes"
          icon={TrendingUp}
          gradient="from-emerald-500/5 to-transparent"
          glow="hover:glow-emerald"
        />
        <MetricCard
          title="Total Records"
          value={fmtNum(summary.total_records)}
          unit={`${fmtNum(summary.by_status.APPROVED)} approved`}
          icon={Database}
          gradient="from-blue-500/5 to-transparent"
          glow="hover:glow-blue"
        />
        <MetricCard
          title="Pending Review"
          value={fmtNum(summary.by_status.PENDING)}
          unit="Awaiting analyst sign-off"
          icon={Clock}
          gradient="from-slate-500/5 to-transparent"
          glow=""
        />
        <MetricCard
          title="Flagged"
          value={fmtNum(summary.by_status.FLAGGED)}
          unit="Require investigation"
          icon={AlertTriangle}
          gradient={summary.by_status.FLAGGED > 0 ? 'from-amber-500/5 to-transparent' : 'from-slate-500/5 to-transparent'}
          glow=""
        />
      </div>

      {/* ── Scope breakdown ── */}
      <ScopeBar by_scope={summary.by_scope} />

      {/* ── Status breakdown row ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { key: 'PENDING',  color: 'border-slate-600/60',   text: 'text-slate-400',   bar: 'bg-slate-500' },
          { key: 'APPROVED', color: 'border-emerald-500/30', text: 'text-emerald-400', bar: 'bg-emerald-500' },
          { key: 'REJECTED', color: 'border-red-500/30',     text: 'text-red-400',     bar: 'bg-red-500' },
          { key: 'FLAGGED',  color: 'border-amber-500/30',   text: 'text-amber-400',   bar: 'bg-amber-500' },
        ].map(({ key, color, text, bar }) => {
          const count = summary.by_status[key] || 0;
          const pct = summary.total_records > 0 ? (count / summary.total_records * 100).toFixed(0) : 0;
          return (
            <button
              key={key}
              onClick={() => setFilters(f => ({ ...f, status: f.status === key ? '' : key }))}
              className={`glass-card p-4 text-left border cursor-pointer hover:border-opacity-60 transition-all duration-200
                ${filters.status === key ? color + ' bg-slate-800/60' : 'border-slate-700/40 hover:bg-slate-800/40'}`}
            >
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{key}</p>
              <p className={`text-2xl font-black font-mono ${text}`}>{count}</p>
              <div className="mt-2 h-1 bg-slate-700/60 rounded-full overflow-hidden">
                <div className={`${bar} h-full rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5">{pct}% of total</p>
            </button>
          );
        })}
      </div>

      {/* ── Filter & bulk action bar ── */}
      <div className="glass-card px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-slate-500 shrink-0" />

          {[
            { name: 'source_type', placeholder: 'All Sources',
              options: [['SAP','SAP Flat File'],['UTILITY','Utility Portal'],['TRAVEL','Concur Travel']] },
            { name: 'scope', placeholder: 'All Scopes',
              options: [['1','Scope 1'],['2','Scope 2'],['3','Scope 3']] },
            { name: 'status', placeholder: 'All Statuses',
              options: [['PENDING','Pending'],['APPROVED','Approved'],['REJECTED','Rejected'],['FLAGGED','Flagged']] },
          ].map(({ name, placeholder, options }) => (
            <div key={name} className="relative">
              <select
                name={name}
                value={filters[name]}
                onChange={e => { setFilters(f => ({ ...f, [name]: e.target.value })); setSelectedIds([]); }}
                className="input-field py-2 pr-8 cursor-pointer text-sm min-w-[140px] appearance-none"
              >
                <option value="">{placeholder}</option>
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
            </div>
          ))}

          {hasFilters && (
            <button
              onClick={() => { setFilters({ source_type: '', scope: '', status: '' }); setSelectedIds([]); }}
              className="btn-ghost text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/5"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}

          <div className="ml-auto flex items-center gap-3">
            {records.length > 0 && (
              <span className="text-xs text-slate-500 font-medium">
                {records.length} record{records.length !== 1 ? 's' : ''}{hasFilters ? ' (filtered)' : ''}
              </span>
            )}
            {selectedIds.length > 0 && (
              <button onClick={() => openModal(null, 'APPROVED')} className="btn-primary text-sm py-2">
                <CheckSquare className="h-4 w-4" />
                Approve {selectedIds.length} Selected
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Records table ── */}
      {loading ? (
        <div className="glass-card p-20 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-emerald-500 animate-spin" />
            <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-b-emerald-500/30 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <p className="text-sm font-medium text-slate-500">Loading emission records...</p>
        </div>
      ) : (
        <RecordTable records={records} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onStatusUpdate={openModal} />
      )}

      {modal.isOpen && <ActionModal modal={modal} onClose={closeModal} onSubmit={submitAction} />}
    </div>
  );
};

export default Review;
