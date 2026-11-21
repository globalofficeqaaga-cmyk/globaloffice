import { useCallback, useEffect, useState } from 'react';
import { AccountsDashboard } from './components/AccountsDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { LandingPage } from './components/LandingPage';
import { LeadershipDashboard } from './components/LeadershipDashboard';
import { LoginModal } from './components/LoginModal';
import { StaffDashboard } from './components/StaffDashboard';
import { TopBar } from './components/TopBar';
import { api, getAuthToken, setAuthToken } from './lib/api';
import { DEFAULT_SITE_SETTINGS } from './lib/siteDefaults';
import {
  getSupabaseConfigError,
  hasPartialOrInvalidSupabaseConfig,
  isSupabaseConfigured,
  supabase,
} from './lib/supabase';
import type { DashboardData, PublicUser, SiteSettings } from './types';

export default function App() {
  const [view, setView] = useState<'landing' | 'dashboard'>('landing');
  const [loginOpen, setLoginOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState('');
  const [backendUnavailable, setBackendUnavailable] = useState(false);

  const loadDashboard = useCallback(async () => {
    setDashError('');
    setDashLoading(true);
    try {
      const data = await api.getDashboard();
      setDashboardData(data);
      setCurrentUser(data.user);
    } catch (err) {
      setAuthToken(null);
      setCurrentUser(null);
      setDashboardData(null);
      setView('landing');
      setDashError(err instanceof Error ? err.message : 'Unable to load dashboard session.');
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      // Load public website CMS settings in parallel with session restore
      api.getSiteSettings().then((settings) => {
        if (active) setSiteSettings(settings);
      });

      if (supabase) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session && active) {
            const res = await api.me();
            if (!active) return;
            setCurrentUser(res.user);
            const dash = await api.getDashboard();
            if (!active) return;
            setDashboardData(dash);
          }
        } catch (err) {
          if (active) {
            setCurrentUser(null);
            setDashboardData(null);
            setDashError(
              err instanceof Error ? err.message : 'Could not restore Supabase session.'
            );
          }
        } finally {
          if (active) setBootstrapping(false);
        }
        return;
      }

      // Verify Express backend availability when running without Supabase in production
      if (import.meta.env.PROD) {
        fetch('/api/health')
          .then(async (res) => {
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (!res.ok || !ct.includes('application/json')) return false;
            const json = (await res.json()) as { ok?: boolean };
            return json?.ok === true;
          })
          .catch(() => false)
          .then((ok) => {
            if (active && !ok) {
              setBackendUnavailable(true);
            }
          });
      }

      // Express backend session restore
      const token = getAuthToken();
      if (!token) {
        if (active) setBootstrapping(false);
        return;
      }
      try {
        const res = await api.me();
        if (!active) return;
        setCurrentUser(res.user);
        const dash = await api.getDashboard();
        if (!active) return;
        setDashboardData(dash);
      } catch {
        setAuthToken(null);
        if (active) {
          setCurrentUser(null);
          setDashboardData(null);
        }
      } finally {
        if (active) setBootstrapping(false);
      }
    }

    init();

    // Sync Supabase auth state changes (token refresh, email confirmation, sign-out)
    if (supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (!active) return;
        if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
          setDashboardData(null);
          setView('landing');
        }
      });
      return () => {
        active = false;
        subscription.unsubscribe();
      };
    }

    return () => {
      active = false;
    };
  }, []);

  async function handleLoginSuccess(user: PublicUser) {
    setLoginOpen(false);
    setCurrentUser(user);
    await loadDashboard();
    setView('dashboard');
  }

  async function handleLogout() {
    await api.logout();
    setCurrentUser(null);
    setDashboardData(null);
    setView('landing');
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500 font-medium">Loading Global Pathways Portal...</div>
      </div>
    );
  }

  if (view === 'dashboard' && dashLoading && !dashboardData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500 font-medium">Loading workspace data...</div>
      </div>
    );
  }

  if (view === 'dashboard' && currentUser && dashboardData) {
    if (currentUser.role === 'admin' || currentUser.permissions?.includes('sub_admin')) {
      return (
        <AdminDashboard
          data={dashboardData}
          siteSettings={siteSettings}
          onSiteSettingsSaved={setSiteSettings}
          onRefresh={loadDashboard}
          onGoHome={() => setView('landing')}
          onLogout={handleLogout}
        />
      );
    }
    const permissionScopedAccess = currentUser.permissions?.some((permission) =>
      ['view_team_profiles', 'add_clients', 'edit_clients', 'delete_clients', 'print_a4', 'send_messages',
        'view_finance', 'manage_finance', 'create_staff_accounts', 'manage_user_permissions', 'view_all_reports'].includes(permission)
    );
    if (permissionScopedAccess) {
      return (
        <AdminDashboard
          data={dashboardData}
          siteSettings={siteSettings}
          onSiteSettingsSaved={setSiteSettings}
          onRefresh={loadDashboard}
          onGoHome={() => setView('landing')}
          onLogout={handleLogout}
          readOnly
        />
      );
    }
    if (
      currentUser.role === 'accounts' ||
      currentUser.permissions?.includes('view_finance') ||
      currentUser.permissions?.includes('manage_finance') ||
      currentUser.permissions?.includes('create_staff_accounts')
    ) {
      return (
        <AccountsDashboard
          data={dashboardData}
          onRefresh={loadDashboard}
          onGoHome={() => setView('landing')}
          onLogout={handleLogout}
        />
      );
    }
    if (currentUser.role === 'director' || currentUser.role === 'management') {
      return (
        <LeadershipDashboard
          data={dashboardData}
          onRefresh={loadDashboard}
          onGoHome={() => setView('landing')}
          onLogout={handleLogout}
        />
      );
    }
    return (
      <StaffDashboard
        data={dashboardData}
        onRefresh={loadDashboard}
        onGoHome={() => setView('landing')}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TopBar
        currentUser={currentUser}
        siteSettings={siteSettings}
        onOpenLogin={() => setLoginOpen(true)}
        onGoDashboard={async () => {
          if (!dashboardData) {
            await loadDashboard();
          }
          setView('dashboard');
        }}
        onGoHome={() => setView('landing')}
      />

      {(hasPartialOrInvalidSupabaseConfig || (backendUnavailable && !isSupabaseConfigured)) && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2.5 text-center text-xs font-medium text-red-800">
          Database configuration alert: {getSupabaseConfigError()} Configure{' '}
          <span className="font-mono font-semibold">VITE_SUPABASE_URL</span> and{' '}
          <span className="font-mono font-semibold">VITE_SUPABASE_PUBLISHABLE_KEY</span> in Google AI Studio Secrets or your root{' '}
          <span className="font-mono font-semibold">.env.local</span> file.
        </div>
      )}

      {dashError && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-center text-xs text-amber-800">
          {dashError}
        </div>
      )}

      <LandingPage siteSettings={siteSettings} />

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}
