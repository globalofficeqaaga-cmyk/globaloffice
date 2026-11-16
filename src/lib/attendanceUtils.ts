import type { PublicUser, StaffAttendanceRecord } from '../types';

export function parseTimeToMinutes(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const trimmed = hhmm.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export function formatTime12h(hhmm?: string | null): string {
  if (!hhmm) return '—';
  const total = parseTimeToMinutes(hhmm);
  if (total === null) return hhmm;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function calculateWorkedMinutes(record: Pick<StaffAttendanceRecord, 'status' | 'checkInTime' | 'checkOutTime'>): number {
  if (record.status === 'Leave') return 0;
  const inMin = parseTimeToMinutes(record.checkInTime);
  const outMin = parseTimeToMinutes(record.checkOutTime);
  if (inMin === null || outMin === null) return 0;
  if (outMin < inMin) return 0;
  return outMin - inMin;
}

export function calculateLateMinutes(
  record: Pick<StaffAttendanceRecord, 'status' | 'checkInTime'>,
  officeStartHHMM = '09:30'
): number {
  if (record.status === 'Leave') return 0;
  const inMin = parseTimeToMinutes(record.checkInTime);
  const startMin = parseTimeToMinutes(officeStartHHMM);
  if (inMin === null || startMin === null) return 0;
  return inMin > startMin ? inMin - startMin : 0;
}

export function formatMinutesWithHours(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins === 0) return '0m';
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours === 0) return `${mins}m`;
  return `${mins.toLocaleString()}m (${hours}h ${String(rem).padStart(2, '0')}m)`;
}

export function formatMinutesShort(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  return `${mins.toLocaleString()}m`;
}

export function getMonthStartDateStr(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}-${parts[1]}-01`;
}

export function shiftDateStr(dateStr: string, deltaDays: number): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return dateStr;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + deltaDays));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getPreviousMonthRange(todayStr: string): { startDate: string; endDate: string } {
  const parts = todayStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return { startDate: todayStr, endDate: todayStr };
  }
  const firstOfPrev = new Date(Date.UTC(parts[0], parts[1] - 2, 1));
  const lastOfPrev = new Date(Date.UTC(parts[0], parts[1] - 1, 0));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`;
  return {
    startDate: fmt(firstOfPrev),
    endDate: fmt(lastOfPrev),
  };
}

export function getWorkingDatesInRange(
  startDate: string,
  endDate: string,
  includeFridays = false
): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const sParts = startDate.split('-').map(Number);
  const eParts = endDate.split('-').map(Number);
  if (
    sParts.length !== 3 ||
    eParts.length !== 3 ||
    sParts.some((n) => !Number.isFinite(n)) ||
    eParts.some((n) => !Number.isFinite(n))
  ) {
    return [];
  }

  const dates: string[] = [];
  let cursor = new Date(Date.UTC(sParts[0], sParts[1] - 1, sParts[2]));
  const endTs = Date.UTC(eParts[0], eParts[1] - 1, eParts[2]);
  let guard = 0;

  while (cursor.getTime() <= endTs && guard < 400) {
    guard += 1;
    const dayOfWeek = cursor.getUTCDay(); // 5 = Friday
    if (includeFridays || dayOfWeek !== 5) {
      dates.push(
        `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(
          cursor.getUTCDate()
        ).padStart(2, '0')}`
      );
    }
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1)
    );
  }

  return dates;
}

export interface MemberAttendanceSummary {
  member: PublicUser;
  workingDaysCount: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  fieldWorkDays: number;
  attendedDays: number;
  leaveDays: number;
  absentDays: number;
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  lateArrivalCount: number;
  avgWorkedMinutesPerDay: number;
  attendanceRatePct: number;
}

export interface DailyAttendanceComputedRow extends StaffAttendanceRecord {
  workedMinutes: number;
  lateMinutes: number;
}

export interface AttendanceReportSummary {
  startDate: string;
  endDate: string;
  evalEndDate: string;
  perMember: MemberAttendanceSummary[];
  dailyRows: DailyAttendanceComputedRow[];
  teamTotals: {
    workingDaysCount: number;
    presentDays: number;
    lateDays: number;
    halfDays: number;
    fieldWorkDays: number;
    attendedDays: number;
    leaveDays: number;
    absentDays: number;
    totalWorkedMinutes: number;
    totalLateMinutes: number;
    lateArrivalCount: number;
    avgWorkedMinutesPerDay: number;
  };
}

export function computeAttendanceReport(params: {
  members: PublicUser[];
  records: StaffAttendanceRecord[];
  startDate: string;
  endDate: string;
  todayStr: string;
  officeStartTime?: string;
  includeFridays?: boolean;
}): AttendanceReportSummary {
  const {
    members,
    records,
    startDate,
    endDate,
    todayStr,
    officeStartTime = '09:30',
    includeFridays = false,
  } = params;

  const evalEndDate = endDate < todayStr ? endDate : todayStr;
  const activeRecords = records.filter(
    (r) =>
      !r.deletedAt &&
      r.attendanceDate >= startDate &&
      r.attendanceDate <= endDate
  );

  const memberIds = new Set(members.map((m) => m.id));
  const scopedRecords = activeRecords.filter((r) => memberIds.has(r.staffId));

  const perMember: MemberAttendanceSummary[] = members.map((member) => {
    const memberRecords = scopedRecords.filter((r) => r.staffId === member.id);
    const byDate = new Map<string, StaffAttendanceRecord>();
    memberRecords.forEach((r) => byDate.set(r.attendanceDate, r));

    const hasValidJoin =
      Boolean(member.joiningDate) && /^\d{4}-\d{2}-\d{2}$/.test(member.joiningDate || '');
    const effectiveStart =
      hasValidJoin && (member.joiningDate as string) > startDate
        ? (member.joiningDate as string)
        : startDate;

    const workingDates =
      effectiveStart <= evalEndDate
        ? getWorkingDatesInRange(effectiveStart, evalEndDate, includeFridays)
        : [];

    let presentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let fieldWorkDays = 0;
    let leaveDays = 0;
    let absentDays = 0;
    let totalWorkedMinutes = 0;
    let totalLateMinutes = 0;
    let lateArrivalCount = 0;

    const accountedDates = new Set<string>();

    for (const dateKey of workingDates) {
      accountedDates.add(dateKey);
      const rec = byDate.get(dateKey);
      if (!rec) {
        absentDays += 1;
        continue;
      }
      if (rec.status === 'Present') presentDays += 1;
      else if (rec.status === 'Late') lateDays += 1;
      else if (rec.status === 'Half Day') halfDays += 1;
      else if (rec.status === 'Field Work') fieldWorkDays += 1;
      else if (rec.status === 'Leave') leaveDays += 1;

      const worked = calculateWorkedMinutes(rec);
      const lateMin = calculateLateMinutes(rec, officeStartTime);
      totalWorkedMinutes += worked;
      totalLateMinutes += lateMin;
      if (lateMin > 0 || rec.status === 'Late') {
        lateArrivalCount += 1;
      }
    }

    // Include any off-day / Friday duty logged inside range
    for (const rec of memberRecords) {
      if (accountedDates.has(rec.attendanceDate)) continue;
      if (rec.status === 'Present') presentDays += 1;
      else if (rec.status === 'Late') lateDays += 1;
      else if (rec.status === 'Half Day') halfDays += 1;
      else if (rec.status === 'Field Work') fieldWorkDays += 1;
      else if (rec.status === 'Leave') leaveDays += 1;

      const worked = calculateWorkedMinutes(rec);
      const lateMin = calculateLateMinutes(rec, officeStartTime);
      totalWorkedMinutes += worked;
      totalLateMinutes += lateMin;
      if (lateMin > 0 || rec.status === 'Late') {
        lateArrivalCount += 1;
      }
    }

    const attendedDays = presentDays + lateDays + halfDays + fieldWorkDays;
    const workingDaysCount = workingDates.length;
    const avgWorkedMinutesPerDay =
      attendedDays > 0 ? Math.round(totalWorkedMinutes / attendedDays) : 0;
    const attendanceRatePct =
      workingDaysCount > 0
        ? Math.min(100, Math.round((attendedDays / workingDaysCount) * 100))
        : attendedDays > 0
        ? 100
        : 0;

    return {
      member,
      workingDaysCount,
      presentDays,
      lateDays,
      halfDays,
      fieldWorkDays,
      attendedDays,
      leaveDays,
      absentDays,
      totalWorkedMinutes,
      totalLateMinutes,
      lateArrivalCount,
      avgWorkedMinutesPerDay,
      attendanceRatePct,
    };
  });

  const dailyRows: DailyAttendanceComputedRow[] = scopedRecords
    .map((r) => ({
      ...r,
      workedMinutes: calculateWorkedMinutes(r),
      lateMinutes: calculateLateMinutes(r, officeStartTime),
    }))
    .sort((a, b) => {
      const dateCmp = (b.attendanceDate || '').localeCompare(a.attendanceDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.staffName || '').localeCompare(b.staffName || '');
    });

  const baseWorkingDays =
    startDate <= evalEndDate
      ? getWorkingDatesInRange(startDate, evalEndDate, includeFridays).length
      : 0;

  const teamTotals = perMember.reduce(
    (acc, item) => ({
      workingDaysCount: acc.workingDaysCount + item.workingDaysCount,
      presentDays: acc.presentDays + item.presentDays,
      lateDays: acc.lateDays + item.lateDays,
      halfDays: acc.halfDays + item.halfDays,
      fieldWorkDays: acc.fieldWorkDays + item.fieldWorkDays,
      attendedDays: acc.attendedDays + item.attendedDays,
      leaveDays: acc.leaveDays + item.leaveDays,
      absentDays: acc.absentDays + item.absentDays,
      totalWorkedMinutes: acc.totalWorkedMinutes + item.totalWorkedMinutes,
      totalLateMinutes: acc.totalLateMinutes + item.totalLateMinutes,
      lateArrivalCount: acc.lateArrivalCount + item.lateArrivalCount,
      avgWorkedMinutesPerDay: 0,
    }),
    {
      workingDaysCount: 0,
      presentDays: 0,
      lateDays: 0,
      halfDays: 0,
      fieldWorkDays: 0,
      attendedDays: 0,
      leaveDays: 0,
      absentDays: 0,
      totalWorkedMinutes: 0,
      totalLateMinutes: 0,
      lateArrivalCount: 0,
      avgWorkedMinutesPerDay: 0,
    }
  );

  if (members.length === 1) {
    teamTotals.workingDaysCount = perMember[0]?.workingDaysCount ?? baseWorkingDays;
  }
  teamTotals.avgWorkedMinutesPerDay =
    teamTotals.attendedDays > 0
      ? Math.round(teamTotals.totalWorkedMinutes / teamTotals.attendedDays)
      : 0;

  return {
    startDate,
    endDate,
    evalEndDate,
    perMember,
    dailyRows,
    teamTotals,
  };
}
