import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PasswordConfirmModal } from '../PasswordConfirmModal';
import {
  api,
  ConflictError,
  formatBDT,
  getCurrentLocalTimeStr,
  getTodayLocalDateStr,
} from '../../lib/api';
import { APP_IMAGES } from '../../lib/assets';
import {
  clearSafeDraft,
  generateRequestId,
  loadSafeDraft,
  saveSafeDraft,
} from '../../lib/drafts';
import { validateStrongPassword } from '../../lib/passwordPolicy';
import { useUnsavedChangesWarning } from '../../lib/useUnsavedChanges';
import type {
  AccountLedgerEntry,
  AttendanceStatus,
  ClientDocument,
  ClientPayment,
  ClientProfile,
  ClientStage,
  DocumentStatus,
  InterviewRecord,
  InterviewStatus,
  LedgerEntryType,
  LogChannel,
  LogOutcome,
  MedicalOutcome,
  MedicalRecord,
  MedicalRecordResult,
  MeetingRecord,
  MeetingStatus,
  PublicUser,
  UserPermission,
  UserRole,
  StaffAttendanceRecord,
  StaffDailyLog,
} from '../../types';

const CLIENT_STAGES: ClientStage[] = [
  'Document Collection',
  'Medical Pending',
  'Medical Fit',
  'Interview Scheduled',
  'Visa Processing',
  'Flight Ready',
  'Completed',
];

const MEDICAL_OUTCOMES: MedicalOutcome[] = ['Not Started', 'Pending Result', 'Fit', 'Unfit'];
const MEETING_STATUSES: MeetingStatus[] = ['Scheduled', 'Completed', 'Cancelled'];
const MEDICAL_RESULTS: MedicalRecordResult[] = ['Pending', 'Fit', 'Unfit'];
const INTERVIEW_STATUSES: InterviewStatus[] = [
  'Upcoming',
  'Selected',
  'Waiting',
  'Rejected',
  'Completed',
];

function UnsavedClosePrompt({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-900">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
        <span>You have unsaved changes. Closing now will lose unsaved sensitive fields.</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onKeepEditing}
          className="px-3 py-1 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded cursor-pointer"
        >
          Keep Editing
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
        >
          Discard Changes
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * 1. CLIENT CREATE / EDIT MODAL
 * ========================================================================== */
interface ClientModalProps {
  initial?: ClientProfile | null;
  isAdmin: boolean;
  staffList: PublicUser[];
  defaultStaffId: string;
  onClose: () => void;
  onSave: (
    payload: Partial<ClientProfile> & { expectedVersion?: number }
  ) => Promise<void>;
}

export function ClientModal({
  initial,
  isAdmin,
  staffList,
  defaultStaffId,
  onClose,
  onSave,
}: ClientModalProps) {
  const isCreate = !initial;
  const draftKey = `client_create_${defaultStaffId}`;
  const [clientRequestId] = useState(() => generateRequestId());

  const [staffId, setStaffId] = useState(initial?.staffId || defaultStaffId);
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [passportNumber, setPassportNumber] = useState(initial?.passportNumber || '');
  const [trade, setTrade] = useState(initial?.trade || '');
  const [destinationCountry, setDestinationCountry] = useState(initial?.destinationCountry || '');
  const [expectedSalary, setExpectedSalary] = useState(initial?.expectedSalary || '');
  const [status, setStatus] = useState<ClientStage>(initial?.status || 'Document Collection');
  const [medicalDone, setMedicalDone] = useState<boolean>(initial?.medicalDone ?? false);
  const [medicalStatus, setMedicalStatus] = useState<MedicalOutcome>(
    initial?.medicalStatus || 'Not Started'
  );
  const [medicalCenter, setMedicalCenter] = useState(initial?.medicalCenter || '');
  const [medicalLocation, setMedicalLocation] = useState(initial?.medicalLocation || '');
  const [totalPayable, setTotalPayable] = useState(String(initial?.totalPayable ?? 0));
  const [manualPaid, setManualPaid] = useState(String(initial?.totalPaid ?? 0));
  const [pendingItems, setPendingItems] = useState(initial?.pendingItems || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [documents, setDocuments] = useState<ClientDocument[]>(initial?.documents || []);
  const [payments, setPayments] = useState<ClientPayment[]>(initial?.payments || []);

  const [isDirty, setIsDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [uploadingDocIdx, setUploadingDocIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isConflict, setIsConflict] = useState(false);
  const [draftOffer, setDraftOffer] = useState<{
    savedAt: string;
    data: {
      name?: string;
      phone?: string;
      address?: string;
      trade?: string;
      destinationCountry?: string;
      expectedSalary?: string;
      pendingItems?: string;
      notes?: string;
    };
  } | null>(() => (isCreate ? loadSafeDraft(draftKey) : null));

  useUnsavedChangesWarning(isDirty && !saving);

  // Save ONLY non-sensitive fields in sessionStorage draft (never passport/medical/files)
  useEffect(() => {
    if (!isCreate || !isDirty) return;
    saveSafeDraft(draftKey, {
      name,
      phone,
      address,
      trade,
      destinationCountry,
      expectedSalary,
      pendingItems,
      notes,
    });
  }, [
    isCreate,
    isDirty,
    draftKey,
    name,
    phone,
    address,
    trade,
    destinationCountry,
    expectedSalary,
    pendingItems,
    notes,
  ]);

  const computedPaidFromEntries = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const effectivePaid = payments.length > 0 ? computedPaidFromEntries : Number(manualPaid) || 0;
  const remainingDue = Math.max(0, (Number(totalPayable) || 0) - effectivePaid);

  function markDirty() {
    setSaved(false);
    if (!isDirty) setIsDirty(true);
    if (confirmClose) setConfirmClose(false);
  }

  function handleCloseAttempt() {
    if (saving) return;
    if (isDirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  function addDocumentRow() {
    markDirty();
    setDocuments((prev) => [
      ...prev,
      {
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        status: 'Submitted',
        note: '',
        updatedAt: new Date().toISOString(),
      },
    ]);
  }

  function updateDoc(index: number, patch: Partial<ClientDocument>) {
    markDirty();
    setDocuments((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d))
    );
  }

  async function handleDocFile(index: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploadingDocIdx(index);
    try {
      const uploaded = await api.uploadClientDocumentFile(file, staffId);
      updateDoc(index, {
        storagePath: uploaded.storagePath,
        fileDataUrl: uploaded.fileDataUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload document file.');
    } finally {
      setUploadingDocIdx(null);
    }
  }

  async function handleViewDoc(doc: ClientDocument) {
    setError('');
    try {
      const url = await api.getClientDocumentSignedUrl(doc);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open document.');
    }
  }

  function addPaymentRow() {
    markDirty();
    setPayments((prev) => [
      ...prev,
      {
        id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        amount: 0,
        purpose: '',
        date: new Date().toISOString().slice(0, 10),
        note: '',
      },
    ]);
  }

  function updatePayment(index: number, patch: Partial<ClientPayment>) {
    markDirty();
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  const [pendingRemoveItem, setPendingRemoveItem] = useState<{
    kind: 'payment' | 'document';
    index: number;
    label: string;
  } | null>(null);

  async function submitSave() {
    setError('');
    setIsConflict(false);
    if (!name.trim() || !phone.trim()) {
      setError('Client name and phone number are required.');
      return;
    }

    setSaving(true);
    try {
      const cleanDocs = documents.filter((d) => d.name.trim());
      const cleanPays = payments.filter((p) => Number(p.amount) > 0 || p.purpose.trim());
      await onSave({
        staffId,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        passportNumber: passportNumber.trim(),
        trade: trade.trim(),
        destinationCountry: destinationCountry.trim(),
        expectedSalary: expectedSalary.trim(),
        status,
        medicalDone,
        medicalStatus,
        medicalCenter: medicalCenter.trim(),
        medicalLocation: medicalLocation.trim(),
        totalPayable: Number(totalPayable) || 0,
        totalPaid: effectivePaid,
        pendingItems: pendingItems.trim(),
        documents: cleanDocs,
        payments: cleanPays,
        notes: notes.trim(),
        clientRequestId: isCreate ? clientRequestId : undefined,
        expectedVersion: initial?.version,
      });
      if (isCreate) clearSafeDraft(draftKey);
      setIsDirty(false);
      setSaved(true);
    } catch (err) {
      if (err instanceof ConflictError) {
        setIsConflict(true);
      }
      setError(err instanceof Error ? err.message : 'Failed to save client profile.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl shadow-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {initial ? 'Edit Client Profile' : 'Create Client Profile'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Saved permanently to Supabase PostgreSQL · Documents stored in private Storage
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {confirmClose && (
          <UnsavedClosePrompt
            onKeepEditing={() => setConfirmClose(false)}
            onDiscard={() => {
              if (isCreate) clearSafeDraft(draftKey);
              onClose();
            }}
          />
        )}

        {draftOffer && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-200 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-blue-900">
              Unsaved non-sensitive contact draft found from{' '}
              {new Date(draftOffer.savedAt).toLocaleTimeString()}. Restore it?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setName(draftOffer.data.name || '');
                  setPhone(draftOffer.data.phone || '');
                  setAddress(draftOffer.data.address || '');
                  setTrade(draftOffer.data.trade || '');
                  setDestinationCountry(draftOffer.data.destinationCountry || '');
                  setExpectedSalary(draftOffer.data.expectedSalary || '');
                  setPendingItems(draftOffer.data.pendingItems || '');
                  setNotes(draftOffer.data.notes || '');
                  setDraftOffer(null);
                  setIsDirty(true);
                }}
                className="px-3 py-1 text-xs font-semibold text-white bg-blue-700 rounded cursor-pointer"
              >
                Restore Draft
              </button>
              <button
                type="button"
                onClick={() => {
                  clearSafeDraft(draftKey);
                  setDraftOffer(null);
                }}
                className="px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              {!isConflict && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={submitSave}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Save</span>
                </button>
              )}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isAdmin && staffList.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Staff Coordinator
                </label>
                <select
                  value={staffId}
                  onChange={(e) => {
                    markDirty();
                    setStaffId(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (@{s.userId})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client Full Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  markDirty();
                  setName(e.target.value);
                }}
                placeholder="e.g. Md. Kamrul Hasan"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number (Used for Lookup) *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => {
                  markDirty();
                  setPhone(e.target.value);
                }}
                placeholder="e.g. 01712345678"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => {
                  markDirty();
                  setAddress(e.target.value);
                }}
                placeholder="Full home address"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Passport Number
              </label>
              <input
                type="text"
                value={passportNumber}
                onChange={(e) => {
                  markDirty();
                  setPassportNumber(e.target.value);
                }}
                placeholder="e.g. A08943211"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Trade / Skill
              </label>
              <input
                type="text"
                value={trade}
                onChange={(e) => {
                  markDirty();
                  setTrade(e.target.value);
                }}
                placeholder="e.g. Electrician, Welder, Driver"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Destination Country (Kon Deshe Jete Cay)
              </label>
              <input
                type="text"
                value={destinationCountry}
                onChange={(e) => {
                  markDirty();
                  setDestinationCountry(e.target.value);
                }}
                placeholder="e.g. Saudi Arabia, UAE, Qatar"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Expected Salary (Koto Salary)
              </label>
              <input
                type="text"
                value={expectedSalary}
                onChange={(e) => {
                  markDirty();
                  setExpectedSalary(e.target.value);
                }}
                placeholder="e.g. 1,800 SAR + Overtime"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Current Processing Stage
              </label>
              <select
                value={status}
                onChange={(e) => {
                  markDirty();
                  setStatus(e.target.value as ClientStage);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {CLIENT_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medical Completed? (Medical Korse Kina)
              </label>
              <div className="flex items-center gap-4 pt-1.5">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={medicalDone}
                    onChange={(e) => {
                      markDirty();
                      setMedicalDone(e.target.checked);
                    }}
                    className="w-4 h-4 accent-blue-700"
                  />
                  <span>Yes, medical done</span>
                </label>
                <select
                  value={medicalStatus}
                  onChange={(e) => {
                    markDirty();
                    setMedicalStatus(e.target.value as MedicalOutcome);
                  }}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  {MEDICAL_OUTCOMES.map((mo) => (
                    <option key={mo} value={mo}>
                      {mo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medical Center Name
              </label>
              <input
                type="text"
                value={medicalCenter}
                onChange={(e) => {
                  markDirty();
                  setMedicalCenter(e.target.value);
                }}
                placeholder="e.g. Al-Riyadh Diagnostic Center"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medical Center Location
              </label>
              <input
                type="text"
                value={medicalLocation}
                onChange={(e) => {
                  markDirty();
                  setMedicalLocation(e.target.value);
                }}
                placeholder="e.g. Banani, Dhaka"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Financial Summary */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Financial & Remaining Balance (Koto Tk Dise / Koto Pabe / Ki Baki Ase)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Total Package Payable (BDT)
                </label>
                <input
                  type="number"
                  min={0}
                  value={totalPayable}
                  onChange={(e) => {
                    markDirty();
                    setTotalPayable(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Total Paid (BDT) {payments.length > 0 && '(Auto-summed)'}
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={payments.length > 0}
                  value={payments.length > 0 ? effectivePaid : manualPaid}
                  onChange={(e) => {
                    markDirty();
                    setManualPaid(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remaining Due (Baki)
                </label>
                <div className="px-3.5 py-2 text-sm font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg tabular-nums">
                  {formatBDT(remainingDue)}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                What is Pending / Remaining (Ki Baki Ase)
              </label>
              <textarea
                rows={2}
                value={pendingItems}
                onChange={(e) => {
                  markDirty();
                  setPendingItems(e.target.value);
                }}
                placeholder="e.g. Police clearance certificate & final visa stamping fee"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            {/* Itemized Payments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">Payment Entries</p>
                <button
                  type="button"
                  onClick={addPaymentRow}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Payment</span>
                </button>
              </div>
              {payments.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No itemized payments added yet. Click &ldquo;Add Payment&rdquo; to log receipts by purpose.
                </p>
              ) : (
                <div className="space-y-2">
                  {payments.map((pay, idx) => (
                    <div
                      key={pay.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg items-center"
                    >
                      <input
                        type="number"
                        min={0}
                        placeholder="Amount"
                        value={pay.amount || ''}
                        onChange={(e) => updatePayment(idx, { amount: Number(e.target.value) || 0 })}
                        className="sm:col-span-2 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded"
                      />
                      <input
                        type="text"
                        placeholder="Purpose (e.g. Medical / Visa)"
                        value={pay.purpose}
                        onChange={(e) => updatePayment(idx, { purpose: e.target.value })}
                        className="sm:col-span-4 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                      />
                      <input
                        type="date"
                        value={pay.date}
                        onChange={(e) => updatePayment(idx, { date: e.target.value })}
                        className="sm:col-span-3 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded"
                      />
                      <input
                        type="text"
                        placeholder="Note"
                        value={pay.note}
                        onChange={(e) => updatePayment(idx, { note: e.target.value })}
                        className="sm:col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPendingRemoveItem({
                            kind: 'payment',
                            index: idx,
                            label: `Payment Entry: ${pay.purpose || 'Payment'} (${formatBDT(Number(pay.amount) || 0)})`,
                          })
                        }
                        className="sm:col-span-1 p-1.5 text-red-600 hover:bg-red-50 rounded justify-self-end cursor-pointer"
                        aria-label="Remove payment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Documents Provided */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Documents Provided by Client (Private Storage)
              </h3>
              <button
                type="button"
                onClick={addDocumentRow}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Document</span>
              </button>
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-slate-500">
                No documents logged. Add Passport, NID, Police Clearance, Medical Slip, or Photos.
              </p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc, idx) => (
                  <div
                    key={doc.id}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg items-center"
                  >
                    <input
                      type="text"
                      placeholder="Document name (e.g. Passport)"
                      value={doc.name}
                      onChange={(e) => updateDoc(idx, { name: e.target.value })}
                      className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    />
                    <select
                      value={doc.status}
                      onChange={(e) => updateDoc(idx, { status: e.target.value as DocumentStatus })}
                      className="sm:col-span-2 px-2 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    >
                      <option value="Submitted">Submitted</option>
                      <option value="Verified">Verified</option>
                      <option value="Pending">Pending</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Note"
                      value={doc.note}
                      onChange={(e) => updateDoc(idx, { note: e.target.value })}
                      className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    />
                    <div className="sm:col-span-3 flex items-center gap-1.5">
                      <label className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded cursor-pointer hover:bg-slate-100">
                        <Upload className="w-3 h-3" />
                        <span>
                          {uploadingDocIdx === idx
                            ? 'Uploading...'
                            : doc.storagePath || doc.fileDataUrl
                            ? 'Replace'
                            : 'Upload'}
                        </span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          disabled={uploadingDocIdx !== null}
                          onChange={(e) => handleDocFile(idx, e)}
                          className="sr-only"
                        />
                      </label>
                      {(doc.storagePath || doc.fileDataUrl) && (
                        <button
                          type="button"
                          onClick={() => handleViewDoc(doc)}
                          className="p-1.5 text-blue-700 bg-white border border-slate-300 rounded hover:bg-blue-50 cursor-pointer"
                          title="Open private file"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingRemoveItem({
                          kind: 'document',
                          index: idx,
                          label: `Client Document: ${doc.name || `Document #${idx + 1}`}`,
                        })
                      }
                      className="sm:col-span-1 p-1.5 text-red-600 hover:bg-red-50 rounded justify-self-end cursor-pointer"
                      aria-label="Remove document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Additional Remarks / Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => {
                markDirty();
                setNotes(e.target.value);
              }}
              placeholder="Any internal or client-facing notes"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {initial?.version ? `Version #${initial.version}` : 'New record'}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCloseAttempt}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingDocIdx !== null}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {saving ? 'Saving to Database...' : initial ? 'Save Changes' : 'Create Client'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <PasswordConfirmModal
        open={pendingRemoveItem !== null}
        title="Confirm Remove Entry"
        itemLabel={pendingRemoveItem?.label || ''}
        onClose={() => setPendingRemoveItem(null)}
        onConfirm={() => {
          if (!pendingRemoveItem) return;
          markDirty();
          if (pendingRemoveItem.kind === 'payment') {
            setPayments((prev) => prev.filter((_, i) => i !== pendingRemoveItem.index));
          } else {
            setDocuments((prev) => prev.filter((_, i) => i !== pendingRemoveItem.index));
          }
        }}
      />
    </div>
  );
}

/* ============================================================================
 * 2. MEETING CREATE / EDIT MODAL
 * ========================================================================== */
export function ClientDetailsModal({
  client,
  staffName,
  onClose,
}: {
  client: ClientProfile;
  staffName: string;
  onClose: () => void;
}) {
  const due = Math.max(0, (client.totalPayable || 0) - (client.totalPaid || 0));
  const fields: Array<[string, string]> = [
    ['Client name', client.name],
    ['Phone', client.phone],
    ['Address', client.address],
    ['Passport number', client.passportNumber],
    ['Assigned staff', staffName],
    ['Trade', client.trade],
    ['Destination country', client.destinationCountry],
    ['Expected salary', client.expectedSalary],
    ['Current stage', client.status],
    ['Medical done', client.medicalDone ? 'Yes' : 'No'],
    ['Medical status', client.medicalStatus],
    ['Medical centre', client.medicalCenter],
    ['Medical location', client.medicalLocation],
    ['Total payable', formatBDT(client.totalPayable)],
    ['Total paid', formatBDT(client.totalPaid)],
    ['Due', formatBDT(due)],
    ['Pending items', client.pendingItems],
    ['Notes', client.notes],
    ['Created', client.createdAt ? new Date(client.createdAt).toLocaleString() : '—'],
    ['Last updated', client.updatedAt ? new Date(client.updatedAt).toLocaleString() : '—'],
  ];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Client details">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Client Details</h2>
            <p className="mt-0.5 text-xs text-slate-500">Read-only complete client profile</p>
          </div>
          <button type="button" data-view-action="true" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close client details"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[calc(90vh-68px)] space-y-6 overflow-y-auto p-5">
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900">Profile information</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 break-words text-sm text-slate-900">{value || '—'}</p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900">Documents ({client.documents?.length || 0})</h3>
            {client.documents?.length ? <div className="space-y-2">{client.documents.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                <div><p className="text-sm font-semibold text-slate-900">{doc.name}</p><p className="text-xs text-slate-500">{doc.note || 'No notes'}</p></div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{doc.status}</span>
              </div>
            ))}</div> : <p className="text-sm text-slate-500">No documents recorded.</p>}
          </section>
          <section>
            <h3 className="mb-3 text-sm font-bold text-slate-900">Payment history ({client.payments?.length || 0})</h3>
            {client.payments?.length ? <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Purpose</th><th className="p-3">Notes</th><th className="p-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-slate-100">{client.payments.map((payment) => <tr key={payment.id}><td className="p-3 whitespace-nowrap">{payment.date || '—'}</td><td className="p-3">{payment.purpose || '—'}</td><td className="p-3">{payment.note || '—'}</td><td className="p-3 text-right font-mono">{formatBDT(payment.amount)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">No payment history recorded.</p>}
          </section>
          <div className="flex justify-end border-t border-slate-200 pt-4">
            <button type="button" data-view-action="true" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MeetingModalProps {
  initial?: MeetingRecord | null;
  isAdmin: boolean;
  staffList: PublicUser[];
  clients: ClientProfile[];
  defaultStaffId: string;
  onClose: () => void;
  onSave: (
    payload: Partial<MeetingRecord> & { expectedVersion?: number }
  ) => Promise<void>;
}

export function MeetingModal({
  initial,
  isAdmin,
  staffList,
  clients,
  defaultStaffId,
  onClose,
  onSave,
}: MeetingModalProps) {
  const isCreate = !initial;
  const draftKey = `meeting_create_${defaultStaffId}`;
  const [clientRequestId] = useState(() => generateRequestId());

  const [staffId, setStaffId] = useState(initial?.staffId || defaultStaffId);
  const [clientId, setClientId] = useState(initial?.clientId || '');
  const [clientName, setClientName] = useState(initial?.clientName || '');
  const [clientPhone, setClientPhone] = useState(initial?.clientPhone || '');
  const [meetingWith, setMeetingWith] = useState(initial?.meetingWith || '');
  const [location, setLocation] = useState(initial?.location || '');
  const [dateTime, setDateTime] = useState(
    initial?.dateTime || new Date().toISOString().slice(0, 16)
  );
  const [purpose, setPurpose] = useState(initial?.purpose || '');
  const [status, setStatus] = useState<MeetingStatus>(initial?.status || 'Scheduled');
  const [notes, setNotes] = useState(initial?.notes || '');

  const [isDirty, setIsDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isConflict, setIsConflict] = useState(false);
  const [draftOffer, setDraftOffer] = useState<{
    savedAt: string;
    data: {
      clientName?: string;
      clientPhone?: string;
      meetingWith?: string;
      location?: string;
      dateTime?: string;
      purpose?: string;
    };
  } | null>(() => (isCreate ? loadSafeDraft(draftKey) : null));

  useUnsavedChangesWarning(isDirty && !saving);

  useEffect(() => {
    if (!isCreate || !isDirty) return;
    saveSafeDraft(draftKey, { clientName, clientPhone, meetingWith, location, dateTime, purpose });
  }, [isCreate, isDirty, draftKey, clientName, clientPhone, meetingWith, location, dateTime, purpose]);

  function markDirty() {
    if (!isDirty) setIsDirty(true);
    if (confirmClose) setConfirmClose(false);
  }

  function handleCloseAttempt() {
    if (saving) return;
    if (isDirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  function handleClientPick(selectedId: string) {
    markDirty();
    setClientId(selectedId);
    const found = clients.find((c) => c.id === selectedId);
    if (found) {
      setClientName(found.name);
      setClientPhone(found.phone);
    }
  }

  async function submitSave() {
    setError('');
    setIsConflict(false);
    if (!clientName.trim() || !meetingWith.trim() || !location.trim() || !dateTime) {
      setError('Client name, meeting partner, location, and date/time are required.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        staffId,
        clientId: clientId || undefined,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        meetingWith: meetingWith.trim(),
        location: location.trim(),
        dateTime,
        purpose: purpose.trim(),
        status,
        notes: notes.trim(),
        clientRequestId: isCreate ? clientRequestId : undefined,
        expectedVersion: initial?.version,
      });
      if (isCreate) clearSafeDraft(draftKey);
      setIsDirty(false);
      onClose();
    } catch (err) {
      if (err instanceof ConflictError) setIsConflict(true);
      setError(err instanceof Error ? err.message : 'Failed to save meeting.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-900">
            {initial ? 'Edit Meeting' : 'Log New Meeting'}
          </h2>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {confirmClose && (
          <UnsavedClosePrompt
            onKeepEditing={() => setConfirmClose(false)}
            onDiscard={() => {
              if (isCreate) clearSafeDraft(draftKey);
              onClose();
            }}
          />
        )}

        {draftOffer && (
          <div className="px-6 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center justify-between gap-2 text-xs">
            <span className="text-blue-900">Restore unsaved meeting draft?</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setClientName(draftOffer.data.clientName || '');
                  setClientPhone(draftOffer.data.clientPhone || '');
                  setMeetingWith(draftOffer.data.meetingWith || '');
                  setLocation(draftOffer.data.location || '');
                  setDateTime(draftOffer.data.dateTime || dateTime);
                  setPurpose(draftOffer.data.purpose || '');
                  setDraftOffer(null);
                  setIsDirty(true);
                }}
                className="px-2.5 py-1 font-semibold text-white bg-blue-700 rounded cursor-pointer"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => {
                  clearSafeDraft(draftKey);
                  setDraftOffer(null);
                }}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              {!isConflict && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={submitSave}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-red-700 rounded cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {isAdmin && staffList.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Owner</label>
              <select
                value={staffId}
                onChange={(e) => {
                  markDirty();
                  setStaffId(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (@{s.userId})
                  </option>
                ))}
              </select>
            </div>
          )}

          {clients.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Link Existing Client (Optional)
              </label>
              <select
                value={clientId}
                onChange={(e) => handleClientPick(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="">— Custom / Manual Client Entry —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client Name *
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => {
                  markDirty();
                  setClientName(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client Phone
              </label>
              <input
                type="tel"
                value={clientPhone}
                onChange={(e) => {
                  markDirty();
                  setClientPhone(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Meeting With (Kar Sathe Meeting) *
            </label>
            <input
              type="text"
              required
              value={meetingWith}
              onChange={(e) => {
                markDirty();
                setMeetingWith(e.target.value);
              }}
              placeholder="e.g. Saudi Delegate / Agency Director / Embassy Officer"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Location (Kothay Meeting) *
            </label>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => {
                markDirty();
                setLocation(e.target.value);
              }}
              placeholder="e.g. Banani Office Room 2"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Date & Time (Kokhon Meeting) *
              </label>
              <input
                type="datetime-local"
                required
                value={dateTime}
                onChange={(e) => {
                  markDirty();
                  setDateTime(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => {
                  markDirty();
                  setStatus(e.target.value as MeetingStatus);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {MEETING_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Purpose</label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => {
                markDirty();
                setPurpose(e.target.value);
              }}
              placeholder="e.g. Salary negotiation & passport handover"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => {
                markDirty();
                setNotes(e.target.value);
              }}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseAttempt}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
 * 3. MEDICAL RECORD CREATE / EDIT MODAL
 * (Never persists medical info in browser storage!)
 * ========================================================================== */
interface MedicalModalProps {
  initial?: MedicalRecord | null;
  isAdmin: boolean;
  staffList: PublicUser[];
  clients: ClientProfile[];
  defaultStaffId: string;
  onClose: () => void;
  onSave: (
    payload: Partial<MedicalRecord> & { expectedVersion?: number }
  ) => Promise<void>;
}

export function MedicalModal({
  initial,
  isAdmin,
  staffList,
  clients,
  defaultStaffId,
  onClose,
  onSave,
}: MedicalModalProps) {
  const isCreate = !initial;
  const [clientRequestId] = useState(() => generateRequestId());

  const [staffId, setStaffId] = useState(initial?.staffId || defaultStaffId);
  const [clientId, setClientId] = useState(initial?.clientId || '');
  const [candidateName, setCandidateName] = useState(initial?.candidateName || '');
  const [candidatePhone, setCandidatePhone] = useState(initial?.candidatePhone || '');
  const [medicalCenter, setMedicalCenter] = useState(initial?.medicalCenter || '');
  const [medicalLocation, setMedicalLocation] = useState(initial?.medicalLocation || '');
  const [testDate, setTestDate] = useState(
    initial?.testDate || new Date().toISOString().slice(0, 10)
  );
  const [result, setResult] = useState<MedicalRecordResult>(initial?.result || 'Pending');
  const [amountPaid, setAmountPaid] = useState(String(initial?.amountPaid ?? 0));
  const [amountReceivable, setAmountReceivable] = useState(String(initial?.amountReceivable ?? 0));
  const [paymentPurpose, setPaymentPurpose] = useState(initial?.paymentPurpose || '');
  const [notes, setNotes] = useState(initial?.notes || '');

  const [isDirty, setIsDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isConflict, setIsConflict] = useState(false);

  useUnsavedChangesWarning(isDirty && !saving);

  function markDirty() {
    if (!isDirty) setIsDirty(true);
    if (confirmClose) setConfirmClose(false);
  }

  function handleCloseAttempt() {
    if (saving) return;
    if (isDirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  function handleClientPick(selectedId: string) {
    markDirty();
    setClientId(selectedId);
    const found = clients.find((c) => c.id === selectedId);
    if (found) {
      setCandidateName(found.name);
      setCandidatePhone(found.phone);
    }
  }

  async function submitSave() {
    setError('');
    setIsConflict(false);
    if (!candidateName.trim() || !medicalCenter.trim() || !medicalLocation.trim()) {
      setError('Candidate name, medical center, and location are required.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        staffId,
        clientId: clientId || undefined,
        candidateName: candidateName.trim(),
        candidatePhone: candidatePhone.trim(),
        medicalCenter: medicalCenter.trim(),
        medicalLocation: medicalLocation.trim(),
        testDate,
        result,
        amountPaid: Number(amountPaid) || 0,
        amountReceivable: Number(amountReceivable) || 0,
        paymentPurpose: paymentPurpose.trim(),
        notes: notes.trim(),
        clientRequestId: isCreate ? clientRequestId : undefined,
        expectedVersion: initial?.version,
      });
      setIsDirty(false);
      onClose();
    } catch (err) {
      if (err instanceof ConflictError) setIsConflict(true);
      setError(err instanceof Error ? err.message : 'Failed to save medical record.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-900">
            {initial ? 'Edit Medical Candidate' : 'Add Medical Candidate'}
          </h2>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {confirmClose && (
          <UnsavedClosePrompt
            onKeepEditing={() => setConfirmClose(false)}
            onDiscard={onClose}
          />
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              {!isConflict && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={submitSave}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-red-700 rounded cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {isAdmin && staffList.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Owner</label>
              <select
                value={staffId}
                onChange={(e) => {
                  markDirty();
                  setStaffId(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (@{s.userId})
                  </option>
                ))}
              </select>
            </div>
          )}

          {clients.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Link Existing Client (Optional)
              </label>
              <select
                value={clientId}
                onChange={(e) => handleClientPick(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="">— Manual Candidate Entry —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Candidate Name (Jatri) *
              </label>
              <input
                type="text"
                required
                value={candidateName}
                onChange={(e) => {
                  markDirty();
                  setCandidateName(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Candidate Phone
              </label>
              <input
                type="tel"
                value={candidatePhone}
                onChange={(e) => {
                  markDirty();
                  setCandidatePhone(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Medical Center Name (Kon Medical Center E) *
            </label>
            <input
              type="text"
              required
              value={medicalCenter}
              onChange={(e) => {
                markDirty();
                setMedicalCenter(e.target.value);
              }}
              placeholder="e.g. Al-Riyadh Diagnostic & GAMCA Center"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Medical Location (Kothay) *
            </label>
            <input
              type="text"
              required
              value={medicalLocation}
              onChange={(e) => {
                markDirty();
                setMedicalLocation(e.target.value);
              }}
              placeholder="e.g. Banani Road 11, Dhaka"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Test Date</label>
              <input
                type="date"
                value={testDate}
                onChange={(e) => {
                  markDirty();
                  setTestDate(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medical Result
              </label>
              <select
                value={result}
                onChange={(e) => {
                  markDirty();
                  setResult(e.target.value as MedicalRecordResult);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {MEDICAL_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Paid Amount (Koto Tk Dise)
              </label>
              <input
                type="number"
                min={0}
                value={amountPaid}
                onChange={(e) => {
                  markDirty();
                  setAmountPaid(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Receivable / Due (Koto Paya Jabe)
              </label>
              <input
                type="number"
                min={0}
                value={amountReceivable}
                onChange={(e) => {
                  markDirty();
                  setAmountReceivable(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payment Purpose (Kon Purpose E Tk Dise)
            </label>
            <input
              type="text"
              value={paymentPurpose}
              onChange={(e) => {
                markDirty();
                setPaymentPurpose(e.target.value);
              }}
              placeholder="e.g. GAMCA Slip & Lab Screening Fee"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => {
                markDirty();
                setNotes(e.target.value);
              }}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseAttempt}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Medical'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
 * 4. INTERVIEW RECORD CREATE / EDIT MODAL
 * ========================================================================== */
interface InterviewModalProps {
  initial?: InterviewRecord | null;
  isAdmin: boolean;
  staffList: PublicUser[];
  clients: ClientProfile[];
  defaultStaffId: string;
  onClose: () => void;
  onSave: (
    payload: Partial<InterviewRecord> & { expectedVersion?: number }
  ) => Promise<void>;
}

export function InterviewModal({
  initial,
  isAdmin,
  staffList,
  clients,
  defaultStaffId,
  onClose,
  onSave,
}: InterviewModalProps) {
  const isCreate = !initial;
  const draftKey = `interview_create_${defaultStaffId}`;
  const [clientRequestId] = useState(() => generateRequestId());

  const [staffId, setStaffId] = useState(initial?.staffId || defaultStaffId);
  const [clientId, setClientId] = useState(initial?.clientId || '');
  const [candidateNames, setCandidateNames] = useState(initial?.candidateNames || '');
  const [clientCount, setClientCount] = useState(String(initial?.clientCount ?? 1));
  const [interviewerOrCompany, setInterviewerOrCompany] = useState(
    initial?.interviewerOrCompany || ''
  );
  const [trade, setTrade] = useState(initial?.trade || '');
  const [interviewDate, setInterviewDate] = useState(
    initial?.interviewDate || new Date().toISOString().slice(0, 10)
  );
  const [interviewTime, setInterviewTime] = useState(initial?.interviewTime || '10:00 AM');
  const [location, setLocation] = useState(initial?.location || '');
  const [status, setStatus] = useState<InterviewStatus>(initial?.status || 'Upcoming');
  const [notes, setNotes] = useState(initial?.notes || '');

  const [isDirty, setIsDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isConflict, setIsConflict] = useState(false);
  const [draftOffer, setDraftOffer] = useState<{
    savedAt: string;
    data: {
      candidateNames?: string;
      interviewerOrCompany?: string;
      trade?: string;
      interviewDate?: string;
      interviewTime?: string;
      location?: string;
    };
  } | null>(() => (isCreate ? loadSafeDraft(draftKey) : null));

  useUnsavedChangesWarning(isDirty && !saving);

  useEffect(() => {
    if (!isCreate || !isDirty) return;
    saveSafeDraft(draftKey, {
      candidateNames,
      interviewerOrCompany,
      trade,
      interviewDate,
      interviewTime,
      location,
    });
  }, [
    isCreate,
    isDirty,
    draftKey,
    candidateNames,
    interviewerOrCompany,
    trade,
    interviewDate,
    interviewTime,
    location,
  ]);

  function markDirty() {
    if (!isDirty) setIsDirty(true);
    if (confirmClose) setConfirmClose(false);
  }

  function handleCloseAttempt() {
    if (saving) return;
    if (isDirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  function handleClientPick(selectedId: string) {
    markDirty();
    setClientId(selectedId);
    const found = clients.find((c) => c.id === selectedId);
    if (found) {
      setCandidateNames(found.name);
      setTrade(found.trade);
    }
  }

  async function submitSave() {
    setError('');
    setIsConflict(false);
    if (!candidateNames.trim() || !interviewerOrCompany.trim() || !interviewDate || !location.trim()) {
      setError('Candidates, company/interviewer, date, and location are required.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        staffId,
        clientId: clientId || undefined,
        candidateNames: candidateNames.trim(),
        clientCount: Math.max(1, Number(clientCount) || 1),
        interviewerOrCompany: interviewerOrCompany.trim(),
        trade: trade.trim(),
        interviewDate,
        interviewTime: interviewTime.trim(),
        location: location.trim(),
        status,
        notes: notes.trim(),
        clientRequestId: isCreate ? clientRequestId : undefined,
        expectedVersion: initial?.version,
      });
      if (isCreate) clearSafeDraft(draftKey);
      setIsDirty(false);
      onClose();
    } catch (err) {
      if (err instanceof ConflictError) setIsConflict(true);
      setError(err instanceof Error ? err.message : 'Failed to save interview.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-900">
            {initial ? 'Edit Interview Schedule' : 'Add Interview Schedule'}
          </h2>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {confirmClose && (
          <UnsavedClosePrompt
            onKeepEditing={() => setConfirmClose(false)}
            onDiscard={() => {
              if (isCreate) clearSafeDraft(draftKey);
              onClose();
            }}
          />
        )}

        {draftOffer && (
          <div className="px-6 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center justify-between gap-2 text-xs">
            <span className="text-blue-900">Restore unsaved interview draft?</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCandidateNames(draftOffer.data.candidateNames || '');
                  setInterviewerOrCompany(draftOffer.data.interviewerOrCompany || '');
                  setTrade(draftOffer.data.trade || '');
                  setInterviewDate(draftOffer.data.interviewDate || interviewDate);
                  setInterviewTime(draftOffer.data.interviewTime || interviewTime);
                  setLocation(draftOffer.data.location || '');
                  setDraftOffer(null);
                  setIsDirty(true);
                }}
                className="px-2.5 py-1 font-semibold text-white bg-blue-700 rounded cursor-pointer"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => {
                  clearSafeDraft(draftKey);
                  setDraftOffer(null);
                }}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              {!isConflict && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={submitSave}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-red-700 rounded cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {isAdmin && staffList.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Owner</label>
              <select
                value={staffId}
                onChange={(e) => {
                  markDirty();
                  setStaffId(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (@{s.userId})
                  </option>
                ))}
              </select>
            </div>
          )}

          {clients.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Quick-Fill from Client (Optional)
              </label>
              <select
                value={clientId}
                onChange={(e) => handleClientPick(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="">— Group / Manual Candidate List —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-9">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Candidate Names (Kon Kon Jatri) *
              </label>
              <input
                type="text"
                required
                value={candidateNames}
                onChange={(e) => {
                  markDirty();
                  setCandidateNames(e.target.value);
                }}
                placeholder="e.g. Md. Kamrul Hasan, Sohel Rana"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Total Clients
              </label>
              <input
                type="number"
                min={1}
                value={clientCount}
                onChange={(e) => {
                  markDirty();
                  setClientCount(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Employer / Interviewer (Kar Interview) *
              </label>
              <input
                type="text"
                required
                value={interviewerOrCompany}
                onChange={(e) => {
                  markDirty();
                  setInterviewerOrCompany(e.target.value);
                }}
                placeholder="e.g. Al-Fanar Contracting (KSA)"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Trade</label>
              <input
                type="text"
                value={trade}
                onChange={(e) => {
                  markDirty();
                  setTrade(e.target.value);
                }}
                placeholder="e.g. Electrician"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Interview Date (Koto Tarikh) *
              </label>
              <input
                type="date"
                required
                value={interviewDate}
                onChange={(e) => {
                  markDirty();
                  setInterviewDate(e.target.value);
                }}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Time</label>
              <input
                type="text"
                value={interviewTime}
                onChange={(e) => {
                  markDirty();
                  setInterviewTime(e.target.value);
                }}
                placeholder="10:00 AM"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => {
                  markDirty();
                  setStatus(e.target.value as InterviewStatus);
                }}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {INTERVIEW_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Interview Location *
            </label>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => {
                markDirty();
                setLocation(e.target.value);
              }}
              placeholder="e.g. Technical Trade Center, Mirpur 12"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => {
                markDirty();
                setNotes(e.target.value);
              }}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseAttempt}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Interview'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
 * 5. ADMIN: STAFF ACCOUNT CREATE / EDIT MODAL
 * ========================================================================== */
interface StaffAccountModalProps {
  initial?: PublicUser | null;
  defaultRole?: UserRole;
  allowedRoles?: Exclude<UserRole, 'accounts'>[];
  canGrantElevatedPermissions?: boolean;
  onClose: () => void;
  onSave: (payload: {
    userId: string;
    email?: string;
    password?: string;
    name: string;
    role: Exclude<UserRole, 'accounts'>;
    permissions: UserPermission[];
    designation: string;
    phone: string;
    personalPhone: string;
    whatsapp: string;
    socialLink: string;
    photoUrl: string;
    coverUrl: string;
    joiningDate: string;
  }) => Promise<void>;
}

export function StaffAccountModal({
  initial,
  defaultRole = 'staff',
  allowedRoles = ['staff', 'director', 'management'],
  canGrantElevatedPermissions = true,
  onClose,
  onSave,
}: StaffAccountModalProps) {
  const fallbackRole = allowedRoles.includes(defaultRole as Exclude<UserRole, 'accounts'>)
    ? defaultRole as Exclude<UserRole, 'accounts'>
    : allowedRoles[0] || 'staff';
  const initialRole = initial?.role && initial.role !== 'accounts' && allowedRoles.includes(initial.role as Exclude<UserRole, 'accounts'>)
    ? initial.role as Exclude<UserRole, 'accounts'>
    : fallbackRole;
  const [role, setRole] = useState<Exclude<UserRole, 'accounts'>>(initialRole);
  const [permissions, setPermissions] = useState<UserPermission[]>(
    initial?.role === 'accounts'
      ? ['view_team_profiles', 'view_finance', 'manage_finance', 'create_staff_accounts']
      : (initial?.permissions || [])
  );
  const isAccounts = permissions.includes('view_finance') || permissions.includes('manage_finance');
  const permissionOptions: { value: UserPermission; label: string }[] = [
    { value: 'view_team_profiles', label: 'View team profiles' },
    { value: 'add_clients', label: 'Add clients' },
    { value: 'edit_clients', label: 'Edit clients' },
    { value: 'delete_clients', label: 'Delete clients' },
    { value: 'print_a4', label: 'A4 print' },
    { value: 'send_messages', label: 'Send messages' },
    { value: 'view_finance', label: 'View finance' },
    { value: 'manage_finance', label: 'Add / verify financial entries and receipts' },
    { value: 'create_staff_accounts', label: 'Create Staff login accounts' },
    { value: 'manage_user_permissions', label: 'Assign user permissions' },
    { value: 'view_all_reports', label: 'View all reports & dashboard overview (read-only)' },
    { value: 'sub_admin', label: 'Full Admin Management (Sub Admin)' },
  ];

  const visiblePermissionOptions = canGrantElevatedPermissions ? permissionOptions : permissionOptions.filter((item) => !['manage_finance', 'view_finance', 'manage_user_permissions', 'view_all_reports', 'sub_admin'].includes(item.value));

  const [name, setName] = useState(initial?.name || '');
  const [designation, setDesignation] = useState(
    initial?.designation ||
      (isAccounts ? 'Accounts & Finance Officer' : 'Visa & Recruitment Coordinator')
  );
  const [userId, setUserId] = useState(initial?.userId || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState(initial?.phone || '');
  const [personalPhone, setPersonalPhone] = useState(initial?.personalPhone || '');
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp || '');
  const [joiningDate, setJoiningDate] = useState(
    initial?.joiningDate || (initial ? '' : getTodayLocalDateStr())
  );
  const [socialLink, setSocialLink] = useState(initial?.socialLink || '');
  const [photoUrl, setPhotoUrl] = useState(
    initial?.photoUrl || APP_IMAGES.staffAvatarDefault
  );
  const [coverUrl, setCoverUrl] = useState(
    initial?.coverUrl || APP_IMAGES.heroMobilityAgency
  );
  const [isDirty, setIsDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<'avatar' | 'cover' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useUnsavedChangesWarning(isDirty && !saving);

  function markDirty() {
    if (!isDirty) setIsDirty(true);
    if (confirmClose) setConfirmClose(false);
  }

  function handleCloseAttempt() {
    if (saving) return;
    if (isDirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  async function handleImageUpload(
    e: ChangeEvent<HTMLInputElement>,
    kind: 'avatar' | 'cover',
    setter: (val: string) => void
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploadingKind(kind);
    try {
      const url = await api.uploadStaffMediaFile(file, initial?.id || 'admin_uploads', kind);
      markDirty();
      setter(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setUploadingKind(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const cleanName = name.trim();
    const cleanUid = userId.trim();
    const cleanEmail = email.trim();
    if (!cleanName || !cleanUid) {
      setError('Full Name and Login User ID are required.');
      return;
    }
    if (cleanUid.length < 2 || /\s/.test(cleanUid)) {
      setError('Login User ID must be at least 2 characters and contain no spaces.');
      return;
    }
    if (!initial && cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address or leave Email blank for automatic assignment.');
      return;
    }
    if (!initial) {
      const pwErr = validateStrongPassword(password, 'Password');
      if (pwErr) {
        setError(pwErr);
        return;
      }
    }
    if (initial && password.trim().length > 0) {
      const pwErr = validateStrongPassword(password, 'New password');
      if (pwErr) {
        setError(pwErr);
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        role,
        permissions,
        designation: designation.trim(),
        userId: userId.trim(),
        email: email.trim() || undefined,
        password: password.trim() || undefined,
        phone: phone.trim(),
        personalPhone: personalPhone.trim(),
        whatsapp: whatsapp.trim() || phone.trim(),
        socialLink: socialLink.trim(),
        photoUrl: photoUrl.trim(),
        coverUrl: coverUrl.trim(),
        joiningDate: joiningDate.trim(),
      });
      setIsDirty(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto ${canGrantElevatedPermissions ? "" : "permission-manager-modal"}`}>
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {initial ? 'Edit Team Account' : 'Create Team Account'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose a dashboard role, then enable only the permissions this user needs.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {confirmClose && (
          <UnsavedClosePrompt
            onKeepEditing={() => setConfirmClose(false)}
            onDiscard={onClose}
          />
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Dashboard Role *</label>
            <select value={role} onChange={(e) => { markDirty(); setRole(e.target.value as Exclude<UserRole, 'accounts'>); }} className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg">
              {allowedRoles.map((allowedRole) => (
                <option key={allowedRole} value={allowedRole}>
                  {allowedRole === 'staff' ? 'Staff' : allowedRole === 'director' ? 'Director' : 'Management'}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <p className="text-xs font-bold text-slate-800 mb-2">Additional permissions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {visiblePermissionOptions.map((item) => (
                <label key={item.value} className="flex items-start gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={permissions.includes(item.value)} onChange={(e) => {
                    markDirty();
                    setPermissions((prev) => e.target.checked ? [...prev, item.value] : prev.filter((p) => p !== item.value));
                  }} className="mt-0.5" />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  markDirty();
                  setName(e.target.value);
                }}
                placeholder="e.g. Rafiqul Islam"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Designation
              </label>
              <input
                type="text"
                value={designation}
                onChange={(e) => {
                  markDirty();
                  setDesignation(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Login User ID *
              </label>
              <input
                type="text"
                required
                value={userId}
                onChange={(e) => {
                  markDirty();
                  setUserId(e.target.value);
                }}
                placeholder="e.g. rafiq"
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address (Optional)
              </label>
              <input
                type="email"
                disabled={Boolean(initial)}
                value={email}
                onChange={(e) => {
                  markDirty();
                  setEmail(e.target.value);
                }}
                placeholder="Auto-assigned if blank"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
              />
            </div>
          </div>

          {saved && (
            <div className="px-3 py-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
              Account details saved successfully. The new password remains visible here so you can copy it before closing.
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {initial
                ? 'Set New Login Password (leave blank to keep current, min. 4 chars)'
                : 'Login Password (min. 4 chars) *'}
            </label>
            <p className="text-[11px] text-slate-500 mb-2">
              Existing/current passwords cannot be viewed or recovered. For security, only a newly entered password can be shown and copied. Leave blank to keep the account password unchanged.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required={!initial}
                  value={password}
                  onChange={(e) => {
                    markDirty();
                    setPassword(e.target.value);
                  }}
                  placeholder={initial ? 'Enter a new password to reset it' : 'Set login password'}
                  className="w-full px-3.5 py-2 pr-11 text-sm font-mono border border-slate-300 rounded-lg"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-500 hover:text-slate-800"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                disabled={!password}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(password);
                    setError('New password copied. Save the account to apply it.');
                  } catch {
                    setError('Copy is unavailable in this browser. Use Show to view the new password.');
                  }
                }}
                className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Copy
              </button>
            </div>
            {initial ? (
              <p className="mt-1 text-[11px] text-slate-500">
                For security, the current/old password cannot be viewed. Enter a new password, then Save Account to reset it.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Official Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  markDirty();
                  setPhone(e.target.value);
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
                value={personalPhone}
                onChange={(e) => {
                  markDirty();
                  setPersonalPhone(e.target.value);
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
                value={whatsapp}
                onChange={(e) => {
                  markDirty();
                  setWhatsapp(e.target.value);
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
                value={joiningDate}
                onChange={(e) => {
                  markDirty();
                  setJoiningDate(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Facebook / Social Profile URL
            </label>
            <input
              type="text"
              value={socialLink}
              onChange={(e) => {
                markDirty();
                setSocialLink(e.target.value);
              }}
              placeholder="https://facebook.com/..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Profile Photo
              </label>
              <div className="flex items-center gap-3">
                <img
                  src={photoUrl}
                  alt="Preview"
                  className="w-11 h-11 rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0"
                />
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingKind === 'avatar' ? 'Uploading...' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingKind !== null}
                    onChange={(e) => handleImageUpload(e, 'avatar', setPhotoUrl)}
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
                  src={coverUrl}
                  alt="Cover preview"
                  className="w-16 h-11 rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0"
                />
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingKind === 'cover' ? 'Uploading...' : 'Upload Cover'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingKind !== null}
                    onChange={(e) => handleImageUpload(e, 'cover', setCoverUrl)}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseAttempt}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingKind !== null}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : initial ? 'Update Account' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
 * 6. DEBIT / CREDIT LEDGER ENTRY MODAL (Accounts Create, Admin Create/Edit)
 * ========================================================================== */
const LEDGER_CATEGORIES = [
  'Client Payment',
  'Medical Fee',
  'Visa Stamping',
  'Air Ticket',
  'Office Rent & Utilities',
  'Staff Salary',
  'Delegate / Hospitality',
  'Refund',
  'General',
];

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'bKash', 'Nagad', 'Check / Card'];

interface LedgerEntryModalProps {
  initial?: AccountLedgerEntry | null;
  ownerId: string;
  permissionActions?: boolean;
  onClose: () => void;
  onSave: (
    payload: Partial<AccountLedgerEntry> & { expectedVersion?: number }
  ) => Promise<void>;
}

export function LedgerEntryModal({
  initial,
  ownerId,
  permissionActions = false,
  onClose,
  onSave,
}: LedgerEntryModalProps) {
  const isCreate = !initial;
  const draftKey = `ledger_create_${ownerId}`;
  const [clientRequestId] = useState(() => generateRequestId());

  const [entryType, setEntryType] = useState<LedgerEntryType>(initial?.entryType || 'credit');
  const [amount, setAmount] = useState<number>(initial?.amount || 0);
  const [entryDate, setEntryDate] = useState(
    initial?.entryDate || new Date().toISOString().slice(0, 10)
  );
  const [title, setTitle] = useState(initial?.title || '');
  const [category, setCategory] = useState(initial?.category || 'Client Payment');
  const [partyName, setPartyName] = useState(initial?.partyName || '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod || 'Cash');
  const [referenceNo, setReferenceNo] = useState(initial?.referenceNo || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [receiptPath, setReceiptPath] = useState(initial?.receiptPath || '');
  const [receiptUploading, setReceiptUploading] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [restoredDraftBanner, setRestoredDraftBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflictDetected, setConflictDetected] = useState(false);

  useUnsavedChangesWarning(isDirty && !saving);

  useEffect(() => {
    if (!isCreate) return;
    const saved = loadSafeDraft<{
      entryType?: LedgerEntryType;
      amount?: number;
      entryDate?: string;
      title?: string;
      category?: string;
      partyName?: string;
      paymentMethod?: string;
      referenceNo?: string;
      notes?: string;
    }>(draftKey);
    if (saved?.data && (saved.data.title || saved.data.amount || saved.data.partyName)) {
      const d = saved.data;
      if (d.entryType) setEntryType(d.entryType);
      if (d.amount !== undefined) setAmount(d.amount);
      if (d.entryDate) setEntryDate(d.entryDate);
      if (d.title) setTitle(d.title);
      if (d.category) setCategory(d.category);
      if (d.partyName) setPartyName(d.partyName);
      if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
      if (d.referenceNo) setReferenceNo(d.referenceNo);
      if (d.notes) setNotes(d.notes);
      setIsDirty(true);
      setRestoredDraftBanner(true);
    }
  }, [draftKey, isCreate]);

  useEffect(() => {
    if (!isCreate || !isDirty) return;
    saveSafeDraft(draftKey, {
      entryType,
      amount,
      entryDate,
      title,
      category,
      partyName,
      paymentMethod,
      referenceNo,
      notes,
    });
  }, [
    isCreate,
    isDirty,
    draftKey,
    entryType,
    amount,
    entryDate,
    title,
    category,
    partyName,
    paymentMethod,
    referenceNo,
    notes,
  ]);

  function markDirty() {
    if (!isDirty) setIsDirty(true);
    if (confirmClose) setConfirmClose(false);
  }

  function handleCloseAttempt() {
    if (saving || receiptUploading) return;
    // Drafts are persisted automatically while editing. Closing the modal should
    // never trap the user behind a confirmation overlay; reopening restores the draft.
    onClose();
  }

  async function handleReceiptUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setReceiptUploading(true);
    try {
      const uploaded = await api.uploadLedgerReceiptFile(file, ownerId);
      setReceiptPath(uploaded.storagePath);
      markDirty();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Receipt upload failed.');
    } finally {
      setReceiptUploading(false);
      e.target.value = '';
    }
  }

  async function executeSave() {
    if (saving) return;
    setError('');
    setConflictDetected(false);

    if (!title.trim()) {
      setError('Particulars / description is required.');
      return;
    }
    if (!Number.isFinite(amount) || Number(amount) <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        entryType,
        amount: Number(amount),
        entryDate: entryDate || new Date().toISOString().slice(0, 10),
        title: title.trim(),
        category: category.trim() || 'General',
        partyName: partyName.trim(),
        paymentMethod: paymentMethod.trim() || 'Cash',
        referenceNo: referenceNo.trim(),
        notes: notes.trim(),
        receiptPath: receiptPath || undefined,
        clientRequestId: isCreate ? clientRequestId : undefined,
        expectedVersion: initial?.version,
      });
      if (isCreate) clearSafeDraft(draftKey);
      setIsDirty(false);
      onClose();
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflictDetected(true);
      }
      setError(err instanceof Error ? err.message : 'Failed to save ledger entry.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    executeSave();
  }

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto ${permissionActions ? "finance-permission-modal" : ""}`}>
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {initial ? 'Edit Debit / Credit Entry' : 'New Debit / Credit Entry'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Saved directly to the Accounts Ledger and visible to both Admin and Accounts dashboards.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {confirmClose && (
          <UnsavedClosePrompt
            onKeepEditing={() => setConfirmClose(false)}
            onDiscard={() => {
              if (isCreate) clearSafeDraft(draftKey);
              onClose();
            }}
          />
        )}

        <form noValidate onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {restoredDraftBanner && (
            <div className="px-4 py-2.5 text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-lg flex items-center justify-between gap-2">
              <span>Restored an unsaved Debit/Credit draft from your last session.</span>
              <button
                type="button"
                onClick={() => {
                  clearSafeDraft(draftKey);
                  setEntryType('credit');
                  setAmount(0);
                  setEntryDate(new Date().toISOString().slice(0, 10));
                  setTitle('');
                  setCategory('Client Payment');
                  setPartyName('');
                  setPaymentMethod('Cash');
                  setReferenceNo('');
                  setNotes('');
                  setIsDirty(false);
                  setRestoredDraftBanner(false);
                }}
                className="font-semibold underline cursor-pointer shrink-0"
              >
                Clear Draft
              </button>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg space-y-2">
              <p>{error}</p>
              {!conflictDetected && (
                <button
                  type="button"
                  onClick={executeSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Save</span>
                </button>
              )}
            </div>
          )}

          {/* Entry Type Switcher */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Transaction Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  markDirty();
                  setEntryType('credit');
                }}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border transition-colors cursor-pointer ${
                  entryType === 'credit'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
                <span>Credit (Money In)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  markDirty();
                  setEntryType('debit');
                }}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border transition-colors cursor-pointer ${
                  entryType === 'debit'
                    ? 'bg-red-50 border-red-600 text-red-800'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 text-red-700" />
                <span>Debit (Money Out)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Amount (BDT) *
              </label>
              <input
                type="number"
                required
                min={1}
                step="any"
                value={amount || ''}
                onChange={(e) => {
                  markDirty();
                  setAmount(Number(e.target.value));
                }}
                placeholder="e.g. 25000"
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Entry Date *
              </label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => {
                  markDirty();
                  setEntryDate(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Particulars / Description *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => {
                markDirty();
                setTitle(e.target.value);
              }}
              placeholder={
                entryType === 'credit'
                  ? 'e.g. Saudi Arabia visa processing advance from Kamrul'
                  : 'e.g. Gulf Medical Center screening payment'
              }
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category
              </label>
              <input
                type="text"
                list="ledger-category-options"
                value={category}
                onChange={(e) => {
                  markDirty();
                  setCategory(e.target.value);
                }}
                placeholder="e.g. Client Payment"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
              <datalist id="ledger-category-options">
                {LEDGER_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {entryType === 'credit' ? 'Received From' : 'Paid To'}
              </label>
              <input
                type="text"
                value={partyName}
                onChange={(e) => {
                  markDirty();
                  setPartyName(e.target.value);
                }}
                placeholder="Client, agency, or vendor name"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  markDirty();
                  setPaymentMethod(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Voucher / Slip / Ref No
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => {
                  markDirty();
                  setReferenceNo(e.target.value);
                }}
                placeholder="e.g. VCH-204"
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Receipt Photo / PDF</label>
                <p className="text-[11px] text-slate-500 mt-0.5">JPG, PNG, WEBP or PDF · max 10 MB · private storage</p>
              </div>
              {receiptPath && <span className="text-[11px] font-semibold text-emerald-700">Attached · Pending verification</span>}
            </div>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={receiptUploading || saving} onChange={handleReceiptUpload} className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold" />
            {receiptUploading && <p className="text-xs text-blue-700">Uploading receipt securely...</p>}
            {receiptPath && <p className="text-[11px] text-slate-500 break-all">Saved: {receiptPath.split('/').pop()}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Remarks / Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => {
                markDirty();
                setNotes(e.target.value);
              }}
              placeholder="Optional internal remarks"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
            <span className="text-xs font-mono tabular-nums text-slate-600">
              {entryType === 'credit' ? '+ Credit:' : '- Debit:'}{' '}
              <strong className={entryType === 'credit' ? 'text-emerald-700' : 'text-red-700'}>
                {formatBDT(amount || 0)}
              </strong>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCloseAttempt}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || receiptUploading}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {saving ? 'Saving...' : initial ? 'Update Entry' : 'Save Entry'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   DAILY ATTENDANCE MODAL
   ============================================================================ */

const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'Present',
  'Late',
  'Field Work',
  'Half Day',
  'Leave',
];

const WORK_LOCATIONS = ['Office', 'Medical Center', 'Embassy / Visa Office', 'Field Visit', 'Remote'];

interface AttendanceModalProps {
  initial: StaffAttendanceRecord | null;
  isAdmin: boolean;
  staffRoster: PublicUser[];
  defaultStaffId: string;
  defaultDate?: string;
  onClose: () => void;
  onSave: (payload: Partial<StaffAttendanceRecord> & { expectedVersion?: number }) => Promise<void>;
}

export function AttendanceModal({
  initial,
  isAdmin,
  staffRoster,
  defaultStaffId,
  defaultDate,
  onClose,
  onSave,
}: AttendanceModalProps) {
  const [staffId, setStaffId] = useState(initial?.staffId || defaultStaffId);
  const [attendanceDate, setAttendanceDate] = useState(
    initial?.attendanceDate || defaultDate || getTodayLocalDateStr()
  );
  const [status, setStatus] = useState<AttendanceStatus>(initial?.status || 'Present');
  const [checkInTime, setCheckInTime] = useState(
    initial?.checkInTime || getCurrentLocalTimeStr()
  );
  const [checkOutTime, setCheckOutTime] = useState(initial?.checkOutTime || '');
  const [workLocation, setWorkLocation] = useState(initial?.workLocation || 'Office');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [requestId] = useState(() => initial?.clientRequestId || generateRequestId());

  const [dirty, setDirty] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflictDetected, setConflictDetected] = useState(false);

  useUnsavedChangesWarning(dirty && !saving);

  function handleCloseAttempt() {
    if (saving) return;
    if (dirty) {
      setShowUnsavedPrompt(true);
      return;
    }
    onClose();
  }

  const isLockedExisting = Boolean(initial);

  async function executeSave() {
    if (isLockedExisting) {
      setError('Attendance records are locked and cannot be edited once saved.');
      return;
    }
    setError('');
    setConflictDetected(false);
    if (!attendanceDate.trim()) {
      setError('Attendance date is required.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        staffId: isAdmin ? staffId : defaultStaffId,
        attendanceDate: attendanceDate.trim(),
        status,
        checkInTime: status === 'Leave' ? '' : checkInTime.trim(),
        checkOutTime: status === 'Leave' ? '' : checkOutTime.trim(),
        workLocation: workLocation.trim() || 'Office',
        notes: notes.trim(),
        expectedVersion: initial?.version,
        clientRequestId: initial ? undefined : requestId,
      });
      setDirty(false);
      onClose();
    } catch (err) {
      if (err instanceof ConflictError) setConflictDetected(true);
      setError(err instanceof Error ? err.message : 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    executeSave();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden my-auto">
        <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold">
              {isLockedExisting ? 'Attendance Record Locked' : 'Mark Daily Attendance'}
            </h2>
            <p className="text-xs text-slate-300">
              {isLockedExisting
                ? 'Attendance entries are permanent and cannot be modified once recorded'
                : 'Record initial check-in, work location & attendance status'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {showUnsavedPrompt && (
          <UnsavedClosePrompt
            onKeepEditing={() => setShowUnsavedPrompt(false)}
            onDiscard={onClose}
          />
        )}

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {isLockedExisting && (
            <div className="px-4 py-3 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                This attendance entry is locked against edits. Use the one-time Check Out button if check-out time is still empty.
              </span>
            </div>
          )}
          {error && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg space-y-2">
              <p>{error}</p>
              {!conflictDetected && (
                <button
                  type="button"
                  onClick={executeSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Save</span>
                </button>
              )}
            </div>
          )}

          {isAdmin && staffRoster.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Team Member *
              </label>
              <select
                value={staffId}
                onChange={(e) => {
                  setDirty(true);
                  setStaffId(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                {staffRoster.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Attendance Date *
              </label>
              <input
                type="date"
                required
                value={attendanceDate}
                onChange={(e) => {
                  setDirty(true);
                  setAttendanceDate(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Attendance Status *
              </label>
              <select
                value={status}
                onChange={(e) => {
                  setDirty(true);
                  setStatus(e.target.value as AttendanceStatus);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                {ATTENDANCE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {status !== 'Leave' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Check-In Time
                </label>
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => {
                    setDirty(true);
                    setCheckInTime(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Check-Out Time
                </label>
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => {
                    setDirty(true);
                    setCheckOutTime(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Work Location
            </label>
            <input
              type="text"
              list="attendance-work-locations"
              value={workLocation}
              onChange={(e) => {
                setDirty(true);
                setWorkLocation(e.target.value);
              }}
              placeholder="Office / Field Visit / Medical Center"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
            <datalist id="attendance-work-locations">
              {WORK_LOCATIONS.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Work / Shift Note
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => {
                setDirty(true);
                setNotes(e.target.value);
              }}
              placeholder="Optional attendance or duty remarks"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseAttempt}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              {isLockedExisting ? 'Close' : 'Cancel'}
            </button>
            {!isLockedExisting && (
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Attendance'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   DAILY CONVERSATION / CALL LOG MODAL ("Kar Sathe Ki Ki Kotha Holo")
   ============================================================================ */

const LOG_CHANNELS: LogChannel[] = [
  'Phone Call',
  'WhatsApp',
  'Office Visit',
  'Video Call',
  'Field Visit',
];

const LOG_OUTCOMES: LogOutcome[] = [
  'Follow Up Needed',
  'Interested',
  'Document Promised',
  'Payment Promised',
  'Confirmed',
  'Resolved',
  'Not Interested',
];

interface DailyLogModalProps {
  initial: StaffDailyLog | null;
  isAdmin: boolean;
  staffRoster: PublicUser[];
  clients?: ClientProfile[];
  defaultStaffId: string;
  defaultDate?: string;
  onClose: () => void;
  onSave: (payload: Partial<StaffDailyLog> & { expectedVersion?: number }) => Promise<void>;
}

export function DailyLogModal({
  initial,
  isAdmin,
  staffRoster,
  clients = [],
  defaultStaffId,
  defaultDate,
  onClose,
  onSave,
}: DailyLogModalProps) {
  const [staffId, setStaffId] = useState(initial?.staffId || defaultStaffId);
  const [clientId, setClientId] = useState(initial?.clientId || '');
  const [logDate, setLogDate] = useState(
    initial?.logDate || defaultDate || getTodayLocalDateStr()
  );
  const [logTime, setLogTime] = useState(initial?.logTime || getCurrentLocalTimeStr());
  const [contactName, setContactName] = useState(initial?.contactName || '');
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone || '');
  const [channel, setChannel] = useState<LogChannel>(initial?.channel || 'Phone Call');
  const [topic, setTopic] = useState(initial?.topic || '');
  const [discussionSummary, setDiscussionSummary] = useState(initial?.discussionSummary || '');
  const [outcome, setOutcome] = useState<LogOutcome>(initial?.outcome || 'Follow Up Needed');
  const [nextFollowUpDate, setNextFollowUpDate] = useState(initial?.nextFollowUpDate || '');
  const [nextFollowUpTime, setNextFollowUpTime] = useState(initial?.nextFollowUpTime || '');
  const [requestId] = useState(() => initial?.clientRequestId || generateRequestId());

  const [dirty, setDirty] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflictDetected, setConflictDetected] = useState(false);

  useUnsavedChangesWarning(dirty && !saving);

  function handleCloseAttempt() {
    if (saving) return;
    if (dirty) {
      setShowUnsavedPrompt(true);
      return;
    }
    onClose();
  }

  function handlePickClient(selectedClientId: string) {
    setDirty(true);
    setClientId(selectedClientId);
    const found = clients.find((c) => c.id === selectedClientId);
    if (found) {
      setContactName(found.name);
      setContactPhone(found.phone);
      if (!topic.trim()) {
        setTopic([found.trade, found.destinationCountry].filter(Boolean).join(' · '));
      }
    }
  }

  async function executeSave() {
    setError('');
    setConflictDetected(false);
    if (!contactName.trim() || !discussionSummary.trim()) {
      setError('Person name ("Kar sathe kotha holo") and discussion summary are required.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        staffId: isAdmin ? staffId : defaultStaffId,
        clientId: clientId || undefined,
        logDate: logDate.trim() || getTodayLocalDateStr(),
        logTime: logTime.trim(),
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        channel,
        topic: topic.trim(),
        discussionSummary: discussionSummary.trim(),
        outcome,
        nextFollowUpDate: nextFollowUpDate.trim(),
        nextFollowUpTime: nextFollowUpTime.trim(),
        expectedVersion: initial?.version,
        clientRequestId: initial ? undefined : requestId,
      });
      setDirty(false);
      onClose();
    } catch (err) {
      if (err instanceof ConflictError) setConflictDetected(true);
      setError(err instanceof Error ? err.message : 'Failed to save daily conversation log.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    executeSave();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden my-auto">
        <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold">
              {initial ? 'Edit Conversation Log' : 'Log Daily Call / Conversation'}
            </h2>
            <p className="text-xs text-slate-300">
              Record who you spoke with, what was discussed, and next follow-up
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {showUnsavedPrompt && (
          <UnsavedClosePrompt
            onKeepEditing={() => setShowUnsavedPrompt(false)}
            onDiscard={onClose}
          />
        )}

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg space-y-2">
              <p>{error}</p>
              {!conflictDetected && (
                <button
                  type="button"
                  onClick={executeSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Save</span>
                </button>
              )}
            </div>
          )}

          {isAdmin && staffRoster.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Coordinator / Staff Member *
              </label>
              <select
                value={staffId}
                onChange={(e) => {
                  setDirty(true);
                  setStaffId(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                {staffRoster.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {clients.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Link Existing Client (Optional)
              </label>
              <select
                value={clientId}
                onChange={(e) => handlePickClient(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <option value="">-- New inquiry / external contact --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone}) {c.trade ? `· ${c.trade}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Person Spoken With (Name) *
              </label>
              <input
                type="text"
                required
                value={contactName}
                onChange={(e) => {
                  setDirty(true);
                  setContactName(e.target.value);
                }}
                placeholder="Client, candidate, or partner name"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => {
                  setDirty(true);
                  setContactPhone(e.target.value);
                }}
                placeholder="01XXXXXXXXX"
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={logDate}
                onChange={(e) => {
                  setDirty(true);
                  setLogDate(e.target.value);
                }}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Time</label>
              <input
                type="time"
                value={logTime}
                onChange={(e) => {
                  setDirty(true);
                  setLogTime(e.target.value);
                }}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Channel *</label>
              <select
                value={channel}
                onChange={(e) => {
                  setDirty(true);
                  setChannel(e.target.value as LogChannel);
                }}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                {LOG_CHANNELS.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Subject / Topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => {
                setDirty(true);
                setTopic(e.target.value);
              }}
              placeholder="e.g. Passport submission, Medical fee, Saudi Electrician visa"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              What Was Discussed (Ki Ki Kotha Holo) *
            </label>
            <textarea
              rows={3}
              required
              value={discussionSummary}
              onChange={(e) => {
                setDirty(true);
                setDiscussionSummary(e.target.value);
              }}
              placeholder="Write clear details of the conversation, commitments made, documents or amount promised..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Call Outcome
              </label>
              <select
                value={outcome}
                onChange={(e) => {
                  setDirty(true);
                  setOutcome(e.target.value as LogOutcome);
                }}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                {LOG_OUTCOMES.map((out) => (
                  <option key={out} value={out}>
                    {out}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Next Follow-Up Date
              </label>
              <input
                type="date"
                value={nextFollowUpDate}
                onChange={(e) => {
                  setDirty(true);
                  setNextFollowUpDate(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Follow-Up Time
              </label>
              <input
                type="time"
                value={nextFollowUpTime}
                onChange={(e) => {
                  setDirty(true);
                  setNextFollowUpTime(e.target.value);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseAttempt}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : initial ? 'Update Log' : 'Save Conversation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

