import React, { useState, useEffect } from 'react';
import Upload from './pages/Upload';
import Review from './pages/Review';
import client from './api/client';
import {
  Leaf, LogOut, UploadCloud, LayoutDashboard,
  Lock, Mail, AlertCircle, ChevronRight, Activity,
  Shield, Zap, TrendingUp, ArrowRight
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────
   LOGIN PAGE  — Split layout, dark left + light glass right
───────────────────────────────────────────────────────────── */
const LoginPage = ({ onLogin }) => {
  const [email, setEmail]       = useState('analyst@demo.com');
  const [password, setPassword] = useState('demo1234');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await client.post('/api/auth/token/', { email, password });
      localStorage.setItem('token', res.data.access);
      onLogin();
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#0a0f1e]">
      {/* ── Left hero panel ── */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden grid-bg">
        {/* radial glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-blue-600/10 pointer-events-none" />
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />

        {/* Brand */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-pulse-glow">
            <Leaf className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-lg leading-none tracking-tight">Breathe ESG</p>
            <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-[0.2em] mt-0.5">Ingestion Platform</p>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative space-y-8">
          <div>
            <h1 className="text-5xl font-black text-white leading-[1.1] tracking-tight">
              Emissions data,<br />
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                audit-ready.
              </span>
            </h1>
            <p className="mt-5 text-slate-400 text-lg leading-relaxed max-w-sm">
              Ingest SAP exports, utility portal CSVs, and Concur travel data. Normalize, review, and sign off — all in one place.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-col gap-3">
            {[
              { icon: Shield,    label: 'Multi-tenant data isolation' },
              { icon: Activity,  label: 'Scope 1 / 2 / 3 classification' },
              { icon: TrendingUp, label: 'Immutable audit trail' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-slate-300">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-emerald-400" />
                </div>
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="relative text-xs text-slate-600">
          Emission factors: DEFRA/DESNZ 2023 · UK GHG Protocol
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex items-center justify-center p-8 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-[#0a0f1e]" />

        <div className="relative w-full max-w-sm animate-slide-up">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
              <Leaf className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="font-bold text-white">Breathe ESG</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
            <p className="text-slate-400 text-sm mt-1">Sign in to your analyst account</p>
          </div>

          {error && (
            <div className="mb-5 flex gap-3 items-start p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 animate-fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="input-field pl-11"
                  placeholder="analyst@demo.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="input-field pl-11"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 mt-2 text-base"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                <>Sign in <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>

          {/* Demo credentials box */}
          <div className="mt-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Demo Credentials</p>
            </div>
            <div className="space-y-1 text-xs font-mono text-slate-400">
              <p>analyst@demo.com</p>
              <p>demo1234</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   SIDEBAR
───────────────────────────────────────────────────────────── */
const Sidebar = ({ page, setPage, onLogout }) => {
  const navItems = [
    { id: 'review', icon: LayoutDashboard, label: 'Review Dashboard', badge: null },
    { id: 'upload', icon: UploadCloud,     label: 'Upload Data',       badge: null },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-slate-900/95 backdrop-blur-xl border-r border-slate-800/60 flex flex-col z-40">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-pulse-glow shrink-0">
            <Leaf className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white text-sm leading-none tracking-tight">Breathe ESG</p>
            <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-[0.18em] mt-1">Ingestion Platform</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-4 py-2 text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">Navigation</p>
        {navItems.map(({ id, icon: Icon, label, badge }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={`w-full text-left ${page === id ? 'nav-item-active' : 'nav-item'}`}
          >
            <Icon className={`h-4.5 w-4.5 shrink-0 ${page === id ? 'text-emerald-400' : ''}`} />
            <span className="flex-1 truncate">{label}</span>
            {badge && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                {badge}
              </span>
            )}
            {page === id && <ChevronRight className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
          </button>
        ))}
      </nav>

      {/* User area */}
      <div className="px-3 py-4 border-t border-slate-800/60">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/40 mb-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-white">A</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">Analyst</p>
            <p className="text-[10px] text-slate-500 truncate">Demo Tenant</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="btn-ghost w-full justify-start text-slate-500 hover:text-red-400 hover:bg-red-500/5"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
};

/* ─────────────────────────────────────────────────────────────
   APP SHELL
───────────────────────────────────────────────────────────── */
function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('token'));
  const [page, setPage]     = useState('review');

  useEffect(() => {
    const handleAuthFail = () => {
      setAuthed(false);
      localStorage.removeItem('token');
    };
    window.addEventListener('auth-failed', handleAuthFail);
    return () => window.removeEventListener('auth-failed', handleAuthFail);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setAuthed(false);
  };

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen bg-[#0a0f1e] grid-bg flex">
      <Sidebar page={page} setPage={setPage} onLogout={handleLogout} />

      {/* Main content */}
      <main className="ml-60 flex-1 min-h-screen overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {page === 'upload'
            ? <Upload onNavigate={setPage} />
            : <Review onNavigate={setPage} />
          }
        </div>
      </main>
    </div>
  );
}

export default App;
