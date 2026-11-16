import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  Clock,
  Lock,
  Printer,
  Users,
} from 'lucide-react';
import { formatDateOnly, getTodayLocalDateStr } from '../lib/api';
import {
  computeAttendanceReport,
  formatMinutesShort,
  formatMinutesWithHours,
  formatTime12h,
  getMonthStartDateStr,
  getPreviousMonthRange,
  shiftDateStr,
} from '../lib/attendanceUtils';
import type { AttendanceStatus, PublicUser, StaffAttendanceRecord } from '../types';

type PeriodPreset = 'this_month' | 'last_month' | 'last_7' | 'today' | 'custom';

interface AttendanceOverviewPanelProps {
  currentUser: PublicUser;
  roster: PublicUser[];
  attendanceRecords: StaffAttendanceRecord[];
  title?: string;
  subtitle?: string;
  defaultOpenDailyLog?: boolean;
}

function getStatusBadgeClass(status: AttendanceStatus): string {
  switch (status) {
    case 'Present':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Field Work':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Late':
    case 'Half Day':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Leave':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function AttendanceOverviewPanel({
  currentUser,
  roster,
  attendanceRecords,
  title = 'Team Attendance Overview & Working Minutes Report',
  subtitle = 'Immutable daily attendance summary — Present, Absent, Leave, Worked Minutes (m), Late Minutes (m) & A4 Print',
  defaultOpenDailyLog = true,
}: AttendanceOverviewPanelProps) {
  const todayStr = getTodayLocalDateStr();
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState<string>(() => getMonthStartDateStr(todayStr));
  const [customEnd, setCustomEnd] = useState<string>(todayStr);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [officeStartTime, setOfficeStartTime] = useState<string>(() => {
    try {
      return localStorage.getItem('gp_office_start_time') || '09:30';
    } catch {
      return '09:30';
    }
  });
  const [includeFridays, setIncludeFridays] = useState<boolean>(false);
  const [showDailyLog, setShowDailyLog] = useState<boolean>(defaultOpenDailyLog);

  useEffect(() => {
    try {
      localStorage.setItem('gp_office_start_time', officeStartTime);
    } catch {
      // Ignore storage quota errors
    }
  }, [officeStartTime]);

  useEffect(() => {
    const cleanup = () => {
      document.body.classList.remove('printing-attendance-a4');
    };
    window.addEventListener('afterprint', cleanup);
    return () => {
      window.removeEventListener('afterprint', cleanup);
      cleanup();
    };
  }, []);

  const { startDate, endDate } = useMemo(() => {
    if (periodPreset === 'today') {
      return { startDate: todayStr, endDate: todayStr };
    }
    if (periodPreset === 'last_7') {
      return { startDate: shiftDateStr(todayStr, -6), endDate: todayStr };
    }
    if (periodPreset === 'last_month') {
      return getPreviousMonthRange(todayStr);
    }
    if (periodPreset === 'custom') {
      const s = customStart || todayStr;
      const e = customEnd && customEnd >= s ? customEnd : s;
      return { startDate: s, endDate: e };
    }
    return { startDate: getMonthStartDateStr(todayStr), endDate: todayStr };
  }, [periodPreset, todayStr, customStart, customEnd]);

  const sortedRoster = useMemo(() => {
    const map = new Map<string, PublicUser>();
    roster.forEach((m) => map.set(m.id, m));
    if (!map.has(currentUser.id)) map.set(currentUser.id, currentUser);
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [roster, currentUser]);

  const scopedMembers = useMemo(() => {
    if (selectedStaffId === 'all') return sortedRoster;
    const match = sortedRoster.filter((m) => m.id === selectedStaffId);
    return match.length > 0 ? match : sortedRoster;
  }, [sortedRoster, selectedStaffId]);

  const report = useMemo(
    () =>
      computeAttendanceReport({
        members: scopedMembers,
        records: attendanceRecords,
        startDate,
        endDate,
        todayStr,
        officeStartTime,
        includeFridays,
      }),
    [scopedMembers, attendanceRecords, startDate, endDate, todayStr, officeStartTime, includeFridays]
  );

  const selectedMemberObj =
    selectedStaffId === 'all'
      ? null
      : sortedRoster.find((m) => m.id === selectedStaffId) || null;

  function triggerA4Print(staffIdToPrint?: string) {
    if (staffIdToPrint && staffIdToPrint !== selectedStaffId) {
      setSelectedStaffId(staffIdToPrint);
    }
    setShowDailyLog(true);
    document.body.classList.add('printing-attendance-a4');
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        document.body.classList.remove('printing-attendance-a4');
      }, 1500);
    }, 80);
  }

  const periodTitle =
    startDate === endDate
      ? formatDateOnly(startDate)
      : `${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`;

  return (
    <section
      id="attendance-a4-print-sheet"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Print-Only Official A4 Header */}
      <div className="print-only-block pb-4 mb-4 border-b-2 border-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600">
              Global Pathways Overseas Ltd
            </p>
            <h1 className="font-display text-xl font-bold text-slate-900 mt-0.5">
              Official Staff Attendance &amp; Working Minutes Report (A4)
            </h1>
            <p className="text-xs text-slate-700 mt-1">
              Scope:{' '}
              <span className="font-semibold">
                {selectedMemberObj
                  ? `${selectedMemberObj.name} (${selectedMemberObj.designation || selectedMemberObj.role} · @${selectedMemberObj.userId})`
                  : `All Team Members (${scopedMembers.length})`}
              </span>
            </p>
          </div>
          <div className="text-right text-xs text-slate-700 font-mono space-y-0.5 shrink-0">
            <p>
              Period: <span className="font-semibold">{periodTitle}</span>
            </p>
            <p>
              Office Start: <span className="font-semibold">{formatTime12h(officeStartTime)}</span> ·{' '}
              {includeFridays ? 'All Days' : 'Fri Off'}
            </p>
            <p>
              Printed By: <span className="font-semibold">{currentUser.name}</span> ({currentUser.role})
            </p>
            <p>Generated: {formatDateOnly(todayStr)}</p>
          </div>
        </div>
      </div>

      {/* Screen Header & Print Actions */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-blue-700 shrink-0" />
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              {title}
            </h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-700 rounded">
              <Lock className="w-3 h-3" />
              <span>Edit Locked</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowDailyLog((prev) => !prev)}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
          >
            {showDailyLog ? 'Hide Daily Log' : `Show Daily Log (${report.dailyRows.length})`}
          </button>
          <button
            type="button"
            onClick={() => triggerA4Print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>
              Print A4 {selectedMemberObj ? `(${selectedMemberObj.name.split(' ')[0]})` : '(All Team)'}
            </span>
          </button>
        </div>
      </div>

      {/* Filter Bar (Screen Only) */}
      <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-col xl:flex-row gap-3 xl:items-center justify-between no-print">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center border border-slate-200 rounded-lg p-1 bg-white">
            {[
              { id: 'this_month' as const, label: 'This Month' },
              { id: 'last_month' as const, label: 'Last Month' },
              { id: 'last_7' as const, label: '7 Days' },
              { id: 'today' as const, label: 'Today' },
              { id: 'custom' as const, label: 'Custom' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodPreset(p.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  periodPreset === p.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {periodPreset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                aria-label="Start date"
                className="px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                aria-label="End date"
                className="px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              aria-label="Select team member for attendance report"
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-medium text-slate-800"
            >
              <option value="all">All Team Members ({sortedRoster.length})</option>
              {sortedRoster.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={officeStartTime}
              onChange={(e) => setOfficeStartTime(e.target.value)}
              aria-label="Office start time for late minutes calculation"
              className="px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="09:00">Start 09:00 AM</option>
              <option value="09:30">Start 09:30 AM</option>
              <option value="10:00">Start 10:00 AM</option>
              <option value="10:30">Start 10:30 AM</option>
            </select>
          </div>

          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeFridays}
              onChange={(e) => setIncludeFridays(e.target.checked)}
              className="rounded border-slate-300 text-blue-700"
            />
            <span className="text-slate-700 font-medium">Count Fridays</span>
          </label>
        </div>
      </div>

      {/* Comprehensive Summary KPI Strip (Screen + A4 Print) */}
      <div className="p-4 sm:p-6 border-b border-slate-200 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-3.5 sm:p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
            <p className="text-[11px] sm:text-xs font-medium text-emerald-900">
              Present &amp; Active Days
            </p>
            <p className="font-mono text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums mt-1">
              {report.teamTotals.attendedDays}{' '}
              <span className="text-xs font-normal text-slate-600">
                days
              </span>
            </p>
            <p className="text-[11px] font-mono text-slate-600 mt-1">
              Present {report.teamTotals.presentDays} · Field {report.teamTotals.fieldWorkDays} · Half{' '}
              {report.teamTotals.halfDays}
            </p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl border border-red-200 bg-red-50/40">
            <p className="text-[11px] sm:text-xs font-medium text-red-900">
              Absent &amp; Leave Days
            </p>
            <p className="font-mono text-xl sm:text-2xl font-bold text-red-700 tabular-nums mt-1">
              {report.teamTotals.absentDays}{' '}
              <span className="text-xs font-normal text-slate-600">absent</span>
            </p>
            <p className="text-[11px] font-mono text-slate-600 mt-1">
              Leave {report.teamTotals.leaveDays} · Eval Days {report.teamTotals.workingDaysCount}
            </p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl border border-blue-200 bg-blue-50/40">
            <p className="text-[11px] sm:text-xs font-medium text-blue-900">
              Total Worked Time (m)
            </p>
            <p className="font-mono text-xl sm:text-2xl font-bold text-blue-700 tabular-nums mt-1">
              {formatMinutesShort(report.teamTotals.totalWorkedMinutes)}
            </p>
            <p className="text-[11px] font-mono text-slate-600 mt-1">
              {formatMinutesWithHours(report.teamTotals.totalWorkedMinutes)} · Avg{' '}
              {formatMinutesShort(report.teamTotals.avgWorkedMinutesPerDay)}/day
            </p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl border border-amber-200 bg-amber-50/40">
            <p className="text-[11px] sm:text-xs font-medium text-amber-900">
              Late Days &amp; Minutes (m)
            </p>
            <p className="font-mono text-xl sm:text-2xl font-bold text-amber-700 tabular-nums mt-1">
              {formatMinutesShort(report.teamTotals.totalLateMinutes)}
            </p>
            <p className="text-[11px] font-mono text-slate-600 mt-1">
              {report.teamTotals.lateArrivalCount} late arrivals · Status Late {report.teamTotals.lateDays}d
            </p>
          </div>
        </div>
      </div>

      {/* Per-Member Summary Table (Mobile Cards on Small Screen, Desktop Table + Print) */}
      <div>
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <h3 className="font-display text-xs sm:text-sm font-bold text-slate-900">
            Member-Wise Attendance Breakdown ({periodTitle})
          </h3>
          <span className="text-[11px] font-mono text-slate-500">
            {report.perMember.length} {report.perMember.length === 1 ? 'member' : 'members'}
          </span>
        </div>

        {/* Mobile Cards (Hidden on A4 Print) */}
        <div className="sm:hidden divide-y divide-slate-100 print-mobile-cards">
          {report.perMember.map((row) => (
            <div key={row.member.id} className="p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-900 truncate">{row.member.name}</p>
                  <p className="text-xs text-slate-500">
                    {row.member.designation || row.member.role} · @{row.member.userId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => triggerA4Print(row.member.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0 cursor-pointer"
                >
                  <Printer className="w-3 h-3" />
                  <span>Print</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums bg-slate-50 p-2.5 rounded-lg">
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">Present</span>
                  <span className="font-bold text-emerald-700">{row.attendedDays}d</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">Absent / Leave</span>
                  <span className="font-bold text-red-700">
                    {row.absentDays}d / {row.leaveDays}d
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">Worked (m)</span>
                  <span className="font-bold text-blue-700">
                    {formatMinutesShort(row.totalWorkedMinutes)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-600">
                <span>
                  Late: {row.lateArrivalCount}d ({formatMinutesShort(row.totalLateMinutes)})
                </span>
                <span>
                  Avg: {formatMinutesShort(row.avgWorkedMinutesPerDay)}/day · {row.attendanceRatePct}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop & Print-Ready Table */}
        <div className="hidden sm:block overflow-x-auto print-desktop-table">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 sm:px-5 py-2.5 font-semibold">Team Member</th>
                <th className="px-2.5 py-2.5 font-semibold text-right">Work Days</th>
                <th className="px-2.5 py-2.5 font-semibold text-right text-emerald-700">Present</th>
                <th className="px-2.5 py-2.5 font-semibold text-right text-blue-700">Field</th>
                <th className="px-2.5 py-2.5 font-semibold text-right text-amber-700">Half</th>
                <th className="px-2.5 py-2.5 font-semibold text-right text-amber-700">Late (d / m)</th>
                <th className="px-2.5 py-2.5 font-semibold text-right text-slate-700">Leave</th>
                <th className="px-2.5 py-2.5 font-semibold text-right text-red-700">Absent</th>
                <th className="px-3 py-2.5 font-semibold text-right text-blue-800">Worked Time</th>
                <th className="px-2.5 py-2.5 font-semibold text-right">Rate</th>
                <th className="px-4 py-2.5 font-semibold text-right no-print">A4</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.perMember.map((row) => (
                <tr key={row.member.id} className="hover:bg-slate-50/70">
                  <td className="px-4 sm:px-5 py-2.5">
                    <p className="font-semibold text-slate-900">{row.member.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {row.member.designation || row.member.role} · @{row.member.userId}
                    </p>
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-slate-700">
                    {row.workingDaysCount}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                    {row.presentDays}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-blue-700">
                    {row.fieldWorkDays}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-amber-700">
                    {row.halfDays}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-amber-700">
                    {row.lateArrivalCount}d / {formatMinutesShort(row.totalLateMinutes)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-slate-700">
                    {row.leaveDays}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums font-bold text-red-700">
                    {row.absentDays}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-blue-800 whitespace-nowrap">
                    {formatMinutesWithHours(row.totalWorkedMinutes)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-800">
                    {row.attendanceRatePct}%
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap no-print">
                    <button
                      type="button"
                      onClick={() => triggerA4Print(row.member.id)}
                      title={`Print ${row.member.name} A4 attendance report`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {report.perMember.length > 1 && (
              <tfoot className="bg-slate-100/80 border-t-2 border-slate-300 text-xs font-bold text-slate-900">
                <tr>
                  <td className="px-4 sm:px-5 py-2.5">Team Total ({report.perMember.length})</td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums">
                    {report.teamTotals.workingDaysCount}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                    {report.teamTotals.presentDays}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-blue-700">
                    {report.teamTotals.fieldWorkDays}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-amber-700">
                    {report.teamTotals.halfDays}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-amber-700">
                    {report.teamTotals.lateArrivalCount}d / {formatMinutesShort(report.teamTotals.totalLateMinutes)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums">
                    {report.teamTotals.leaveDays}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-red-700">
                    {report.teamTotals.absentDays}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-blue-800 whitespace-nowrap">
                    {formatMinutesWithHours(report.teamTotals.totalWorkedMinutes)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono tabular-nums">
                    {report.teamTotals.workingDaysCount > 0
                      ? `${Math.min(
                          100,
                          Math.round(
                            (report.teamTotals.attendedDays / report.teamTotals.workingDaysCount) *
                              100
                          )
                        )}%`
                      : '—'}
                  </td>
                  <td className="no-print" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Detailed Daily Check-In / Out & Minute Log (Read-Only, Immutable) */}
      {showDailyLog && (
        <div className="border-t border-slate-200">
          <div className="px-4 sm:px-6 py-3 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-2">
            <h3 className="font-display text-xs sm:text-sm font-bold text-slate-900">
              Daily Attendance Log — Minutes &amp; Timestamps ({report.dailyRows.length})
            </h3>
            <span className="text-[11px] text-slate-500">
              Permanent records · Edits disabled
            </span>
          </div>

          {report.dailyRows.length === 0 ? (
            <div className="px-6 py-8 text-center text-xs sm:text-sm text-slate-500">
              No attendance entries recorded in {periodTitle}.
            </div>
          ) : (
            <>
              {/* Mobile Log Cards */}
              <div className="sm:hidden divide-y divide-slate-100 print-mobile-cards">
                {report.dailyRows.map((rec) => (
                  <div key={rec.id} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm text-slate-900">{rec.staffName}</p>
                        <p className="text-xs font-mono text-slate-500">
                          {formatDateOnly(rec.attendanceDate)} · {rec.workLocation || 'Office'}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 text-[11px] font-semibold border rounded ${getStatusBadgeClass(
                          rec.status
                        )}`}
                      >
                        {rec.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-700">
                      <span>
                        In: {formatTime12h(rec.checkInTime)}
                        {rec.checkOutTime ? ` · Out: ${formatTime12h(rec.checkOutTime)}` : ''}
                      </span>
                      <span className="font-bold text-blue-700">
                        {rec.workedMinutes > 0 ? formatMinutesWithHours(rec.workedMinutes) : '—'}
                        {rec.lateMinutes > 0 ? ` (${rec.lateMinutes}m late)` : ''}
                      </span>
                    </div>
                    {rec.notes && <p className="text-xs text-slate-500">{rec.notes}</p>}
                  </div>
                ))}
              </div>

              {/* Desktop & Print Daily Log Table */}
              <div className="hidden sm:block overflow-x-auto print-desktop-table">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 sm:px-5 py-2.5 font-semibold">Date</th>
                      <th className="px-3 py-2.5 font-semibold">Team Member</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold">Check-In</th>
                      <th className="px-3 py-2.5 font-semibold">Check-Out</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Worked (m)</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Late (m)</th>
                      <th className="px-4 py-2.5 font-semibold">Location &amp; Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.dailyRows.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/70">
                        <td className="px-4 sm:px-5 py-2 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                          {formatDateOnly(rec.attendanceDate)}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                          {rec.staffName}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 text-[11px] font-semibold border rounded ${getStatusBadgeClass(
                              rec.status
                            )}`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {rec.status === 'Leave' ? '—' : formatTime12h(rec.checkInTime)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {rec.status === 'Leave'
                            ? '—'
                            : rec.checkOutTime
                            ? formatTime12h(rec.checkOutTime)
                            : 'Active'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-blue-800 whitespace-nowrap">
                          {rec.workedMinutes > 0 ? formatMinutesWithHours(rec.workedMinutes) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                          {rec.lateMinutes > 0 ? (
                            <span className="font-semibold text-amber-700">
                              {rec.lateMinutes}m
                            </span>
                          ) : (
                            <span className="text-slate-400">0m</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600 max-w-xs truncate">
                          {[rec.workLocation || 'Office', rec.notes].filter(Boolean).join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Print-Only Signature Block for Official A4 Handout */}
      <div className="print-only-block pt-8 mt-6 border-t border-slate-300">
        <div className="grid grid-cols-3 gap-8 text-xs text-slate-700">
          <div>
            <div className="border-t border-slate-500 pt-1.5 font-semibold">Prepared By</div>
            <p className="text-[11px] text-slate-500">{currentUser.name}</p>
          </div>
          <div>
            <div className="border-t border-slate-500 pt-1.5 font-semibold">Manager / HR Review</div>
            <p className="text-[11px] text-slate-500">Global Pathways Overseas Ltd</p>
          </div>
          <div>
            <div className="border-t border-slate-500 pt-1.5 font-semibold">Managing Director</div>
            <p className="text-[11px] text-slate-500">Authorized Signature</p>
          </div>
        </div>
      </div>
    </section>
  );
}
