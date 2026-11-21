import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, LogOut, Menu, MessageSquare, WifiOff, X } from 'lucide-react';
import { api } from '../lib/api';
import { APP_IMAGES } from '../lib/assets';
import type { PublicUser, TeamDirectoryMember, TeamMessage } from '../types';
import { TeamMessenger } from './TeamMessenger';
import { TeamCallProvider } from './TeamCallProvider';

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

function getGroupSeenStorageKey(userId: string): string {
  return `gp_group_chat_seen_${userId}`;
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
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [directory, setDirectory] = useState<TeamDirectoryMember[]>([]);
  const [teamMessages, setTeamMessages] = useState<TeamMessage[]>([]);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [groupLastSeenAt, setGroupLastSeenAt] = useState<string>(() => {
    try {
      return localStorage.getItem(getGroupSeenStorageKey(user.id)) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    try {
      setGroupLastSeenAt(localStorage.getItem(getGroupSeenStorageKey(user.id)) || '');
    } catch {
      setGroupLastSeenAt('');
    }
  }, [user.id]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await api.getTeamMessages();
      setDirectory(res.directory);
      setTeamMessages(res.messages);
      setSchemaMissing(Boolean(res.schemaMissing));
    } catch {
      // Keep existing state on transient errors
    }
  }, []);

  const mergeIncomingMessage = useCallback((incoming: TeamMessage) => {
    setTeamMessages((prev) => {
      const idx = prev.findIndex(
        (m) =>
          m.id === incoming.id ||
          (Boolean(incoming.clientRequestId) && m.clientRequestId === incoming.clientRequestId)
      );
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = incoming;
        return next;
      }
      return [...prev, incoming];
    });
  }, []);

  useEffect(() => {
    void loadMessages();
    const unsubscribe = api.subscribeToTeamMessages(user.id, {
      onMessageCreated: (msg) => {
        mergeIncomingMessage(msg);
      },
      onMessagesRead: (senderId, readerId, readAt) => {
        setTeamMessages((prev) =>
          prev.map((m) =>
            m.senderId === senderId && m.recipientId === readerId && !m.readAt
              ? { ...m, readAt }
              : m
          )
        );
      },
      onMessageUpdated: (msg) => mergeIncomingMessage(msg),
      onMessageDeleted: (messageId) => setTeamMessages((prev) => prev.filter((m) => m.id !== messageId)),
      onReconnectSync: () => {
        void loadMessages();
      },
      onStatusChange: (connected) => {
        setRealtimeConnected(connected);
      },
    });
    return () => {
      unsubscribe();
    };
  }, [user.id, loadMessages, mergeIncomingMessage]);

  const handleSendMessage = useCallback(
    async (recipientId: string | null, body: string, attachment: File | null, expiresInSeconds: number | null) => {
      const clientRequestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const { message } = await api.sendTeamMessage({
        recipientId,
        body,
        clientRequestId,
        attachment,
        expiresInSeconds,
      });
      mergeIncomingMessage(message);
    },
    [mergeIncomingMessage]
  );

  const handleAttestAttachment = useCallback(async (messageId: string) => {
    const updated = await api.attestTeamMessageAttachment(messageId);
    mergeIncomingMessage(updated);
  }, [mergeIncomingMessage]);

  const handleVerifyAttachment = useCallback(async (messageId: string) => {
    const updated = await api.verifyTeamMessageAttachment(messageId);
    mergeIncomingMessage(updated);
  }, [mergeIncomingMessage]);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    await api.deleteTeamMessage(messageId);
    setTeamMessages((prev) => prev.filter((message) => message.id !== messageId));
  }, []);

  const handleOpenAttachment = useCallback(async (path: string) => {
    const url = await api.getTeamChatFileUrl(path);
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleMarkDirectRead = useCallback(
    (senderId: string) => {
      const now = new Date().toISOString();
      setTeamMessages((prev) =>
        prev.map((m) =>
          m.senderId === senderId && m.recipientId === user.id && !m.readAt
            ? { ...m, readAt: now }
            : m
        )
      );
      void api.markDirectMessagesRead(senderId).catch(() => {
        // Retry naturally on next thread open or sync
      });
    },
    [user.id]
  );

  const handleMarkGroupSeen = useCallback(() => {
    const now = new Date().toISOString();
    setGroupLastSeenAt(now);
    try {
      localStorage.setItem(getGroupSeenStorageKey(user.id), now);
    } catch {
      // Ignore storage quota issues
    }
  }, [user.id]);

  const unreadBySender = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of teamMessages) {
      if (m.recipientId === user.id && !m.readAt) {
        counts[m.senderId] = (counts[m.senderId] || 0) + 1;
      }
    }
    return counts;
  }, [teamMessages, user.id]);

  const unreadGroupCount = useMemo(() => {
    const seenTs = groupLastSeenAt ? new Date(groupLastSeenAt).getTime() : 0;
    let count = 0;
    for (const m of teamMessages) {
      if (m.recipientId === null && m.senderId !== user.id) {
        const msgTs = new Date(m.createdAt).getTime() || 0;
        if (msgTs > seenTs) {
          count += 1;
        }
      }
    }
    return count;
  }, [teamMessages, user.id, groupLastSeenAt]);

  const totalUnreadCount = useMemo(() => {
    const directTotal = Object.values(unreadBySender).reduce((acc, n) => acc + n, 0);
    return directTotal + unreadGroupCount;
  }, [unreadBySender, unreadGroupCount]);

  const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label || 'Overview';

  const openMessenger = () => {
    setMobileNavOpen(false);
    setMessengerOpen(true);
    void loadMessages();
  };

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

        <div className="pt-2 mt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={openMessenger}
            className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="inline-flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4" />
              <span>Team Messages</span>
            </span>
            {totalUnreadCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-2">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <img
            src={user.photoUrl || APP_IMAGES.staffAvatarDefault}
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
    <TeamCallProvider currentUser={user}>
    <div className="min-h-screen bg-slate-50 flex dashboard-shell-root">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[256px] shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen no-print">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
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
      <div className="flex-1 min-w-0 flex flex-col dashboard-main-viewport">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-3 no-print">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer -ml-1"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 truncate">
              <span className="hidden sm:inline">{roleLabel}</span>
              <span className="hidden sm:inline mx-2 text-slate-300">/</span>
              <span className="font-semibold text-slate-900">{activeTabLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openMessenger}
              aria-label="Open team messages"
              title="Team Messages"
              className="relative min-w-[42px] min-h-[42px] px-2.5 sm:px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-700 inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="hidden md:inline text-xs font-semibold">Messages</span>
              {totalUnreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </span>
              )}
            </button>

            {primaryAction && <div className="shrink-0">{primaryAction}</div>}
          </div>
        </header>

        {!isOnline && (
          <div className="bg-red-50 border-b border-red-200 px-4 sm:px-6 py-2.5 flex items-center gap-2 text-xs font-medium text-red-800 no-print">
            <WifiOff className="w-4 h-4 text-red-700 shrink-0" />
            <span>
              Offline mode — changes will confirm once connected.
            </span>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto dashboard-main-content">{children}</main>
      </div>

      <TeamMessenger
        isOpen={messengerOpen}
        onClose={() => setMessengerOpen(false)}
        currentUser={user}
        directory={directory}
        messages={teamMessages}
        schemaMissing={schemaMissing}
        realtimeConnected={realtimeConnected}
        unreadBySender={unreadBySender}
        unreadGroupCount={unreadGroupCount}
        onSendMessage={handleSendMessage}
        onAttestAttachment={handleAttestAttachment}
        onVerifyAttachment={handleVerifyAttachment}
        onDeleteMessage={handleDeleteMessage}
        onOpenAttachment={handleOpenAttachment}
        onMarkDirectRead={handleMarkDirectRead}
        onMarkGroupSeen={handleMarkGroupSeen}
      />
    </div>
    </TeamCallProvider>
  );
}
