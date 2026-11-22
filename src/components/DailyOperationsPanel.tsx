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

  const presentMembers = teamScorecard.filter((row) => row.attendance && row.attendance.status !== 'Leave');
  const absentMembers = teamScorecard.filter((row) => !row.attendance || row.attendance.status === 'Leave');
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

  const pendingFollowUpsCount = useMemo(
    () =>
      filteredLogs.filter(
        (l) =>
          l.outcome === 'Follow Up Needed' ||
          l.outcome === 'Document Promised' ||
          l.outcome === 'Payment Promised' ||
          (l.nextFollowUpDate && l.nextFollowUpDate >= today)
      ).length,
    [filteredLogs, today]
  );

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
          4A. TEAM VIEW: STAFF ATTENDANCE & DAILY CLIENT ADD COUNT SCORECARD
         ==================================================================== */}
      {mode === 'team' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-700" />
                <span>Staff Daily Attendance &amp; Clients Added ({scopeLabel})</span>
              </h3>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                Live count of clients created per staff and daily duty attendance ({formatDateOnly(effectiveAttendanceDate)})
              </p>
            </div>
            {canManageAll && (
              <button
                type="button"
                onClick={() => onOpenAttendanceModal(null, rosterList[0]?.id || currentUser.id, effectiveAttendanceDate)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Mark Staff Attendance</span>
              </button>
            )}
          </div>

          {teamScorecard.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-500">
              No staff or accounts coordinators found.
            </div>
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {teamScorecard.map(({ member, attendance, addedClients, talksCount }) => {
                  const isExpanded = expandedStaffClientsId === member.id;
                  return (
                    <div key={member.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900 truncate">
                            {member.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {member.role === 'accounts' ? 'Accounts' : 'Staff'} · @{member.userId}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold shrink-0 ${getAttendanceStatusClass(
                            attendance?.status
                          )}`}
                        >
                          {attendance ? attendance.status : 'Not Marked'}
                        </span>
                      </div>

                      {attendance && (
                        <p className="text-xs font-mono text-slate-600 tabular-nums">
                          In {formatTime12h(attendance.checkInTime)}
                          {attendance.checkOutTime
                            ? ` · Out ${formatTime12h(attendance.checkOutTime)}`
                            : ''}
                          {attendance.workLocation ? ` · ${attendance.workLocation}` : ''}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 text-xs">
                        <div className="flex items-center gap-3 font-mono tabular-nums">
                          <span className="font-semibold text-blue-700">
                            {addedClients.length} Clients
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-semibold text-slate-800">{talksCount} Talks</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {addedClients.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedStaffClientsId(isExpanded ? null : member.id)
                              }
                              className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                            >
                              {isExpanded ? 'Hide Names' : 'See Clients'}
                            </button>
                          )}
                          {!attendance ? (
                            (canManageAll || member.id === currentUser.id) && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenAttendanceModal(null, member.id, effectiveAttendanceDate)
                                }
                                className="px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 rounded cursor-pointer"
                              >
                                Mark
                              </button>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-500 bg-slate-100 rounded">
                              <Lock className="w-3 h-3" />
                              <span>Locked</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {isExpanded && addedClients.length > 0 && (
                        <div className="bg-slate-50 rounded-lg p-2.5 space-y-1">
                          {addedClients.map((c) => (
                            <div
                              key={c.clientId}
                              className="text-xs flex items-center justify-between gap-2"
                            >
                              <span className="font-medium text-slate-800 truncate">
                                {c.clientName}
                              </span>
                              <span className="font-mono text-slate-500 shrink-0">
                                {c.destinationCountry || c.trade || c.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Team Member</th>
                      <th className="px-4 py-3 font-medium">
                        Attendance ({formatDateOnly(effectiveAttendanceDate)})
                      </th>
                      <th className="px-4 py-3 font-medium">Check-In / Out &amp; Location</th>
                      <th className="px-4 py-3 font-medium">Clients Added ({scopeLabel})</th>
                      <th className="px-4 py-3 font-medium text-right">Talks Logged</th>
                      {(canManageAll || rosterList.some((r) => r.id === currentUser.id)) && (
                        <th className="px-6 py-3 font-medium text-right">Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teamScorecard.map(({ member, attendance, addedClients, talksCount }) => (
                      <tr key={member.id} className="hover:bg-slate-50/70 align-top">
                        <td className="px-6 py-3.5">
                          <p className="font-semibold text-slate-900">{member.name}</p>
                          <p className="text-xs text-slate-500">
                            {member.role === 'accounts' ? 'Accounts Officer' : 'Staff'} · @
                            {member.userId}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${getAttendanceStatusClass(
                              attendance?.status
                            )}`}
                          >
                            {attendance ? attendance.status : 'Not Marked'}
                          </span>
                          {attendance?.notes && (
                            <p className="text-xs text-slate-500 mt-0.5 max-w-[200px] truncate">
                              {attendance.notes}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-700 font-mono tabular-nums">
                          {attendance ? (
                            <>
                              <p>
                                In: {formatTime12h(attendance.checkInTime)}
                                {attendance.checkOutTime
                                  ? ` · Out: ${formatTime12h(attendance.checkOutTime)}`
                                  : ''}
                              </p>
                              <p className="font-sans text-slate-500 mt-0.5">
                                {attendance.workLocation || 'Office'}
                              </p>
                            </>
                          ) : (
                            <span className="font-sans text-slate-400">No check-in</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-mono font-bold text-blue-700 tabular-nums">
                            {addedClients.length}{' '}
                            <span className="font-sans font-normal text-xs text-slate-500">
                              {addedClients.length === 1 ? 'client' : 'clients'}
                            </span>
                          </p>
                          {addedClients.length > 0 && (
                            <p className="text-xs text-slate-600 mt-0.5 max-w-xs">
                              {addedClients
                                .slice(0, 3)
                                .map((c) => c.clientName)
                                .join(', ')}
                              {addedClients.length > 3 ? ` +${addedClients.length - 3} more` : ''}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {talksCount}
                        </td>
                        {(canManageAll || rosterList.some((r) => r.id === currentUser.id)) && (
                          <td className="px-6 py-3.5 text-right whitespace-nowrap">
                            {!attendance ? (
                              (canManageAll || member.id === currentUser.id) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenAttendanceModal(
                                      null,
                                      member.id,
                                      effectiveAttendanceDate
                                    )
                                  }
                                  className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded cursor-pointer"
                                >
                                  Mark
                                </button>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-500 bg-slate-100 rounded">
                                <Lock className="w-3 h-3" />
                                <span>Locked</span>
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ====================================================================
          4B. PERSONAL VIEW (STAFF): CLIENTS ADDED IN SCOPE
         ==================================================================== */}
      {mode === 'personal' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-700" />
                <span>
                  Clients Added ({scopeLabel}: {filteredClientsForScope.length})
                </span>
              </h3>
            </div>
          </div>

          {filteredClientsForScope.length === 0 ? (
            <div className="px-6 py-6 text-sm text-slate-500 text-center">
              No new clients created in this date filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredClientsForScope.map((c) => (
                <div
                  key={c.clientId}
                  className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{c.clientName}</p>
                    <p className="text-xs text-slate-500 truncate">
                      <span className="font-mono">{c.phone}</span> · {c.trade || 'Trade TBD'} ·{' '}
                      {c.destinationCountry || 'TBD'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-blue-700">{c.status}</p>
                    <p className="text-xs font-mono text-slate-400 tabular-nums">
                      {formatDateOnly(c.createdDate)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          5. "KAR SATHE KI KI KOTHA HOLO" — DAILY CONVERSATION LOGS
         ==================================================================== */}
      <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-amber-100 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Call Outcome — Follow-Up Schedule</h3>
            <p className="text-xs text-slate-500 mt-0.5">All pending follow-ups with live countdown and required next action</p>
          </div>
          <span className="text-xs font-semibold text-amber-700">{allFollowUps.length} pending</span>
        </div>
        {allFollowUps.length === 0 ? <p className="px-4 sm:px-6 py-4 text-xs text-slate-500">No follow-up schedule available.</p> : (
          <div className="divide-y divide-slate-100">
            {allFollowUps.map((log) => {
              const dueAt = new Date(`${log.nextFollowUpDate}T${log.nextFollowUpTime || '23:59'}:00`).getTime();
              const diff = dueAt - nowMs;
              const expired = diff <= 0;
              const seconds = Math.max(0, Math.floor(diff / 1000));
              const countdown = expired ? 'TIME EXPIRED' : `${Math.floor(seconds / 86400)}d ${String(Math.floor((seconds % 86400) / 3600)).padStart(2,'0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
              return <div key={log.id} className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{log.contactName} · {log.outcome}</p>
                  <p className="text-xs text-slate-500">{formatDateOnly(log.nextFollowUpDate)} · {log.nextFollowUpTime ? formatTime12h(log.nextFollowUpTime) : '11:59 PM'}{mode === 'team' ? ` · ${log.staffName}` : ''}</p>
                  {log.topic && <p className="text-xs text-slate-600 mt-0.5 truncate">Next action: {log.topic}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`font-mono text-lg sm:text-xl font-bold tabular-nums ${expired ? 'text-red-700' : 'text-amber-700'}`}>{countdown}</span>
                  <button type="button" onClick={() => onOpenLogModal(log)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800">Update Log</button>
                </div>
              </div>;
            })}
          </div>
        )}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-blue-700" />
              <span>Daily Conversations &amp; Call Logs ({filteredLogs.length})</span>
            </h3>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Detailed log of who each staff member spoke with, discussion notes, and next follow-up
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenLogModal(null, isAllDates ? today : dateFilter)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Conversation</span>
          </button>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              No daily calls or conversations recorded for {scopeLabel.toLowerCase()}.
            </p>
            <button
              type="button"
              onClick={() => onOpenLogModal(null, isAllDates ? today : dateFilter)}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Log First Conversation</span>
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Stacked Cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const canModify = canManageAll || log.staffId === currentUser.id;
                return (
                  <div key={log.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900 truncate">
                          {log.contactName}
                        </p>
                        <p className="text-xs font-mono text-slate-500 tabular-nums">
                          {[
                            log.contactPhone,
                            log.channel,
                            formatDateOnly(log.logDate),
                            log.logTime ? formatTime12h(log.logTime) : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${getOutcomeTextClass(
                          log.outcome
                        )}`}
                      >
                        {log.outcome}
                      </span>
                    </div>

                    {mode === 'team' && (
                      <p className="text-xs text-slate-500">
                        Coordinator: <span className="font-medium text-slate-700">{log.staffName}</span>
                      </p>
                    )}

                    {log.topic && (
                      <p className="text-xs font-semibold text-slate-800">{log.topic}</p>
                    )}

                    <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                      {log.discussionSummary}
                    </p>
                    {!!log.editHistory?.length && <p className="text-[11px] text-slate-500">Edit history dates: {Array.from(new Set(log.editHistory.map((h) => new Date(h.changedAt).toLocaleDateString()))).join(' · ')}</p>}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        {log.nextFollowUpDate
                          ? `Follow-up: ${formatDateOnly(log.nextFollowUpDate)}${log.nextFollowUpTime ? ` · ${formatTime12h(log.nextFollowUpTime)}` : ''}`
                          : 'No follow-up date'}
                      </span>
                      {canModify && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenLogModal(log)}
                            className="p-1.5 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                            title="Edit log"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteLog(log)}
                            className="p-1.5 text-slate-500 hover:text-red-600 rounded cursor-pointer"
                            title="Delete log"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date &amp; Time</th>
                    {mode === 'team' && <th className="px-4 py-3 font-medium">Staff</th>}
                    <th className="px-4 py-3 font-medium">Person Spoken With</th>
                    <th className="px-4 py-3 font-medium">Topic &amp; Discussion Summary</th>
                    <th className="px-4 py-3 font-medium">Outcome &amp; Follow-Up</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map((log) => {
                    const canModify = canManageAll || log.staffId === currentUser.id;
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/70 align-top">
                        <td className="px-6 py-3.5 whitespace-nowrap">
                          <p className="font-mono text-xs text-slate-800 tabular-nums">
                            {formatDateOnly(log.logDate)}
                          </p>
                          <p className="font-mono text-xs text-slate-500 tabular-nums mt-0.5">
                            {log.logTime ? formatTime12h(log.logTime) : '—'}
                          </p>
                        </td>
                        {mode === 'team' && (
                          <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                            {log.staffName || 'Coordinator'}
                          </td>
                        )}
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-900">{log.contactName}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">
                            {[log.contactPhone, log.channel].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 max-w-md">
                          {log.topic && (
                            <p className="text-xs font-semibold text-slate-900 mb-0.5">
                              {log.topic}
                            </p>
                          )}
                          <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                            {log.discussionSummary}
                          </p>
                          {!!log.editHistory?.length && <p className="text-[11px] text-slate-500 mt-1">Edited on: {Array.from(new Set(log.editHistory.map((h) => new Date(h.changedAt).toLocaleDateString()))).join(' · ')}</p>}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${getOutcomeTextClass(log.outcome)}`}
                          >
                            {log.outcome}
                          </span>
                          {log.nextFollowUpDate && (
                            <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                              Next: {formatDateOnly(log.nextFollowUpDate)}{log.nextFollowUpTime ? ` · ${formatTime12h(log.nextFollowUpTime)}` : ''}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          {canModify ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenLogModal(log)}
                                className="p-1.5 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                                title="Edit conversation log"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteLog(log)}
                                className="p-1.5 text-slate-500 hover:text-red-600 rounded ml-1 cursor-pointer"
                                title="Archive conversation log"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">View Only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
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
