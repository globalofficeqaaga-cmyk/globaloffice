import { useState, type ReactNode } from 'react';
import { ArrowLeft, LogOut, Menu, X } from 'lucide-react';
import type { PublicUser } from '../types';

export interface NavTab {
  id: string;
  label: string;
  icon: ReactNode;
  count?: number;
}

interface DashboardShellProps {
  user: PublicUser;
  roleLabel: string;
  tabs: NavTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onGoHome: () => void;
  onLogout: () => void;
  primaryAction?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  user,
  roleLabel,
  tabs,
  activeTab,
  onTabChange,
  onGoHome,
  onLogout,
  primaryAction,
  children,
}: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label || 'Overview';

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <p className="font-display text-base font-bold text-slate-900">Global Pathways</p>
          <p className="text-xs text-slate-500 mt-0.5">{roleLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onTabChange(tab.id);
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="inline-flex items-center gap-2.5">
                {tab.icon}
                <span>{tab.label}</span>
              </span>
              {tab.count !== undefined && (
                <span
                  className={`font-mono text-xs tabular-nums ${
                    isActive ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-2">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <img
            src={user.photoUrl || '/src/assets/images/staff_avatar_default_1794656907853.jpg'}
            alt={user.name}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-lg object-cover bg-slate-200 border border-slate-200 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 font-mono truncate">@{user.userId}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onGoHome}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Public Lookup Page</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[256px] shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full border-r border-slate-200 z-10">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 truncate">
              <span>{roleLabel}</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-semibold text-slate-900">{activeTabLabel}</span>
            </div>
          </div>

          {primaryAction && <div className="shrink-0">{primaryAction}</div>}
        </header>

        <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
