import { LogIn, LayoutDashboard } from 'lucide-react';
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
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1280px] mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
        {/* Zone 1: Website logo mark + single-line brand wordmark */}
        <button
          type="button"
          onClick={onGoHome}
          aria-label={`${siteSettings.brandName || 'Global Pathways'} Home`}
          className="whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded-lg"
        >
          <BrandLogo
            variant="light"
            brandName={siteSettings.brandName}
            logoUrl={siteSettings.logoUrl}
          />
        </button>

        {/* Zone 2: Single-line navigation links for active sections */}
        <nav aria-label="Primary" className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          {siteSettings.showTracker && (
            <a
              href="#track-status"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Track Status
            </a>
          )}
          {siteSettings.showPosterSlider && siteSettings.posters.length > 0 && (
            <a
              href="#posters"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Posters
            </a>
          )}
          {siteSettings.showContactSection && (
            <a
              href="#contact"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Contact
            </a>
          )}
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
          ) : siteSettings.showLoginButton ? (
            <button
              type="button"
              onClick={onOpenLogin}
              aria-label="Staff and Admin Login"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-settle whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              <LogIn className="w-4 h-4" />
              <span>{siteSettings.loginButtonLabel || 'Login'}</span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
