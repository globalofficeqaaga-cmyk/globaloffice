export type UserRole = 'admin' | 'staff';

export interface PublicUser {
  id: string;
  userId: string;
  role: UserRole;
  name: string;
  designation: string;
  phone: string;
  whatsapp: string;
  socialLink: string;
  photoUrl: string;
  coverUrl: string;
  createdAt: string;
}

export type DocumentStatus = 'Submitted' | 'Verified' | 'Pending';

export interface ClientDocument {
  id: string;
  name: string;
  status: DocumentStatus;
  note: string;
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
  createdAt: string;
}

export interface DashboardData {
  user: PublicUser;
  staffList: PublicUser[];
  clients: ClientProfile[];
  meetings: MeetingRecord[];
  medicals: MedicalRecord[];
  interviews: InterviewRecord[];
}

export interface ClientLookupResponse {
  client: ClientProfile;
  staff: PublicUser | null;
  meetings: MeetingRecord[];
  medicals: MedicalRecord[];
  interviews: InterviewRecord[];
}
