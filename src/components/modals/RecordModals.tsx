import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { compressImageFile, formatBDT } from '../../lib/api';
import type {
  ClientDocument,
  ClientPayment,
  ClientProfile,
  ClientStage,
  DocumentStatus,
  InterviewRecord,
  InterviewStatus,
  MedicalOutcome,
  MedicalRecord,
  MedicalRecordResult,
  MeetingRecord,
  MeetingStatus,
  PublicUser,
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

/* ============================================================================
 * 1. CLIENT CREATE / EDIT MODAL
 * ========================================================================== */
interface ClientModalProps {
  initial?: ClientProfile | null;
  isAdmin: boolean;
  staffList: PublicUser[];
  defaultStaffId: string;
  onClose: () => void;
  onSave: (payload: Partial<ClientProfile>) => Promise<void>;
}

export function ClientModal({
  initial,
  isAdmin,
  staffList,
  defaultStaffId,
  onClose,
  onSave,
}: ClientModalProps) {
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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const computedPaidFromEntries = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const effectivePaid = payments.length > 0 ? computedPaidFromEntries : Number(manualPaid) || 0;
  const remainingDue = Math.max(0, (Number(totalPayable) || 0) - effectivePaid);

  function addDocumentRow() {
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
    setDocuments((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d))
    );
  }

  async function handleDocFile(index: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, 900);
      updateDoc(index, { fileDataUrl: dataUrl });
    } catch {
      setError('Could not process document image.');
    }
  }

  function addPaymentRow() {
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
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
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
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save client profile.');
    } finally {
      setSaving(false);
    }
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
              Clients can search their phone number on the landing page to view this update.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
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
                  onChange={(e) => setStaffId(e.target.value)}
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
                onChange={(e) => setName(e.target.value)}
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
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 01712345678"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
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
                onChange={(e) => setPassportNumber(e.target.value)}
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
                onChange={(e) => setTrade(e.target.value)}
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
                onChange={(e) => setDestinationCountry(e.target.value)}
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
                onChange={(e) => setExpectedSalary(e.target.value)}
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
                onChange={(e) => setStatus(e.target.value as ClientStage)}
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
                    onChange={(e) => setMedicalDone(e.target.checked)}
                    className="w-4 h-4 accent-blue-700"
                  />
                  <span>Yes, medical done</span>
                </label>
                <select
                  value={medicalStatus}
                  onChange={(e) => setMedicalStatus(e.target.value as MedicalOutcome)}
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
                onChange={(e) => setMedicalCenter(e.target.value)}
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
                onChange={(e) => setMedicalLocation(e.target.value)}
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
                  onChange={(e) => setTotalPayable(e.target.value)}
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
                  onChange={(e) => setManualPaid(e.target.value)}
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
                onChange={(e) => setPendingItems(e.target.value)}
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
                        onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}
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
                Documents Provided by Client
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
                      className="sm:col-span-4 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
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
                    <label className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded cursor-pointer hover:bg-slate-100">
                      <Upload className="w-3 h-3" />
                      <span>{doc.fileDataUrl ? 'Uploaded' : 'Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleDocFile(idx, e)}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== idx))}
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
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any internal or client-facing notes"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. MEETING CREATE / EDIT MODAL
 * ========================================================================== */
interface MeetingModalProps {
  initial?: MeetingRecord | null;
  isAdmin: boolean;
  staffList: PublicUser[];
  clients: ClientProfile[];
  defaultStaffId: string;
  onClose: () => void;
  onSave: (payload: Partial<MeetingRecord>) => Promise<void>;
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleClientPick(selectedId: string) {
    setClientId(selectedId);
    const found = clients.find((c) => c.id === selectedId);
    if (found) {
      setClientName(found.name);
      setClientPhone(found.phone);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
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
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meeting.');
    } finally {
      setSaving(false);
    }
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
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {isAdmin && staffList.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Owner</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
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
                onChange={(e) => setClientName(e.target.value)}
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
                onChange={(e) => setClientPhone(e.target.value)}
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
              onChange={(e) => setMeetingWith(e.target.value)}
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
              onChange={(e) => setLocation(e.target.value)}
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
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MeetingStatus)}
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
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Salary negotiation & passport handover"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
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
 * ========================================================================== */
interface MedicalModalProps {
  initial?: MedicalRecord | null;
  isAdmin: boolean;
  staffList: PublicUser[];
  clients: ClientProfile[];
  defaultStaffId: string;
  onClose: () => void;
  onSave: (payload: Partial<MedicalRecord>) => Promise<void>;
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleClientPick(selectedId: string) {
    setClientId(selectedId);
    const found = clients.find((c) => c.id === selectedId);
    if (found) {
      setCandidateName(found.name);
      setCandidatePhone(found.phone);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
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
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save medical record.');
    } finally {
      setSaving(false);
    }
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
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {isAdmin && staffList.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Owner</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
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
                onChange={(e) => setCandidateName(e.target.value)}
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
                onChange={(e) => setCandidatePhone(e.target.value)}
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
              onChange={(e) => setMedicalCenter(e.target.value)}
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
              onChange={(e) => setMedicalLocation(e.target.value)}
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
                onChange={(e) => setTestDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medical Result
              </label>
              <select
                value={result}
                onChange={(e) => setResult(e.target.value as MedicalRecordResult)}
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
                onChange={(e) => setAmountPaid(e.target.value)}
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
                onChange={(e) => setAmountReceivable(e.target.value)}
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
              onChange={(e) => setPaymentPurpose(e.target.value)}
              placeholder="e.g. GAMCA Slip & Lab Screening Fee"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
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
  onSave: (payload: Partial<InterviewRecord>) => Promise<void>;
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleClientPick(selectedId: string) {
    setClientId(selectedId);
    const found = clients.find((c) => c.id === selectedId);
    if (found) {
      setCandidateNames(found.name);
      setTrade(found.trade);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
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
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save interview.');
    } finally {
      setSaving(false);
    }
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
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {isAdmin && staffList.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Owner</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
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
                onChange={(e) => setCandidateNames(e.target.value)}
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
                onChange={(e) => setClientCount(e.target.value)}
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
                onChange={(e) => setInterviewerOrCompany(e.target.value)}
                placeholder="e.g. Al-Fanar Contracting (KSA)"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Trade</label>
              <input
                type="text"
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
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
                onChange={(e) => setInterviewDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Time</label>
              <input
                type="text"
                value={interviewTime}
                onChange={(e) => setInterviewTime(e.target.value)}
                placeholder="10:00 AM"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as InterviewStatus)}
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
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Technical Trade Center, Mirpur 12"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
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
  onClose: () => void;
  onSave: (payload: {
    userId: string;
    password?: string;
    name: string;
    designation: string;
    phone: string;
    whatsapp: string;
    socialLink: string;
    photoUrl: string;
    coverUrl: string;
  }) => Promise<void>;
}

export function StaffAccountModal({ initial, onClose, onSave }: StaffAccountModalProps) {
  const [name, setName] = useState(initial?.name || '');
  const [designation, setDesignation] = useState(
    initial?.designation || 'Visa & Recruitment Coordinator'
  );
  const [userId, setUserId] = useState(initial?.userId || '');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp || '');
  const [socialLink, setSocialLink] = useState(initial?.socialLink || '');
  const [photoUrl, setPhotoUrl] = useState(
    initial?.photoUrl || '/src/assets/images/staff_avatar_default_1794656907853.jpg'
  );
  const [coverUrl, setCoverUrl] = useState(
    initial?.coverUrl || '/src/assets/images/hero_mobility_agency_1794656908413.jpg'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleImageUpload(
    e: ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, 900);
      setter(dataUrl);
    } catch {
      setError('Failed to process uploaded image.');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !userId.trim()) {
      setError('Staff Name and User ID are required.');
      return;
    }
    if (!initial && password.trim().length < 3) {
      setError('Password must be at least 3 characters.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        designation: designation.trim(),
        userId: userId.trim(),
        password: password.trim() || undefined,
        phone: phone.trim(),
        whatsapp: whatsapp.trim() || phone.trim(),
        socialLink: socialLink.trim(),
        photoUrl: photoUrl.trim(),
        coverUrl: coverUrl.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save staff account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-2xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {initial ? 'Edit Staff Account' : 'Create Staff Account'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Staff will use this User ID and Password to sign in to their dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                onChange={(e) => setDesignation(e.target.value)}
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
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. rafiq"
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {initial ? 'New Password (leave blank to keep)' : 'Login Password *'}
              </label>
              <input
                type="text"
                required={!initial}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={initial ? 'Optional password reset' : 'Set password'}
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
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
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+88017..."
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                WhatsApp Number
              </label>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+88017..."
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
              onChange={(e) => setSocialLink(e.target.value)}
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
                  <span>Upload Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, setPhotoUrl)}
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
                  <span>Upload Cover</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, setCoverUrl)}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : initial ? 'Update Staff' : 'Create Staff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
