import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  MessageSquare,
  Search,
  Send,
  User,
  Users,
  X,
} from 'lucide-react';
import { APP_IMAGES } from '../lib/assets';
import type { PublicUser, TeamDirectoryMember, TeamMessage, UserRole } from '../types';
import { UserProfileModal } from './TeamProfilesPanel';

export const TEAM_GROUP_THREAD_ID = '__team_group__';

interface TeamMessengerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: PublicUser;
  directory: TeamDirectoryMember[];
  messages: TeamMessage[];
  schemaMissing?: boolean;
  realtimeConnected: boolean;
  unreadBySender: Record<string, number>;
  unreadGroupCount: number;
  onSendMessage: (recipientId: string | null, body: string) => Promise<void>;
  onMarkDirectRead: (senderId: string) => void;
  onMarkGroupSeen: () => void;
}

function formatRoleLabel(role: UserRole): string {
  if (role === 'admin') return 'Admin';
  if (role === 'accounts') return 'Accounts';
  return 'Staff';
}

function getRoleBadgeClass(role: UserRole): string {
  if (role === 'admin') return 'bg-slate-900 text-white';
  if (role === 'accounts') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  return 'bg-blue-50 text-blue-700 border border-blue-200';
}

function formatMessageTime(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function TeamMessenger({
  isOpen,
  onClose,
  currentUser,
  directory,
  messages,
  schemaMissing = false,
  realtimeConnected,
  unreadBySender,
  unreadGroupCount,
  onSendMessage,
  onMarkDirectRead,
  onMarkGroupSeen,
}: TeamMessengerProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string>(TEAM_GROUP_THREAD_ID);
  const [mobilePane, setMobilePane] = useState<'list' | 'chat'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [profileMember, setProfileMember] = useState<TeamDirectoryMember | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const memberMap = useMemo(() => {
    const map = new Map<string, TeamDirectoryMember>();
    for (const member of directory) {
      map.set(member.id, member);
    }
    return map;
  }, [directory]);

  const otherMembers = useMemo(
    () => directory.filter((m) => m.id !== currentUser.id),
    [directory, currentUser.id]
  );

  // Sort contacts: unread first, then most recent activity, then alphabetical
  const sortedContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = otherMembers.filter((m) => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.userId.toLowerCase().includes(q) ||
        m.designation.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
      );
    });

    const getLastTimestamp = (memberId: string): number => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (
          (m.senderId === currentUser.id && m.recipientId === memberId) ||
          (m.senderId === memberId && m.recipientId === currentUser.id)
        ) {
          return new Date(m.createdAt).getTime() || 0;
        }
      }
      return 0;
    };

    return [...filtered].sort((a, b) => {
      const unreadA = unreadBySender[a.id] || 0;
      const unreadB = unreadBySender[b.id] || 0;
      if (unreadA !== unreadB) return unreadB - unreadA;
      const tsA = getLastTimestamp(a.id);
      const tsB = getLastTimestamp(b.id);
      if (tsA !== tsB) return tsB - tsA;
      return a.name.localeCompare(b.name);
    });
  }, [otherMembers, searchQuery, messages, currentUser.id, unreadBySender]);

  const groupMessages = useMemo(
    () => messages.filter((m) => m.recipientId === null),
    [messages]
  );

  const activeThreadMessages = useMemo(() => {
    if (selectedThreadId === TEAM_GROUP_THREAD_ID) {
      return groupMessages;
    }
    return messages.filter(
      (m) =>
        (m.senderId === currentUser.id && m.recipientId === selectedThreadId) ||
        (m.senderId === selectedThreadId && m.recipientId === currentUser.id)
    );
  }, [selectedThreadId, groupMessages, messages, currentUser.id]);

  const activePartner =
    selectedThreadId === TEAM_GROUP_THREAD_ID
      ? null
      : memberMap.get(selectedThreadId) || null;

  const getLastDirectMessage = (memberId: string): TeamMessage | undefined => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (
        (m.senderId === currentUser.id && m.recipientId === memberId) ||
        (m.senderId === memberId && m.recipientId === currentUser.id)
      ) {
        return m;
      }
    }
    return undefined;
  };

  // Mark messages read when viewing a thread while open
  useEffect(() => {
    if (!isOpen) return;
    if (selectedThreadId === TEAM_GROUP_THREAD_ID) {
      onMarkGroupSeen();
      return;
    }
    if ((unreadBySender[selectedThreadId] || 0) > 0) {
      onMarkDirectRead(selectedThreadId);
    }
  }, [
    isOpen,
    selectedThreadId,
    unreadBySender,
    activeThreadMessages.length,
    onMarkDirectRead,
    onMarkGroupSeen,
  ]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (!isOpen) return;
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isOpen, selectedThreadId, activeThreadMessages.length, mobilePane]);

  if (!isOpen) return null;

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setMobilePane('chat');
    setSendError('');
    if (threadId === TEAM_GROUP_THREAD_ID) {
      onMarkGroupSeen();
    } else if ((unreadBySender[threadId] || 0) > 0) {
      onMarkDirectRead(threadId);
    }
    setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean || sending) return;

    setSending(true);
    setSendError('');
    try {
      const recipientId =
        selectedThreadId === TEAM_GROUP_THREAD_ID ? null : selectedThreadId;
      await onSendMessage(recipientId, clean);
      setDraft('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const lastGroupMsg = groupMessages[groupMessages.length - 1];

  return (
    <div
      className="fixed inset-0 z-50 bg-white sm:bg-slate-950/60 sm:p-4 sm:flex sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Office Team Messenger"
    >
      <div className="w-full h-[100dvh] sm:h-[640px] sm:max-h-[88vh] sm:max-w-4xl bg-white sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-2xl flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Team Messenger
              </h2>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    realtimeConnected ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                />
                <span>
                  {realtimeConnected ? 'Live sync active' : 'Syncing messages...'}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close messenger"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {schemaMissing && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-900 shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Supabase Team Messaging Table Required</p>
              <p className="text-amber-800 mt-0.5">
                Run the updated <span className="font-mono font-semibold">supabase/setup_all.sql</span> script in your Supabase SQL Editor to enable live messaging across Admin, Accounts, and Staff.
              </p>
            </div>
          </div>
        )}

        {/* Split Body: Left Contacts List / Right Active Thread */}
        <div className="flex-1 min-h-0 flex">
          {/* Contacts / Channels Pane */}
          <aside
            className={`${
              mobilePane === 'list' ? 'flex' : 'hidden'
            } sm:flex w-full sm:w-72 md:w-80 border-r border-slate-200 flex-col bg-slate-50/70 min-h-0`}
          >
            <div className="p-3 border-b border-slate-200 bg-white shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search team member..."
                  className="w-full pl-9 pr-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {/* All Team Office Group Channel */}
              <button
                type="button"
                onClick={() => handleSelectThread(TEAM_GROUP_THREAD_ID)}
                className={`w-full text-left px-3.5 py-3 min-h-[64px] flex items-center gap-3 transition-colors cursor-pointer ${
                  selectedThreadId === TEAM_GROUP_THREAD_ID
                    ? 'bg-blue-50/90 border-l-4 border-l-blue-600'
                    : 'hover:bg-white'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      All Team Group
                    </span>
                    {unreadGroupCount > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        {unreadGroupCount > 99 ? '99+' : unreadGroupCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {lastGroupMsg
                      ? `${memberMap.get(lastGroupMsg.senderId)?.name || 'Member'}: ${lastGroupMsg.body}`
                      : 'Office-wide announcements & chat'}
                  </p>
                </div>
              </button>

              {/* Individual Team Members (Admin, Accounts, Staff) */}
              {sortedContacts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  {otherMembers.length === 0
                    ? 'No other team accounts found yet.'
                    : 'No team member matches your search.'}
                </div>
              ) : (
                sortedContacts.map((member) => {
                  const isSelected = selectedThreadId === member.id;
                  const unreadCount = unreadBySender[member.id] || 0;
                  const lastMsg = getLastDirectMessage(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => handleSelectThread(member.id)}
                      className={`w-full text-left px-3.5 py-3 min-h-[64px] flex items-center gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/90 border-l-4 border-l-blue-600'
                          : 'hover:bg-white'
                      }`}
                    >
                      <img
                        src={member.photoUrl || APP_IMAGES.staffAvatarDefault}
                        alt={member.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-slate-200 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {member.name}
                          </span>
                          {unreadCount > 0 ? (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          ) : (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${getRoleBadgeClass(
                                member.role
                              )} shrink-0`}
                            >
                              {formatRoleLabel(member.role)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {lastMsg
                            ? `${lastMsg.senderId === currentUser.id ? 'You: ' : ''}${lastMsg.body}`
                            : `@${member.userId} · ${member.designation}`}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Active Chat Pane */}
          <section
            className={`${
              mobilePane === 'chat' ? 'flex' : 'hidden'
            } sm:flex flex-1 flex-col min-w-0 min-h-0 bg-slate-50`}
          >
            {/* Active Partner Header */}
            <div className="px-3 sm:px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setMobilePane('list')}
                aria-label="Back to conversations"
                className="sm:hidden min-w-[44px] min-h-[44px] -ml-1 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {selectedThreadId === TEAM_GROUP_THREAD_ID ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      All Team Group
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {directory.length} team {directory.length === 1 ? 'member' : 'members'} (Admin, Accounts & Staff)
                    </p>
                  </div>
                </div>
              ) : activePartner ? (
                <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={activePartner.photoUrl || APP_IMAGES.staffAvatarDefault}
                      alt={activePartner.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {activePartner.name}
                        </p>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${getRoleBadgeClass(
                            activePartner.role
                          )}`}
                        >
                          {formatRoleLabel(activePartner.role)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        @{activePartner.userId} · {activePartner.designation}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileMember(activePartner)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer shrink-0"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">View Profile</span>
                    <span className="sm:hidden">Profile</span>
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a team member to chat</p>
              )}
            </div>

            {/* Message History */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
              {activeThreadMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-10">
                  <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    {selectedThreadId === TEAM_GROUP_THREAD_ID
                      ? 'Start the team conversation'
                      : `Message ${activePartner?.name || 'team member'}`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Messages are delivered in real time across Admin, Accounts, and Staff dashboards.
                  </p>
                </div>
              ) : (
                activeThreadMessages.map((msg) => {
                  const isMine = msg.senderId === currentUser.id;
                  const sender = memberMap.get(msg.senderId);
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      {!isMine && selectedThreadId === TEAM_GROUP_THREAD_ID && (
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-[11px] font-semibold text-slate-700">
                            {sender?.name || 'Team Member'}
                          </span>
                          {sender && (
                            <span
                              className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${getRoleBadgeClass(
                                sender.role
                              )}`}
                            >
                              {formatRoleLabel(sender.role)}
                            </span>
                          )}
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words shadow-xs ${
                          isMine
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-white text-slate-900 border border-slate-200 rounded-bl-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                        <div
                          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                            isMine ? 'text-blue-100' : 'text-slate-400'
                          }`}
                        >
                          <span>{formatMessageTime(msg.createdAt)}</span>
                          {isMine && selectedThreadId !== TEAM_GROUP_THREAD_ID && (
                            msg.readAt ? (
                              <CheckCheck className="w-3.5 h-3.5 text-blue-100" aria-label="Seen" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-blue-200" aria-label="Sent" />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={scrollAnchorRef} />
            </div>

            {/* Sticky Bottom Message Composer */}
            <div className="p-2.5 sm:p-3 bg-white border-t border-slate-200 shrink-0">
              {sendError && (
                <p className="text-xs text-red-600 mb-2 px-1 font-medium">{sendError}</p>
              )}
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={2000}
                  disabled={schemaMissing}
                  placeholder={
                    selectedThreadId === TEAM_GROUP_THREAD_ID
                      ? 'Message everyone in office...'
                      : `Message ${activePartner?.name || 'team member'}...`
                  }
                  className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 text-base sm:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending || schemaMissing}
                  aria-label="Send message"
                  className="min-w-[44px] min-h-[44px] px-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium text-sm inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">{sending ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>

      {profileMember && (
        <UserProfileModal
          member={profileMember}
          isSelf={profileMember.id === currentUser.id}
          onClose={() => setProfileMember(null)}
        />
      )}
    </div>
  );
}
