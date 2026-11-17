import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  CheckCircle2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Upload,
  UserCircle2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  api,
  ConflictError,
  formatBDT,
  formatDateOnly,
  getCurrentLocalTimeStr,
  getTodayLocalDateStr,
} from '../lib/api';
import { validateStrongPassword } from '../lib/passwordPolicy';
import { useUnsavedChangesWarning } from '../lib/useUnsavedChanges';
import type {
  DashboardData,
  LedgerEntryType,
  StaffAttendanceRecord,
  StaffDailyLog,
} from '../types';
import { DailyOperationsPanel } from './DailyOperationsPanel';
import { DashboardShell, type NavTab } from './DashboardShell';
import { StaffContactCard } from './StaffContactCard';
import { TeamProfilesPanel } from './TeamProfilesPanel';
import { AttendanceModal, ClientModal, DailyLogModal, LedgerEntryModal, StaffAccountModal } from './modals/RecordModals';

interface AccountsDashboardProps {
  data: DashboardData;
  onRefresh: () => Promise<void>;
  onGoHome: () => void;
  onLogout: () => void;
}

type AccountsTab = 'ledger' | 'daily' | 'team' | 'profile';

export function AccountsDashboard({
  data,
  onRefresh,
  onGoHome,
  onLogout,
}: AccountsDashboardProps) {
  const canViewFinance = data.user.role === 'admin' || Boolean(data.user.permissions?.includes('view_finance') || data.user.permissions?.includes('manage_finance'));
  const canManageFinance = data.user.role === 'admin' || Boolean(data.user.permissions?.includes('manage_finance'));
  const canCreateStaffAccounts = data.user.role === 'admin' || Boolean(data.user.permissions?.includes('create_staff_accounts'));
  const [activeTab, setActiveTab] = useState<AccountsTab>(canViewFinance ? 'ledger' : 'team');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | LedgerEntryType>('all');
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [attendanceModal, setAttendanceModal] = useState<{
    open: boolean;
    item: StaffAttendanceRecord | null;
    presetDate?: string;
  }>({ open: false, item: null });
  const [dailyLogModal, setDailyLogModal] = useState<{
    open: boolean;
    item: StaffDailyLog | null;
    presetDate?: string;
  }>({ open: false, item: null });
  const [saveToast, setSaveToast] = useState('');
  const [actionError, setActionError] = useState('');

  // Own profile edit state
  const [profName, setProfName] = useState(data.user.name);
  const [profDesignation, setProfDesignation] = useState(
    data.user.designation || 'Accounts & Finance Officer'
  );
  const [profPhone, setProfPhone] = useState(data.user.phone);
  const [profPersonalPhone, setProfPersonalPhone] = useState(data.user.personalPhone || '');
  const [profWhatsapp, setProfWhatsapp] = useState(data.user.whatsapp);
  const [profSocial, setProfSocial] = useState(data.user.socialLink || '');
  const [profJoiningDate, setProfJoiningDate] = useState(data.user.joiningDate || '');
  const [profPhoto, setProfPhoto] = useState(data.user.photoUrl);
  const [profCover, setProfCover] = useState(data.user.coverUrl);
  const [profPassword, setProfPassword] = useState('');
  const [profDirty, setProfDirty] = useState(false);
  const [profSaving, setProfSaving] = useState(false);
  const [profUploadingKind, setProfUploadingKind] = useState<'avatar' | 'cover' | null>(null);
  const [profMessage, setProfMessage] = useState('');
  const [profError, setProfError] = useState('');
  const [profConflict, setProfConflict] = useState(false);

  useUnsavedChangesWarning(profDirty && !profSaving);

  useEffect(() => {
    if (!profDirty) {
      setProfName(data.user.name);
      setProfDesignation(data.user.designation || 'Accounts & Finance Officer');
      setProfPhone(data.user.phone);
      setProfPersonalPhone(data.user.personalPhone || '');
      setProfWhatsapp(data.user.whatsapp);
      setProfSocial(data.user.socialLink || '');
      setProfJoiningDate(data.user.joiningDate || '');
      setProfPhoto(data.user.photoUrl);
      setProfCover(data.user.coverUrl);
    }
  }, [data.user, profDirty]);

  const entries = useMemo(() => {
    const list = [...(data.ledgerEntries || [])];
    list.sort((a, b) => {
      const dateCmp = (b.entryDate || '').localeCompare(a.entryDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return list;
  }, [data.ledgerEntries]);

  const totals = useMemo(() => {
    let totalCredit = 0;
    let totalDebit = 0;
    let creditCount = 0;
    let debitCount = 0;
    for (const item of entries) {
      if (item.entryType === 'debit') {
        totalDebit += Number(item.amount) || 0;
        debitCount += 1;
      } else {
        totalCredit += Number(item.amount) || 0;
        creditCount += 1;
      }
    }
    return {
      totalCredit,
      totalDebit,
      netBalance: totalCredit - totalDebit,
      creditCount,
      debitCount,
    };
  }, [entries]);

  const q = searchQuery.trim().toLowerCase();
  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      if (typeFilter !== 'all' && item.entryType !== typeFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.partyName.toLowerCase().includes(q) ||
        item.referenceNo.toLowerCase().includes(q) ||
        (item.paymentMethod || '').toLowerCase().includes(q) ||
        (item.createdByName || '').toLowerCase().includes(q)
      );
    });
  }, [entries, typeFilter, q]);

  const filteredTotals = useMemo(() => {
    let credit = 0;
    let debit = 0;
    for (const item of filteredEntries) {
      if (item.entryType === 'debit') {
        debit += Number(item.amount) || 0;
      } else {
        credit += Number(item.amount) || 0;
      }
    }
    return { credit, debit, net: credit - debit };
  }, [filteredEntries]);

  function notifySuccess(msg: string) {
    setActionError('');
    setSaveToast(msg);
  }

  async function saveOwnProfile() {
    setProfMessage('');
    setProfError('');
    setProfConflict(false);
    if (profPassword.trim()) {
      const pwErr = validateStrongPassword(profPassword, 'New password');
      if (pwErr) {
        setProfError(pwErr);
        return;
      }
    }
    setProfSaving(true);
    try {
      await api.updateOwnProfile({
        name: profName.trim(),
        designation: profDesignation.trim(),
        phone: profPhone.trim(),
        personalPhone: profPersonalPhone.trim(),
        whatsapp: profWhatsapp.trim(),
        socialLink: profSocial.trim(),
        joiningDate: profJoiningDate.trim(),
        photoUrl: profPhoto,
        coverUrl: profCover,
        newPassword: profPassword.trim() || undefined,
        expectedVersion: data.user.version,
      });
      setProfPassword('');
      setProfDirty(false);
      await onRefresh();
      setProfMessage('Profile settings updated in database.');
    } catch (err) {
      if (err instanceof ConflictError) {
        setProfConflict(true);
      }
      setProfError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setProfSaving(false);
    }
  }

  function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    saveOwnProfile();
  }

  async function handleProfileImage(
    e: ChangeEvent<HTMLInputElement>,
    kind: 'avatar' | 'cover',
    setter: (val: string) => void
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfError('');
    setProfUploadingKind(kind);
    try {
      const url = await api.uploadStaffMediaFile(file, data.user.id, kind);
      setProfDirty(true);
      setter(url);
    } catch (err) {
      setProfError(err instanceof Error ? err.message : 'Failed to upload photo.');
    } finally {
      setProfUploadingKind(null);
    }
  }

  const todayStr = getTodayLocalDateStr();
  const attendanceRecords = useMemo(
    () => data.attendanceRecords || [],
    [data.attendanceRecords]
  );
  const dailyLogs = useMemo(() => data.dailyLogs || [], [data.dailyLogs]);
  const dailyClientSummaries = useMemo(
    () => data.dailyClientSummaries || [],
    [data.dailyClientSummaries]
  );
  const teamRoster = useMemo(() => {
    const map = new Map<string, (typeof data.staffList)[number]>();
    (data.teamProfiles || []).forEach((m) => map.set(m.id, m));
    (data.staffList || []).forEach((s) => map.set(s.id, s));
    (data.accountsList || []).forEach((a) => map.set(a.id, a));
    map.set(data.user.id, data.user);
    return Array.from(map.values());
  }, [data.teamProfiles, data.staffList, data.accountsList, data.user]);

  const todayTalksCount = useMemo(
    () => dailyLogs.filter((l) => l.logDate === todayStr).length,
    [dailyLogs, todayStr]
  );

  async function handleQuickCheckIn() {
    setActionError('');
    try {
      await api.markAttendance({
        attendanceDate: todayStr,
        status: 'Present',
        checkInTime: getCurrentLocalTimeStr(),
        workLocation: 'Office',
      });
      await onRefresh();
      notifySuccess('Today attendance checked in.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to check in.');
    }
  }

  async function handleQuickCheckOut(existing: StaffAttendanceRecord) {
    setActionError('');
    try {
      await api.updateAttendance(existing.id, {
        checkOutTime: getCurrentLocalTimeStr(),
        expectedVersion: existing.version,
      });
      await onRefresh();
      notifySuccess('Check-out time saved.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to check out.');
    }
  }

  const tabs: NavTab[] = [
    ...(canViewFinance ? [{
      id: 'ledger',
      label: 'Debit & Credit Ledger',
      icon: <Wallet className="w-4 h-4" />,
      count: entries.length,
    }] : []),
    {
      id: 'daily',
      label: 'Staff Daily Report',
      icon: <CalendarCheck className="w-4 h-4" />,
      count: todayTalksCount,
    },
    {
      id: 'team',
      label: 'Team Profiles',
      icon: <Users className="w-4 h-4" />,
      count: teamRoster.length,
    },
    {
      id: 'profile',
      label: 'My Profile',
      icon: <UserCircle2 className="w-4 h-4" />,
    },
  ];

  const primaryAction =
    activeTab === 'ledger' && canManageFinance ? (
      <button
        type="button"
        onClick={() => setLedgerModalOpen(true)}
        className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 min-h-[38px] text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
      >
        <Plus className="w-4 h-4" />
        <span className="sm:hidden">Add Entry</span>
        <span className="hidden sm:inline">Add Debit / Credit</span>
      </button>
    ) : activeTab === 'daily' ? (
      <button
        type="button"
        onClick={() => setDailyLogModal({ open: true, item: null, presetDate: todayStr })}
        className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 min-h-[38px] text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
      >
        <Plus className="w-4 h-4" />
        <span className="sm:hidden">Log Talk</span>
        <span className="hidden sm:inline">Log Conversation</span>
      </button>
    ) : activeTab === 'team' ? (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setClientModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-blue-800 cursor-pointer">
          <Plus className="w-4 h-4" /> Add Client
        </button>
        {canCreateStaffAccounts && (
          <button type="button" onClick={() => setStaffModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-slate-700 cursor-pointer">
            <Plus className="w-4 h-4" /> Create Staff Account
          </button>
        )}
      </div>
    ) : null;

  return (
    <DashboardShell
      user={data.user}
      roleLabel="Accounts Dashboard"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as AccountsTab)}
      onGoHome={onGoHome}
      onLogout={onLogout}
      primaryAction={primaryAction}
    >
      {saveToast && (
        <div className="mb-5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-sm text-emerald-900">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{saveToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveToast('')}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-3 text-sm text-red-800">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError('')}
            className="text-red-700 hover:text-red-900 p-1 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ====================================================================
          DEBIT & CREDIT LEDGER TAB
         ==================================================================== */}
      {activeTab === 'ledger' && (
        <div className="space-y-4 sm:space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">
                Total Credit <span className="hidden sm:inline">(Money In)</span>
              </p>
              <p className="font-mono text-lg sm:text-2xl font-bold text-emerald-700 tabular-nums mt-1 sm:mt-2 truncate">
                {formatBDT(totals.totalCredit)}
              </p>
              <p className="hidden sm:block text-xs text-slate-500 font-mono tabular-nums mt-1.5">
                {totals.creditCount} credit {totals.creditCount === 1 ? 'entry' : 'entries'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">
                Total Debit <span className="hidden sm:inline">(Money Out)</span>
              </p>
              <p className="font-mono text-lg sm:text-2xl font-bold text-red-700 tabular-nums mt-1 sm:mt-2 truncate">
                {formatBDT(totals.totalDebit)}
              </p>
              <p className="hidden sm:block text-xs text-slate-500 font-mono tabular-nums mt-1.5">
                {totals.debitCount} debit {totals.debitCount === 1 ? 'entry' : 'entries'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">Net Balance</p>
              <p
                className={`font-mono text-lg sm:text-2xl font-bold tabular-nums mt-1 sm:mt-2 truncate ${
                  totals.netBalance < 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {totals.netBalance < 0 ? '-' : ''}
                {formatBDT(Math.abs(totals.netBalance))}
              </p>
              <p className="hidden sm:block text-xs text-slate-500 mt-1.5">
                Total Credit minus Total Debit
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">Total Entries</p>
              <p className="font-mono text-lg sm:text-2xl font-bold text-slate-900 tabular-nums mt-1 sm:mt-2">
                {filteredEntries.length}
                <span className="text-xs sm:text-sm font-normal text-slate-500"> / {entries.length}</span>
              </p>
              <p className="hidden sm:block text-xs text-slate-500 font-mono tabular-nums mt-1.5">
                Net: {filteredTotals.net < 0 ? '-' : ''}
                {formatBDT(Math.abs(filteredTotals.net))}
              </p>
            </div>
          </div>

          {/* Search & Type Segmented Filter */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search particulars, party, voucher..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:bg-white"
              />
            </div>

            <div className="inline-flex items-center border border-slate-200 rounded-lg p-1 bg-slate-50 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  typeFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({entries.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('credit')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  typeFilter === 'credit'
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Credit ({totals.creditCount})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('debit')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  typeFilter === 'debit'
                    ? 'bg-red-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Debit ({totals.debitCount})
              </button>
            </div>
          </div>

          {/* Ledger Card List (Mobile) + Table (Desktop) */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                  Debit &amp; Credit Ledger
                </h2>
                <p className="hidden sm:flex text-xs text-slate-500 mt-0.5 items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Posted entries appear immediately in the Admin Dashboard. Only Admin can edit or remove posted entries.
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLedgerModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Entry</span>
              </button>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-700">
                  {entries.length === 0
                    ? 'No Debit or Credit entries recorded yet.'
                    : 'No entries match your search or filter.'}
                </p>
                {entries.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setLedgerModalOpen(true)}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record First Entry</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile Stacked Cards */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {filteredEntries.map((item) => {
                    const isCredit = item.entryType === 'credit';
                    return (
                      <div key={item.id} className="p-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={`inline-flex items-center gap-0.5 font-semibold ${
                                isCredit ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {isCredit ? (
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              )}
                              <span>{isCredit ? 'Credit' : 'Debit'}</span>
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono text-slate-500 tabular-nums">
                              {formatDateOnly(item.entryDate)}
                            </span>
                          </div>
                          <p className="font-semibold text-sm text-slate-900 mt-1 truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {[item.category || 'General', item.partyName, item.paymentMethod]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        <p
                          className={`font-mono text-sm font-bold tabular-nums whitespace-nowrap shrink-0 ${
                            isCredit ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {isCredit ? '+' : '-'}
                          {formatBDT(item.amount)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="px-6 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Particulars &amp; Category</th>
                        <th className="px-4 py-3 font-medium">Party &amp; Ref</th>
                        <th className="px-4 py-3 font-medium">Method</th>
                        <th className="px-4 py-3 font-medium">Entered By</th>
                        <th className="px-6 py-3 font-medium text-right">Amount (BDT)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEntries.map((item) => {
                        const isCredit = item.entryType === 'credit';
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70 align-top">
                            <td className="px-6 py-3.5 font-mono text-xs text-slate-700 whitespace-nowrap tabular-nums">
                              {formatDateOnly(item.entryDate)}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                  isCredit ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {isCredit ? (
                                  <ArrowDownLeft className="w-3.5 h-3.5" />
                                ) : (
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                )}
                                <span>{isCredit ? 'Credit' : 'Debit'}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="font-semibold text-slate-900">{item.title}</p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {item.category || 'General'}
                                {item.notes ? ` · ${item.notes}` : ''}
                              </p>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="text-slate-800">{item.partyName || '—'}</p>
                              {item.referenceNo && (
                                <p className="text-xs font-mono text-slate-500 mt-0.5">
                                  Ref: {item.referenceNo}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                              {item.paymentMethod || 'Cash'}
                            </td>
                            <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                              {item.createdByName || 'Accounts'}
                            </td>
                            <td
                              className={`px-6 py-3.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                                isCredit ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {isCredit ? '+' : '-'}
                              {formatBDT(item.amount)}
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
        </div>
      )}

      {/* ====================================================================
          TEAM PROFILES DIRECTORY TAB
         ==================================================================== */}
      {activeTab === 'team' && (
        <>
        <TeamProfilesPanel
          currentUser={data.user}
          members={teamRoster}
          onEditOwnProfile={() => setActiveTab('profile')}
        />
        </>
      )}

      {/* ====================================================================
          MY PROFILE TAB
         ==================================================================== */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={handleProfileSubmit}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Accounts Officer Profile &amp; Password
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Update your contact details, joining date, or login password.
              </p>
            </div>

            {profMessage && (
              <div className="px-4 py-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
                {profMessage}
              </div>
            )}
            {profError && (
              <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg space-y-2">
                <p>{profError}</p>
                <div>
                  {profConflict ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setProfDirty(false);
                        setProfConflict(false);
                        setProfError('');
                        await onRefresh();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reload Latest Profile</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={saveOwnProfile}
                      disabled={profSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Save</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Profile Photo
                </label>
                <div className="flex items-center gap-3">
                  <img
                    src={profPhoto}
                    alt="Profile preview"
                    className="w-14 h-14 rounded-xl object-cover border border-slate-200 bg-slate-100 shrink-0"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{profUploadingKind === 'avatar' ? 'Uploading...' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={profUploadingKind !== null}
                      onChange={(e) => handleProfileImage(e, 'avatar', setProfPhoto)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cover Photo
                </label>
                <div className="flex items-center gap-3">
                  <img
                    src={profCover}
                    alt="Cover preview"
                    className="w-24 h-14 rounded-xl object-cover border border-slate-200 bg-slate-100 shrink-0"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{profUploadingKind === 'cover' ? 'Uploading...' : 'Upload Cover'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={profUploadingKind !== null}
                      onChange={(e) => handleProfileImage(e, 'cover', setProfCover)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={profName}
                  onChange={(e) => {
                    setProfDirty(true);
                    setProfName(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Designation
                </label>
                <input
                  type="text"
                  value={profDesignation}
                  onChange={(e) => {
                    setProfDirty(true);
                    setProfDesignation(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  User ID (Assigned by Admin)
                </label>
                <input
                  type="text"
                  disabled
                  value={data.user.userId}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-slate-100 text-slate-600 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Change Password (Optional, min. 12 chars)
                </label>
                <input
                  type="password"
                  value={profPassword}
                  onChange={(e) => {
                    setProfDirty(true);
                    setProfPassword(e.target.value);
                  }}
                  placeholder="Leave blank to keep current"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Official Phone Number
                </label>
                <input
                  type="tel"
                  value={profPhone}
                  onChange={(e) => {
                    setProfDirty(true);
                    setProfPhone(e.target.value);
                  }}
                  placeholder="+88017..."
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Personal Phone Number
                </label>
                <input
                  type="tel"
                  value={profPersonalPhone}
                  onChange={(e) => {
                    setProfDirty(true);
                    setProfPersonalPhone(e.target.value);
                  }}
                  placeholder="+88018..."
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  WhatsApp Number
                </label>
                <input
                  type="tel"
                  value={profWhatsapp}
                  onChange={(e) => {
                    setProfDirty(true);
                    setProfWhatsapp(e.target.value);
                  }}
                  placeholder="+88017..."
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Joining Date
                </label>
                <input
                  type="date"
                  value={profJoiningDate}
                  onChange={(e) => {
                    setProfDirty(true);
                    setProfJoiningDate(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Facebook / Social Link
              </label>
              <input
                type="text"
                value={profSocial}
                onChange={(e) => {
                  setProfDirty(true);
                  setProfSocial(e.target.value);
                }}
                placeholder="https://facebook.com/..."
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={profSaving || profUploadingKind !== null}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {profSaving ? 'Saving Profile...' : 'Save Profile'}
              </button>
            </div>
          </form>

          <div className="lg:col-span-5">
            <StaffContactCard
              staff={{
                ...data.user,
                name: profName,
                designation: profDesignation,
                phone: profPhone,
                personalPhone: profPersonalPhone,
                whatsapp: profWhatsapp,
                socialLink: profSocial,
                joiningDate: profJoiningDate,
                photoUrl: profPhoto,
                coverUrl: profCover,
              }}
              heading="Live Profile Preview"
              showInternalDetails={true}
            />
          </div>
        </div>
      )}

      {/* ====================================================================
          STAFF DAILY REPORT, CLIENT COUNTS & CONVERSATIONS TAB
         ==================================================================== */}
      {activeTab === 'daily' && (
        <DailyOperationsPanel
          mode="team"
          currentUser={data.user}
          roster={teamRoster}
          attendanceRecords={attendanceRecords}
          dailyLogs={dailyLogs}
          dailyClientSummaries={dailyClientSummaries}
          canManageAll={false}
          onQuickCheckIn={handleQuickCheckIn}
          onQuickCheckOut={handleQuickCheckOut}
          onOpenAttendanceModal={(record, _staffId, presetDate) =>
            setAttendanceModal({ open: true, item: record, presetDate })
          }
          onOpenLogModal={(log, presetDate) =>
            setDailyLogModal({ open: true, item: log, presetDate })
          }
          onDeleteLog={async (id) => {
            setActionError('');
            try {
              await api.deleteDailyLog(id);
              await onRefresh();
              notifySuccess('Conversation log archived.');
            } catch (err) {
              setActionError(err instanceof Error ? err.message : 'Failed to archive log.');
            }
          }}
        />
      )}

      {clientModalOpen && (
        <ClientModal
          initial={null}
          isAdmin={false}
          staffList={data.staffList}
          defaultStaffId={data.user.id}
          onClose={() => setClientModalOpen(false)}
          onSave={async (payload) => {
            await api.createClient(payload);
            await onRefresh();
            setClientModalOpen(false);
            notifySuccess('New client profile saved permanently in database.');
          }}
        />
      )}

      {staffModalOpen && (
        <StaffAccountModal
          allowedRoles={['staff']}
          defaultRole="staff"
          onClose={() => setStaffModalOpen(false)}
          onSave={async (payload) => {
            if (!payload.password) throw new Error('Password is required to create an account.');
            await api.createStaff({ ...payload, password: payload.password });
            await onRefresh();
            setStaffModalOpen(false);
            notifySuccess('Staff login account created successfully.');
          }}
        />
      )}

      {ledgerModalOpen && canManageFinance && (
        <LedgerEntryModal
          initial={null}
          ownerId={data.user.id}
          onClose={() => setLedgerModalOpen(false)}
          onSave={async (payload) => {
            await api.createLedgerEntry(payload);
            await onRefresh();
            notifySuccess('Debit / Credit entry saved permanently in database.');
          }}
        />
      )}

      {attendanceModal.open && (
        <AttendanceModal
          initial={attendanceModal.item}
          isAdmin={false}
          staffRoster={[data.user]}
          defaultStaffId={data.user.id}
          defaultDate={attendanceModal.presetDate}
          onClose={() => setAttendanceModal({ open: false, item: null })}
          onSave={async (payload) => {
            if (attendanceModal.item) {
              await api.updateAttendance(attendanceModal.item.id, payload);
              await onRefresh();
              notifySuccess('Attendance updated in database.');
            } else {
              await api.markAttendance(payload);
              await onRefresh();
              notifySuccess('Daily attendance saved permanently in database.');
            }
          }}
        />
      )}

      {dailyLogModal.open && (
        <DailyLogModal
          initial={dailyLogModal.item}
          isAdmin={false}
          staffRoster={[data.user]}
          defaultStaffId={data.user.id}
          defaultDate={dailyLogModal.presetDate}
          onClose={() => setDailyLogModal({ open: false, item: null })}
          onSave={async (payload) => {
            if (dailyLogModal.item) {
              await api.updateDailyLog(dailyLogModal.item.id, payload);
              await onRefresh();
              notifySuccess('Conversation log updated in database.');
            } else {
              await api.createDailyLog(payload);
              await onRefresh();
              notifySuccess('Daily conversation saved permanently in database.');
            }
          }}
        />
      )}
    </DashboardShell>
  );
}
