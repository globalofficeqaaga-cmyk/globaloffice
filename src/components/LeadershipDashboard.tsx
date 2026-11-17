import { useMemo, useState } from 'react';
import { Briefcase, Calendar, ClipboardList, Printer, Stethoscope, Users } from 'lucide-react';
import { DashboardShell, type NavTab } from './DashboardShell';
import { TeamProfilesPanel } from './TeamProfilesPanel';
import { formatDateOnly, formatDateTime } from '../lib/api';
import type { DashboardData } from '../types';

interface LeadershipDashboardProps {
  data: DashboardData;
  onGoHome: () => void;
  onLogout: () => void;
}

type TabId = 'clients' | 'meetings' | 'medicals' | 'interviews' | 'team';

export function LeadershipDashboard({ data, onGoHome, onLogout }: LeadershipDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('clients');
  const isManagement = data.user.role === 'management';
  const members = useMemo(() => {
    const map = new Map((data.teamProfiles || data.staffList || []).map((member) => [member.id, member]));
    map.set(data.user.id, data.user);
    return Array.from(map.values()).filter((member) => member.role !== 'admin');
  }, [data.teamProfiles, data.staffList, data.user]);
  const tabs: NavTab[] = [
    { id: 'clients', label: 'All Clients', icon: <ClipboardList className="w-4 h-4" />, count: data.clients.length },
    { id: 'meetings', label: 'Meetings', icon: <Calendar className="w-4 h-4" />, count: data.meetings.length },
    { id: 'medicals', label: 'Medicals', icon: <Stethoscope className="w-4 h-4" />, count: data.medicals.length },
    { id: 'interviews', label: 'Interviews', icon: <Briefcase className="w-4 h-4" />, count: data.interviews.length },
    { id: 'team', label: 'Team Profiles', icon: <Users className="w-4 h-4" />, count: members.length },
  ];
  const printPage = () => window.print();

  return (
    <DashboardShell
      user={data.user}
      roleLabel={isManagement ? 'Management Workspace' : 'Director Workspace'}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabId)}
      onGoHome={onGoHome}
      onLogout={onLogout}
      primaryAction={activeTab === 'team' ? null : (
        <button type="button" onClick={printPage} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          <Printer className="h-4 w-4" /> Print A4
        </button>
      )}
    >
      <style>{'@media print { @page { size: A4; margin: 12mm; } body { background: white !important; } aside, nav, header, button { display: none !important; } main { overflow: visible !important; } }'}</style>
      {activeTab === 'team' && (
        <TeamProfilesPanel currentUser={data.user} members={members} />
      )}
      {activeTab === 'clients' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">Client Directory</h2><p className="text-xs text-slate-500">Read-only overview · {data.clients.length} records</p></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Client</th><th className="p-3">Phone</th><th className="p-3">Trade</th><th className="p-3">Destination</th><th className="p-3">Status</th></tr></thead><tbody>{data.clients.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="p-3 font-medium">{c.name}</td><td className="p-3">{c.phone}</td><td className="p-3">{c.trade}</td><td className="p-3">{c.destinationCountry}</td><td className="p-3">{c.status}</td></tr>)}</tbody></table></div>
        </section>
      )}
      {activeTab === 'meetings' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Meeting Register</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Client</th><th className="p-3">Meeting With</th><th className="p-3">Location</th><th className="p-3">Date</th><th className="p-3">Status</th></tr></thead><tbody>{data.meetings.map((m) => <tr key={m.id} className="border-t border-slate-100"><td className="p-3">{m.clientName}</td><td className="p-3">{m.meetingWith}</td><td className="p-3">{m.location}</td><td className="p-3">{formatDateTime(m.dateTime)}</td><td className="p-3">{m.status}</td></tr>)}</tbody></table></div></section>
      )}
      {activeTab === 'medicals' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Medical Register</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Candidate</th><th className="p-3">Medical Center</th><th className="p-3">Test Date</th><th className="p-3">Result</th></tr></thead><tbody>{data.medicals.map((m) => <tr key={m.id} className="border-t border-slate-100"><td className="p-3">{m.candidateName}</td><td className="p-3">{m.medicalCenter}</td><td className="p-3">{formatDateOnly(m.testDate)}</td><td className="p-3">{m.result}</td></tr>)}</tbody></table></div></section>
      )}
      {activeTab === 'interviews' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Interview Register</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Candidates</th><th className="p-3">Company</th><th className="p-3">Trade</th><th className="p-3">Date</th><th className="p-3">Status</th></tr></thead><tbody>{data.interviews.map((i) => <tr key={i.id} className="border-t border-slate-100"><td className="p-3">{i.candidateNames}</td><td className="p-3">{i.interviewerOrCompany}</td><td className="p-3">{i.trade}</td><td className="p-3">{formatDateOnly(i.interviewDate)}</td><td className="p-3">{i.status}</td></tr>)}</tbody></table></div></section>
      )}
      {isManagement && <p className="mt-4 text-xs text-slate-500">Management view is read-only. Financial totals, ledger entries and finance reports are not shown in this workspace.</p>}
    </DashboardShell>
  );
}
