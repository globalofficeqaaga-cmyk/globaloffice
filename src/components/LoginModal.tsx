import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Mail, Phone, User, X } from 'lucide-react';
import { api, setAuthToken } from '../lib/api';
import type { PublicUser } from '../types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: PublicUser) => void;
}

type AuthMode = 'login' | 'register';

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');

  // Sign-in fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Registration fields
  const [regName, setRegName] = useState('');
  const [regUserId, setRegUserId] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!isOpen) return null;

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setNotice('');
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!identifier.trim() || !password) {
      setError('Please enter your Email or User ID and password.');
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
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!regName.trim() || !regUserId.trim() || !regEmail.trim() || !regPassword) {
      setError('Full name, User ID, email, and password are required.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.register({
        name: regName.trim(),
        userId: regUserId.trim(),
        email: regEmail.trim(),
        phone: regPhone.trim(),
        password: regPassword,
      });

      if (res.requiresEmailConfirmation || !res.user) {
        setNotice(
          res.message ||
            'Account created. Please verify your email address, then sign in.'
        );
        setRegPassword('');
        setMode('login');
        setIdentifier(regEmail.trim());
        return;
      }

      setRegName('');
      setRegUserId('');
      setRegEmail('');
      setRegPhone('');
      setRegPassword('');
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete registration.');
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
              {mode === 'login' ? 'Portal Sign In' : 'Staff Registration'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {mode === 'login'
                ? 'Sign in with your Email or User ID and password'
                : 'Create a new staff coordinator account'}
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

        {/* Mode Tabs */}
        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
            {notice && (
              <div className="px-4 py-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
                {notice}
              </div>
            )}
            {error && (
              <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="login-userid" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email or User ID
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-userid"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter your email or User ID"
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
        ) : (
          <form onSubmit={handleRegisterSubmit} className="p-6 space-y-4">
            {error && (
              <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label htmlFor="reg-userid" className="block text-xs font-semibold text-slate-700 mb-1">
                  User ID *
                </label>
                <input
                  id="reg-userid"
                  type="text"
                  required
                  value={regUserId}
                  onChange={(e) => setRegUserId(e.target.value)}
                  placeholder="Unique handle"
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Phone / WhatsApp Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-phone"
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="+88017..."
                  className="w-full pl-10 pr-4 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-xs font-semibold text-slate-700 mb-1">
                Password (min. 6 characters) *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Create password"
                  className="w-full pl-10 pr-11 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
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
                {loading ? 'Creating account...' : 'Register'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
