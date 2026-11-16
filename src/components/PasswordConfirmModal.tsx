import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, ShieldAlert, X } from 'lucide-react';
import { api } from '../lib/api';

interface PasswordConfirmModalProps {
  open: boolean;
  title?: string;
  itemLabel: string;
  description?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export function PasswordConfirmModal({
  open,
  title = 'Password Required to Remove',
  itemLabel,
  description = 'For security, enter your account login password to confirm this removal.',
  confirmLabel = 'Verify & Remove',
  onClose,
  onConfirm,
}: PasswordConfirmModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPassword('');
      setShowPassword(false);
      setError('');
      setBusy(false);
    }
  }, [open, itemLabel]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      setError('Please enter your login password.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.verifyCurrentPassword(password);
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 no-print"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-300 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h2 className="font-display text-sm sm:text-base font-bold truncate">{title}</h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-lg cursor-pointer"
            aria-label="Cancel removal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-xs font-semibold text-red-900 break-words">{itemLabel}</p>
            <p className="text-xs text-red-700 mt-1">{description}</p>
          </div>

          {error && (
            <div className="px-3.5 py-2.5 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Your Login Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter your password to confirm"
                className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !password}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg cursor-pointer"
            >
              {busy ? 'Verifying...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
