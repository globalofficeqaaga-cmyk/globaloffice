import { useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  MapPin,
  Phone,
  Search,
  Stethoscope,
  Wallet,
} from 'lucide-react';
import { api, formatBDT, formatDateOnly, formatDateTime } from '../lib/api';
import type { ClientLookupResponse } from '../types';
import { StaffContactCard } from './StaffContactCard';

export function LandingPage() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ClientLookupResponse | null>(null);
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  async function runLookup(targetPhone: string) {
    const clean = targetPhone.trim();
    if (!clean) {
      setError('Please enter your registered phone number.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const data = await api.lookupClient(clean);
      setResult(data);
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } catch (err) {
      setResult(null);
      setError(
        err instanceof Error
          ? err.message
          : 'No client record found for this phone number.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runLookup(phone);
  }

  const dueAmount = result
    ? Math.max(0, (result.client.totalPayable || 0) - (result.client.totalPaid || 0))
    : 0;

  return (
    <main className="bg-slate-50">
      {/* Hero Section */}
      <section id="track-status" className="bg-white border-b border-slate-200">
        <div className="max-w-[1280px] mx-auto px-6 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            {/* Left Column: Proposition + Client Phone Update Form */}
            <div className="lg:col-span-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 tracking-wide mb-3">
                  Overseas Recruitment · Visa Processing · Live Candidate Desk
                </p>
                <h1
                  className="font-display font-bold tracking-tight text-slate-900 text-balance"
                  style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', lineHeight: 1.08 }}
                >
                  Check your visa, medical, and payment progress in seconds.
                </h1>
                <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-xl">
                  Enter the phone number registered with your coordinator to review submitted
                  documents, GAMCA medical clearance, interview dates, remaining balance, and
                  direct staff contact details.
                </p>

                {/* Primary Focal Action: Phone Number + See Update */}
                <form
                  onSubmit={handleSubmit}
                  className="mt-8 p-5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <label
                    htmlFor="client-phone-input"
                    className="block text-sm font-semibold text-slate-900 mb-2"
                  >
                    Client Phone Number
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="client-phone-input"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 01712345678"
                        className="w-full pl-10 pr-4 py-3 text-base bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-settle whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                    >
                      <Search className="w-4 h-4" />
                      <span>{loading ? 'Checking...' : 'See Update'}</span>
                    </button>
                  </div>

                  {error && (
                    <div className="mt-3 px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                      {error}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Sample registered files:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPhone('01712345678');
                        runLookup('01712345678');
                      }}
                      className="font-mono font-medium text-blue-700 hover:underline cursor-pointer"
                    >
                      01712345678
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPhone('01855667788');
                        runLookup('01855667788');
                      }}
                      className="font-mono font-medium text-blue-700 hover:underline cursor-pointer"
                    >
                      01855667788
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Right Column: Architectural Visual */}
            <div className="lg:col-span-6">
              <div className="relative h-72 sm:h-96 lg:h-full min-h-[340px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
                <img
                  src="/src/assets/images/hero_mobility_agency_1794656908413.jpg"
                  alt="Global Pathways headquarters reception and visa consultation desk"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <p className="text-xs text-slate-200 font-medium">
                    Dhaka Head Office · Banani Road 11
                  </p>
                  <p className="font-display text-lg font-semibold mt-0.5">
                    Transparent processing from passport intake to boarding pass.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Operational Proof Strip below hero split */}
          <div className="mt-10 pt-8 border-t border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">1,450+</p>
              <p className="text-sm text-slate-600 mt-1">
                Workers deployed across Saudi Arabia, UAE, and Qatar
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">100%</p>
              <p className="text-sm text-slate-600 mt-1">
                Itemized payment ledger & verifiable receipt records
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">24 hrs</p>
              <p className="text-sm text-slate-600 mt-1">
                Live status sync after medical or interview updates
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">Direct</p>
              <p className="text-sm text-slate-600 mt-1">
                Phone, WhatsApp & Facebook access to your assigned officer
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Client Lookup Result Section (Shown when "See Update" finds a client) */}
      {result && (
        <section
          ref={resultRef}
          aria-live="polite"
          className="bg-slate-50 border-b border-slate-200 py-12"
        >
          <div className="max-w-[1280px] mx-auto px-6">
            {/* Client Status Banner */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Candidate Status File · Registered Phone {result.client.phone}
                </p>
                <h2 className="font-display text-2xl lg:text-3xl font-bold text-slate-900 mt-1">
                  {result.client.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span>{result.client.trade || 'Trade Pending'}</span>
                  <span aria-hidden="true">·</span>
                  <span>Target: {result.client.destinationCountry || 'TBD'}</span>
                  <span aria-hidden="true">·</span>
                  <span>Salary: {result.client.expectedSalary || 'As per contract'}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm">
                  <span className="text-slate-500 mr-2">Current Stage:</span>
                  <span className="font-semibold text-blue-700">{result.client.status}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 8 Columns: Full Client Details, Financials, Documents, Medical, Schedules */}
              <div className="lg:col-span-8 space-y-6">
                {/* Profile & Financial Snapshot */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h3 className="font-display text-base font-bold text-slate-900 mb-4">
                    Candidate Profile & Financial Summary
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-6 border-b border-slate-100 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Full Address</p>
                      <p className="font-medium text-slate-900 mt-0.5">
                        {result.client.address || 'Not provided'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Passport Number</p>
                      <p className="font-mono font-medium text-slate-900 mt-0.5">
                        {result.client.passportNumber || 'Pending'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Medical Completed</p>
                      <p className="font-medium text-slate-900 mt-0.5">
                        {result.client.medicalDone ? 'Yes' : 'No'} · {result.client.medicalStatus}
                      </p>
                    </div>
                  </div>

                  {/* Financial Totals */}
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="text-xs text-slate-500">Total Package / Payable</p>
                      <p className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-1">
                        {formatBDT(result.client.totalPayable)}
                      </p>
                    </div>
                    <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                      <p className="text-xs text-emerald-800">Total Paid (Koto Tk Dise)</p>
                      <p className="font-mono text-xl font-bold text-emerald-700 tabular-nums mt-1">
                        {formatBDT(result.client.totalPaid)}
                      </p>
                    </div>
                    <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg">
                      <p className="text-xs text-amber-800">Remaining Due (Koto Baki)</p>
                      <p className="font-mono text-xl font-bold text-amber-700 tabular-nums mt-1">
                        {formatBDT(dueAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Remaining Items / What is Left */}
                  <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-xs font-semibold text-slate-700">
                      Remaining Steps & Pending Requirements
                    </p>
                    <p className="text-sm text-slate-800 mt-1">
                      {result.client.pendingItems || 'All required documents and steps are up to date.'}
                    </p>
                  </div>
                </div>

                {/* Documents Submitted */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-blue-700" />
                      <span>Submitted Documents & Checklist</span>
                    </h3>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {result.client.documents.length} items
                    </span>
                  </div>

                  {result.client.documents.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No documents logged yet. Please submit your passport and NID to your coordinator.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {result.client.documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                            {doc.note && <p className="text-xs text-slate-500 mt-0.5">{doc.note}</p>}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {doc.fileDataUrl && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewImage({ title: doc.name, url: doc.fileDataUrl! })
                                }
                                className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                              >
                                View Copy
                              </button>
                            )}
                            <span
                              className={`text-xs font-semibold ${
                                doc.status === 'Verified'
                                  ? 'text-emerald-700'
                                  : doc.status === 'Submitted'
                                  ? 'text-blue-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {doc.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payment History */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-blue-700" />
                      <span>Payment History & Purpose</span>
                    </h3>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {result.client.payments.length} transactions
                    </span>
                  </div>

                  {result.client.payments.length === 0 ? (
                    <p className="text-sm text-slate-500">No payment receipts logged yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs text-slate-500">
                            <th className="pb-2 font-medium">Date</th>
                            <th className="pb-2 font-medium">Purpose</th>
                            <th className="pb-2 font-medium">Note</th>
                            <th className="pb-2 font-medium text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {result.client.payments.map((pay) => (
                            <tr key={pay.id}>
                              <td className="py-2.5 text-slate-600 font-mono text-xs whitespace-nowrap">
                                {formatDateOnly(pay.date)}
                              </td>
                              <td className="py-2.5 font-medium text-slate-900">{pay.purpose}</td>
                              <td className="py-2.5 text-slate-500">{pay.note || '—'}</td>
                              <td className="py-2.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                                {formatBDT(pay.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Medical, Meetings & Interviews */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <Stethoscope className="w-4 h-4 text-blue-700" />
                      <span>Medical Screening Details</span>
                    </h3>
                    <div className="text-sm text-slate-700 space-y-1">
                      <p>
                        <span className="text-slate-500">Status:</span>{' '}
                        <span className="font-semibold">
                          {result.client.medicalDone ? 'Completed' : 'Pending'} (
                          {result.client.medicalStatus})
                        </span>
                      </p>
                      {result.client.medicalCenter && (
                        <p>
                          <span className="text-slate-500">Medical Center:</span>{' '}
                          {result.client.medicalCenter}
                          {result.client.medicalLocation ? ` · ${result.client.medicalLocation}` : ''}
                        </p>
                      )}
                    </div>
                    {result.medicals.length > 0 && (
                      <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                        {result.medicals.map((med) => (
                          <div key={med.id} className="py-2.5 text-sm flex flex-wrap justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-900">
                                {med.medicalCenter} — {med.medicalLocation}
                              </p>
                              <p className="text-xs text-slate-500">
                                {formatDateOnly(med.testDate)} · Purpose: {med.paymentPurpose || 'Medical Test'}
                              </p>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-xs font-semibold ${
                                  med.result === 'Fit'
                                    ? 'text-emerald-700'
                                    : med.result === 'Unfit'
                                    ? 'text-red-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                Result: {med.result}
                              </span>
                              <p className="text-xs font-mono text-slate-600 tabular-nums">
                                Paid {formatBDT(med.amountPaid)} · Due {formatBDT(med.amountReceivable)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Meetings & Interviews */}
                  <div className="pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                        <Calendar className="w-4 h-4 text-blue-700" />
                        <span>Scheduled Meetings</span>
                      </h4>
                      {result.meetings.length === 0 ? (
                        <p className="text-sm text-slate-500">No meetings scheduled.</p>
                      ) : (
                        <div className="space-y-3">
                          {result.meetings.map((mtg) => (
                            <div
                              key={mtg.id}
                              className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                            >
                              <p className="font-semibold text-slate-900">{mtg.meetingWith}</p>
                              <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>{formatDateTime(mtg.dateTime)}</span>
                              </p>
                              <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                <span>{mtg.location}</span>
                              </p>
                              <p className="text-xs font-medium text-blue-700 mt-1.5">
                                Status: {mtg.status}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-blue-700" />
                        <span>Trade Interviews</span>
                      </h4>
                      {result.interviews.length === 0 ? (
                        <p className="text-sm text-slate-500">No interview dates assigned yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {result.interviews.map((iv) => (
                            <div
                              key={iv.id}
                              className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                            >
                              <p className="font-semibold text-slate-900">{iv.interviewerOrCompany}</p>
                              <p className="text-xs text-slate-600 mt-1">
                                Date: {formatDateOnly(iv.interviewDate)}
                                {iv.interviewTime ? ` · ${iv.interviewTime}` : ''}
                              </p>
                              <p className="text-xs text-slate-600 mt-0.5">
                                Location: {iv.location}
                              </p>
                              <p className="text-xs font-medium text-blue-700 mt-1.5">
                                Status: {iv.status}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 4 Columns: Assigned Staff Contact Card */}
              <div className="lg:col-span-4 space-y-4">
                {result.staff ? (
                  <StaffContactCard staff={result.staff} heading="Assigned Staff Coordinator" />
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
                    Coordinator details unavailable. Please contact our Dhaka front desk.
                  </div>
                )}

                {result.client.notes && (
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <p className="text-xs font-semibold text-slate-500">Coordinator Remarks</p>
                    <p className="text-sm text-slate-800 mt-1.5 leading-relaxed">
                      {result.client.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Services & Operations Showcase */}
      <section id="medical-screening" className="py-16 max-w-[1280px] mx-auto px-6">
        <div className="max-w-2xl mb-10">
          <p className="text-xs font-medium text-blue-700 mb-2">Core Operations</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance">
            Coordinated medical, trade testing, and employer interviews under one ledger.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
              <img
                src="/src/assets/images/service_medical_center_1794656908059.jpg"
                alt="Partner international diagnostic medical screening center"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  GAMCA · QVC · Gulf Diagnostic Centers
                </p>
                <h3 className="font-display text-xl font-bold text-slate-900 mt-1">
                  01. Verified Medical Screening & Fee Transparency
                </h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  Every medical slip, diagnostic center location, fit/unfit result, and lab payment
                  is recorded directly by your coordinator so candidates know exact fees paid and
                  remaining balances.
                </p>
              </div>
              <a
                href="#track-status"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                <span>Check your medical status</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div id="trade-interviews" className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
              <img
                src="/src/assets/images/service_trade_interview_1794656908174.jpg"
                alt="Technical trade testing and foreign delegate interview center"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Trade Assessment · Foreign Delegate Interviews
                </p>
                <h3 className="font-display text-xl font-bold text-slate-900 mt-1">
                  02. Direct Employer Interviews & Trade Certification
                </h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  Receive exact interview dates, test center addresses, salary terms, and briefing
                  schedules directly on your status page before meeting foreign employer delegates.
                </p>
              </div>
              <a
                href="#track-status"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                <span>View scheduled interviews</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Process Breakdown */}
      <section id="process" className="bg-white border-t border-slate-200 py-16">
        <div className="max-w-[1280px] mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-medium text-blue-700 mb-2">How It Works</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
              Four verifiable milestones from registration to departure.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="pt-4 border-t border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">
                01. Document Intake
              </h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Your coordinator creates your profile with passport, NID, trade skill, target
                country, and salary package.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">
                02. Medical Clearance
              </h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Designated medical center, screening date, fit/pending result, and medical receipts
                are logged in real time.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">
                03. Delegate Interview
              </h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Pre-interview briefing meetings and technical trade test locations appear on your
                lookup dashboard.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">
                04. Visa & Settlement
              </h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Track every installment paid, remaining balance, and pending clearance items before
                flight departure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
        <div className="max-w-[1280px] mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="font-display text-base font-bold text-white">Global Pathways</p>
            <p className="text-xs text-slate-400 mt-1">
              House 42, Road 11, Banani, Dhaka 1213 · Overseas Recruitment & Candidate Operations
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400">
            <a href="#track-status" className="hover:text-white transition-colors">
              Track Status
            </a>
            <a href="#medical-screening" className="hover:text-white transition-colors">
              Medical Centers
            </a>
            <a href="#trade-interviews" className="hover:text-white transition-colors">
              Trade Interviews
            </a>
            <span>© {new Date().getFullYear()} Global Pathways</span>
          </div>
        </div>
      </footer>

      {/* Document Copy Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="max-w-2xl w-full bg-white rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <p className="font-display font-semibold text-slate-900 text-sm">
                {previewImage.title}
              </p>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-w-full max-h-[65vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
