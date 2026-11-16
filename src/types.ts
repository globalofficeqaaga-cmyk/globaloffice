export type UserRole = 'admin' | 'staff' | 'accounts';

export interface PublicUser {
  id: string;
  userId: string;
  email?: string;
  role: UserRole;
  name: string;
  designation: string;
  phone: string;
  personalPhone: string;
  whatsapp: string;
  socialLink: string;
  photoUrl: string;
  coverUrl: string;
  joiningDate: string;
  version?: number;
  createdAt: string;
}

export type DocumentStatus = 'Submitted' | 'Verified' | 'Pending';

export interface ClientDocument {
  id: string;
  name: string;
  status: DocumentStatus;
  note: string;
  storagePath?: string;
  fileDataUrl?: string;
  updatedAt: string;
}

export interface ClientPayment {
  id: string;
  amount: number;
  purpose: string;
  date: string;
  note: string;
}

export type ClientStage =
  | 'Document Collection'
  | 'Medical Pending'
  | 'Medical Fit'
  | 'Interview Scheduled'
  | 'Visa Processing'
  | 'Flight Ready'
  | 'Completed';

export type MedicalOutcome =
  | 'Not Started'
  | 'Pending Result'
  | 'Fit'
  | 'Unfit';

export interface ClientProfile {
  id: string;
  staffId: string;
  name: string;
  phone: string;
  address: string;
  passportNumber: string;
  trade: string;
  destinationCountry: string;
  expectedSalary: string;
  status: ClientStage;
  medicalDone: boolean;
  medicalStatus: MedicalOutcome;
  medicalCenter: string;
  medicalLocation: string;
  totalPayable: number;
  totalPaid: number;
  pendingItems: string;
  documents: ClientDocument[];
  payments: ClientPayment[];
  notes: string;
  version?: number;
  clientRequestId?: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MeetingStatus = 'Scheduled' | 'Completed' | 'Cancelled';

export interface MeetingRecord {
  id: string;
  staffId: string;
  clientId?: string;
  clientName: string;
  clientPhone: string;
  meetingWith: string;
  location: string;
  dateTime: string;
  purpose: string;
  status: MeetingStatus;
  notes: string;
  version?: number;
  clientRequestId?: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt: string;
}

export type MedicalRecordResult = 'Pending' | 'Fit' | 'Unfit';

export interface MedicalRecord {
  id: string;
  staffId: string;
  clientId?: string;
  candidateName: string;
  candidatePhone: string;
  medicalCenter: string;
  medicalLocation: string;
  testDate: string;
  result: MedicalRecordResult;
  amountPaid: number;
  amountReceivable: number;
  paymentPurpose: string;
  notes: string;
  version?: number;
  clientRequestId?: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt: string;
}

export type InterviewStatus = 'Upcoming' | 'Selected' | 'Waiting' | 'Rejected' | 'Completed';

export interface InterviewRecord {
  id: string;
  staffId: string;
  clientId?: string;
  candidateNames: string;
  clientCount: number;
  interviewerOrCompany: string;
  trade: string;
  interviewDate: string;
  interviewTime: string;
  location: string;
  status: InterviewStatus;
  notes: string;
  version?: number;
  clientRequestId?: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt: string;
}

export type AuditAction = 'INSERT' | 'UPDATE' | 'SOFT_DELETE' | 'RESTORE';

export interface AuditLogEntry {
  id: string;
  tableName: string;
  recordId: string;
  action: AuditAction;
  actorId: string | null;
  actorName: string;
  changedFields: Record<string, { old?: unknown; new?: unknown; changed?: boolean }>;
  createdAt: string;
}

export type LedgerEntryType = 'credit' | 'debit';

export interface AccountLedgerEntry {
  id: string;
  accountOwnerId: string;
  entryType: LedgerEntryType;
  amount: number;
  title: string;
  category: string;
  partyName: string;
  referenceNo: string;
  entryDate: string;
  paymentMethod: string;
  notes: string;
  createdByName?: string;
  version?: number;
  clientRequestId?: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus = 'Present' | 'Late' | 'Field Work' | 'Half Day' | 'Leave';

export interface StaffAttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: UserRole;
  attendanceDate: string;
  status: AttendanceStatus;
  checkInTime: string;
  checkOutTime: string;
  workLocation: string;
  notes: string;
  version?: number;
  clientRequestId?: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LogChannel = 'Phone Call' | 'WhatsApp' | 'Office Visit' | 'Video Call' | 'Field Visit';

export type LogOutcome =
  | 'Interested'
  | 'Follow Up Needed'
  | 'Document Promised'
  | 'Payment Promised'
  | 'Confirmed'
  | 'Not Interested'
  | 'Resolved';

export interface StaffDailyLog {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: UserRole;
  clientId?: string;
  logDate: string;
  logTime: string;
  contactName: string;
  contactPhone: string;
  channel: LogChannel;
  topic: string;
  discussionSummary: string;
  outcome: LogOutcome;
  nextFollowUpDate: string;
  version?: number;
  clientRequestId?: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyClientSummary {
  clientId: string;
  staffId: string;
  staffName: string;
  clientName: string;
  phone: string;
  trade: string;
  destinationCountry: string;
  status: ClientStage;
  createdDate: string;
  createdAt: string;
}

export interface DashboardData {
  user: PublicUser;
  staffList: PublicUser[];
  accountsList?: PublicUser[];
  teamProfiles?: PublicUser[];
  clients: ClientProfile[];
  meetings: MeetingRecord[];
  medicals: MedicalRecord[];
  interviews: InterviewRecord[];
  ledgerEntries?: AccountLedgerEntry[];
  attendanceRecords?: StaffAttendanceRecord[];
  dailyLogs?: StaffDailyLog[];
  dailyClientSummaries?: DailyClientSummary[];
  archivedClients?: ClientProfile[];
  archivedMeetings?: MeetingRecord[];
  archivedMedicals?: MedicalRecord[];
  archivedInterviews?: InterviewRecord[];
  archivedLedgerEntries?: AccountLedgerEntry[];
  archivedDailyLogs?: StaffDailyLog[];
  auditLogs?: AuditLogEntry[];
}

export interface PublicTrackedClient {
  id: string;
  name: string;
  phone: string;
  trade: string;
  destinationCountry: string;
  status: ClientStage;
  medicalDone: boolean;
  medicalStatus: MedicalOutcome;
  medicalCenter: string;
  medicalLocation: string;
  updatedAt: string;
}

export interface PublicTrackedStaff {
  id: string;
  name: string;
  designation: string;
  phone: string;
  whatsapp: string;
  socialLink: string;
  photoUrl: string;
  coverUrl: string;
}

export interface PublicTrackedMeeting {
  id: string;
  meetingWith: string;
  location: string;
  dateTime: string;
  status: MeetingStatus;
}

export interface PublicTrackedMedical {
  id: string;
  medicalCenter: string;
  medicalLocation: string;
  testDate: string;
  result: MedicalRecordResult;
}

export interface PublicTrackedInterview {
  id: string;
  interviewerOrCompany: string;
  trade: string;
  interviewDate: string;
  interviewTime: string;
  location: string;
  status: InterviewStatus;
}

export interface ClientLookupResponse {
  client: PublicTrackedClient;
  staff: PublicTrackedStaff | null;
  meetings: PublicTrackedMeeting[];
  medicals: PublicTrackedMedical[];
  interviews: PublicTrackedInterview[];
}

export interface SitePosterSlide {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  actionHref: string;
  imageUrl: string;
  alt: string;
}

export interface SiteContactItem {
  id: string;
  label: string;
  value: string;
  type: 'phone' | 'whatsapp';
  actionLabel: string;
}

export interface SiteSettings {
  brandName: string;
  logoUrl: string;
  heroKicker: string;
  heroTitle: string;
  heroSubtitle: string;
  trackerTitle: string;
  trackerPlaceholder: string;
  trackerButtonLabel: string;
  loginButtonLabel: string;
  showTracker: boolean;
  showPosterSlider: boolean;
  showContactSection: boolean;
  showLoginButton: boolean;
  posterAutoSlideMs: number;
  posters: SitePosterSlide[];
  contactSectionTitle: string;
  officeAddress: string;
  officeHours: string;
  contacts: SiteContactItem[];
  footerHotline: string;
  updatedAt?: string;
}

export interface TeamDirectoryMember {
  id: string;
  userId: string;
  role: UserRole;
  name: string;
  designation: string;
  phone?: string;
  personalPhone?: string;
  whatsapp?: string;
  socialLink?: string;
  photoUrl: string;
  coverUrl?: string;
  joiningDate?: string;
}

export interface TeamMessage {
  id: string;
  senderId: string;
  recipientId: string | null;
  body: string;
  readAt?: string | null;
  clientRequestId?: string;
  createdAt: string;
}

