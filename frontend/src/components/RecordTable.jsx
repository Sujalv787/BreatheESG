import React, { useState } from 'react';
import StatusBadge from './StatusBadge';
import { ChevronDown, ChevronUp, Check, X, Flag, AlertTriangle, Clock, Code2 } from 'lucide-react';

const ScopeChip = ({ scope }) => {
  const map = {
    '1': { cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25',   label: 'S1' },
    '2': { cls: 'bg-violet-500/15 text-violet-400 border-violet-500/25', label: 'S2' },
    '3': { cls: 'bg-teal-500/15 text-teal-400 border-teal-500/25',   label: 'S3' },
  };
  const cfg = map[scope] || { cls: 'bg-slate-700/60 text-slate-400 border-slate-600/40', label: `S${scope}` };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

const SourceChip = ({ type }) => {
  const map = {
    SAP:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
    UTILITY: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    TRAVEL:  'bg-teal-500/10 text-teal-400 border-teal-500/20',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${map[type] || 'bg-slate-700/50 text-slate-400 border-slate-600/30'}`}>
      {type}
    </span>
  );
};

const RecordTable = ({ records, selectedIds, setSelectedIds, onStatusUpdate }) => {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id);
  const handleSelectAll = (e) => setSelectedIds(e.target.checked ? records.map(r => r.id) : []);
  const handleSelectOne = (e, id) => {
    e.stopPropagation();
    setSelectedIds(prev => e.target.checked ? [...prev, id] : prev.filter(i => i !== id));
  };

  const allSelected  = records.length > 0 && selectedIds.length === records.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < records.length;

  const rowAccent = (status) => ({
    APPROVED: 'border-l-emerald-500 bg-emerald-500/3',
    REJECTED: 'border-l-red-500 bg-red-500/3',
    FLAGGED:  'border-l-amber-500 bg-amber-500/3',
    PENDING:  'border-l-slate-700',
  }[status] || 'border-l-slate-700');

  if (records.length === 0) {
    return (
      <div className="glass-card p-20 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center">
          <Clock className="h-7 w-7 text-slate-600" />
        </div>
        <div>
          <p className="font-semibold text-slate-400">No emission records found</p>
          <p className="text-sm text-slate-600 mt-1">Upload a CSV file or adjust your filters</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-700/60">
              <th className="w-12 px-4 py-3.5 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer"
                />
              </th>
              <th className="w-8 px-2 py-3.5" />
              <th className="tbl-th">Source</th>
              <th className="tbl-th">Scope</th>
              <th className="tbl-th">Category</th>
              <th className="tbl-th">Description</th>
              <th className="tbl-th">Period</th>
              <th className="tbl-th text-right">kg CO₂e</th>
              <th className="tbl-th text-center">Status</th>
              <th className="tbl-th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {records.map((record) => {
              const isExpanded = expandedId === record.id;
              const isSelected = selectedIds.includes(record.id);

              return (
                <React.Fragment key={record.id}>
                  <tr
                    onClick={() => toggleExpand(record.id)}
                    className={`cursor-pointer border-l-2 hover:bg-slate-800/40 transition-colors duration-150 ${rowAccent(record.status)}`}
                  >
                    <td className="w-12 px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => handleSelectOne(e, record.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer"
                      />
                    </td>
                    <td className="w-8 px-2 py-3.5 text-center text-slate-600">
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 mx-auto text-emerald-400" />
                        : <ChevronDown className="h-4 w-4 mx-auto" />
                      }
                    </td>
                    <td className="tbl-td"><SourceChip type={record.source_type} /></td>
                    <td className="tbl-td"><ScopeChip scope={record.scope} /></td>
                    <td className="tbl-td font-medium text-slate-200 max-w-[140px] truncate" title={record.category}>
                      {record.category}
                    </td>
                    <td className="tbl-td text-slate-500 max-w-[200px] truncate text-xs" title={record.description}>
                      {record.description}
                    </td>
                    <td className="tbl-td text-[11px] font-mono text-slate-500 whitespace-nowrap">
                      {record.period_start}
                      {record.period_start !== record.period_end && <><br /><span className="text-slate-600">→ {record.period_end}</span></>}
                    </td>
                    <td className="tbl-td text-right font-mono font-bold text-sm text-white whitespace-nowrap">
                      {parseFloat(record.quantity_kg_co2e).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="tbl-td text-center"><StatusBadge status={record.status} /></td>
                    <td className="tbl-td" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        {record.status !== 'APPROVED' && (
                          <button
                            onClick={() => onStatusUpdate(record.id, 'APPROVED')}
                            title="Approve"
                            className="p-2 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {record.status !== 'REJECTED' && (
                          <button
                            onClick={() => onStatusUpdate(record.id, 'REJECTED')}
                            title="Reject"
                            className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {record.status !== 'FLAGGED' && (
                          <button
                            onClick={() => onStatusUpdate(record.id, 'FLAGGED')}
                            title="Flag"
                            className="p-2 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                          >
                            <Flag className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* ── Expanded detail ── */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} className="p-0 border-l-2 border-l-emerald-500/40">
                        <div className="px-6 py-5 bg-slate-900/60 border-t border-slate-700/40 animate-fade-in">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Raw data */}
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <Code2 className="h-4 w-4 text-slate-400" />
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Original CSV Row</h4>
                              </div>
                              <pre className="bg-slate-950/60 border border-slate-700/40 rounded-xl p-4 text-[11px] font-mono text-slate-400 overflow-x-auto max-h-48 leading-relaxed">
                                {JSON.stringify(record.raw_data || {}, null, 2)}
                              </pre>
                              {record.parse_error && (
                                <div className="mt-2.5 flex gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                                  <AlertTriangle className="h-4 w-4 shrink-0" />
                                  <div>
                                    <p className="font-semibold">Parse Error</p>
                                    <p className="mt-0.5 opacity-75">{record.parse_error}</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Normalization + audit */}
                            <div className="space-y-4">
                              {/* Normalization */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Normalization</h4>
                                <div className="bg-slate-950/40 border border-slate-700/40 rounded-xl divide-y divide-slate-800/60">
                                  {[
                                    { label: 'Original', value: `${parseFloat(record.value_original).toLocaleString()} ${record.unit_original}` },
                                    { label: 'Normalized', value: `${parseFloat(record.quantity_kg_co2e).toLocaleString(undefined, { minimumFractionDigits: 4 })} kg CO₂e`, highlight: true },
                                    { label: 'Source', value: record.source_type },
                                    ...(record.approved_by_email ? [{ label: 'Approved by', value: record.approved_by_email, green: true }] : []),
                                  ].map(({ label, value, highlight, green }) => (
                                    <div key={label} className="flex justify-between items-center px-4 py-2.5 text-sm">
                                      <span className="text-slate-500">{label}</span>
                                      <span className={`font-mono font-semibold ${highlight ? 'text-emerald-400' : green ? 'text-emerald-400' : 'text-slate-300'}`}>
                                        {value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Flag reason */}
                              {record.flag_reason && (
                                <div className="flex gap-2.5 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs">
                                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-semibold text-amber-400">Flag Reason</p>
                                    <p className="text-amber-400/70 mt-0.5">{record.flag_reason}</p>
                                  </div>
                                </div>
                              )}

                              {/* Audit trail */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Audit Trail</h4>
                                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                                  {record.audit_events?.length > 0 ? (
                                    record.audit_events.map(evt => (
                                      <div key={evt.id} className="bg-slate-950/40 border border-slate-700/40 rounded-xl px-4 py-3 text-xs">
                                        <div className="flex items-center justify-between">
                                          <StatusBadge status={evt.action} />
                                          <span className="font-mono text-[10px] text-slate-600">
                                            {new Date(evt.timestamp).toLocaleString()}
                                          </span>
                                        </div>
                                        {evt.note && <p className="mt-2 text-slate-500 italic">"{evt.note}"</p>}
                                        <p className="mt-1.5 text-[10px] text-slate-600">by {evt.user_email}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs text-slate-600 italic px-1">No audit history yet.</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecordTable;
