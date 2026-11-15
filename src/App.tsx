import { useCallback, useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { LandingPage } from './components/LandingPage';
import { LoginModal } from './components/LoginModal';
import { StaffDashboard } from './components/StaffDashboard';
import { TopBar } from './components/TopBar';
import { api, getAuthToken, setAuthToken } from './lib/api';
import { supabase } from './lib/supabase';
import type { DashboardData, PublicUser } from './types';

export default function App() {
  const [view, setView] = useState<'landing' | 'dashboard'>('landing');
  const [loginOpen, setLoginOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState('');

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

      // Local dev Express session restore
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
    if (currentUser.role === 'admin') {
      return (
        <AdminDashboard
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
        onOpenLogin={() => setLoginOpen(true)}
        onGoDashboard={async () => {
          if (!dashboardData) {
            await loadDashboard();
          }
          setView('dashboard');
        }}
        onGoHome={() => setView('landing')}
      />

      {dashError && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-center text-xs text-amber-800">
          {dashError}
        </div>
      )}

      <LandingPage />

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}
