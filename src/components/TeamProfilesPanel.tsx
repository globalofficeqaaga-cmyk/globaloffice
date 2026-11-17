import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  Calendar,
  ExternalLink,
  Eye,
  MessageCircle,
  Paperclip,
  Send,
  Clock,
  FileText,
  Pencil,
  Phone,
  Search,
  Smartphone,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { api, buildWhatsAppUrl, formatDateOnly } from '../lib/api';
import { APP_IMAGES } from '../lib/assets';
import type { PublicUser, TeamDirectoryMember, TeamMessage, UserRole } from '../types';

function TeamChatModal({ currentUser, member, onClose }: { currentUser: PublicUser; member: PublicUser; onClose: () => void }) {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState('0');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const canVerifyAttachments = currentUser.role === 'admin' || currentUser.role === 'accounts' || currentUser.permissions?.includes('manage_finance') === true;
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const matches = (m: TeamMessage) =>
      (m.senderId === currentUser.id && m.recipientId === member.id) ||
      (m.senderId === member.id && m.recipientId === currentUser.id);
    const refresh = async () => {
      try {
        const rows = await api.getDirectTeamMessages(member.id, currentUser.id);
        if (!active) return;
        setMessages(rows);
        setError('');
        setLoading(false);
        await api.markDirectMessagesRead(member.id);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load chat.');
          setLoading(false);
        }
      }
    };
    void refresh();
    const unsubscribe = api.subscribeToTeamMessages(currentUser.id, {
      onMessageCreated: (msg) => {
        if (active && matches(msg)) {
          setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
          if (msg.senderId === member.id) void api.markDirectMessagesRead(member.id);
        }
      },
      onMessagesRead: (senderId, readerId, readAt) => {
        if (active && senderId === currentUser.id && readerId === member.id) {
          setMessages((prev) => prev.map((m) => m.senderId === currentUser.id ? { ...m, readAt } : m));
        }
      },
      onReconnectSync: () => { void refresh(); },
    });
    // Keep the conversation usable if Realtime is temporarily disconnected.
    const poll = window.setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; window.clearInterval(poll); unsubscribe(); };
  }, [currentUser.id, member.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if ((!body.trim() && !file) || sending) return;
    setSending(true); setError('');
    try {
      const { message } = await api.sendTeamMessage({
        recipientId: member.id,
        body,
        attachment: file,
        expiresInSeconds: Number(expiry) || null,
        clientRequestId: crypto.randomUUID(),
      });
      setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [...prev, message]);
      setBody(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message could not be sent.');
    } finally { setSending(false); }
  };

  const attestAttachment = async (messageId: string) => {
    try {
      const updated = await api.attestTeamMessageAttachment(messageId);
      setMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m));
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Attestation failed.'); }
  };

  const verifyAttachment = async (messageId: string) => {
    try {
      const updated = await api.verifyTeamMessageAttachment(messageId);
      setMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m));
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Verification failed.'); }
  };

  const openAttachment = async (path: string) => {
    try {
      const url = await api.getTeamChatFileUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to open file.'); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl h-[min(720px,92vh)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={member.photoUrl || APP_IMAGES.staffAvatarDefault} alt="" className="w-10 h-10 rounded-full object-cover"/>
            <div className="min-w-0"><h3 className="font-bold text-slate-900 truncate">Chat with {member.name}</h3><p className="text-xs text-slate-500">{member.designation}</p></div>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-600"><X className="w-5 h-5"/></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {loading && <p className="text-center text-sm text-slate-500">Loading chat…</p>}
          {!loading && messages.length === 0 && <p className="text-center text-sm text-slate-500 py-10">No messages yet. Start your conversation.</p>}
          {messages.map((m) => {
            const mine = m.senderId === currentUser.id;
            return <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm ${mine ? 'bg-blue-700 text-white rounded-br-sm' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm'}`}>
                {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                {m.attachmentPath && <>
                  <button type="button" onClick={() => void openAttachment(m.attachmentPath!)} className={`mt-2 flex items-center gap-2 text-xs underline ${mine ? 'text-blue-100' : 'text-blue-700'}`}><FileText className="w-4 h-4"/>{m.attachmentName || 'Open attachment'}</button>
                  <div className={`mt-2 flex flex-wrap items-center gap-2 text-[10px] ${mine ? 'text-blue-100' : 'text-slate-500'}`}>
                    {m.attachmentReceivedAt ? <span>Received attested</span> : !mine ? <button type="button" onClick={() => void attestAttachment(m.id)} className="rounded-md border border-current px-2 py-1 font-semibold">Attest received</button> : <span>Awaiting recipient attestation</span>}
                    {m.attachmentVerifiedAt ? <span className="font-semibold">Verified {new Date(m.attachmentVerifiedAt).toLocaleDateString()}</span> : canVerifyAttachments && m.attachmentReceivedAt ? <button type="button" onClick={() => void verifyAttachment(m.id)} className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">Verify file</button> : null}
                    {m.attachmentVerificationNote && <span>Note: {m.attachmentVerificationNote}</span>}
                  </div>
                </>}
                <div className={`mt-1 flex gap-2 text-[10px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}><span>{new Date(m.createdAt).toLocaleString()}</span>{m.expiresAt && <span>Auto-delete {new Date(m.expiresAt).toLocaleString()}</span>}{mine && m.readAt && <span>Seen</span>}</div>
              </div>
            </div>;
          })}
          <div ref={bottomRef}/>
        </div>
        {error && <p className="px-4 py-2 text-xs text-red-700 bg-red-50">{error}</p>}
        <div className="p-3 border-t border-slate-200 space-y-2">
          {file && <div className="text-xs flex items-center justify-between bg-blue-50 text-blue-800 rounded-lg px-3 py-2"><span className="truncate">{file.name} · {(file.size/1024/1024).toFixed(1)} MB</span><button type="button" onClick={() => {setFile(null); if(fileRef.current) fileRef.current.value='';}}>Remove</button></div>}
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)}/>
            <button type="button" onClick={() => fileRef.current?.click()} title="Attach file" className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600"><Paperclip className="w-4 h-4"/></button>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)} title="Auto-delete timer" className="max-w-[130px] text-xs border border-slate-200 rounded-lg px-2 py-2.5 bg-white">
              <option value="0">Keep forever</option><option value="3600">Delete in 1 hour</option><option value="86400">Delete in 24 hours</option><option value="604800">Delete in 7 days</option><option value="2592000">Delete in 30 days</option>
            </select>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={1} maxLength={2000} placeholder="Write a message…" className="flex-1 resize-none min-w-0 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            <button type="button" disabled={sending || (!body.trim() && !file)} onClick={() => void send()} className="p-3 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white"><Send className="w-4 h-4"/></button>
          </div>
          <p className="text-[10px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3"/>Timer applies to each message and attached file; max file size 20 MB.</p>
        </div>
      </div>
    </div>
  );
}

export type ProfileViewTarget = PublicUser | TeamDirectoryMember;

function formatRoleLabel(role: UserRole): string {
  if (role === 'admin') return 'Administrator';
  if (role === 'accounts') return 'Accounts (legacy)';
  if (role === 'director') return 'Director';
  if (role === 'management') return 'Management';
  return 'Staff';
}

function getRoleBadgeClass(role: UserRole): string {
  if (role === 'admin') return 'bg-slate-900 text-white';
  if (role === 'accounts') return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
  if (role === 'director') return 'bg-violet-50 text-violet-800 border border-violet-200';
  if (role === 'management') return 'bg-amber-50 text-amber-800 border border-amber-200';
  return 'bg-blue-50 text-blue-800 border border-blue-200';
}

interface UserProfileModalProps {
  member: ProfileViewTarget;
  isSelf?: boolean;
  onClose: () => void;
  onEdit?: (member: PublicUser) => void;
}

export function UserProfileModal({ member, isSelf, onClose, onEdit }: UserProfileModalProps) {
  const [coverError, setCoverError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const officialPhone = member.phone?.trim() || '';
  const personalPhone = member.personalPhone?.trim() || '';
  const whatsapp = member.whatsapp?.trim() || '';
  const socialLink = member.socialLink?.trim() || '';
  const joiningDate = member.joiningDate?.trim() || '';
  const whatsappHref = whatsapp ? buildWhatsAppUrl(whatsapp) : '';
  const fullPublicUser = 'createdAt' in member ? (member as PublicUser) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover */}
        <div className="relative h-36 bg-slate-900 overflow-hidden">
          {!coverError && member.coverUrl ? (
            <img
              src={member.coverUrl}
              alt={`${member.name} cover`}
              referrerPolicy="no-referrer"
              onError={() => setCoverError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />

          <div className="absolute top-3 left-4 flex items-center gap-2">
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded ${getRoleBadgeClass(member.role)}`}
            >
              {formatRoleLabel(member.role)}
            </span>
            {isSelf && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white/90 text-slate-800">
                You
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-slate-950/60 hover:bg-slate-950 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 pb-6">
          <div className="relative -mt-11 mb-4 flex items-end justify-between gap-3">
            <div className="w-22 h-22 rounded-2xl border-4 border-white bg-slate-100 overflow-hidden shadow-md shrink-0">
              {!avatarError && member.photoUrl ? (
                <img
                  src={member.photoUrl}
                  alt={member.name}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-600">
                  <UserCheck className="w-8 h-8" />
                </div>
              )}
            </div>

            {onEdit && fullPublicUser && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(fullPublicUser);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>
            )}
          </div>

          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">{member.name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                <span>{member.designation || 'Team Member'}</span>
              </span>
              <span className="text-slate-300">·</span>
              <span className="font-mono text-xs text-slate-500">@{member.userId}</span>
            </div>
          </div>

          {/* Info Grid */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-blue-700" />
                <span>Official Phone</span>
              </p>
              {officialPhone ? (
                <a
                  href={`tel:${officialPhone.replace(/\s+/g, '')}`}
                  className="mt-1 block font-mono text-sm font-semibold text-blue-700 hover:underline tabular-nums"
                >
                  {officialPhone}
                </a>
              ) : (
                <p className="mt-1 text-sm text-slate-400">Not set</p>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-slate-600" />
                <span>Personal Phone</span>
              </p>
              {personalPhone ? (
                <a
                  href={`tel:${personalPhone.replace(/\s+/g, '')}`}
                  className="mt-1 block font-mono text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline tabular-nums"
                >
                  {personalPhone}
                </a>
              ) : (
                <p className="mt-1 text-sm text-slate-400">Not set</p>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                <span>Joining Date</span>
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {joiningDate ? formatDateOnly(joiningDate) : 'Not set'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                <span>WhatsApp</span>
              </p>
              {whatsapp ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block font-mono text-sm font-semibold text-emerald-700 hover:underline tabular-nums"
                >
                  {whatsapp}
                </a>
              ) : (
                <p className="mt-1 text-sm text-slate-400">Not set</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2.5">
            {whatsapp && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp Chat</span>
              </a>
            )}
            {socialLink && (
              <a
                href={socialLink.startsWith('http') ? socialLink : `https://${socialLink}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
              >
                <span>Social Profile</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TeamProfilesPanelProps {
  currentUser: PublicUser;
  members: PublicUser[];
  onEditMember?: (member: PublicUser) => void;
  onEditOwnProfile?: () => void;
}

export function TeamProfilesPanel({
  currentUser,
  members,
  onEditMember,
  onEditOwnProfile,
}: TeamProfilesPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [selectedMember, setSelectedMember] = useState<PublicUser | null>(null);
  const [chatMember, setChatMember] = useState<PublicUser | null>(null);

  const normalizedMembers = useMemo(() => {
    const map = new Map<string, PublicUser>();
    members.forEach((m) => map.set(m.id, m));
    map.set(currentUser.id, currentUser);
    const weight = (r: UserRole) => (r === 'admin' ? 0 : r === 'accounts' ? 1 : 2);
    return Array.from(map.values()).sort((a, b) => {
      const diff = weight(a.role) - weight(b.role);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [members, currentUser]);

  const roleCounts = useMemo(() => {
    let admin = 0;
    let staff = 0;
    let accounts = 0;
    let directors = 0;
    let management = 0;
    for (const m of normalizedMembers) {
      if (m.role === 'admin') admin += 1;
      else if (m.role === 'accounts') accounts += 1;
      else if (m.role === 'director') directors += 1;
      else if (m.role === 'management') management += 1;
      else staff += 1;
    }
    return { total: normalizedMembers.length, admin, staff, accounts, directors, management };
  }, [normalizedMembers]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return normalizedMembers.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.userId.toLowerCase().includes(q) ||
        m.designation.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q) ||
        (m.personalPhone || '').toLowerCase().includes(q) ||
        (m.whatsapp || '').toLowerCase().includes(q)
      );
    });
  }, [normalizedMembers, roleFilter, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Header + Filter Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-700" />
              <span>Team Profiles Directory ({roleCounts.total})</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Everyone can view official phone numbers, personal phone numbers, WhatsApp, and joining dates across the team.
            </p>
          </div>
          {onEditOwnProfile && (
            <button
              type="button"
              onClick={onEditOwnProfile}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Update My Profile</span>
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, ID, designation, or phone..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:bg-white"
            />
          </div>

          <div className="inline-flex flex-wrap items-center border border-slate-200 rounded-lg p-1 bg-slate-50 self-start sm:self-auto">
            {(
              [
                { id: 'all', label: `All (${roleCounts.total})` },
                { id: 'admin', label: `Admin (${roleCounts.admin})` },
                { id: 'staff', label: `Staff (${roleCounts.staff})` },
                { id: 'accounts', label: `Accounts (${roleCounts.accounts})` },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setRoleFilter(btn.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  roleFilter === btn.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Directory Grid */}
      {filteredMembers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-12 text-center text-sm text-slate-500">
          No team members match your search or role filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredMembers.map((member) => {
            const isSelf = member.id === currentUser.id;
            const canAdminEdit = Boolean(onEditMember && member.role !== 'admin');
            return (
              <div
                key={member.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Cover */}
                  <div className="relative h-24 bg-slate-900 overflow-hidden">
                    <img
                      src={member.coverUrl || APP_IMAGES.heroMobilityAgency}
                      alt={`${member.name} cover`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
                    <div className="absolute top-2.5 left-3 flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${getRoleBadgeClass(
                          member.role
                        )}`}
                      >
                        {formatRoleLabel(member.role)}
                      </span>
                      {isSelf && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/90 text-slate-800">
                          You
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Header */}
                  <div className="px-5 pb-4">
                    <div className="relative -mt-8 mb-3 flex items-end justify-between gap-2">
                      <img
                        src={member.photoUrl || APP_IMAGES.staffAvatarDefault}
                        alt={member.name}
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-xl border-4 border-white bg-slate-100 object-cover shadow-xs shrink-0"
                      />
                      {member.joiningDate && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          <span>Joined {formatDateOnly(member.joiningDate)}</span>
                        </span>
                      )}
                    </div>

                    <h3 className="font-display text-base font-bold text-slate-900 truncate">
                      {member.name}
                    </h3>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {member.designation || 'Team Member'} ·{' '}
                      <span className="font-mono">@{member.userId}</span>
                    </p>

                    {/* Phone Details */}
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 inline-flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-blue-700" />
                          <span>Official Phone</span>
                        </span>
                        {member.phone ? (
                          <a
                            href={`tel:${member.phone.replace(/\s+/g, '')}`}
                            className="font-mono font-semibold text-blue-700 hover:underline tabular-nums"
                          >
                            {member.phone}
                          </a>
                        ) : (
                          <span className="text-slate-400">Not set</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 inline-flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-slate-600" />
                          <span>Personal Phone</span>
                        </span>
                        {member.personalPhone ? (
                          <a
                            href={`tel:${member.personalPhone.replace(/\s+/g, '')}`}
                            className="font-mono font-semibold text-slate-900 hover:text-blue-700 hover:underline tabular-nums"
                          >
                            {member.personalPhone}
                          </a>
                        ) : (
                          <span className="text-slate-400">Not set</span>
                        )}
                      </div>

                      {!member.joiningDate && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500 inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>Joining Date</span>
                          </span>
                          <span className="text-slate-400">Not set</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedMember(member)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Full Profile</span>
                    </button>
                    {!isSelf && (
                      <button type="button" onClick={() => setChatMember(member)} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md cursor-pointer">
                        <MessageCircle className="w-3 h-3" /><span>Chat</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {member.whatsapp && (
                      <a
                        href={buildWhatsAppUrl(member.whatsapp)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md"
                      >
                        <MessageCircle className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    {canAdminEdit && (
                      <button
                        type="button"
                        onClick={() => onEditMember?.(member)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {chatMember && <TeamChatModal currentUser={currentUser} member={chatMember} onClose={() => setChatMember(null)} />}
      {selectedMember && (
        <UserProfileModal
          member={selectedMember}
          isSelf={selectedMember.id === currentUser.id}
          onClose={() => setSelectedMember(null)}
          onEdit={
            selectedMember.id === currentUser.id && onEditOwnProfile
              ? () => onEditOwnProfile()
              : onEditMember && selectedMember.role !== 'admin'
              ? (m) => onEditMember(m)
              : undefined
          }
        />
      )}
    </div>
  );
}
