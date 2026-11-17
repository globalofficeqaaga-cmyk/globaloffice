import { useState } from 'react';
import { LogIn, LayoutDashboard, Menu, X } from 'lucide-react';
import type { PublicUser, SiteSettings } from '../types';
import { BrandLogo } from './BrandLogo';

interface TopBarProps {
  currentUser: PublicUser | null;
  siteSettings: SiteSettings;
  onOpenLogin: () => void;
  onGoDashboard: () => void;
  onGoHome: () => void;
}

export function TopBar({
  currentUser,
  siteSettings,
  onOpenLogin,
  onGoDashboard,
  onGoHome,
}: TopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileLinks = [
    ...(siteSettings.showTracker ? [{ label: 'Track Status', href: '#track-status' }] : []),
    ...(siteSettings.showPosterSlider && siteSettings.posters.length > 0
      ? [{ label: 'Posters', href: '#posters' }]
      : []),
    ...(siteSettings.showContactSection ? [{ label: 'Contact', href: '#contact' }] : []),
  ];

  return (
    <>
      <header className="relative z-30 bg-white border-b border-slate-200">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-4 sm:gap-8">
          <button
            type="button"
            onClick={onGoHome}
            aria-label={`${siteSettings.brandName || 'Global Pathways'} Home`}
            className="min-w-0 whitespace-nowrap shrink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded-lg"
          >
            <BrandLogo
              variant="light"
              brandName={siteSettings.brandName}
              logoUrl={siteSettings.logoUrl}
            />
          </button>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            {mobileLinks.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden sm:flex items-center shrink-0">
            {currentUser ? (
              <button type="button" onClick={onGoDashboard} className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-settle whitespace-nowrap cursor-pointer">
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </button>
            ) : siteSettings.showLoginButton ? (
              <button type="button" onClick={onOpenLogin} aria-label="Staff and Admin Login" className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-settle whitespace-nowrap cursor-pointer">
                <LogIn className="w-4 h-4" />
                <span>{siteSettings.loginButtonLabel || 'Login'}</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-md px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(15,23,42,0.10)]">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="flex-1 inline-flex items-center justify-center gap-2 min-h-11 rounded-xl border border-slate-300 bg-white text-slate-800 font-semibold text-sm"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            <span>{mobileMenuOpen ? 'Close' : 'Menu'}</span>
          </button>
          {currentUser ? (
            <button type="button" onClick={onGoDashboard} className="flex-1 inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-blue-700 text-white font-semibold text-sm">
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
          ) : siteSettings.showLoginButton ? (
            <button type="button" onClick={onOpenLogin} aria-label="Staff and Admin Login" className="flex-1 inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-slate-900 text-white font-semibold text-sm">
              <LogIn className="w-4 h-4" />
              <span>{siteSettings.loginButtonLabel || 'Login'}</span>
            </button>
          ) : null}
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="sm:hidden fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 px-4">
          <nav aria-label="Mobile" className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            {mobileLinks.length ? mobileLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {link.label}
              </a>
            )) : <p className="px-4 py-3 text-sm text-slate-500">No menu links available.</p>}
          </nav>
        </div>
      )}
    </>
  );
}
