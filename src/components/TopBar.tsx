import { LogIn, LayoutDashboard } from 'lucide-react';
import type { PublicUser } from '../types';

interface TopBarProps {
  currentUser: PublicUser | null;
  onOpenLogin: () => void;
  onGoDashboard: () => void;
  onGoHome: () => void;
}

export function TopBar({ currentUser, onOpenLogin, onGoDashboard, onGoHome }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1280px] mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line brand wordmark */}
        <button
          type="button"
          onClick={onGoHome}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded"
        >
          Global Pathways
        </button>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <a
            href="#track-status"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Track Status
          </a>
          <a
            href="#medical-screening"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Medical Screening
          </a>
          <a
            href="#trade-interviews"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Trade Interviews
          </a>
          <a
            href="#process"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Process
          </a>
        </nav>

        {/* Zone 3: 1 primary action button */}
        <div className="flex items-center shrink-0">
          {currentUser ? (
            <button
              type="button"
              onClick={onGoDashboard}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-settle whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              aria-label="Staff and Admin Login"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-settle whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Login</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
