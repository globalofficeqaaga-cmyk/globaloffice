import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  LogIn,
  LogOut,
  MessageSquareText,
  Pencil,
  PhoneCall,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  formatDateOnly,
  getCurrentLocalTimeStr,
  getTodayLocalDateStr,
} from '../lib/api';
import { calculateWorkedMinutes, formatMinutesWithHours } from '../lib/attendanceUtils';
import { PasswordConfirmModal } from './PasswordConfirmModal';
import type {
  AttendanceStatus,
  DailyClientSummary,
  LogOutcome,
  PublicUser,
  StaffAttendanceRecord,
  StaffDailyLog,
} from '../types';

function formatTime12h(hhmm: string): string {
  if (!hhmm) return '—';
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

function getYesterdayLocalDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getTodayLocalDateStr(d);
}

function getAttendanceStatusClass(status?: AttendanceStatus | null): string {
  switch (status) {
    case 'Present':
      return 'text-emerald-700';
    case 'Field Work':
      return 'text-blue-700';
    case 'Late':
    case 'Half Day':
      return 'text-amber-700';
    case 'Leave':
      return 'text-red-700';
    default:
      return 'text-slate-400';
  }
}

function getOutcomeTextClass(outcome: LogOutcome): string {
  switch (outcome) {
    case 'Confirmed':
    case 'Resolved':
      return 'text-emerald-700';
    case 'Interested':
    case 'Document Promised':
    case 'Payment Promised':
      return 'text-blue-700';
    case 'Not Interested':
      return 'text-red-700';
    default:
      return 'text-amber-700';
  }
}

interface DailyOperationsPanelProps {
  mode: 'team' | 'personal';
  currentUser: PublicUser;
  roster: PublicUser[];
  attendanceRecords: StaffAttendanceRecord[];
  dailyLogs: StaffDailyLog[];
  dailyClientSummaries: DailyClientSummary[];
  canManageAll: boolean;
  showAllDates?: boolean;
  onQuickCheckIn: () => Promise<void>;
  onQuickCheckOut: (existing: StaffAttendanceRecord) => Promise<void>;
  onOpenAttendanceModal: (
    record: StaffAttendanceRecord | null,
    presetStaffId?: string,
    presetDate?: string
  ) => void;
  onOpenLogModal: (log: StaffDailyLog | null, presetDate?: string) => void;
  onDeleteLog: (id: string) => Promise<void>;
  onDeleteAttendance?: (id: string) => Promise<void>;
}

export function DailyOperationsPanel({
  mode,
  currentUser,
  roster,
  attendanceRecords,
  dailyLogs,
  dailyClientSummaries,
  canManageAll,
  showAllDates = false,
  onQuickCheckIn,
  onQuickCheckOut,
  onOpenAttendanceModal,
  onOpenLogModal,
  onDeleteLog,
}: DailyOperationsPanelProps) {
  const today = getTodayLocalDateStr();
  const yesterday = getYesterdayLocalDateStr();

  const [dateFilter, setDateFilter] = useState<string>(today);
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNowMs(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (showAllDates) setDateFilter('all'); }, [showAllDates]);
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [checkingBusy, setCheckingBusy] = useState(false);
  const [pendingDeleteLog, setPendingDeleteLog] = useState<StaffDailyLog | null>(null);
  const [expandedStaffClientsId, setExpandedStaffClientsId] = useState<string | null>(null);
  const [activePopup, setActivePopup] = useState<'attendance' | 'clients' | 'followups' | 'talks' | null>(null);
  const [showAllPopupItems, setShowAllPopupItems] = useState(false);

  const isAllDates = dateFilter === 'all';
  const effectiveAttendanceDate = isAllDates ? today : dateFilter;

  const myTodayAttendance = useMemo(
    () =>
      attendanceRecords.find(
        (a) => a.staffId === currentUser.id && a.attendanceDate === today && !a.deletedAt
      ) || null,
    [attendanceRecords, currentUser.id, today]
  );

  const rosterList = useMemo(() => {
    const map = new Map<string, PublicUser>();
    roster.forEach((u) => map.set(u.id, u));
    if (!map.has(currentUser.id) && currentUser.role !== 'admin') {
      map.set(currentUser.id, currentUser);
    }
    return Array.from(map.values());
  }, [roster, currentUser]);

  const q = searchQuery.trim().toLowerCase();

  const filteredClientsForScope = useMemo(() => {
    return dailyClientSummaries.filter((c) => {
      if (mode === 'personal' && c.staffId !== currentUser.id) return false;
      if (staffFilter !== 'all' && c.staffId !== staffFilter) return false;
      if (!isAllDates && c.createdDate !== dateFilter) return false;
      if (!q) return true;
      return (
        c.clientName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.trade.toLowerCase().includes(q) ||
        c.destinationCountry.toLowerCase().includes(q) ||
        c.staffName.toLowerCase().includes(q)
      );
    });
  }, [dailyClientSummaries, mode, currentUser.id, staffFilter, isAllDates, dateFilter, q]);

  const filteredLogs = useMemo(() => {
    return dailyLogs
      .filter((l) => {
        if (mode === 'personal' && l.staffId !== currentUser.id) return false;
        if (staffFilter !== 'all' && l.staffId !== staffFilter) return false;
        if (!isAllDates && l.logDate !== dateFilter) return false;
        if (!q) return true;
        return (
          l.contactName.toLowerCase().includes(q) ||
          l.contactPhone.toLowerCase().includes(q) ||
          l.topic.toLowerCase().includes(q) ||
          l.discussionSummary.toLowerCase().includes(q) ||
          l.staffName.toLowerCase().includes(q) ||
          l.channel.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const d = (b.logDate || '').localeCompare(a.logDate || '');
        if (d !== 0) return d;
        const t = (b.logTime || '').localeCompare(a.logTime || '');
        if (t !== 0) return t;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [dailyLogs, mode, currentUser.id, staffFilter, isAllDates, dateFilter, q]);

  const teamScorecard = useMemo(() => {
    return rosterList
      .filter((member) => staffFilter === 'all' || member.id === staffFilter)
      .map((member) => {
        const att =
          attendanceRecords.find(
            (a) => a.staffId === member.id && a.attendanceDate === effectiveAttendanceDate
          ) || null;
        const addedClients = dailyClientSummaries.filter(
          (c) =>
            c.staffId === member.id &&
            (isAllDates ? true : c.createdDate === dateFilter)
        );
        const talks = dailyLogs.filter(
          (l) =>
            l.staffId === member.id &&
            (isAllDates ? true : l.logDate === dateFilter)
        );
        return {
          member,
          attendance: att,
          addedClients,
          talksCount: talks.length,
        };
      });
  }, [
    rosterList,
    staffFilter,
    attendanceRecords,
    effectiveAttendanceDate,
    dailyClientSummaries,
    isAllDates,
    dateFilter,
    dailyLogs,
  ]);

  const attendanceRowsForSearch = teamScorecard.filter((row) => !q || row.member.name.toLowerCase().includes(q) || row.member.userId.toLowerCase().includes(q));
  const presentMembers = attendanceRowsForSearch.filter((row) => row.attendance && row.attendance.status !== 'Leave');
  const absentMembers = attendanceRowsForSearch.filter((row) => !row.attendance || row.attendance.status === 'Leave');
  const presentCount = presentMembers.length;

  const myAttendanceHistory = useMemo(() => {
    return attendanceRecords
      .filter((a) => a.staffId === currentUser.id)
      .sort((a, b) => (b.attendanceDate || '').localeCompare(a.attendanceDate || ''));
  }, [attendanceRecords, currentUser.id]);

  const allFollowUps = useMemo(() => dailyLogs
    .filter((log) => {
      if (log.deletedAt || !log.nextFollowUpDate || log.outcome === 'Resolved' || log.outcome === 'Not Interested') return false;
      if (mode === 'personal' && log.staffId !== currentUser.id) return false;
      if (staffFilter !== 'all' && log.staffId !== staffFilter) return false;
      if (!isAllDates && log.nextFollowUpDate !== dateFilter) return false;
      if (!q) return true;
      return [log.contactName, log.contactPhone, log.staffName, log.topic, log.discussionSummary]
        .some((value) => (value || '').toLowerCase().includes(q));
    })
    .sort((a, b) => `${a.nextFollowUpDate}T${a.nextFollowUpTime || '23:59'}`.localeCompare(`${b.nextFollowUpDate}T${b.nextFollowUpTime || '23:59'}`)),
    [dailyLogs, mode, currentUser.id, staffFilter, isAllDates, dateFilter, q]);

  const pendingFollowUpsCount = allFollowUps.length;

  async function handleCheckInClick() {
    setCheckingBusy(true);
    try {
      await onQuickCheckIn();
    } finally {
      setCheckingBusy(false);
    }
  }

  async function handleCheckOutClick() {
    if (!myTodayAttendance) return;
    setCheckingBusy(true);
    try {
      await onQuickCheckOut(myTodayAttendance);
    } finally {
      setCheckingBusy(false);
    }
  }

  const scopeLabel =
    dateFilter === 'all'
      ? 'All Dates'
      : dateFilter === today
      ? 'Today'
      : dateFilter === yesterday
      ? 'Yesterday'
      : formatDateOnly(dateFilter);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ====================================================================
          1. MY TODAY ATTENDANCE CHECK-IN / CHECK-OUT BAR
         ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                Today&apos;s Attendance
              </h2>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {formatDateOnly(today)}
              </span>
            </div>
            {myTodayAttendance ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                <span className={`font-semibold ${getAttendanceStatusClass(myTodayAttendance.status)}`}>
                  {myTodayAttendance.status}
                </span>
                {myTodayAttendance.status !== 'Leave' && (
                  <span className="font-mono text-slate-600 tabular-nums">
                    In: {formatTime12h(myTodayAttendance.checkInTime)}
                    {myTodayAttendance.checkOutTime
                      ? ` · Out: ${formatTime12h(myTodayAttendance.checkOutTime)}`
                      : ' · On Duty'}
                  </span>
                )}
                {myTodayAttendance.workLocation && (
                  <span className="text-slate-500">· {myTodayAttendance.workLocation}</span>
                )}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-amber-700 font-medium mt-1">
                Not checked in yet today ({formatTime12h(getCurrentLocalTimeStr())} now)
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!myTodayAttendance ? (
            <button
              type="button"
              disabled={checkingBusy}
              onClick={handleCheckInClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{checkingBusy ? 'Saving...' : 'Check In Now'}</span>
            </button>
          ) : (
            !myTodayAttendance.checkOutTime &&
            myTodayAttendance.status !== 'Leave' && (
              <button
                type="button"
                disabled={checkingBusy}
                onClick={handleCheckOutClick}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{checkingBusy ? 'Saving...' : 'Check Out'}</span>
              </button>
            )
          )}

          {!myTodayAttendance ? (
            <button
              type="button"
              onClick={() => onOpenAttendanceModal(null, currentUser.id, today)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Leave / Field Work</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-500 bg-slate-100 rounded-lg">
              <Lock className="w-3.5 h-3.5" />
              <span>Attendance Locked</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => onOpenLogModal(null, isAllDates ? today : dateFilter)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="sm:hidden">Log Talk</span>
            <span className="hidden sm:inline">Log Call / Conversation</span>
          </button>
        </div>
      </div>

      {/* ====================================================================
          2. DATE SCOPE, STAFF FILTER & SEARCH BAR
         ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center border border-slate-200 rounded-lg p-1 bg-slate-50">
            <button
              type="button"
              onClick={() => setDateFilter(today)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                dateFilter === today ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilter(yesterday)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                dateFilter === yesterday
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                dateFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Dates
            </button>
          </div>

          <div className="relative">
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={isAllDates ? today : dateFilter}
              onChange={(e) => setDateFilter(e.target.value || today)}
              aria-label="Filter by date"
              className="pl-8 pr-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[34px]"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 flex-1 lg:max-w-xl lg:justify-end">
          {mode === 'team' && rosterList.length > 0 && (
            <select
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              aria-label="Filter by staff member"
              className="px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg min-h-[38px]"
            >
              <option value="all">All Staff ({rosterList.length})</option>
              {rosterList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          )}

          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contact, phone, discussion..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:bg-white min-h-[38px]"
            />
          </div>
        </div>
      </div>

      {/* ====================================================================
          3. KPI SUMMARY STRIP
         ==================================================================== */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <button type="button" onClick={() => { setShowAllPopupItems(false); setActivePopup('clients'); }} className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-3.5 sm:p-5 cursor-pointer">
          <p className="text-[11px] sm:text-xs font-medium text-slate-500">
            Clients Added ({scopeLabel})
          </p>
          <p className="font-mono text-2xl sm:text-3xl font-bold text-blue-700 tabular-nums mt-1 sm:mt-2">
            {filteredClientsForScope.length}
          </p>
          <p className="text-xs text-blue-700 mt-1.5">View List</p>
        </button>

        <button type="button" onClick={() => { setShowAllPopupItems(false); setActivePopup('talks'); }} className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-3.5 sm:p-5 cursor-pointer">
          <p className="text-[11px] sm:text-xs font-medium text-slate-500">
            Talks Logged ({scopeLabel})
          </p>
          <p className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums mt-1 sm:mt-2">
            {filteredLogs.length}
          </p>
          <p className="text-xs text-blue-700 mt-1.5">View List</p>
        </button>

        {mode === 'team' ? (
          <button type="button" onClick={() => { setShowAllPopupItems(false); setActivePopup('attendance'); }} className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-3.5 sm:p-5 cursor-pointer">
            <p className="text-[11px] sm:text-xs font-medium text-slate-500">
              Team Attendance ({isAllDates ? 'Today' : scopeLabel})
            </p>
            <p className="font-mono text-2xl sm:text-3xl font-bold text-emerald-700 tabular-nums mt-1 sm:mt-2">{presentCount} Present <span className="text-sm font-normal text-slate-500">/ {absentMembers.length} Absent</span></p>
            <p className="text-xs text-blue-700 mt-1.5">View Present &amp; Absent List</p>
          </button>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
            <p className="text-[11px] sm:text-xs font-medium text-slate-500">My Present Days</p>
            <p className="font-mono text-2xl sm:text-3xl font-bold text-emerald-700 tabular-nums mt-1 sm:mt-2">
              {myAttendanceHistory.filter((a) => a.status !== 'Leave').length}
            </p>
            <p className="hidden sm:block text-xs text-slate-500 mt-1.5">
              Total recorded duty days
            </p>
          </div>
        )}

        <button type="button" onClick={() => { setShowAllPopupItems(false); setActivePopup('followups'); }} className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-3.5 sm:p-5 cursor-pointer">
          <p className="text-[11px] sm:text-xs font-medium text-slate-500">Follow-Ups Active</p>
          <p className="font-mono text-2xl sm:text-3xl font-bold text-amber-700 tabular-nums mt-1 sm:mt-2">
            {pendingFollowUpsCount}
          </p>
          <p className="text-xs text-blue-700 mt-1.5">View List</p>
        </button>
      </div>

      {/* ====================================================================
          6. PERSONAL ATTENDANCE HISTORY (STAFF)
         ==================================================================== */}
      {mode === 'personal' && myAttendanceHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200">
            <h3 className="font-display text-sm sm:text-base font-bold text-slate-900">
              My Recent Attendance History ({myAttendanceHistory.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {myAttendanceHistory.slice(0, 14).map((att) => (
              <div
                key={att.id}
                className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatDateOnly(att.attendanceDate)}
                    </span>
                    <span className={`font-semibold ${getAttendanceStatusClass(att.status)}`}>
                      {att.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {att.workLocation || 'Office'}
                    {att.notes ? ` · ${att.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {att.status !== 'Leave' && (
                    <span className="font-mono text-xs text-slate-600 tabular-nums">
                      {formatTime12h(att.checkInTime)}
                      {att.checkOutTime ? ` – ${formatTime12h(att.checkOutTime)}` : ''}
                      {calculateWorkedMinutes(att) > 0
                        ? ` · ${formatMinutesWithHours(calculateWorkedMinutes(att))}`
                        : ''}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-500 bg-slate-100 rounded">
                    <Lock className="w-3 h-3" />
                    <span>Locked</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {activePopup && <div className="fixed inset-0 z-50 bg-slate-950/50 p-3 sm:p-6 flex items-center justify-center" role="dialog" aria-modal="true">
        <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-xl shadow-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between gap-3"><h3 className="font-bold text-slate-900">{activePopup === 'attendance' ? 'Team Attendance — Present & Absent' : activePopup === 'clients' ? 'Clients Added (' + scopeLabel + ')' : activePopup === 'followups' ? 'Active Follow-Ups' : 'Daily Conversations & Call Logs (' + filteredLogs.length + ')'}</h3>
            <div className="flex gap-2"><button type="button" onClick={() => {setActivePopup(null); onOpenLogModal(null, isAllDates ? today : dateFilter);}} className={activePopup === 'talks' ? 'px-3 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg' : 'hidden'}><Plus className="inline w-3 h-3 mr-1"/>Log Conversation</button><button type="button" onClick={() => setActivePopup(null)} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">×</button></div>
          </div>
          <div className="overflow-y-auto divide-y divide-slate-100">
            {activePopup === 'attendance' && <><div className="p-4"><p className="font-semibold text-emerald-700 mb-2">Present ({presentMembers.length})</p>{presentMembers.map(({member,attendance}) => <div key={member.id} className="py-2 flex justify-between text-sm"><span>{member.name}</span><span className={getAttendanceStatusClass(attendance?.status)}>{attendance?.status}</span></div>)}</div><div className="p-4"><p className="font-semibold text-red-700 mb-2">Absent / Leave ({absentMembers.length})</p>{absentMembers.map(({member,attendance}) => <div key={member.id} className="py-2 flex justify-between text-sm"><span>{member.name}</span><span className="text-red-700">{attendance?.status === 'Leave' ? 'Leave' : 'Absent'}</span></div>)}</div></>}
            {activePopup === 'clients' && (showAllPopupItems ? filteredClientsForScope : filteredClientsForScope.slice(0,5)).map(c => <div key={c.clientId} className="p-4"><p className="font-semibold text-sm">{c.clientName}</p><p className="text-xs text-slate-500">{c.phone} · {c.trade} · {c.destinationCountry}</p><p className="text-xs text-slate-500">{c.staffName} · {formatDateOnly(c.createdDate)}</p></div>)}
            {activePopup === 'followups' && (showAllPopupItems ? allFollowUps : allFollowUps.slice(0,5)).map(log => <div key={log.id} className="p-4 flex justify-between gap-3"><div><p className="font-semibold text-sm">{log.contactName} · {log.outcome}</p><p className="text-xs text-slate-500">{formatDateOnly(log.nextFollowUpDate)} · {log.staffName}</p><p className="text-xs">{log.topic || log.discussionSummary}</p></div><button type="button" onClick={() => {setActivePopup(null); onOpenLogModal(log);}} className="text-xs text-blue-700">Update</button></div>)}
            {activePopup === 'talks' && (showAllPopupItems ? filteredLogs : filteredLogs.slice(0,5)).map(log => <div key={log.id} className="p-4"><div className="flex justify-between gap-2"><p className="font-semibold text-sm">{log.contactName}</p><span className="text-xs">{log.outcome}</span></div><p className="text-xs text-slate-500">{log.staffName} · {formatDateOnly(log.logDate)} · {log.channel}</p><p className="text-sm mt-1">{log.topic}</p><p className="text-xs text-slate-600">{log.discussionSummary}</p></div>)}
            {((activePopup === 'clients' && filteredClientsForScope.length === 0) || (activePopup === 'followups' && allFollowUps.length === 0) || (activePopup === 'talks' && filteredLogs.length === 0)) && <p className="p-5 text-sm text-slate-500">No records found for this filter.</p>}
          </div>
          {((activePopup === 'clients' && filteredClientsForScope.length > 5) || (activePopup === 'followups' && allFollowUps.length > 5) || (activePopup === 'talks' && filteredLogs.length > 5)) && <div className="p-3 border-t text-center"><button type="button" onClick={() => setShowAllPopupItems(v => !v)} className="text-xs font-semibold text-blue-700">{showAllPopupItems ? 'See Less' : 'See More'}</button></div>}
        </div>
      </div>}
      <PasswordConfirmModal
        open={pendingDeleteLog !== null}
        title="Confirm Remove Conversation Log"
        itemLabel={
          pendingDeleteLog
            ? `Conversation with ${pendingDeleteLog.contactName} (${formatDateOnly(pendingDeleteLog.logDate)})`
            : ''
        }
        onClose={() => setPendingDeleteLog(null)}
        onConfirm={async () => {
          if (pendingDeleteLog) {
            await onDeleteLog(pendingDeleteLog.id);
          }
        }}
      />
    </div>
  );
}
