import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArchiveRestore,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  Globe,
  History,
  KeyRound,
  LayoutDashboard,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Stethoscope,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, ConflictError, formatBDT, formatDateOnly, formatDateTime } from '../lib/api';
import { useUnsavedChangesWarning } from '../lib/useUnsavedChanges';
import type {
  ClientProfile,
  DashboardData,
  InterviewRecord,
  MedicalRecord,
  MeetingRecord,
  PublicUser,
  SiteSettings,
} from '../types';
import { DashboardShell, type NavTab } from './DashboardShell';
import { StaffContactCard } from './StaffContactCard';
import { WebsiteControlPanel } from './WebsiteControlPanel';
import {
  ClientModal,
  InterviewModal,
  MedicalModal,
  MeetingModal,
  StaffAccountModal,
} from './modals/RecordModals';

interface AdminDashboardProps {
  data: DashboardData;
  siteSettings: SiteSettings;
  onSiteSettingsSaved: (next: SiteSettings) => void;
  onRefresh: () => Promise<void>;
  onGoHome: () => void;
  onLogout: () => void;
}

type AdminTab =
  | 'overview'
  | 'meetings'
  | 'medicals'
  | 'interviews'
  | 'clients'
  | 'staff'
  | 'audit'
  | 'website'
  | 'settings';

export function AdminDashboard({
  data,
  siteSettings,
  onSiteSettingsSaved,
  onRefresh,
  onGoHome,
  onLogout,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [staffFilter, setStaffFilter] = useState('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState('');
  const [actionError, setActionError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Admin Credentials & Settings Form State
  const [adminUserId, setAdminUserId] = useState(data.user.userId);
  const [adminName, setAdminName] = useState(data.user.name);
  const [adminPhone, setAdminPhone] = useState(data.user.phone);
  const [adminWhatsapp, setAdminWhatsapp] = useState(data.user.whatsapp);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  useUnsavedChangesWarning(settingsDirty && !settingsSaving);

  useEffect(() => {
    if (!settingsDirty) {
      setAdminUserId(data.user.userId);
      setAdminName(data.user.name);
      setAdminPhone(data.user.phone);
      setAdminWhatsapp(data.user.whatsapp);
    }
  }, [data.user, settingsDirty]);

  function notifySuccess(msg: string) {
    setActionError('');
    setSaveToast(msg);
  }

  async function handleSaveAdminCredentials(e: FormEvent) {
    e.preventDefault();
    setSettingsError('');
    if (!adminUserId.trim() || !adminName.trim()) {
      setSettingsError('Admin User ID and Display Name are required.');
      return;
    }
    if (adminNewPassword.trim()) {
      if (adminNewPassword.trim().length < 4) {
        setSettingsError('New password must be at least 4 characters.');
        return;
      }
      if (adminNewPassword.trim() !== adminConfirmPassword.trim()) {
        setSettingsError('New password and confirmation password do not match.');
        return;
      }
    }

    setSettingsSaving(true);
    try {
      await api.updateOwnProfile({
        userId: adminUserId.trim(),
        name: adminName.trim(),
        phone: adminPhone.trim(),
        whatsapp: adminWhatsapp.trim(),
        newPassword: adminNewPassword.trim() || undefined,
        expectedVersion: data.user.version,
      });
      setAdminNewPassword('');
      setAdminConfirmPassword('');
      setSettingsDirty(false);
      await onRefresh();
      notifySuccess(
        adminNewPassword.trim()
          ? 'Admin User ID and password updated in database.'
          : 'Admin credentials and profile updated in database.'
      );
    } catch (err) {
      if (err instanceof ConflictError) {
        setSettingsError(err.message);
      } else {
        setSettingsError(
          err instanceof Error ? err.message : 'Failed to update admin credentials.'
        );
      }
    } finally {
      setSettingsSaving(false);
    }
  }

  // Modal states
  const [clientModal, setClientModal] = useState<{ open: boolean; item: ClientProfile | null }>({
    open: false,
    item: null,
  });
  const [meetingModal, setMeetingModal] = useState<{ open: boolean; item: MeetingRecord | null }>({
    open: false,
    item: null,
  });
  const [medicalModal, setMedicalModal] = useState<{ open: boolean; item: MedicalRecord | null }>({
    open: false,
    item: null,
  });
  const [interviewModal, setInterviewModal] = useState<{
    open: boolean;
    item: InterviewRecord | null;
  }>({ open: false, item: null });
  const [staffModal, setStaffModal] = useState<{ open: boolean; item: PublicUser | null }>({
    open: false,
    item: null,
  });

  const staffNameMap = useMemo(() => {
    const map = new Map<string, PublicUser>();
    data.staffList.forEach((s) => map.set(s.id, s));
    return map;
  }, [data.staffList]);

  function getStaffLabel(staffId: string): string {
    if (staffId === data.user.id) return `${data.user.name} (Admin)`;
    return staffNameMap.get(staffId)?.name || 'Unassigned';
  }

  // Aggregates
  const medicalTotals = useMemo(() => {
    const totalCandidates = data.medicals.length;
    const totalPaid = data.medicals.reduce((s, m) => s + (m.amountPaid || 0), 0);
    const totalReceivable = data.medicals.reduce((s, m) => s + (m.amountReceivable || 0), 0);
    return {
      totalCandidates,
      totalPaid,
      totalReceivable,
      totalValue: totalPaid + totalReceivable,
    };
  }, [data.medicals]);

  const totalInterviewClients = useMemo(
    () => data.interviews.reduce((s, i) => s + (i.clientCount || 1), 0),
    [data.interviews]
  );

  const staffBreakdown = useMemo(() => {
    return data.staffList.map((s) => {
      const sClients = data.clients.filter((c) => c.staffId === s.id);
      const sMeetings = data.meetings.filter((m) => m.staffId === s.id);
      const sMedicals = data.medicals.filter((m) => m.staffId === s.id);
      const sInterviews = data.interviews.filter((i) => i.staffId === s.id);
      const medPaid = sMedicals.reduce((sum, m) => sum + (m.amountPaid || 0), 0);
      const medDue = sMedicals.reduce((sum, m) => sum + (m.amountReceivable || 0), 0);
      const interviewCount = sInterviews.reduce((sum, i) => sum + (i.clientCount || 1), 0);
      return {
        staff: s,
        clientsCount: sClients.length,
        meetingsCount: sMeetings.length,
        medicalsCount: sMedicals.length,
        medPaid,
        medDue,
        interviewsCount: sInterviews.length,
        interviewCandidatesCount: interviewCount,
      };
    });
  }, [data]);

  const q = searchQuery.trim().toLowerCase();

  const filteredMeetings = useMemo(
    () =>
      data.meetings.filter((m) => {
        if (staffFilter !== 'all' && m.staffId !== staffFilter) return false;
        if (!q) return true;
        return (
          m.clientName.toLowerCase().includes(q) ||
          m.meetingWith.toLowerCase().includes(q) ||
          m.location.toLowerCase().includes(q)
        );
      }),
    [data.meetings, staffFilter, q]
  );

  const filteredMedicals = useMemo(
    () =>
      data.medicals.filter((m) => {
        if (staffFilter !== 'all' && m.staffId !== staffFilter) return false;
        if (!q) return true;
        return (
          m.candidateName.toLowerCase().includes(q) ||
          m.medicalCenter.toLowerCase().includes(q) ||
          m.medicalLocation.toLowerCase().includes(q) ||
          m.paymentPurpose.toLowerCase().includes(q)
        );
      }),
    [data.medicals, staffFilter, q]
  );

  const filteredInterviews = useMemo(
    () =>
      data.interviews.filter((i) => {
        if (staffFilter !== 'all' && i.staffId !== staffFilter) return false;
        if (!q) return true;
        return (
          i.candidateNames.toLowerCase().includes(q) ||
          i.interviewerOrCompany.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q) ||
          i.trade.toLowerCase().includes(q)
        );
      }),
    [data.interviews, staffFilter, q]
  );

  const filteredClients = useMemo(
    () =>
      data.clients.filter((c) => {
        if (staffFilter !== 'all' && c.staffId !== staffFilter) return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.trade.toLowerCase().includes(q) ||
          c.destinationCountry.toLowerCase().includes(q)
        );
      }),
    [data.clients, staffFilter, q]
  );

  const archivedCount =
    (data.archivedClients?.length || 0) +
    (data.archivedMeetings?.length || 0) +
    (data.archivedMedicals?.length || 0) +
    (data.archivedInterviews?.length || 0);

  const tabs: NavTab[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'meetings',
      label: 'Meetings',
      icon: <Calendar className="w-4 h-4" />,
      count: data.meetings.length,
    },
    {
      id: 'medicals',
      label: 'Medicals & Finance',
      icon: <Stethoscope className="w-4 h-4" />,
      count: data.medicals.length,
    },
    {
      id: 'interviews',
      label: 'Interviews',
      icon: <Briefcase className="w-4 h-4" />,
      count: data.interviews.length,
    },
    {
      id: 'clients',
      label: 'Clients',
      icon: <ClipboardList className="w-4 h-4" />,
      count: data.clients.length,
    },
    {
      id: 'staff',
      label: 'Staff Accounts',
      icon: <Users className="w-4 h-4" />,
      count: data.staffList.length,
    },
    {
      id: 'audit',
      label: 'Audit & Archive',
      icon: <History className="w-4 h-4" />,
      count: archivedCount > 0 ? archivedCount : undefined,
    },
    {
      id: 'website',
      label: 'Website Control',
      icon: <Globe className="w-4 h-4" />,
    },
    {
      id: 'settings',
      label: 'Admin Credentials',
      icon: <KeyRound className="w-4 h-4" />,
    },
  ];

  const primaryAction = (() => {
    if (activeTab === 'audit' || activeTab === 'website' || activeTab === 'settings') return null;
    if (activeTab === 'staff') {
      return (
        <button
          type="button"
          onClick={() => setStaffModal({ open: true, item: null })}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" />
          <span>Create Staff ID</span>
        </button>
      );
    }
    if (activeTab === 'meetings') {
      return (
        <button
          type="button"
          onClick={() => setMeetingModal({ open: true, item: null })}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add Meeting</span>
        </button>
      );
    }
    if (activeTab === 'medicals') {
      return (
        <button
          type="button"
          onClick={() => setMedicalModal({ open: true, item: null })}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add Medical</span>
        </button>
      );
    }
    if (activeTab === 'interviews') {
      return (
        <button
          type="button"
          onClick={() => setInterviewModal({ open: true, item: null })}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add Interview</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setClientModal({ open: true, item: null })}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
      >
        <Plus className="w-4 h-4" />
        <span>Add Client</span>
      </button>
    );
  })();

  const defaultStaffId = data.staffList[0]?.id || data.user.id;

  return (
    <DashboardShell
      user={data.user}
      roleLabel="Admin Control Center"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as AdminTab);
        setConfirmDeleteId(null);
      }}
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

      {/* Shared Filter Toolbar for List Views */}
      {activeTab !== 'overview' && activeTab !== 'staff' && activeTab !== 'audit' && (
        <div className="mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white border border-slate-200 rounded-xl p-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, location, center..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="admin-staff-filter" className="text-xs font-medium text-slate-500">
              Filter Staff:
            </label>
            <select
              id="admin-staff-filter"
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
            >
              <option value="all">All Staff Members</option>
              {data.staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ====================================================================
          OVERVIEW TAB
         ==================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Top KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <button
              type="button"
              onClick={() => setActiveTab('meetings')}
              className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition-colors cursor-pointer"
            >
              <p className="text-xs font-medium text-slate-500">Total Meetings</p>
              <p className="font-mono text-3xl font-bold text-slate-900 tabular-nums mt-2">
                {data.meetings.length}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {data.meetings.filter((m) => m.status === 'Scheduled').length} currently scheduled
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('medicals')}
              className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition-colors cursor-pointer"
            >
              <p className="text-xs font-medium text-slate-500">Medical Candidates & Totals</p>
              <p className="font-mono text-3xl font-bold text-slate-900 tabular-nums mt-2">
                {medicalTotals.totalCandidates}
              </p>
              <p className="text-xs text-slate-600 font-mono tabular-nums mt-2">
                Paid {formatBDT(medicalTotals.totalPaid)} · Due {formatBDT(medicalTotals.totalReceivable)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('interviews')}
              className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition-colors cursor-pointer"
            >
              <p className="text-xs font-medium text-slate-500">Interview Candidates</p>
              <p className="font-mono text-3xl font-bold text-slate-900 tabular-nums mt-2">
                {totalInterviewClients}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Across {data.interviews.length} scheduled sessions
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('clients')}
              className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition-colors cursor-pointer"
            >
              <p className="text-xs font-medium text-slate-500">Active Clients & Staff</p>
              <p className="font-mono text-3xl font-bold text-slate-900 tabular-nums mt-2">
                {data.clients.length}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Managed by {data.staffList.length} staff coordinators
              </p>
            </button>
          </div>

          {/* Per-Staff Operational & Financial Breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Staff Activity & Medical Finance Breakdown
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time entries submitted by each staff coordinator
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStaffModal({ open: true, item: null })}
                className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                + Create Staff Account
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Staff Member</th>
                    <th className="px-4 py-3 font-medium text-right">Clients</th>
                    <th className="px-4 py-3 font-medium text-right">Meetings</th>
                    <th className="px-4 py-3 font-medium text-right">Medical Jatri</th>
                    <th className="px-4 py-3 font-medium text-right">Medical Paid</th>
                    <th className="px-4 py-3 font-medium text-right">Medical Due</th>
                    <th className="px-6 py-3 font-medium text-right">Interview Jatri</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                        No staff members created yet. Create a staff ID & password to begin.
                      </td>
                    </tr>
                  ) : (
                    staffBreakdown.map((row) => (
                      <tr key={row.staff.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5">
                          <p className="font-semibold text-slate-900">{row.staff.name}</p>
                          <p className="text-xs text-slate-500 font-mono">@{row.staff.userId}</p>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-800">
                          {row.clientsCount}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-800">
                          {row.meetingsCount}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-800">
                          {row.medicalsCount}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-emerald-700 font-medium">
                          {formatBDT(row.medPaid)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-amber-700 font-medium">
                          {formatBDT(row.medDue)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums text-slate-800">
                          {row.interviewCandidatesCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Feeds: Upcoming Meetings & Upcoming Interviews */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Recent & Upcoming Meetings
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('meetings')}
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  View All
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {data.meetings.slice(0, 4).map((m) => (
                  <div key={m.id} className="py-3 flex items-start justify-between gap-4 text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {m.clientName} <span className="text-slate-400 font-normal">with</span>{' '}
                        {m.meetingWith}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Staff: {getStaffLabel(m.staffId)} · {m.location}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs text-slate-700">
                        {formatDateTime(m.dateTime)}
                      </p>
                      <p className="text-xs font-medium text-blue-700 mt-0.5">{m.status}</p>
                    </div>
                  </div>
                ))}
                {data.meetings.length === 0 && (
                  <p className="text-sm text-slate-500 py-4">No meetings recorded yet.</p>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Interview Schedule Summary
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('interviews')}
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  View All
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {data.interviews.slice(0, 4).map((iv) => (
                  <div key={iv.id} className="py-3 flex items-start justify-between gap-4 text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{iv.interviewerOrCompany}</p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Candidates ({iv.clientCount}): {iv.candidateNames}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Staff: {getStaffLabel(iv.staffId)} · {iv.location}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs text-slate-700">
                        {formatDateOnly(iv.interviewDate)}
                      </p>
                      <p className="text-xs font-medium text-emerald-700 mt-0.5">{iv.status}</p>
                    </div>
                  </div>
                ))}
                {data.interviews.length === 0 && (
                  <p className="text-sm text-slate-500 py-4">No interviews recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MEETINGS TAB
         ==================================================================== */}
      {activeTab === 'meetings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                All Meetings ({filteredMeetings.length})
              </h2>
              <p className="text-xs text-slate-500">
                Who is meeting whom, which staff&apos;s client, location, and exact time
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Staff</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Meeting With</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Date & Time</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMeetings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                      No meetings match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredMeetings.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-3.5 text-slate-700 font-medium">
                        {getStaffLabel(m.staffId)}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-900">{m.clientName}</p>
                        {m.clientPhone && (
                          <p className="text-xs text-slate-500 font-mono">{m.clientPhone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-800">
                        <p className="font-medium">{m.meetingWith}</p>
                        {m.purpose && <p className="text-xs text-slate-500">{m.purpose}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{m.location}</td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {formatDateTime(m.dateTime)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-xs font-semibold ${
                            m.status === 'Completed'
                              ? 'text-emerald-700'
                              : m.status === 'Cancelled'
                              ? 'text-red-700'
                              : 'text-blue-700'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setMeetingModal({ open: true, item: m })}
                          className="p-1.5 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                          title="Edit meeting"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDeleteId === m.id ? (
                          <span className="inline-flex items-center gap-1 ml-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  setActionError('');
                                  try {
                                    await api.deleteMeeting(m.id);
                                    setConfirmDeleteId(null);
                                    await onRefresh();
                                    notifySuccess('Meeting archived. You can restore it anytime from Audit & Archive.');
                                  } catch (err) {
                                    setConfirmDeleteId(null);
                                    setActionError(err instanceof Error ? err.message : 'Failed to archive meeting.');
                                  }
                                }}
                                className="px-2 py-1 text-xs font-semibold text-white bg-red-600 rounded cursor-pointer"
                              >
                                Confirm
                              </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-xs text-slate-600 bg-slate-100 rounded cursor-pointer"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(m.id)}
                            className="p-1.5 text-slate-500 hover:text-red-600 rounded ml-1 cursor-pointer"
                            title="Delete meeting"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====================================================================
          MEDICALS & FINANCE TAB
         ==================================================================== */}
      {activeTab === 'medicals' && (
        <div className="space-y-6">
          {/* Totals Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Medical Candidates</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {filteredMedicals.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Paid (Koto Tk Dise)</p>
              <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                {formatBDT(filteredMedicals.reduce((s, m) => s + (m.amountPaid || 0), 0))}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Receivable (Koto Paya Jabe)</p>
              <p className="font-mono text-2xl font-bold text-amber-700 tabular-nums mt-1">
                {formatBDT(filteredMedicals.reduce((s, m) => s + (m.amountReceivable || 0), 0))}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Combined Medical Total</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {formatBDT(
                  filteredMedicals.reduce(
                    (s, m) => s + (m.amountPaid || 0) + (m.amountReceivable || 0),
                    0
                  )
                )}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-slate-900">
                Medical Screening & Payment Ledger
              </h2>
              <p className="text-xs text-slate-500">
                Center, location, staff owner, paid amount, receivable due, and payment purpose
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Staff</th>
                    <th className="px-4 py-3 font-medium">Candidate</th>
                    <th className="px-4 py-3 font-medium">Medical Center & Location</th>
                    <th className="px-4 py-3 font-medium">Purpose</th>
                    <th className="px-4 py-3 font-medium text-right">Paid</th>
                    <th className="px-4 py-3 font-medium text-right">Receivable</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMedicals.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-slate-500">
                        No medical records found.
                      </td>
                    </tr>
                  ) : (
                    filteredMedicals.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5 text-slate-700 font-medium">
                          {getStaffLabel(m.staffId)}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-900">{m.candidateName}</p>
                          <p className="text-xs text-slate-500 font-mono">
                            {m.candidatePhone || formatDateOnly(m.testDate)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-900">{m.medicalCenter}</p>
                          <p className="text-xs text-slate-500">{m.medicalLocation}</p>
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">
                          {m.paymentPurpose || 'Medical Screening'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {formatBDT(m.amountPaid)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-amber-700">
                          {formatBDT(m.amountReceivable)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`text-xs font-semibold ${
                              m.result === 'Fit'
                                ? 'text-emerald-700'
                                : m.result === 'Unfit'
                                ? 'text-red-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {m.result}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setMedicalModal({ open: true, item: m })}
                            className="p-1.5 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                            title="Edit medical"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {confirmDeleteId === m.id ? (
                            <span className="inline-flex items-center gap-1 ml-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  setActionError('');
                                  try {
                                    await api.deleteMedical(m.id);
                                    setConfirmDeleteId(null);
                                    await onRefresh();
                                    notifySuccess('Medical record archived. You can restore it from Audit & Archive.');
                                  } catch (err) {
                                    setConfirmDeleteId(null);
                                    setActionError(err instanceof Error ? err.message : 'Failed to archive medical record.');
                                  }
                                }}
                                className="px-2 py-1 text-xs font-semibold text-white bg-red-600 rounded cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-xs text-slate-600 bg-slate-100 rounded cursor-pointer"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(m.id)}
                              className="p-1.5 text-slate-500 hover:text-red-600 rounded ml-1 cursor-pointer"
                              title="Delete medical"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          INTERVIEWS TAB
         ==================================================================== */}
      {activeTab === 'interviews' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Interview Sessions</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {filteredInterviews.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Interview Candidates</p>
              <p className="font-mono text-2xl font-bold text-blue-700 tabular-nums mt-1">
                {filteredInterviews.reduce((s, i) => s + (i.clientCount || 1), 0)}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-slate-900">
                Employer Interviews & Trade Assessments
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Staff</th>
                    <th className="px-4 py-3 font-medium">Candidates (Jatri)</th>
                    <th className="px-4 py-3 font-medium text-right">Count</th>
                    <th className="px-4 py-3 font-medium">Company / Interviewer</th>
                    <th className="px-4 py-3 font-medium">Date & Location</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInterviews.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                        No interviews found.
                      </td>
                    </tr>
                  ) : (
                    filteredInterviews.map((iv) => (
                      <tr key={iv.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5 text-slate-700 font-medium">
                          {getStaffLabel(iv.staffId)}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-900">{iv.candidateNames}</p>
                          {iv.trade && <p className="text-xs text-slate-500">Trade: {iv.trade}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {iv.clientCount}
                        </td>
                        <td className="px-4 py-3.5 text-slate-800">{iv.interviewerOrCompany}</td>
                        <td className="px-4 py-3.5">
                          <p className="font-mono text-xs text-slate-800">
                            {formatDateOnly(iv.interviewDate)}
                            {iv.interviewTime ? ` · ${iv.interviewTime}` : ''}
                          </p>
                          <p className="text-xs text-slate-500">{iv.location}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`text-xs font-semibold ${
                              iv.status === 'Selected' || iv.status === 'Completed'
                                ? 'text-emerald-700'
                                : iv.status === 'Rejected'
                                ? 'text-red-700'
                                : 'text-blue-700'
                            }`}
                          >
                            {iv.status}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setInterviewModal({ open: true, item: iv })}
                            className="p-1.5 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                            title="Edit interview"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {confirmDeleteId === iv.id ? (
                            <span className="inline-flex items-center gap-1 ml-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  setActionError('');
                                  try {
                                    await api.deleteInterview(iv.id);
                                    setConfirmDeleteId(null);
                                    await onRefresh();
                                    notifySuccess('Interview record archived. You can restore it from Audit & Archive.');
                                  } catch (err) {
                                    setConfirmDeleteId(null);
                                    setActionError(err instanceof Error ? err.message : 'Failed to archive interview.');
                                  }
                                }}
                                className="px-2 py-1 text-xs font-semibold text-white bg-red-600 rounded cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-xs text-slate-600 bg-slate-100 rounded cursor-pointer"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(iv.id)}
                              className="p-1.5 text-slate-500 hover:text-red-600 rounded ml-1 cursor-pointer"
                              title="Delete interview"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          CLIENTS TAB
         ==================================================================== */}
      {activeTab === 'clients' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-bold text-slate-900">
              All Client Profiles ({filteredClients.length})
            </h2>
            <p className="text-xs text-slate-500">
              Full document, medical, salary, payment, and remaining requirement records
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Staff</th>
                  <th className="px-4 py-3 font-medium">Client & Phone</th>
                  <th className="px-4 py-3 font-medium">Trade & Country</th>
                  <th className="px-4 py-3 font-medium">Medical</th>
                  <th className="px-4 py-3 font-medium text-right">Paid / Due</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                      No client profiles found.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((c) => {
                    const due = Math.max(0, (c.totalPayable || 0) - (c.totalPaid || 0));
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5 text-slate-700 font-medium">
                          {getStaffLabel(c.staffId)}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-900">{c.name}</p>
                          <p className="text-xs text-slate-500 font-mono">{c.phone}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-slate-900">{c.trade || '—'}</p>
                          <p className="text-xs text-slate-500">
                            {c.destinationCountry || 'TBD'} · {c.expectedSalary || 'Salary TBD'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`text-xs font-semibold ${
                              c.medicalStatus === 'Fit'
                                ? 'text-emerald-700'
                                : c.medicalStatus === 'Unfit'
                                ? 'text-red-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {c.medicalDone ? 'Yes' : 'No'} ({c.medicalStatus})
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                          <p className="text-xs font-semibold text-emerald-700">
                            Paid {formatBDT(c.totalPaid)}
                          </p>
                          <p className="text-xs text-amber-700">Due {formatBDT(due)}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs font-semibold text-blue-700">
                          {c.status}
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setClientModal({ open: true, item: c })}
                            className="p-1.5 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                            title="Edit client"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {confirmDeleteId === c.id ? (
                            <span className="inline-flex items-center gap-1 ml-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  setActionError('');
                                  try {
                                    await api.deleteClient(c.id);
                                    setConfirmDeleteId(null);
                                    await onRefresh();
                                    notifySuccess('Client profile archived. Restore anytime from Audit & Archive.');
                                  } catch (err) {
                                    setConfirmDeleteId(null);
                                    setActionError(err instanceof Error ? err.message : 'Failed to archive client.');
                                  }
                                }}
                                className="px-2 py-1 text-xs font-semibold text-white bg-red-600 rounded cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-xs text-slate-600 bg-slate-100 rounded cursor-pointer"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(c.id)}
                              className="p-1.5 text-slate-500 hover:text-red-600 rounded ml-1 cursor-pointer"
                              title="Delete client"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====================================================================
          STAFF ACCOUNTS TAB
         ==================================================================== */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          {data.staffList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <p className="text-base font-semibold text-slate-900">No Staff Accounts Yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Create staff User IDs and passwords so coordinators can log in and manage their clients.
              </p>
              <button
                type="button"
                onClick={() => setStaffModal({ open: true, item: null })}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create First Staff ID</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {data.staffList.map((staff) => (
                <div key={staff.id} className="space-y-3">
                  <StaffContactCard
                    staff={staff}
                    heading={`Login ID: @${staff.userId}`}
                  />
                  <div className="flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs">
                    <span className="text-slate-500 font-mono">
                      {data.clients.filter((c) => c.staffId === staff.id).length} clients assigned
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setStaffModal({ open: true, item: staff })}
                        className="px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-50 rounded cursor-pointer"
                      >
                        Edit / Reset Pass
                      </button>
                      {confirmDeleteId === staff.id ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              setActionError('');
                              try {
                                await api.deleteStaff(staff.id);
                                setConfirmDeleteId(null);
                                await onRefresh();
                                notifySuccess('Staff account removed from active roster.');
                              } catch (err) {
                                setConfirmDeleteId(null);
                                setActionError(err instanceof Error ? err.message : 'Failed to remove staff account.');
                              }
                            }}
                            className="px-2 py-1 font-semibold text-white bg-red-600 rounded cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-slate-600 bg-slate-100 rounded cursor-pointer"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(staff.id)}
                          className="px-2.5 py-1 font-semibold text-red-600 hover:bg-red-50 rounded cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          AUDIT & ARCHIVE TAB
         ==================================================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-8">
          {/* Soft-Deleted / Archived Records */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <ArchiveRestore className="w-4 h-4 text-blue-700" />
                  <span>Archived Records (Soft-Deleted Recovery)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Records deleted by staff or admin are preserved here and can be restored with one click.
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {archivedCount} archived
              </span>
            </div>

            {archivedCount === 0 ? (
              <div className="px-6 py-8 text-sm text-slate-500 text-center">
                No archived records. Any soft-deleted clients, meetings, medicals, or interviews appear here.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {[
                  ...(data.archivedClients || []).map((item) => ({
                    table: 'clients' as const,
                    id: item.id,
                    typeLabel: 'Client Profile',
                    title: `${item.name} (${item.phone})`,
                    deletedAt: item.deletedAt,
                  })),
                  ...(data.archivedMeetings || []).map((item) => ({
                    table: 'meetings' as const,
                    id: item.id,
                    typeLabel: 'Meeting',
                    title: `${item.clientName} with ${item.meetingWith}`,
                    deletedAt: item.deletedAt,
                  })),
                  ...(data.archivedMedicals || []).map((item) => ({
                    table: 'medicals' as const,
                    id: item.id,
                    typeLabel: 'Medical',
                    title: `${item.candidateName} — ${item.medicalCenter}`,
                    deletedAt: item.deletedAt,
                  })),
                  ...(data.archivedInterviews || []).map((item) => ({
                    table: 'interviews' as const,
                    id: item.id,
                    typeLabel: 'Interview',
                    title: `${item.candidateNames} (${item.interviewerOrCompany})`,
                    deletedAt: item.deletedAt,
                  })),
                ].map((rec) => (
                  <div
                    key={`${rec.table}_${rec.id}`}
                    className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/60"
                  >
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {rec.typeLabel}
                      </span>
                      <p className="text-sm font-semibold text-slate-900">{rec.title}</p>
                      {rec.deletedAt && (
                        <p className="text-xs text-slate-500 font-mono">
                          Archived {formatDateTime(rec.deletedAt)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={restoringId === rec.id}
                      onClick={async () => {
                        setActionError('');
                        setRestoringId(rec.id);
                        try {
                          await api.restoreRecord(rec.table, rec.id);
                          await onRefresh();
                          notifySuccess(`${rec.typeLabel} "${rec.title}" restored to active records.`);
                        } catch (err) {
                          setActionError(err instanceof Error ? err.message : 'Failed to restore record.');
                        } finally {
                          setRestoringId(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{restoringId === rec.id ? 'Restoring...' : 'Restore Record'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit History Log */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-700" />
                  <span>Change Audit Trail</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Immutable log of creations, edits, soft deletions, and restorations across all records.
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {(data.auditLogs || []).length} events
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Record Type</th>
                    <th className="px-6 py-3 font-medium">Changed Fields</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.auditLogs || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                        No audit events recorded yet. Events appear automatically once database triggers are active.
                      </td>
                    </tr>
                  ) : (
                    (data.auditLogs || []).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 align-top">
                        <td className="px-6 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                          {log.actorName || 'System'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${
                              log.action === 'SOFT_DELETE'
                                ? 'text-red-700'
                                : log.action === 'RESTORE'
                                ? 'text-emerald-700'
                                : log.action === 'INSERT'
                                ? 'text-blue-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {log.tableName}
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-600">
                          {Object.entries(log.changedFields || {}).map(([field, diff]) => (
                            <div key={field} className="mb-0.5">
                              <span className="font-mono font-semibold text-slate-800">{field}:</span>{' '}
                              {diff && typeof diff === 'object' && 'changed' in diff ? (
                                <span className="text-slate-500">[Protected field updated]</span>
                              ) : diff && typeof diff === 'object' && ('old' in diff || 'new' in diff) ? (
                                <span>
                                  <span className="text-slate-400">{String(diff.old ?? '—')}</span>
                                  {' → '}
                                  <span className="text-slate-800">{String(diff.new ?? '—')}</span>
                                </span>
                              ) : (
                                <span>{String(diff)}</span>
                              )}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          WEBSITE CONTROL TAB (Logo, Slider, Photos, Functions, Contacts)
         ==================================================================== */}
      {activeTab === 'website' && (
        <WebsiteControlPanel
          siteSettings={siteSettings}
          onSiteSettingsSaved={onSiteSettingsSaved}
          onNotifySuccess={notifySuccess}
        />
      )}

      {/* ====================================================================
          ADMIN CREDENTIALS & SETTINGS TAB
         ==================================================================== */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Customize Website Logo, Running Posters, Photos & Functions
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Add or remove posters, upload logo/photos, edit hotlines, and toggle landing sections.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('website')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer shrink-0"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Open Website Control</span>
            </button>
          </div>
          <form
            onSubmit={handleSaveAdminCredentials}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Admin Login User ID & Password
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Change your Admin User ID (default: admin) or update your login password. Changes take
                effect immediately on your next sign-in.
              </p>
            </div>

            {settingsError && (
              <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {settingsError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="admin-userid-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Admin Login User ID *
                </label>
                <input
                  id="admin-userid-input"
                  type="text"
                  required
                  value={adminUserId}
                  onChange={(e) => {
                    setSettingsDirty(true);
                    setAdminUserId(e.target.value);
                  }}
                  placeholder="admin"
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-name-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Display Name *
                </label>
                <input
                  id="admin-name-input"
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => {
                    setSettingsDirty(true);
                    setAdminName(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="admin-newpass-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  New Password (min. 4 characters)
                </label>
                <div className="relative">
                  <input
                    id="admin-newpass-input"
                    type={showAdminPass ? 'text' : 'password'}
                    value={adminNewPassword}
                    onChange={(e) => {
                      setSettingsDirty(true);
                      setAdminNewPassword(e.target.value);
                    }}
                    placeholder="Leave blank to keep current password"
                    className="w-full pl-3.5 pr-10 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPass((prev) => !prev)}
                    aria-label={showAdminPass ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-confirmpass-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Confirm New Password
                </label>
                <input
                  id="admin-confirmpass-input"
                  type={showAdminPass ? 'text' : 'password'}
                  value={adminConfirmPassword}
                  onChange={(e) => {
                    setSettingsDirty(true);
                    setAdminConfirmPassword(e.target.value);
                  }}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="admin-phone-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Admin Hotline Phone
                </label>
                <input
                  id="admin-phone-input"
                  type="tel"
                  value={adminPhone}
                  onChange={(e) => {
                    setSettingsDirty(true);
                    setAdminPhone(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-whatsapp-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Admin WhatsApp
                </label>
                <input
                  id="admin-whatsapp-input"
                  type="tel"
                  value={adminWhatsapp}
                  onChange={(e) => {
                    setSettingsDirty(true);
                    setAdminWhatsapp(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={settingsSaving}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {settingsSaving ? 'Saving...' : 'Save Admin Credentials'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ====================================================================
          MODALS
         ==================================================================== */}
      {clientModal.open && (
        <ClientModal
          initial={clientModal.item}
          isAdmin={true}
          staffList={data.staffList}
          defaultStaffId={defaultStaffId}
          onClose={() => setClientModal({ open: false, item: null })}
          onSave={async (payload) => {
            if (clientModal.item) {
              await api.updateClient(clientModal.item.id, payload);
              await onRefresh();
              notifySuccess('Client profile update confirmed in database.');
            } else {
              await api.createClient(payload);
              await onRefresh();
              notifySuccess('New client profile saved permanently in database.');
            }
          }}
        />
      )}

      {meetingModal.open && (
        <MeetingModal
          initial={meetingModal.item}
          isAdmin={true}
          staffList={data.staffList}
          clients={data.clients}
          defaultStaffId={defaultStaffId}
          onClose={() => setMeetingModal({ open: false, item: null })}
          onSave={async (payload) => {
            if (meetingModal.item) {
              await api.updateMeeting(meetingModal.item.id, payload);
              await onRefresh();
              notifySuccess('Meeting update confirmed in database.');
            } else {
              await api.createMeeting(payload);
              await onRefresh();
              notifySuccess('Meeting saved permanently in database.');
            }
          }}
        />
      )}

      {medicalModal.open && (
        <MedicalModal
          initial={medicalModal.item}
          isAdmin={true}
          staffList={data.staffList}
          clients={data.clients}
          defaultStaffId={defaultStaffId}
          onClose={() => setMedicalModal({ open: false, item: null })}
          onSave={async (payload) => {
            if (medicalModal.item) {
              await api.updateMedical(medicalModal.item.id, payload);
              await onRefresh();
              notifySuccess('Medical record update confirmed in database.');
            } else {
              await api.createMedical(payload);
              await onRefresh();
              notifySuccess('Medical record saved permanently in database.');
            }
          }}
        />
      )}

      {interviewModal.open && (
        <InterviewModal
          initial={interviewModal.item}
          isAdmin={true}
          staffList={data.staffList}
          clients={data.clients}
          defaultStaffId={defaultStaffId}
          onClose={() => setInterviewModal({ open: false, item: null })}
          onSave={async (payload) => {
            if (interviewModal.item) {
              await api.updateInterview(interviewModal.item.id, payload);
              await onRefresh();
              notifySuccess('Interview schedule update confirmed in database.');
            } else {
              await api.createInterview(payload);
              await onRefresh();
              notifySuccess('Interview schedule saved permanently in database.');
            }
          }}
        />
      )}

      {staffModal.open && (
        <StaffAccountModal
          initial={staffModal.item}
          onClose={() => setStaffModal({ open: false, item: null })}
          onSave={async (payload) => {
            if (staffModal.item) {
              await api.updateStaff(staffModal.item.id, payload);
              await onRefresh();
              notifySuccess('Staff account update confirmed in database.');
            } else {
              if (!payload.password) {
                throw new Error('Password is required to create a staff account.');
              }
              await api.createStaff({
                ...payload,
                password: payload.password,
              });
              await onRefresh();
              notifySuccess('Staff account created and saved in database.');
            }
          }}
        />
      )}
    </DashboardShell>
  );
}
