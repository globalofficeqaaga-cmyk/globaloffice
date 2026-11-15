import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  Trash2,
  Upload,
  UserCircle2,
  X,
} from 'lucide-react';
import {
  api,
  ConflictError,
  formatBDT,
  formatDateOnly,
  formatDateTime,
} from '../lib/api';
import { useUnsavedChangesWarning } from '../lib/useUnsavedChanges';
import type {
  ClientProfile,
  DashboardData,
  InterviewRecord,
  MedicalRecord,
  MeetingRecord,
} from '../types';
import { DashboardShell, type NavTab } from './DashboardShell';
import { StaffContactCard } from './StaffContactCard';
import {
  ClientModal,
  InterviewModal,
  MedicalModal,
  MeetingModal,
} from './modals/RecordModals';

interface StaffDashboardProps {
  data: DashboardData;
  onRefresh: () => Promise<void>;
  onGoHome: () => void;
  onLogout: () => void;
}

type StaffTab = 'overview' | 'clients' | 'meetings' | 'medicals' | 'interviews' | 'profile';

export function StaffDashboard({
  data,
  onRefresh,
  onGoHome,
  onLogout,
}: StaffDashboardProps) {
  const [activeTab, setActiveTab] = useState<StaffTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState('');
  const [actionError, setActionError] = useState('');

  // Modals
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

  // Staff Profile Edit Form State
  const [profName, setProfName] = useState(data.user.name);
  const [profDesignation, setProfDesignation] = useState(data.user.designation);
  const [profPhone, setProfPhone] = useState(data.user.phone);
  const [profWhatsapp, setProfWhatsapp] = useState(data.user.whatsapp);
  const [profSocial, setProfSocial] = useState(data.user.socialLink);
  const [profPhoto, setProfPhoto] = useState(data.user.photoUrl);
  const [profCover, setProfCover] = useState(data.user.coverUrl);
  const [profPassword, setProfPassword] = useState('');
  const [profDirty, setProfDirty] = useState(false);
  const [profUploadingKind, setProfUploadingKind] = useState<'avatar' | 'cover' | null>(null);
  const [profSaving, setProfSaving] = useState(false);
  const [profMessage, setProfMessage] = useState('');
  const [profError, setProfError] = useState('');
  const [profConflict, setProfConflict] = useState(false);

  useUnsavedChangesWarning(profDirty && !profSaving);

  useEffect(() => {
    if (!profDirty) {
      setProfName(data.user.name);
      setProfDesignation(data.user.designation);
      setProfPhone(data.user.phone);
      setProfWhatsapp(data.user.whatsapp);
      setProfSocial(data.user.socialLink);
      setProfPhoto(data.user.photoUrl);
      setProfCover(data.user.coverUrl);
    }
  }, [data.user, profDirty]);

  function notifySuccess(msg: string) {
    setActionError('');
    setSaveToast(msg);
  }

  const medicalPaid = useMemo(
    () => data.medicals.reduce((s, m) => s + (m.amountPaid || 0), 0),
    [data.medicals]
  );
  const medicalDue = useMemo(
    () => data.medicals.reduce((s, m) => s + (m.amountReceivable || 0), 0),
    [data.medicals]
  );
  const totalInterviewCandidates = useMemo(
    () => data.interviews.reduce((s, i) => s + (i.clientCount || 1), 0),
    [data.interviews]
  );

  const q = searchQuery.trim().toLowerCase();

  const filteredClients = useMemo(
    () =>
      data.clients.filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.trade.toLowerCase().includes(q) ||
          c.destinationCountry.toLowerCase().includes(q)
      ),
    [data.clients, q]
  );

  const filteredMeetings = useMemo(
    () =>
      data.meetings.filter(
        (m) =>
          !q ||
          m.clientName.toLowerCase().includes(q) ||
          m.meetingWith.toLowerCase().includes(q) ||
          m.location.toLowerCase().includes(q)
      ),
    [data.meetings, q]
  );

  const filteredMedicals = useMemo(
    () =>
      data.medicals.filter(
        (m) =>
          !q ||
          m.candidateName.toLowerCase().includes(q) ||
          m.medicalCenter.toLowerCase().includes(q) ||
          m.medicalLocation.toLowerCase().includes(q)
      ),
    [data.medicals, q]
  );

  const filteredInterviews = useMemo(
    () =>
      data.interviews.filter(
        (i) =>
          !q ||
          i.candidateNames.toLowerCase().includes(q) ||
          i.interviewerOrCompany.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q)
      ),
    [data.interviews, q]
  );

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
      setProfError(err instanceof Error ? err.message : 'Failed to upload image file.');
    } finally {
      setProfUploadingKind(null);
    }
  }

  async function saveOwnProfile() {
    setProfError('');
    setProfMessage('');
    setProfConflict(false);
    setProfSaving(true);
    try {
      await api.updateOwnProfile({
        name: profName.trim(),
        designation: profDesignation.trim(),
        phone: profPhone.trim(),
        whatsapp: profWhatsapp.trim(),
        socialLink: profSocial.trim(),
        photoUrl: profPhoto.trim(),
        coverUrl: profCover.trim(),
        newPassword: profPassword.trim() || undefined,
        expectedVersion: data.user.version,
      });
      setProfPassword('');
      setProfDirty(false);
      await onRefresh();
      setProfMessage('Profile saved to database. Clients searching their status will see these details.');
    } catch (err) {
      if (err instanceof ConflictError) setProfConflict(true);
      setProfError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setProfSaving(false);
    }
  }

  function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    saveOwnProfile();
  }

  const tabs: NavTab[] = [
    { id: 'overview', label: 'My Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'clients',
      label: 'My Clients',
      icon: <ClipboardList className="w-4 h-4" />,
      count: data.clients.length,
    },
    {
      id: 'meetings',
      label: 'My Meetings',
      icon: <Calendar className="w-4 h-4" />,
      count: data.meetings.length,
    },
    {
      id: 'medicals',
      label: 'My Medicals',
      icon: <Stethoscope className="w-4 h-4" />,
      count: data.medicals.length,
    },
    {
      id: 'interviews',
      label: 'My Interviews',
      icon: <Briefcase className="w-4 h-4" />,
      count: data.interviews.length,
    },
    { id: 'profile', label: 'My Profile', icon: <UserCircle2 className="w-4 h-4" /> },
  ];

  const primaryAction = (() => {
    if (activeTab === 'meetings') {
      return (
        <button
          type="button"
          onClick={() => setMeetingModal({ open: true, item: null })}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 min-h-[38px] text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span className="sm:hidden">Meeting</span>
          <span className="hidden sm:inline">Add Meeting</span>
        </button>
      );
    }
    if (activeTab === 'medicals') {
      return (
        <button
          type="button"
          onClick={() => setMedicalModal({ open: true, item: null })}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 min-h-[38px] text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span className="sm:hidden">Medical</span>
          <span className="hidden sm:inline">Add Medical</span>
        </button>
      );
    }
    if (activeTab === 'interviews') {
      return (
        <button
          type="button"
          onClick={() => setInterviewModal({ open: true, item: null })}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 min-h-[38px] text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span className="sm:hidden">Interview</span>
          <span className="hidden sm:inline">Add Interview</span>
        </button>
      );
    }
    if (activeTab === 'profile') return null;
    return (
      <button
        type="button"
        onClick={() => setClientModal({ open: true, item: null })}
        className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 min-h-[38px] text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
      >
        <Plus className="w-4 h-4" />
        <span className="sm:hidden">New Client</span>
        <span className="hidden sm:inline">New Client Profile</span>
      </button>
    );
  })();

  return (
    <DashboardShell
      user={data.user}
      roleLabel="Staff Workspace"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as StaffTab);
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

      {/* Search Filter for list tabs */}
      {activeTab !== 'overview' && activeTab !== 'profile' && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl p-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your entries..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:bg-white"
            />
          </div>
        </div>
      )}

      {/* ====================================================================
          OVERVIEW TAB
         ==================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6 sm:space-y-8">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">My Clients</p>
              <p className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums mt-1 sm:mt-2">
                {data.clients.length}
              </p>
              <button
                type="button"
                onClick={() => setClientModal({ open: true, item: null })}
                className="mt-2 sm:mt-3 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                + Add Client
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">My Meetings</p>
              <p className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums mt-1 sm:mt-2">
                {data.meetings.length}
              </p>
              <button
                type="button"
                onClick={() => setMeetingModal({ open: true, item: null })}
                className="mt-2 sm:mt-3 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                + Log Meeting
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">My Medicals</p>
              <p className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums mt-1 sm:mt-2">
                {data.medicals.length}
              </p>
              <p className="hidden sm:block text-xs font-mono text-slate-600 tabular-nums mt-1">
                Paid {formatBDT(medicalPaid)} · Due {formatBDT(medicalDue)}
              </p>
              <button
                type="button"
                onClick={() => setMedicalModal({ open: true, item: null })}
                className="mt-2 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                + Add Medical
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs font-medium text-slate-500">My Interviews</p>
              <p className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums mt-1 sm:mt-2">
                {totalInterviewCandidates}
              </p>
              <p className="hidden sm:block text-xs text-slate-500 mt-1">
                Across {data.interviews.length} interview dates
              </p>
              <button
                type="button"
                onClick={() => setInterviewModal({ open: true, item: null })}
                className="mt-2 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                + Add Interview
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-bold text-slate-900">
                  My Recent Client Files
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('clients')}
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  Manage All
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {data.clients.slice(0, 5).map((c) => (
                  <div key={c.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{c.phone}</span> · {c.trade || 'Trade TBD'} ·{' '}
                        {c.destinationCountry || 'Country TBD'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-blue-700">{c.status}</p>
                      <p className="text-xs font-mono text-slate-500 tabular-nums">
                        Paid {formatBDT(c.totalPaid)} / {formatBDT(c.totalPayable)}
                      </p>
                    </div>
                  </div>
                ))}
                {data.clients.length === 0 && (
                  <p className="text-sm text-slate-500 py-4">
                    You have not created any client profiles yet.
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-4">
              <StaffContactCard staff={data.user} heading="Your Public Contact Card" />
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MY CLIENTS TAB
         ==================================================================== */}
      {activeTab === 'clients' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200">
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              My Client Profiles ({filteredClients.length})
            </h2>
            <p className="hidden sm:block text-xs text-slate-500">
              Only clients created under your staff account are shown here
            </p>
          </div>

          {filteredClients.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No clients found. Click &ldquo;New Client&rdquo; to create one.
            </div>
          ) : (
            <>
              {/* Mobile Client Cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filteredClients.map((c) => {
                  const due = Math.max(0, (c.totalPayable || 0) - (c.totalPaid || 0));
                  return (
                    <div key={c.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                          <p className="text-xs font-mono text-slate-500">{c.phone}</p>
                        </div>
                        <span className="text-xs font-semibold text-blue-700 shrink-0">
                          {c.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {[c.trade || 'Trade TBD', c.destinationCountry || 'TBD', c.expectedSalary]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <div className="font-mono text-xs tabular-nums">
                          <span className="text-emerald-700 font-semibold">
                            Paid {formatBDT(c.totalPaid)}
                          </span>
                          <span className="text-slate-300 mx-1.5">·</span>
                          <span className="text-amber-700">Due {formatBDT(due)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setClientModal({ open: true, item: c })}
                            className="p-2 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                            title="Edit client"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {confirmDeleteId === c.id ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  setActionError('');
                                  try {
                                    await api.deleteClient(c.id);
                                    setConfirmDeleteId(null);
                                    await onRefresh();
                                    notifySuccess('Client profile archived.');
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
                              className="p-2 text-slate-500 hover:text-red-600 rounded cursor-pointer"
                              title="Delete client"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
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
                      <th className="px-6 py-3 font-medium">Client &amp; Phone</th>
                      <th className="px-4 py-3 font-medium">Trade &amp; Country</th>
                      <th className="px-4 py-3 font-medium">Salary</th>
                      <th className="px-4 py-3 font-medium">Medical</th>
                      <th className="px-4 py-3 font-medium text-right">Paid / Due</th>
                      <th className="px-4 py-3 font-medium">Stage</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredClients.map((c) => {
                      const due = Math.max(0, (c.totalPayable || 0) - (c.totalPaid || 0));
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/70">
                          <td className="px-6 py-3.5">
                            <p className="font-semibold text-slate-900">{c.name}</p>
                            <p className="text-xs text-slate-500 font-mono">{c.phone}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="text-slate-900">{c.trade || '—'}</p>
                            <p className="text-xs text-slate-500">{c.destinationCountry || 'TBD'}</p>
                          </td>
                          <td className="px-4 py-3.5 text-slate-700">{c.expectedSalary || '—'}</td>
                          <td className="px-4 py-3.5 text-xs font-semibold">
                            <span
                              className={
                                c.medicalStatus === 'Fit' ? 'text-emerald-700' : 'text-amber-700'
                              }
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
                                      notifySuccess('Client profile archived. Administrators can restore it from Audit & Archive.');
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
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ====================================================================
          MY MEETINGS TAB
         ==================================================================== */}
      {activeTab === 'meetings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200">
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              My Scheduled Meetings ({filteredMeetings.length})
            </h2>
          </div>

          {filteredMeetings.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No meetings logged yet.
            </div>
          ) : (
            <>
              {/* Mobile Meeting Cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filteredMeetings.map((m) => (
                  <div key={m.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{m.clientName}</p>
                        <p className="text-xs text-slate-600 truncate">
                          With {m.meetingWith} · {m.location}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          m.status === 'Completed'
                            ? 'text-emerald-700'
                            : m.status === 'Cancelled'
                            ? 'text-red-700'
                            : 'text-blue-700'
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs font-mono text-slate-500">
                        {formatDateTime(m.dateTime)}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setMeetingModal({ open: true, item: m })}
                          className="p-2 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                          title="Edit meeting"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDeleteId === m.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                setActionError('');
                                try {
                                  await api.deleteMeeting(m.id);
                                  setConfirmDeleteId(null);
                                  await onRefresh();
                                  notifySuccess('Meeting record archived.');
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
                            className="p-2 text-slate-500 hover:text-red-600 rounded cursor-pointer"
                            title="Delete meeting"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Meetings Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Client</th>
                      <th className="px-4 py-3 font-medium">Meeting With</th>
                      <th className="px-4 py-3 font-medium">Location</th>
                      <th className="px-4 py-3 font-medium">Date & Time</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMeetings.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5">
                          <p className="font-semibold text-slate-900">{m.clientName}</p>
                          {m.clientPhone && (
                            <p className="text-xs font-mono text-slate-500">{m.clientPhone}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-slate-800">{m.meetingWith}</td>
                        <td className="px-4 py-3.5 text-slate-700">{m.location}</td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {formatDateTime(m.dateTime)}
                        </td>
                        <td className="px-4 py-3.5 text-xs font-semibold text-blue-700">
                          {m.status}
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setMeetingModal({ open: true, item: m })}
                            className="p-1.5 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
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
                                    notifySuccess('Meeting record archived.');
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
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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

      {/* ====================================================================
          MY MEDICALS TAB
         ==================================================================== */}
      {activeTab === 'medicals' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                My Medical Candidates ({filteredMedicals.length})
              </h2>
              <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                Paid {formatBDT(medicalPaid)} · Due {formatBDT(medicalDue)}
              </p>
            </div>
          </div>

          {filteredMedicals.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No medical records logged yet.
            </div>
          ) : (
            <>
              {/* Mobile Medical Cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filteredMedicals.map((m) => (
                  <div key={m.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{m.candidateName}</p>
                        <p className="text-xs text-slate-600 truncate">
                          {m.medicalCenter} · {m.medicalLocation}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          m.result === 'Fit'
                            ? 'text-emerald-700'
                            : m.result === 'Unfit'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {m.result}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="font-mono text-xs tabular-nums">
                        <span className="text-emerald-700 font-semibold">
                          Paid {formatBDT(m.amountPaid)}
                        </span>
                        <span className="text-slate-300 mx-1.5">·</span>
                        <span className="text-amber-700">Due {formatBDT(m.amountReceivable)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setMedicalModal({ open: true, item: m })}
                          className="p-2 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                          title="Edit medical"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDeleteId === m.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                setActionError('');
                                try {
                                  await api.deleteMedical(m.id);
                                  setConfirmDeleteId(null);
                                  await onRefresh();
                                  notifySuccess('Medical record archived.');
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
                            className="p-2 text-slate-500 hover:text-red-600 rounded cursor-pointer"
                            title="Delete medical"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Medicals Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Candidate</th>
                      <th className="px-4 py-3 font-medium">Medical Center & Location</th>
                      <th className="px-4 py-3 font-medium">Purpose</th>
                      <th className="px-4 py-3 font-medium text-right">Paid</th>
                      <th className="px-4 py-3 font-medium text-right">Receivable</th>
                      <th className="px-4 py-3 font-medium">Result</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMedicals.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5">
                          <p className="font-semibold text-slate-900">{m.candidateName}</p>
                          <p className="text-xs font-mono text-slate-500">
                            {m.candidatePhone || formatDateOnly(m.testDate)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-900">{m.medicalCenter}</p>
                          <p className="text-xs text-slate-500">{m.medicalLocation}</p>
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">{m.paymentPurpose || '—'}</td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {formatBDT(m.amountPaid)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-amber-700">
                          {formatBDT(m.amountReceivable)}
                        </td>
                        <td className="px-4 py-3.5 text-xs font-semibold text-slate-800">
                          {m.result}
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setMedicalModal({ open: true, item: m })}
                            className="p-1.5 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
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
                                    notifySuccess('Medical record archived.');
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
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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

      {/* ====================================================================
          MY INTERVIEWS TAB
         ==================================================================== */}
      {activeTab === 'interviews' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200">
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              My Interview Schedules ({filteredInterviews.length})
            </h2>
          </div>

          {filteredInterviews.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No interviews scheduled yet.
            </div>
          ) : (
            <>
              {/* Mobile Interview Cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filteredInterviews.map((iv) => (
                  <div key={iv.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {iv.interviewerOrCompany}
                        </p>
                        <p className="text-xs text-slate-600 truncate">
                          {iv.clientCount} {iv.clientCount === 1 ? 'candidate' : 'candidates'} ·{' '}
                          {iv.candidateNames}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          iv.status === 'Selected' || iv.status === 'Completed'
                            ? 'text-emerald-700'
                            : iv.status === 'Rejected'
                            ? 'text-red-700'
                            : 'text-blue-700'
                        }`}
                      >
                        {iv.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs font-mono text-slate-500">
                        {formatDateOnly(iv.interviewDate)}
                        {iv.location ? ` · ${iv.location}` : ''}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setInterviewModal({ open: true, item: iv })}
                          className="p-2 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
                          title="Edit interview"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDeleteId === iv.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                setActionError('');
                                try {
                                  await api.deleteInterview(iv.id);
                                  setConfirmDeleteId(null);
                                  await onRefresh();
                                  notifySuccess('Interview record archived.');
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
                            className="p-2 text-slate-500 hover:text-red-600 rounded cursor-pointer"
                            title="Delete interview"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Interviews Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Candidates</th>
                      <th className="px-4 py-3 font-medium text-right">Count</th>
                      <th className="px-4 py-3 font-medium">Company / Interviewer</th>
                      <th className="px-4 py-3 font-medium">Date & Location</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInterviews.map((iv) => (
                      <tr key={iv.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5">
                          <p className="font-semibold text-slate-900">{iv.candidateNames}</p>
                          {iv.trade && <p className="text-xs text-slate-500">{iv.trade}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold">
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
                        <td className="px-4 py-3.5 text-xs font-semibold text-blue-700">
                          {iv.status}
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setInterviewModal({ open: true, item: iv })}
                            className="p-1.5 text-slate-500 hover:text-blue-700 rounded cursor-pointer"
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
                                    notifySuccess('Interview record archived.');
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
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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
                Staff Profile & Contact Settings
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Clients looking up their phone number will see your photo, cover photo, call number,
                WhatsApp, and Facebook link.
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
                <div className="flex flex-wrap gap-2">
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
                  Designation / Role Title
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
                  Change Password (Optional)
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
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={profPhone}
                  onChange={(e) => {
                    setProfDirty(true);
                    setProfPhone(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
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
                whatsapp: profWhatsapp,
                socialLink: profSocial,
                photoUrl: profPhoto,
                coverUrl: profCover,
              }}
              heading="Live Client View Preview"
            />
          </div>
        </div>
      )}

      {/* ====================================================================
          MODALS
         ==================================================================== */}
      {clientModal.open && (
        <ClientModal
          initial={clientModal.item}
          isAdmin={false}
          staffList={[data.user]}
          defaultStaffId={data.user.id}
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
          isAdmin={false}
          staffList={[data.user]}
          clients={data.clients}
          defaultStaffId={data.user.id}
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
          isAdmin={false}
          staffList={[data.user]}
          clients={data.clients}
          defaultStaffId={data.user.id}
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
          isAdmin={false}
          staffList={[data.user]}
          clients={data.clients}
          defaultStaffId={data.user.id}
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
    </DashboardShell>
  );
}
