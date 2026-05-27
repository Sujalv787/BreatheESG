import React from 'react';

const cfg = {
  PENDING:    { cls: 'badge-pending',  dot: 'bg-slate-500',                label: 'Pending' },
  APPROVED:   { cls: 'badge-approved', dot: 'bg-emerald-400',              label: 'Approved' },
  REJECTED:   { cls: 'badge-rejected', dot: 'bg-red-400',                  label: 'Rejected' },
  FLAGGED:    { cls: 'badge-flagged',  dot: 'bg-amber-400',                label: 'Flagged' },
  DONE:       { cls: 'badge-approved', dot: 'bg-emerald-400',              label: 'Done' },
  FAILED:     { cls: 'badge-rejected', dot: 'bg-red-400',                  label: 'Failed' },
  PROCESSING: { cls: 'badge-flagged',  dot: 'bg-amber-400 animate-pulse',  label: 'Processing' },
};

const StatusBadge = ({ status }) => {
  const key = (status || '').toUpperCase();
  const c   = cfg[key] || { cls: 'badge-pending', dot: 'bg-slate-500', label: status };
  return (
    <span className={c.cls}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  );
};

export default StatusBadge;
