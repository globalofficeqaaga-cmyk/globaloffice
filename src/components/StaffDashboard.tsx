import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Briefcase,
  Calendar,
  ClipboardList,
  LayoutDashboard,
  Pencil,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  Upload,
  UserCircle2,
} from 'lucide-react';
import {
  api,
  compressImageFile,
  formatBDT,
  formatDateOnly,
  formatDateTime,
} from '../lib/api';
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
  const [profSaving, setProfSaving] = useState(false);
  const [profMessage, setProfMessage] = useState('');
  const [profError, setProfError] = useState('');

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
    setter: (val: string) => void
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await compressImageFile(file, 960);
      setter(url);
    } catch {
      setProfError('Failed to process image file.');
    }
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfError('');
    setProfMessage('');
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
      });
      setProfPassword('');
      await onRefresh();
      setProfMessage('Profile updated. Clients searching their status will see these details.');
    } catch (err) {
      setProfError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setProfSaving(false);
    }
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
    if (activeTab === 'profile') return null;
    return (
      <button
        type="button"
        onClick={() => setClientModal({ open: true, item: null })}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
      >
        <Plus className="w-4 h-4" />
        <span>New Client Profile</span>
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
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">My Client Profiles</p>
              <p className="font-mono text-3xl font-bold text-slate-900 tabular-nums mt-2">
                {data.clients.length}
              </p>
              <button
                type="button"
                onClick={() => setClientModal({ open: true, item: null })}
                className="mt-3 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                + Add Client Profile
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">My Meetings</p>
              <p className="font-mono text-3xl font-bold text-slate-900 tabular-nums mt-2">
                {data.meetings.length}
              </p>
              <button
                type="button"
                onClick={() => setMeetingModal({ open: true, item: null })}
                className="mt-3 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                + Log New Meeting
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">My Medical Candidates</p>
              <p className="font-mono text-3xl font-bold text-slate-900 tabular-nums mt-2">
                {data.medicals.length}
              </p>
              <p className="text-xs font-mono text-slate-600 tabular-nums mt-1">
                Paid {formatBDT(medicalPaid)} · Due {formatBDT(medicalDue)}
              </p>
              <button
                type="button"
                onClick={() => setMedicalModal({ open: true, item: null })}
                className="mt-2 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                + Add Medical Entry
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">My Interview Candidates</p>
              <p className="font-mono text-3xl font-bold text-slate-900 tabular-nums mt-2">
                {totalInterviewCandidates}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Across {data.interviews.length} interview dates
              </p>
              <button
                type="button"
                onClick={() => setInterviewModal({ open: true, item: null })}
                className="mt-2 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                + Add Interview Date
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
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-bold text-slate-900">
              My Client Profiles ({filteredClients.length})
            </h2>
            <p className="text-xs text-slate-500">
              Only clients created under your staff account are shown here
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Client & Phone</th>
                  <th className="px-4 py-3 font-medium">Trade & Country</th>
                  <th className="px-4 py-3 font-medium">Salary</th>
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
                      No clients found. Click &ldquo;New Client Profile&rdquo; to create one.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((c) => {
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
                                  await api.deleteClient(c.id);
                                  setConfirmDeleteId(null);
                                  await onRefresh();
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
          MY MEETINGS TAB
         ==================================================================== */}
      {activeTab === 'meetings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-bold text-slate-900">
              My Scheduled Meetings ({filteredMeetings.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
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
                {filteredMeetings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                      No meetings logged yet.
                    </td>
                  </tr>
                ) : (
                  filteredMeetings.map((m) => (
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
                                await api.deleteMeeting(m.id);
                                setConfirmDeleteId(null);
                                await onRefresh();
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====================================================================
          MY MEDICALS TAB
         ==================================================================== */}
      {activeTab === 'medicals' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                My Medical Candidates ({filteredMedicals.length})
              </h2>
              <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                Paid: {formatBDT(medicalPaid)} · Receivable: {formatBDT(medicalDue)}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
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
                {filteredMedicals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                      No medical records logged yet.
                    </td>
                  </tr>
                ) : (
                  filteredMedicals.map((m) => (
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
                                await api.deleteMedical(m.id);
                                setConfirmDeleteId(null);
                                await onRefresh();
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====================================================================
          MY INTERVIEWS TAB
         ==================================================================== */}
      {activeTab === 'interviews' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-bold text-slate-900">
              My Interview Schedules ({filteredInterviews.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
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
                {filteredInterviews.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                      No interviews scheduled yet.
                    </td>
                  </tr>
                ) : (
                  filteredInterviews.map((iv) => (
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
                                await api.deleteInterview(iv.id);
                                setConfirmDeleteId(null);
                                await onRefresh();
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
                  ))
                )}
              </tbody>
            </table>
          </div>
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
              <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {profError}
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
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleProfileImage(e, setProfPhoto)}
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
                    <span>Upload Cover</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleProfileImage(e, setProfCover)}
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
                  onChange={(e) => setProfName(e.target.value)}
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
                  onChange={(e) => setProfDesignation(e.target.value)}
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
                  onChange={(e) => setProfPassword(e.target.value)}
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
                  onChange={(e) => setProfPhone(e.target.value)}
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
                  onChange={(e) => setProfWhatsapp(e.target.value)}
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
                onChange={(e) => setProfSocial(e.target.value)}
                placeholder="https://facebook.com/..."
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={profSaving}
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
            } else {
              await api.createClient(payload);
            }
            await onRefresh();
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
            } else {
              await api.createMeeting(payload);
            }
            await onRefresh();
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
            } else {
              await api.createMedical(payload);
            }
            await onRefresh();
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
            } else {
              await api.createInterview(payload);
            }
            await onRefresh();
          }}
        />
      )}
    </DashboardShell>
  );
}
