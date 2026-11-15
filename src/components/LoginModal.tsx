import { useState, type FormEvent } from 'react';
import { Check, Copy, Database, ExternalLink, Eye, EyeOff, Lock, User, X } from 'lucide-react';
import { api, DatabaseSetupError, setAuthToken } from '../lib/api';
import { getSupabaseSqlEditorUrl } from '../lib/supabase';
import type { PublicUser } from '../types';
import setupAllSql from '../../supabase/setup_all.sql?raw';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: PublicUser) => void;
}

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsDbSetup, setNeedsDbSetup] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showRawSql, setShowRawSql] = useState(false);

  if (!isOpen) return null;

  const sqlEditorUrl = getSupabaseSqlEditorUrl();

  async function handleCopySql() {
    try {
      await navigator.clipboard.writeText(setupAllSql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
      return;
    } catch {
      // Fallback for mobile webviews / iframes where navigator.clipboard is restricted
      try {
        const ta = document.createElement('textarea');
        ta.value = setupAllSql;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) {
          setCopiedSql(true);
          setTimeout(() => setCopiedSql(false), 3000);
          return;
        }
      } catch {
        // Reveal raw SQL box below
      }
      setShowRawSql(true);
    }
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNeedsDbSetup(false);
    if (!identifier.trim() || !password) {
      setError('Please enter your User ID and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login(identifier.trim(), password);
      if (res.token) {
        setAuthToken(res.token);
      }
      setIdentifier('');
      setPassword('');
      onSuccess(res.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in.';
      const isSetupMissing =
        err instanceof DatabaseSetupError ||
        msg.toLowerCase().includes('resolve_login_email') ||
        msg.toLowerCase().includes('setup_all.sql') ||
        msg.toLowerCase().includes('database setup is incomplete');
      setNeedsDbSetup(isSetupMissing);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
          <div>
            <h2 id="login-modal-title" className="font-display text-lg font-bold text-slate-900">
              Portal Sign In
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Sign in with your Admin, Staff, or Accounts User ID
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
          {error && !needsDbSetup && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {needsDbSetup && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5">
                <Database className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-950">
                    One-Time Supabase Database Setup Required
                  </p>
                  <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                    Your website is connected to Supabase, but the required database tables and
                    functions are not installed yet.
                  </p>
                </div>
              </div>

              <ol className="text-xs text-amber-950 space-y-1 pl-4 list-decimal">
                <li>Click <strong>Copy Setup SQL</strong> below.</li>
                <li>Click <strong>Open SQL Editor</strong>, paste the SQL, and click <strong>Run</strong>.</li>
                <li>Create your admin user in <strong>Authentication → Users</strong> with a strong password and run the promotion query at the bottom of the SQL script.</li>
              </ol>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied Setup SQL!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Setup SQL
                    </>
                  )}
                </button>
                <a
                  href={sqlEditorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-950 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Open SQL Editor</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setShowRawSql((prev) => !prev)}
                  className="px-2.5 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
                >
                  {showRawSql ? 'Hide SQL' : 'View SQL'}
                </button>
              </div>

              {showRawSql && (
                <textarea
                  readOnly
                  value={setupAllSql}
                  onFocus={(e) => e.currentTarget.select()}
                  rows={5}
                  className="w-full p-2.5 text-[11px] font-mono bg-white border border-amber-300 rounded-lg text-slate-800 focus:outline-none"
                />
              )}
            </div>
          )}

          <div>
            <label htmlFor="login-userid" className="block text-sm font-medium text-slate-700 mb-1.5">
              User ID
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-userid"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter User ID (e.g. admin)"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full pl-10 pr-11 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-settle cursor-pointer whitespace-nowrap shrink-0"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
