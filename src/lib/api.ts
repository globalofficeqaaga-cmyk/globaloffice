import type {
  AccountLedgerEntry,
  AttendanceStatus,
  AuditAction,
  AuditLogEntry,
  ClientDocument,
  ClientLookupResponse,
  ClientPayment,
  ClientProfile,
  ClientStage,
  DailyClientSummary,
  DashboardData,
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
  SiteSettings,
  StaffAttendanceRecord,
  StaffDailyLog,
  TeamDirectoryMember,
  TeamMessage,
  UserRole,
} from '../types';
import { APP_IMAGES } from './assets';
import { validateStrongPassword } from './passwordPolicy';
import { normalizeSiteSettings } from './siteDefaults';
import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabase,
} from './supabase';

const TOKEN_KEY = 'gp_portal_auth_token';

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class DatabaseSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseSetupError';
  }
}

function isMissingSupabaseSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = (err.code || '').toUpperCase();
  const msg = (err.message || '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42883' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('could not find the function') ||
    msg.includes('could not find the table') ||
    msg.includes('resolve_login_email') ||
    msg.includes('lookup_client_by_phone') ||
    msg.includes('get_team_directory') ||
    msg.includes('team_messages') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  );
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function assertProductionBackend(): void {
  // Handled dynamically by apiFetch when falling back to Express /api/* routes.
}

function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('timeout') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('econnreset')
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof ConflictError || !isTransientNetworkError(err) || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 600 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  assertProductionBackend();
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();
  const trimmed = text.trimStart().toLowerCase();
  const isHtmlFallback =
    contentType.includes('text/html') ||
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html');

  if (isHtmlFallback || (res.status === 404 && !contentType.includes('application/json'))) {
    throw new Error(
      getSupabaseConfigError() ||
        'Backend API is unavailable and Supabase environment variables are not configured.'
    );
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    if (
      res.status === 409 &&
      data &&
      typeof data === 'object' &&
      'conflict' in data &&
      (data as { conflict: unknown }).conflict === true
    ) {
      throw new ConflictError(errMsg);
    }
    throw new Error(errMsg);
  }

  return data as T;
}

async function supabaseAdminApiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }
  let { data: sessionData } = await supabase.auth.getSession();
  let accessToken = sessionData.session?.access_token;

  // Refresh a missing or nearly-expired token before privileged account actions.
  const expiresAt = sessionData.session?.expires_at ?? 0;
  if (!accessToken || expiresAt * 1000 <= Date.now() + 60_000) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session?.access_token) {
      sessionData = { session: refreshed.session };
      accessToken = refreshed.session.access_token;
    }
  }
  if (!accessToken) {
    throw new Error('Your sign-in session has expired. Please sign out and sign in again.');
  }

  const sendWithToken = (token: string) =>
    fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
      },
    });

  let res = await sendWithToken(accessToken);

  // A token can be revoked between page load and account creation. Refresh once on 401.
  if (res.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session?.access_token) {
      res = await sendWithToken(refreshed.session.access_token);
    }
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();
  const trimmedLower = text.trimStart().toLowerCase();
  const isHtmlOrNotFoundText =
    contentType.includes('text/html') ||
    trimmedLower.startsWith('<!doctype') ||
    trimmedLower.startsWith('<html') ||
    (!contentType.includes('application/json') &&
      (res.status === 404 ||
        trimmedLower.includes('the page could not be found') ||
        trimmedLower.includes('not_found')));

  if (isHtmlOrNotFoundText) {
    throw new Error(
      'Account management API (/api/supabase-admin/users) is not reachable on this server. Ensure /api/supabase-admin/users Serverless Function (or Express server.ts) is deployed and SUPABASE_SERVICE_ROLE_KEY is set in server environment variables.'
    );
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const isFunctionCrash =
        trimmedLower.includes('function_invocation_failed') ||
        trimmedLower.includes('a server error has occurred');
      data = {
        error: res.ok
          ? 'Invalid server response format.'
          : isFunctionCrash
          ? 'Serverless function invocation failed (500). Verify SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ESM deployment logs.'
          : `Server error (${res.status}). Please verify SUPABASE_SERVICE_ROLE_KEY and database schema, then try again.`,
      };
    }
  }

  if (!res.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }

  return data as T;
}

/* ============================================================================
 * SUPABASE ROW MAPPERS
 * ========================================================================== */
interface ProfileRow {
  id: string;
  user_id: string;
  email?: string;
  role: UserRole;
  permissions?: import('../types').UserPermission[];
  name: string;
  designation: string;
  phone: string;
  personal_phone?: string;
  whatsapp: string;
  social_link: string;
  photo_url: string;
  cover_url: string;
  joining_date?: string;
  version?: number;
  created_at: string;
}

interface ClientRow {
  id: string;
  staff_id: string;
  name: string;
  phone: string;
  address: string;
  passport_number: string;
  trade: string;
  destination_country: string;
  expected_salary: string;
  status: ClientStage;
  medical_done: boolean;
  medical_status: MedicalOutcome;
  medical_center: string;
  medical_location: string;
  total_payable: number;
  total_paid: number;
  pending_items: string;
  documents: ClientDocument[];
  payments: ClientPayment[];
  notes: string;
  version?: number;
  client_request_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
  updated_at: string;
}

interface MeetingRow {
  id: string;
  staff_id: string;
  client_id: string | null;
  client_name: string;
  client_phone: string;
  meeting_with: string;
  location: string;
  date_time: string;
  purpose: string;
  status: MeetingStatus;
  notes: string;
  version?: number;
  client_request_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
}

interface MedicalRow {
  id: string;
  staff_id: string;
  client_id: string | null;
  candidate_name: string;
  candidate_phone: string;
  medical_center: string;
  medical_location: string;
  test_date: string;
  result: MedicalRecordResult;
  amount_paid: number;
  amount_receivable: number;
  payment_purpose: string;
  notes: string;
  version?: number;
  client_request_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
}

interface InterviewRow {
  id: string;
  staff_id: string;
  client_id: string | null;
  candidate_names: string;
  client_count: number;
  interviewer_or_company: string;
  trade: string;
  interview_date: string;
  interview_time: string;
  location: string;
  status: InterviewStatus;
  notes: string;
  version?: number;
  client_request_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
}

interface AuditLogRow {
  id: string;
  table_name: string;
  record_id: string;
  action: AuditAction;
  actor_id: string | null;
  actor_name: string;
  changed_fields: Record<string, { old?: unknown; new?: unknown; changed?: boolean }>;
  created_at: string;
}

interface AccountLedgerRow {
  id: string;
  account_owner_id: string;
  entry_type: LedgerEntryType;
  amount: number;
  title: string;
  category: string;
  party_name: string;
  reference_no: string;
  entry_date: string;
  payment_method: string;
  notes: string;
  receipt_path?: string | null;
  receipt_status?: 'not_submitted' | 'pending' | 'verified' | 'rejected';
  receipt_uploaded_at?: string | null;
  receipt_verified_at?: string | null;
  receipt_verified_by?: string | null;
  created_by_name?: string;
  version?: number;
  client_request_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
  updated_at: string;
}

interface StaffAttendanceRow {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_role: UserRole;
  attendance_date: string;
  status: AttendanceStatus;
  check_in_time: string;
  check_out_time: string;
  work_location: string;
  notes: string;
  version?: number;
  client_request_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
  updated_at: string;
}

interface StaffDailyLogRow {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_role: UserRole;
  client_id: string | null;
  log_date: string;
  log_time: string;
  contact_name: string;
  contact_phone: string;
  channel: LogChannel;
  topic: string;
  discussion_summary: string;
  outcome: LogOutcome;
  next_follow_up_date: string;
  version?: number;
  client_request_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
  updated_at: string;
}

interface DailyClientActivityRow {
  client_id: string;
  staff_id: string;
  staff_name: string;
  client_name: string;
  phone: string;
  trade: string;
  destination_country: string;
  status: ClientStage;
  created_date: string;
  created_at: string;
}

interface TeamDirectoryRpcRow {
  id: string;
  user_id: string;
  role: UserRole;
  name: string;
  designation: string;
  phone?: string;
  personal_phone?: string;
  whatsapp?: string;
  social_link?: string;
  photo_url: string;
  cover_url?: string;
  joining_date?: string;
}

interface TeamMessageRow {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  body: string;
  read_at?: string | null;
  client_request_id?: string | null;
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  expires_at?: string | null;
  created_at: string;
}

function mapProfileRow(row: ProfileRow): PublicUser {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    name: row.name,
    designation: row.designation || 'Visa & Recruitment Coordinator',
    phone: row.phone || '',
    personalPhone: row.personal_phone || '',
    whatsapp: row.whatsapp || '',
    socialLink: row.social_link || '',
    photoUrl: row.photo_url || APP_IMAGES.staffAvatarDefault,
    coverUrl: row.cover_url || APP_IMAGES.heroMobilityAgency,
    joiningDate: row.joining_date || '',
    version: row.version ?? 1,
    createdAt: row.created_at,
  };
}

function mapClientRow(row: ClientRow): ClientProfile {
  return {
    id: row.id,
    staffId: row.staff_id,
    name: row.name,
    phone: row.phone,
    address: row.address || '',
    passportNumber: row.passport_number || '',
    trade: row.trade || '',
    destinationCountry: row.destination_country || '',
    expectedSalary: row.expected_salary || '',
    status: row.status,
    medicalDone: Boolean(row.medical_done),
    medicalStatus: row.medical_status,
    medicalCenter: row.medical_center || '',
    medicalLocation: row.medical_location || '',
    totalPayable: Number(row.total_payable) || 0,
    totalPaid: Number(row.total_paid) || 0,
    pendingItems: row.pending_items || '',
    documents: Array.isArray(row.documents) ? row.documents : [],
    payments: Array.isArray(row.payments) ? row.payments : [],
    notes: row.notes || '',
    version: row.version ?? 1,
    clientRequestId: row.client_request_id || undefined,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMeetingRow(row: MeetingRow): MeetingRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    clientId: row.client_id || undefined,
    clientName: row.client_name,
    clientPhone: row.client_phone || '',
    meetingWith: row.meeting_with,
    location: row.location,
    dateTime: row.date_time,
    purpose: row.purpose || '',
    status: row.status,
    notes: row.notes || '',
    version: row.version ?? 1,
    clientRequestId: row.client_request_id || undefined,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    createdAt: row.created_at,
  };
}

function mapMedicalRow(row: MedicalRow): MedicalRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    clientId: row.client_id || undefined,
    candidateName: row.candidate_name,
    candidatePhone: row.candidate_phone || '',
    medicalCenter: row.medical_center,
    medicalLocation: row.medical_location,
    testDate: row.test_date,
    result: row.result,
    amountPaid: Number(row.amount_paid) || 0,
    amountReceivable: Number(row.amount_receivable) || 0,
    paymentPurpose: row.payment_purpose || '',
    notes: row.notes || '',
    version: row.version ?? 1,
    clientRequestId: row.client_request_id || undefined,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    createdAt: row.created_at,
  };
}

function mapInterviewRow(row: InterviewRow): InterviewRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    clientId: row.client_id || undefined,
    candidateNames: row.candidate_names,
    clientCount: Number(row.client_count) || 1,
    interviewerOrCompany: row.interviewer_or_company,
    trade: row.trade || '',
    interviewDate: row.interview_date,
    interviewTime: row.interview_time || '',
    location: row.location,
    status: row.status,
    notes: row.notes || '',
    version: row.version ?? 1,
    clientRequestId: row.client_request_id || undefined,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    createdAt: row.created_at,
  };
}

function mapAuditLogRow(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    tableName: row.table_name,
    recordId: row.record_id,
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name,
    changedFields: row.changed_fields || {},
    createdAt: row.created_at,
  };
}

function mapAccountLedgerRow(row: AccountLedgerRow): AccountLedgerEntry {
  return {
    id: row.id,
    accountOwnerId: row.account_owner_id,
    entryType: row.entry_type === 'debit' ? 'debit' : 'credit',
    amount: Number(row.amount) || 0,
    title: row.title,
    category: row.category || 'General',
    partyName: row.party_name || '',
    referenceNo: row.reference_no || '',
    entryDate: row.entry_date,
    paymentMethod: row.payment_method || 'Cash',
    notes: row.notes || '',
    receiptPath: row.receipt_path || undefined,
    receiptStatus: row.receipt_status || 'not_submitted',
    receiptUploadedAt: row.receipt_uploaded_at || undefined,
    receiptVerifiedAt: row.receipt_verified_at || undefined,
    receiptVerifiedBy: row.receipt_verified_by || undefined,
    createdByName: row.created_by_name || '',
    version: row.version ?? 1,
    clientRequestId: row.client_request_id || undefined,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttendanceRow(row: StaffAttendanceRow): StaffAttendanceRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff_name || '',
    staffRole: row.staff_role || 'staff',
    attendanceDate: row.attendance_date,
    status: row.status || 'Present',
    checkInTime: row.check_in_time || '',
    checkOutTime: row.check_out_time || '',
    workLocation: row.work_location || 'Office',
    notes: row.notes || '',
    version: row.version ?? 1,
    clientRequestId: row.client_request_id || undefined,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTeamMessageRow(row: TeamMessageRow): TeamMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id ?? null,
    body: row.body,
    readAt: row.read_at ?? null,
    clientRequestId: row.client_request_id || undefined,
    attachmentPath: row.attachment_path || undefined,
    attachmentName: row.attachment_name || undefined,
    attachmentMime: row.attachment_mime || undefined,
    attachmentSize: row.attachment_size ? Number(row.attachment_size) : undefined,
    expiresAt: row.expires_at || undefined,
    createdAt: row.created_at,
  };
}

function mapDailyLogRow(row: StaffDailyLogRow): StaffDailyLog {
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff_name || '',
    staffRole: row.staff_role || 'staff',
    clientId: row.client_id || undefined,
    logDate: row.log_date,
    logTime: row.log_time || '',
    contactName: row.contact_name,
    contactPhone: row.contact_phone || '',
    channel: row.channel || 'Phone Call',
    topic: row.topic || '',
    discussionSummary: row.discussion_summary || '',
    outcome: row.outcome || 'Follow Up Needed',
    nextFollowUpDate: row.next_follow_up_date || '',
    version: row.version ?? 1,
    clientRequestId: row.client_request_id || undefined,
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDailyClientSummaryRow(row: DailyClientActivityRow): DailyClientSummary {
  return {
    clientId: row.client_id,
    staffId: row.staff_id,
    staffName: row.staff_name || 'Unassigned',
    clientName: row.client_name,
    phone: row.phone || '',
    trade: row.trade || '',
    destinationCountry: row.destination_country || '',
    status: row.status,
    createdDate: row.created_date,
    createdAt: row.created_at,
  };
}

async function getCurrentSupabaseUser(): Promise<PublicUser> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error(authError?.message || 'Authentication required.');
  }

  const { data: profile, error: profError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profError) {
    if (isMissingSupabaseSchemaError(profError)) {
      throw new DatabaseSetupError(
        'Supabase database tables are not installed yet. Run the SQL Setup script once in your Supabase Dashboard → SQL Editor.'
      );
    }
    throw new Error(profError.message);
  }

  if (profile) {
    return mapProfileRow(profile as ProfileRow);
  }

  const fallbackUserId =
    String(user.user_metadata?.user_id || '').trim() ||
    `${(user.email || 'user').split('@')[0]}_${user.id.slice(0, 4)}`;
  const fallbackName =
    String(user.user_metadata?.name || '').trim() || (user.email || 'Staff Member').split('@')[0];

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      user_id: fallbackUserId,
      email: user.email || '',
      role: 'staff',
      name: fallbackName,
      phone: String(user.user_metadata?.phone || ''),
      whatsapp: String(user.user_metadata?.phone || ''),
    })
    .select('*')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return mapProfileRow(inserted as ProfileRow);
}

/* ============================================================================
 * UNIFIED API LAYER (Supabase Postgres + Storage, Local Express Fallback)
 * ========================================================================== */
export interface RegisterPayload {
  name: string;
  userId: string;
  email: string;
  password: string;
  phone?: string;
}

export interface RegisterResult {
  user: PublicUser | null;
  requiresEmailConfirmation: boolean;
  message?: string;
}

export const api = {
  isUsingSupabase: () => isSupabaseConfigured && Boolean(supabase),

  verifyCurrentPassword: async (password: string): Promise<{ verified: boolean }> => {
    assertProductionBackend();
    if (!password) {
      throw new Error('Password is required to confirm removal.');
    }
    if (supabase) {
      return supabaseAdminApiFetch<{ verified: boolean }>('/api/supabase-admin/verify-password', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
    }
    return apiFetch<{ verified: boolean }>('/api/auth/verify-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  /**
   * Uploads a client document (image or PDF) to the PRIVATE 'client-documents' Supabase Storage bucket.
   * Falls back to compressed Data URL only in local Express dev mode when Supabase is not configured.
   */
  uploadClientDocumentFile: async (
    file: File,
    staffId: string
  ): Promise<{ storagePath?: string; fileDataUrl?: string }> => {
    assertProductionBackend();
    if (supabase) {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Document file must be smaller than 10 MB.');
      }
      const isImage = file.type.startsWith('image/');
      let uploadBlob: Blob = file;
      let ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      if (isImage) {
        const compressedDataUrl = await compressImageFile(file, 1400);
        const res = await fetch(compressedDataUrl);
        uploadBlob = await res.blob();
        ext = 'jpg';
      }
      const safeSlug = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 40);
      const path = `${staffId}/${Date.now()}_${safeSlug || 'document'}.${ext}`;

      const { error } = await supabase.storage
        .from('client-documents')
        .upload(path, uploadBlob, {
          contentType: isImage ? 'image/jpeg' : file.type || 'application/octet-stream',
          upsert: false,
        });

      if (error) {
        throw new Error(`Document upload failed: ${error.message}`);
      }
      return { storagePath: path };
    }

    const fileDataUrl = await compressImageFile(file, 900);
    return { fileDataUrl };
  },

  /**
   * Generates a short-lived signed URL (1 hour) for private client documents stored in Supabase Storage.
   */
  getClientDocumentSignedUrl: async (doc: ClientDocument): Promise<string> => {
    if (doc.storagePath && supabase) {
      const { data, error } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(doc.storagePath, 3600);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'Unable to generate secure document link.');
      }
      return data.signedUrl;
    }
    if (doc.fileDataUrl) {
      return doc.fileDataUrl;
    }
    throw new Error('No file attachment found for this document.');
  },

  /**
   * Uploads staff profile or cover photo to 'staff-media' bucket when Supabase is configured.
   */
  uploadStaffMediaFile: async (
    file: File,
    ownerId: string,
    kind: 'avatar' | 'cover'
  ): Promise<string> => {
    assertProductionBackend();
    const compressedDataUrl = await compressImageFile(file, kind === 'cover' ? 1200 : 600);
    if (supabase) {
      const res = await fetch(compressedDataUrl);
      const blob = await res.blob();
      const path = `${ownerId}/${kind}_${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from('staff-media')
        .upload(path, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (error) {
        throw new Error(`Media upload failed: ${error.message}`);
      }
      const { data: pub } = supabase.storage.from('staff-media').getPublicUrl(path);
      return pub.publicUrl;
    }
    return compressedDataUrl;
  },

  getSiteSettings: async (): Promise<SiteSettings> => {
    if (supabase) {
      const { data, error } = await supabase
        .from('site_settings')
        .select('settings, updated_at')
        .eq('id', 'default')
        .maybeSingle();

      if (error) {
        // Gracefully fall back to defaults if migration hasn't been run yet
        return normalizeSiteSettings(null);
      }
      const raw = (data?.settings || null) as Partial<SiteSettings> | null;
      return normalizeSiteSettings(
        raw ? { ...raw, updatedAt: data?.updated_at || raw.updatedAt } : null
      );
    }

    try {
      const res = await apiFetch<{ siteSettings: Partial<SiteSettings> | null }>(
        '/api/site-settings'
      );
      return normalizeSiteSettings(res.siteSettings);
    } catch {
      return normalizeSiteSettings(null);
    }
  },

  updateSiteSettings: async (settings: SiteSettings): Promise<SiteSettings> => {
    assertProductionBackend();
    const cleanPayload: SiteSettings = {
      ...settings,
      updatedAt: new Date().toISOString(),
    };

    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { data, error } = await withRetry(async () =>
        supabase!
          .from('site_settings')
          .upsert(
            {
              id: 'default',
              settings: cleanPayload,
              updated_by: current.id,
              updated_at: cleanPayload.updatedAt,
            },
            { onConflict: 'id' }
          )
          .select('settings, updated_at')
          .single()
      );
      if (error) {
        throw new Error(
          error.message.includes('site_settings')
            ? `${error.message} (Run supabase/migrations/20261117_site_settings.sql in Supabase SQL Editor.)`
            : error.message
        );
      }
      const saved = (data?.settings || cleanPayload) as Partial<SiteSettings>;
      return normalizeSiteSettings({
        ...saved,
        updatedAt: data?.updated_at || cleanPayload.updatedAt,
      });
    }

    const res = await apiFetch<{ siteSettings: Partial<SiteSettings> }>('/api/site-settings', {
      method: 'PUT',
      body: JSON.stringify({ siteSettings: cleanPayload }),
    });
    return normalizeSiteSettings(res.siteSettings);
  },

  lookupClient: async (phone: string): Promise<ClientLookupResponse> => {
    assertProductionBackend();
    const clean = phone.trim();
    if (!clean) {
      throw new Error('Please enter a complete registered phone number.');
    }
    const digits = clean.replace(/\D/g, '');
    const normalizedDigits = digits.startsWith('880') && digits.length >= 13 ? digits.slice(2) : digits;
    if (normalizedDigits.length < 10 || normalizedDigits.length > 15) {
      throw new Error('Please enter a valid complete phone number (at least 10 digits).');
    }

    if (supabase) {
      const { data, error } = await withRetry(async () =>
        supabase!.rpc('lookup_client_by_phone', { p_phone: clean })
      );
      if (error) {
        if (isMissingSupabaseSchemaError(error)) {
          throw new DatabaseSetupError(
            'Supabase database functions are not installed yet. Run the SQL Setup script once in your Supabase Dashboard → SQL Editor.'
          );
        }
        throw new Error(error.message);
      }
      if (!data) {
        throw new Error(
          'No client record found for this phone number. Please verify the number or contact your coordinator.'
        );
      }
      return data as ClientLookupResponse;
    }

    return apiFetch<ClientLookupResponse>(
      `/api/client-lookup?phone=${encodeURIComponent(clean)}`
    );
  },

  login: async (
    identifier: string,
    password: string
  ): Promise<{ token: string; user: PublicUser }> => {
    assertProductionBackend();
    if (supabase) {
      const cleanIdentifier = identifier.trim();
      if (!cleanIdentifier || !password) {
        throw new Error('User ID and password are required.');
      }

      let emailToUse = cleanIdentifier;

      if (!cleanIdentifier.includes('@')) {
        const { data: resolvedEmail, error: resolveErr } = await supabase.rpc(
          'resolve_login_email',
          { p_identifier: cleanIdentifier }
        );
        if (resolveErr) {
          if (isMissingSupabaseSchemaError(resolveErr)) {
            throw new DatabaseSetupError(
              'Supabase database setup is incomplete. Click "Copy Setup SQL" below, run it once in your Supabase Dashboard → SQL Editor, then create & promote your Admin account.'
            );
          }
          throw new Error(resolveErr.message);
        }
        if (!resolvedEmail) {
          if (cleanIdentifier.toLowerCase() === 'admin') {
            throw new Error(
              'No Admin profile found yet. Create an admin user in Supabase Dashboard → Authentication → Users and promote it in SQL Editor.'
            );
          }
          throw new Error(
            'No account found for this User ID. Please check your User ID or verify the account exists.'
          );
        }
        emailToUse = String(resolvedEmail);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      });
      if (error) {
        throw new Error(error.message);
      }

      const profile = await getCurrentSupabaseUser();
      return {
        token: data.session?.access_token || '',
        user: profile,
      };
    }

    return apiFetch<{ token: string; user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ userId: identifier, password }),
    });
  },

  register: async (payload: RegisterPayload): Promise<RegisterResult> => {
    assertProductionBackend();
    const pwErr = validateStrongPassword(payload.password, 'Password');
    if (pwErr) {
      throw new Error(pwErr);
    }
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: payload.email.trim(),
        password: payload.password.trim(),
        options: {
          data: {
            name: payload.name.trim(),
            user_id: payload.userId.trim(),
            phone: (payload.phone || '').trim(),
            whatsapp: (payload.phone || '').trim(),
          },
        },
      });
      if (error) {
        throw new Error(error.message);
      }

      if (!data.session) {
        return {
          user: null,
          requiresEmailConfirmation: true,
          message:
            'Registration successful. Please check your email inbox to verify your account before signing in.',
        };
      }

      const profile = await getCurrentSupabaseUser();
      return {
        user: profile,
        requiresEmailConfirmation: false,
      };
    }

    const res = await apiFetch<{ token: string; user: PublicUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(res.token);
    return {
      user: res.user,
      requiresEmailConfirmation: false,
    };
  },

  logout: async (): Promise<void> => {
    setAuthToken(null);
    if (supabase) {
      await supabase.auth.signOut();
    }
  },

  me: async (): Promise<{ user: PublicUser }> => {
    assertProductionBackend();
    if (supabase) {
      const user = await getCurrentSupabaseUser();
      return { user };
    }
    return apiFetch<{ user: PublicUser }>('/api/auth/me');
  },

  getDashboard: async (): Promise<DashboardData> => {
    assertProductionBackend();
    if (supabase) {
      const user = await getCurrentSupabaseUser();
      const isAdmin = user.role === 'admin';
      const isAccounts = user.role !== 'management' && Boolean(user.permissions?.includes('view_finance') || user.permissions?.includes('manage_finance'));

      const [
        profilesRes,
        clientsRes,
        meetingsRes,
        medicalsRes,
        interviewsRes,
        ledgerRes,
        attendanceRes,
        dailyLogsRes,
        dailyClientActivityRes,
        archivedClientsRes,
        archivedMeetingsRes,
        archivedMedicalsRes,
        archivedInterviewsRes,
        archivedLedgerRes,
        archivedDailyLogsRes,
        auditLogsRes,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .neq('role', 'admin')
          .order('created_at', { ascending: false }),
        user.role !== 'accounts'
          ? supabase
              .from('clients')
              .select('*')
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        user.role !== 'accounts'
          ? supabase
              .from('meetings')
              .select('*')
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        user.role !== 'accounts'
          ? supabase
              .from('medicals')
              .select('*')
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        user.role !== 'accounts'
          ? supabase
              .from('interviews')
              .select('*')
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        isAdmin || isAccounts
          ? supabase
              .from('account_ledger')
              .select('*')
              .is('deleted_at', null)
              .order('entry_date', { ascending: false })
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('staff_attendance')
          .select('*')
          .is('deleted_at', null)
          .order('attendance_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('staff_daily_logs')
          .select('*')
          .is('deleted_at', null)
          .order('log_date', { ascending: false })
          .order('created_at', { ascending: false }),
        isAdmin || isAccounts
          ? supabase.rpc('get_daily_client_activity')
          : Promise.resolve({ data: [], error: null }),
        isAdmin
          ? supabase
              .from('clients')
              .select('*')
              .not('deleted_at', 'is', null)
              .order('deleted_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        isAdmin
          ? supabase
              .from('meetings')
              .select('*')
              .not('deleted_at', 'is', null)
              .order('deleted_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        isAdmin
          ? supabase
              .from('medicals')
              .select('*')
              .not('deleted_at', 'is', null)
              .order('deleted_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        isAdmin
          ? supabase
              .from('interviews')
              .select('*')
              .not('deleted_at', 'is', null)
              .order('deleted_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        isAdmin
          ? supabase
              .from('account_ledger')
              .select('*')
              .not('deleted_at', 'is', null)
              .order('deleted_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        isAdmin
          ? supabase
              .from('staff_daily_logs')
              .select('*')
              .not('deleted_at', 'is', null)
              .order('deleted_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        isAdmin
          ? supabase
              .from('audit_logs')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(100)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);
      if (clientsRes.error) throw new Error(clientsRes.error.message);
      if (meetingsRes.error) throw new Error(meetingsRes.error.message);
      if (medicalsRes.error) throw new Error(medicalsRes.error.message);
      if (interviewsRes.error) throw new Error(interviewsRes.error.message);

      const mappedClients = ((clientsRes.data || []) as ClientRow[]).map(mapClientRow);
      let allTeamRows = (profilesRes.data || []) as ProfileRow[];

      // Fallback to authenticated server directory if older RLS only returned caller's own row
      if (allTeamRows.length <= 1) {
        try {
          const dirRes = await supabaseAdminApiFetch<{ profiles: ProfileRow[] }>(
            '/api/supabase-admin/users',
            { method: 'GET' }
          );
          if (Array.isArray(dirRes.profiles) && dirRes.profiles.length > allTeamRows.length) {
            allTeamRows = dirRes.profiles;
          }
        } catch {
          // Non-fatal: continue with direct RLS rows
        }
      }

      const teamMap = new Map<string, PublicUser>();
      for (const row of allTeamRows) {
        const mapped = mapProfileRow(row);
        teamMap.set(mapped.id, mapped);
      }
      teamMap.set(user.id, user);

      const roleWeight = (role: UserRole) => (role === 'admin' ? 0 : role === 'accounts' ? 1 : 2);
      const mappedTeamProfiles = Array.from(teamMap.values()).sort((a, b) => {
        const diff = roleWeight(a.role) - roleWeight(b.role);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });
      const mappedStaffList = mappedTeamProfiles.filter((u) => u.role === 'staff');
      const mappedAccountsList = mappedTeamProfiles.filter((u) => u.role === 'accounts');

      const staffLookup = new Map<string, string>();
      mappedTeamProfiles.forEach((s) => staffLookup.set(s.id, s.name));

      const mappedDailyClients: DailyClientSummary[] =
        (isAdmin || isAccounts) && !dailyClientActivityRes.error && Array.isArray(dailyClientActivityRes.data)
          ? (dailyClientActivityRes.data as DailyClientActivityRow[]).map(mapDailyClientSummaryRow)
          : mappedClients.map((c) => ({
              clientId: c.id,
              staffId: c.staffId,
              staffName: staffLookup.get(c.staffId) || 'Coordinator',
              clientName: c.name,
              phone: c.phone,
              trade: c.trade,
              destinationCountry: c.destinationCountry,
              status: c.status,
              createdDate: toLocalDateKey(c.createdAt),
              createdAt: c.createdAt,
            }));

      let attendanceRows = (attendanceRes.data || []) as StaffAttendanceRow[];
      const hasOtherStaffAttendance = attendanceRows.some((r) => r.staff_id !== user.id);
      if (attendanceRes.error || (!hasOtherStaffAttendance && mappedTeamProfiles.length > 1)) {
        try {
          const teamAttRes = await supabaseAdminApiFetch<{ attendance: StaffAttendanceRow[] }>(
            '/api/supabase-admin/attendance',
            { method: 'GET' }
          );
          if (Array.isArray(teamAttRes.attendance) && teamAttRes.attendance.length >= attendanceRows.length) {
            attendanceRows = teamAttRes.attendance;
          }
        } catch {
          // Non-fatal: continue with direct RLS rows
        }
      }

      return {
        user,
        staffList: mappedStaffList,
        accountsList: mappedAccountsList,
        teamProfiles: mappedTeamProfiles,
        clients: mappedClients,
        meetings: ((meetingsRes.data || []) as MeetingRow[]).map(mapMeetingRow),
        medicals: ((medicalsRes.data || []) as MedicalRow[]).map(mapMedicalRow),
        interviews: ((interviewsRes.data || []) as InterviewRow[]).map(mapInterviewRow),
        ledgerEntries: ledgerRes.error
          ? []
          : ((ledgerRes.data || []) as AccountLedgerRow[]).map(mapAccountLedgerRow),
        attendanceRecords: attendanceRows.map(mapAttendanceRow),
        dailyLogs: dailyLogsRes.error
          ? []
          : ((dailyLogsRes.data || []) as StaffDailyLogRow[]).map(mapDailyLogRow),
        dailyClientSummaries: mappedDailyClients,
        archivedClients: ((archivedClientsRes.data || []) as ClientRow[]).map(mapClientRow),
        archivedMeetings: ((archivedMeetingsRes.data || []) as MeetingRow[]).map(mapMeetingRow),
        archivedMedicals: ((archivedMedicalsRes.data || []) as MedicalRow[]).map(mapMedicalRow),
        archivedInterviews: ((archivedInterviewsRes.data || []) as InterviewRow[]).map(
          mapInterviewRow
        ),
        archivedLedgerEntries: archivedLedgerRes.error
          ? []
          : ((archivedLedgerRes.data || []) as AccountLedgerRow[]).map(mapAccountLedgerRow),
        archivedDailyLogs: archivedDailyLogsRes.error
          ? []
          : ((archivedDailyLogsRes.data || []) as StaffDailyLogRow[]).map(mapDailyLogRow),
        auditLogs: auditLogsRes.error
          ? []
          : ((auditLogsRes.data || []) as AuditLogRow[]).map(mapAuditLogRow),
      };
    }

    return apiFetch<DashboardData>('/api/dashboard');
  },

  updateOwnProfile: async (payload: {
    userId?: string;
    name?: string;
    designation?: string;
    phone?: string;
    personalPhone?: string;
    whatsapp?: string;
    socialLink?: string;
    photoUrl?: string;
    coverUrl?: string;
    joiningDate?: string;
    newPassword?: string;
    expectedVersion?: number;
  }): Promise<{ user: PublicUser }> => {
    assertProductionBackend();
    const trimmedPass = payload.newPassword?.trim();
    if (trimmedPass) {
      const pwErr = validateStrongPassword(trimmedPass, 'New password');
      if (pwErr) {
        throw new Error(pwErr);
      }
    }

    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const nextUserId = payload.userId?.trim();

      if (nextUserId && nextUserId !== current.userId && current.role !== 'admin') {
        throw new Error('Only administrators can change their own login User ID.');
      }

      if (trimmedPass) {
        const { error: passErr } = await supabase.auth.updateUser({
          password: trimmedPass,
        });
        if (passErr) throw new Error(passErr.message);
      }

      const data = await withRetry(async () => {
        const nextPersonalPhone = payload.personalPhone ?? current.personalPhone;
        const nextJoiningDate = payload.joiningDate ?? current.joiningDate;
        const updatePayload: Record<string, unknown> = {
          name: payload.name ?? current.name,
          designation: payload.designation ?? current.designation,
          phone: payload.phone ?? current.phone,
          personal_phone: nextPersonalPhone,
          whatsapp: payload.whatsapp ?? current.whatsapp,
          social_link: payload.socialLink ?? current.socialLink,
          photo_url: payload.photoUrl ?? current.photoUrl,
          cover_url: payload.coverUrl ?? current.coverUrl,
          joining_date: nextJoiningDate,
        };
        if (nextUserId && nextUserId !== current.userId && current.role === 'admin') {
          updatePayload.user_id = nextUserId;
        }

        const runUpdate = async (fields: Record<string, unknown>) => {
          let query = supabase!
            .from('profiles')
            .update(fields)
            .eq('id', current.id);

          if (payload.expectedVersion !== undefined) {
            query = query.eq('version', payload.expectedVersion);
          }

          return query.select('*').maybeSingle();
        };

        let { data: updatedRow, error } = await runUpdate(updatePayload);

        if (
          error &&
          (error.code === '42703' || error.code === 'PGRST204') &&
          (error.message?.includes('personal_phone') || error.message?.includes('joining_date'))
        ) {
          if (!nextPersonalPhone && !nextJoiningDate) {
            const { personal_phone: _p, joining_date: _j, ...legacyFields } = updatePayload;
            const retry = await runUpdate(legacyFields);
            updatedRow = retry.data;
            error = retry.error;
          } else {
            throw new Error(
              'Database profiles table needs personal_phone & joining_date columns. Please run supabase/migrations/20261121_staff_profile_fields_and_team_directory.sql in Supabase SQL Editor.'
            );
          }
        }

        if (error) {
          if (error.code === '23505') {
            throw new Error('Another account already uses this User ID.');
          }
          throw new Error(error.message);
        }
        if (!updatedRow) {
          throw new ConflictError(
            'Your profile was updated elsewhere while you were editing. Reload the latest version before saving.'
          );
        }
        return updatedRow as ProfileRow;
      });

      return { user: mapProfileRow(data) };
    }

    return apiFetch<{ user: PublicUser }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  createStaff: async (payload: {
    userId: string;
    email?: string;
    password: string;
    name: string;
    role?: UserRole;
    permissions?: import('../types').UserPermission[];
    designation?: string;
    phone?: string;
    personalPhone?: string;
    whatsapp?: string;
    socialLink?: string;
    photoUrl?: string;
    coverUrl?: string;
    joiningDate?: string;
  }): Promise<{ staff: PublicUser }> => {
    assertProductionBackend();
    const cleanUserId = payload.userId.trim();
    const cleanPass = (payload.password || '').trim();
    const cleanName = payload.name.trim();
    const cleanEmail = (payload.email || '').trim();
    if (!cleanUserId || !cleanName) {
      throw new Error('Full Name and User ID are required.');
    }
    if (cleanUserId.length < 2 || /\s/.test(cleanUserId)) {
      throw new Error('Login User ID must be at least 2 characters and contain no spaces.');
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address or leave Email blank.');
    }
    const pwErr = validateStrongPassword(cleanPass, 'Password');
    if (pwErr) {
      throw new Error(pwErr);
    }

    if (supabase) {
      const res = await supabaseAdminApiFetch<{ profile: ProfileRow }>(
        '/api/supabase-admin/users',
        {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            userId: cleanUserId,
            email: cleanEmail || undefined,
            password: cleanPass,
            name: cleanName,
          }),
        }
      );
      return { staff: mapProfileRow(res.profile) };
    }

    return apiFetch<{ staff: PublicUser }>('/api/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateStaff: async (
    id: string,
    payload: {
      userId?: string;
      role?: UserRole;
      permissions?: import('../types').UserPermission[];
      email?: string;
      password?: string;
      name?: string;
      designation?: string;
      phone?: string;
      personalPhone?: string;
      whatsapp?: string;
      socialLink?: string;
      photoUrl?: string;
      coverUrl?: string;
      joiningDate?: string;
    }
  ): Promise<{ staff: PublicUser }> => {
    assertProductionBackend();
    const nextPass = payload.password?.trim();
    if (nextPass) {
      const pwErr = validateStrongPassword(nextPass, 'New password');
      if (pwErr) {
        throw new Error(pwErr);
      }
    }

    if (supabase) {
      const res = await supabaseAdminApiFetch<{ profile: ProfileRow }>(
        `/api/supabase-admin/users/${encodeURIComponent(id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...payload,
            password: nextPass || undefined,
          }),
        }
      );
      return { staff: mapProfileRow(res.profile) };
    }

    return apiFetch<{ staff: PublicUser }>(`/api/staff/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteStaff: async (id: string): Promise<{ ok: boolean }> => {
    assertProductionBackend();
    if (supabase) {
      return supabaseAdminApiFetch<{ ok: boolean }>(
        `/api/supabase-admin/users/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      );
    }

    return apiFetch<{ ok: boolean }>(`/api/staff/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  createClient: async (payload: Partial<ClientProfile>): Promise<{ client: ClientProfile }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const payments = Array.isArray(payload.payments) ? payload.payments : [];
      const paidFromEntries = payments.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
      const totalPaid = payments.length > 0 ? paidFromEntries : Number(payload.totalPaid) || 0;

      const rowData = await withRetry(async () => {
        const { data, error } = await supabase!
          .from('clients')
          .insert({
            staff_id: current.role === 'admin' && payload.staffId ? payload.staffId : current.id,
            name: payload.name || '',
            phone: payload.phone || '',
            address: payload.address || '',
            passport_number: payload.passportNumber || '',
            trade: payload.trade || '',
            destination_country: payload.destinationCountry || '',
            expected_salary: payload.expectedSalary || '',
            status: payload.status || 'Document Collection',
            medical_done: Boolean(payload.medicalDone),
            medical_status: payload.medicalStatus || 'Not Started',
            medical_center: payload.medicalCenter || '',
            medical_location: payload.medicalLocation || '',
            total_payable: Number(payload.totalPayable) || 0,
            total_paid: totalPaid,
            pending_items: payload.pendingItems || '',
            documents: payload.documents || [],
            payments,
            notes: payload.notes || '',
            client_request_id: payload.clientRequestId || null,
          })
          .select('*')
          .single();

        if (error) {
          // Idempotent recovery: if duplicate client_request_id (23505), return existing row
          if (error.code === '23505' && payload.clientRequestId) {
            const { data: existing } = await supabase!
              .from('clients')
              .select('*')
              .eq('client_request_id', payload.clientRequestId)
              .maybeSingle();
            if (existing) return existing as ClientRow;
          }
          throw new Error(error.message);
        }
        return data as ClientRow;
      });

      return { client: mapClientRow(rowData) };
    }

    return apiFetch<{ client: ClientProfile }>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateClient: async (
    id: string,
    payload: Partial<ClientProfile> & { expectedVersion?: number }
  ): Promise<{ client: ClientProfile }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const updateBody: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (current.role === 'admin' && payload.staffId !== undefined) {
        updateBody.staff_id = payload.staffId;
      }
      if (payload.name !== undefined) updateBody.name = payload.name;
      if (payload.phone !== undefined) updateBody.phone = payload.phone;
      if (payload.address !== undefined) updateBody.address = payload.address;
      if (payload.passportNumber !== undefined) updateBody.passport_number = payload.passportNumber;
      if (payload.trade !== undefined) updateBody.trade = payload.trade;
      if (payload.destinationCountry !== undefined) {
        updateBody.destination_country = payload.destinationCountry;
      }
      if (payload.expectedSalary !== undefined) updateBody.expected_salary = payload.expectedSalary;
      if (payload.status !== undefined) updateBody.status = payload.status;
      if (payload.medicalDone !== undefined) updateBody.medical_done = payload.medicalDone;
      if (payload.medicalStatus !== undefined) updateBody.medical_status = payload.medicalStatus;
      if (payload.medicalCenter !== undefined) updateBody.medical_center = payload.medicalCenter;
      if (payload.medicalLocation !== undefined) {
        updateBody.medical_location = payload.medicalLocation;
      }
      if (payload.totalPayable !== undefined) {
        updateBody.total_payable = Number(payload.totalPayable) || 0;
      }
      if (payload.pendingItems !== undefined) updateBody.pending_items = payload.pendingItems;
      if (payload.documents !== undefined) updateBody.documents = payload.documents;
      if (payload.payments !== undefined) {
        updateBody.payments = payload.payments;
        const paidFromEntries = payload.payments.reduce(
          (sum, p) => sum + (Number(p?.amount) || 0),
          0
        );
        updateBody.total_paid =
          payload.payments.length > 0 ? paidFromEntries : Number(payload.totalPaid) || 0;
      } else if (payload.totalPaid !== undefined) {
        updateBody.total_paid = Number(payload.totalPaid) || 0;
      }
      if (payload.notes !== undefined) updateBody.notes = payload.notes;
      if (payload.receiptPath !== undefined) {
        updateBody.receipt_path = payload.receiptPath || null;
        updateBody.receipt_status = payload.receiptPath ? 'pending' : 'not_submitted';
        updateBody.receipt_uploaded_at = payload.receiptPath ? new Date().toISOString() : null;
        updateBody.receipt_verified_at = null;
        updateBody.receipt_verified_by = null;
      }
      if (payload.receiptStatus !== undefined) updateBody.receipt_status = payload.receiptStatus;
      if (payload.receiptVerifiedAt !== undefined) updateBody.receipt_verified_at = payload.receiptVerifiedAt;
      if (payload.receiptVerifiedBy !== undefined) updateBody.receipt_verified_by = payload.receiptVerifiedBy;

      const rowData = await withRetry(async () => {
        let query = supabase!.from('clients').update(updateBody).eq('id', id);
        if (payload.expectedVersion !== undefined) {
          query = query.eq('version', payload.expectedVersion);
        }
        const { data, error } = await query.select('*').maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          throw new ConflictError(
            'Conflict detected: this client profile was modified by another user. Close and reopen the record to load the latest version.'
          );
        }
        return data as ClientRow;
      });

      return { client: mapClientRow(rowData) };
    }

    return apiFetch<{ client: ClientProfile }>(`/api/clients/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteClient: async (id: string): Promise<{ ok: boolean }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { error } = await supabase
        .from('clients')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: current.id,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    return apiFetch<{ ok: boolean }>(`/api/clients/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  restoreRecord: async (
    table:
      | 'clients'
      | 'meetings'
      | 'medicals'
      | 'interviews'
      | 'account_ledger'
      | 'staff_attendance'
      | 'staff_daily_logs',
    id: string
  ): Promise<{ ok: boolean }> => {
    assertProductionBackend();
    if (!supabase) {
      return apiFetch<{ ok: boolean }>('/api/restore', {
        method: 'POST',
        body: JSON.stringify({ table, id }),
      });
    }
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  createMeeting: async (payload: Partial<MeetingRecord>): Promise<{ meeting: MeetingRecord }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const rowData = await withRetry(async () => {
        const { data, error } = await supabase!
          .from('meetings')
          .insert({
            staff_id: current.role === 'admin' && payload.staffId ? payload.staffId : current.id,
            client_id: payload.clientId || null,
            client_name: payload.clientName || '',
            client_phone: payload.clientPhone || '',
            meeting_with: payload.meetingWith || '',
            location: payload.location || '',
            date_time: payload.dateTime || '',
            purpose: payload.purpose || '',
            status: payload.status || 'Scheduled',
            notes: payload.notes || '',
            client_request_id: payload.clientRequestId || null,
          })
          .select('*')
          .single();

        if (error) {
          if (error.code === '23505' && payload.clientRequestId) {
            const { data: existing } = await supabase!
              .from('meetings')
              .select('*')
              .eq('client_request_id', payload.clientRequestId)
              .maybeSingle();
            if (existing) return existing as MeetingRow;
          }
          throw new Error(error.message);
        }
        return data as MeetingRow;
      });

      return { meeting: mapMeetingRow(rowData) };
    }

    return apiFetch<{ meeting: MeetingRecord }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateMeeting: async (
    id: string,
    payload: Partial<MeetingRecord> & { expectedVersion?: number }
  ): Promise<{ meeting: MeetingRecord }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const updateBody: Record<string, unknown> = {};
      if (current.role === 'admin' && payload.staffId !== undefined) {
        updateBody.staff_id = payload.staffId;
      }
      if (payload.clientId !== undefined) updateBody.client_id = payload.clientId || null;
      if (payload.clientName !== undefined) updateBody.client_name = payload.clientName;
      if (payload.clientPhone !== undefined) updateBody.client_phone = payload.clientPhone;
      if (payload.meetingWith !== undefined) updateBody.meeting_with = payload.meetingWith;
      if (payload.location !== undefined) updateBody.location = payload.location;
      if (payload.dateTime !== undefined) updateBody.date_time = payload.dateTime;
      if (payload.purpose !== undefined) updateBody.purpose = payload.purpose;
      if (payload.status !== undefined) updateBody.status = payload.status;
      if (payload.notes !== undefined) updateBody.notes = payload.notes;

      const rowData = await withRetry(async () => {
        let query = supabase!.from('meetings').update(updateBody).eq('id', id);
        if (payload.expectedVersion !== undefined) {
          query = query.eq('version', payload.expectedVersion);
        }
        const { data, error } = await query.select('*').maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          throw new ConflictError(
            'Conflict detected: this meeting was modified by another user. Reload the latest record before saving.'
          );
        }
        return data as MeetingRow;
      });

      return { meeting: mapMeetingRow(rowData) };
    }

    return apiFetch<{ meeting: MeetingRecord }>(`/api/meetings/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteMeeting: async (id: string): Promise<{ ok: boolean }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { error } = await supabase
        .from('meetings')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: current.id,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    return apiFetch<{ ok: boolean }>(`/api/meetings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  createMedical: async (payload: Partial<MedicalRecord>): Promise<{ medical: MedicalRecord }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const rowData = await withRetry(async () => {
        const { data, error } = await supabase!
          .from('medicals')
          .insert({
            staff_id: current.role === 'admin' && payload.staffId ? payload.staffId : current.id,
            client_id: payload.clientId || null,
            candidate_name: payload.candidateName || '',
            candidate_phone: payload.candidatePhone || '',
            medical_center: payload.medicalCenter || '',
            medical_location: payload.medicalLocation || '',
            test_date: payload.testDate || new Date().toISOString().slice(0, 10),
            result: payload.result || 'Pending',
            amount_paid: Number(payload.amountPaid) || 0,
            amount_receivable: Number(payload.amountReceivable) || 0,
            payment_purpose: payload.paymentPurpose || '',
            notes: payload.notes || '',
            client_request_id: payload.clientRequestId || null,
          })
          .select('*')
          .single();

        if (error) {
          if (error.code === '23505' && payload.clientRequestId) {
            const { data: existing } = await supabase!
              .from('medicals')
              .select('*')
              .eq('client_request_id', payload.clientRequestId)
              .maybeSingle();
            if (existing) return existing as MedicalRow;
          }
          throw new Error(error.message);
        }
        return data as MedicalRow;
      });

      return { medical: mapMedicalRow(rowData) };
    }

    return apiFetch<{ medical: MedicalRecord }>('/api/medicals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateMedical: async (
    id: string,
    payload: Partial<MedicalRecord> & { expectedVersion?: number }
  ): Promise<{ medical: MedicalRecord }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const updateBody: Record<string, unknown> = {};
      if (current.role === 'admin' && payload.staffId !== undefined) {
        updateBody.staff_id = payload.staffId;
      }
      if (payload.clientId !== undefined) updateBody.client_id = payload.clientId || null;
      if (payload.candidateName !== undefined) updateBody.candidate_name = payload.candidateName;
      if (payload.candidatePhone !== undefined) updateBody.candidate_phone = payload.candidatePhone;
      if (payload.medicalCenter !== undefined) updateBody.medical_center = payload.medicalCenter;
      if (payload.medicalLocation !== undefined) {
        updateBody.medical_location = payload.medicalLocation;
      }
      if (payload.testDate !== undefined) updateBody.test_date = payload.testDate;
      if (payload.result !== undefined) updateBody.result = payload.result;
      if (payload.amountPaid !== undefined) {
        updateBody.amount_paid = Number(payload.amountPaid) || 0;
      }
      if (payload.amountReceivable !== undefined) {
        updateBody.amount_receivable = Number(payload.amountReceivable) || 0;
      }
      if (payload.paymentPurpose !== undefined) updateBody.payment_purpose = payload.paymentPurpose;
      if (payload.notes !== undefined) updateBody.notes = payload.notes;

      const rowData = await withRetry(async () => {
        let query = supabase!.from('medicals').update(updateBody).eq('id', id);
        if (payload.expectedVersion !== undefined) {
          query = query.eq('version', payload.expectedVersion);
        }
        const { data, error } = await query.select('*').maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          throw new ConflictError(
            'Conflict detected: this medical record was modified by another user. Reload the latest record before saving.'
          );
        }
        return data as MedicalRow;
      });

      return { medical: mapMedicalRow(rowData) };
    }

    return apiFetch<{ medical: MedicalRecord }>(`/api/medicals/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteMedical: async (id: string): Promise<{ ok: boolean }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { error } = await supabase
        .from('medicals')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: current.id,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    return apiFetch<{ ok: boolean }>(`/api/medicals/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  createInterview: async (
    payload: Partial<InterviewRecord>
  ): Promise<{ interview: InterviewRecord }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const rowData = await withRetry(async () => {
        const { data, error } = await supabase!
          .from('interviews')
          .insert({
            staff_id: current.role === 'admin' && payload.staffId ? payload.staffId : current.id,
            client_id: payload.clientId || null,
            candidate_names: payload.candidateNames || '',
            client_count: Math.max(1, Number(payload.clientCount) || 1),
            interviewer_or_company: payload.interviewerOrCompany || '',
            trade: payload.trade || '',
            interview_date: payload.interviewDate || '',
            interview_time: payload.interviewTime || '',
            location: payload.location || '',
            status: payload.status || 'Upcoming',
            notes: payload.notes || '',
            client_request_id: payload.clientRequestId || null,
          })
          .select('*')
          .single();

        if (error) {
          if (error.code === '23505' && payload.clientRequestId) {
            const { data: existing } = await supabase!
              .from('interviews')
              .select('*')
              .eq('client_request_id', payload.clientRequestId)
              .maybeSingle();
            if (existing) return existing as InterviewRow;
          }
          throw new Error(error.message);
        }
        return data as InterviewRow;
      });

      return { interview: mapInterviewRow(rowData) };
    }

    return apiFetch<{ interview: InterviewRecord }>('/api/interviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateInterview: async (
    id: string,
    payload: Partial<InterviewRecord> & { expectedVersion?: number }
  ): Promise<{ interview: InterviewRecord }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const updateBody: Record<string, unknown> = {};
      if (current.role === 'admin' && payload.staffId !== undefined) {
        updateBody.staff_id = payload.staffId;
      }
      if (payload.clientId !== undefined) updateBody.client_id = payload.clientId || null;
      if (payload.candidateNames !== undefined) updateBody.candidate_names = payload.candidateNames;
      if (payload.clientCount !== undefined) {
        updateBody.client_count = Math.max(1, Number(payload.clientCount) || 1);
      }
      if (payload.interviewerOrCompany !== undefined) {
        updateBody.interviewer_or_company = payload.interviewerOrCompany;
      }
      if (payload.trade !== undefined) updateBody.trade = payload.trade;
      if (payload.interviewDate !== undefined) updateBody.interview_date = payload.interviewDate;
      if (payload.interviewTime !== undefined) updateBody.interview_time = payload.interviewTime;
      if (payload.location !== undefined) updateBody.location = payload.location;
      if (payload.status !== undefined) updateBody.status = payload.status;
      if (payload.notes !== undefined) updateBody.notes = payload.notes;

      const rowData = await withRetry(async () => {
        let query = supabase!.from('interviews').update(updateBody).eq('id', id);
        if (payload.expectedVersion !== undefined) {
          query = query.eq('version', payload.expectedVersion);
        }
        const { data, error } = await query.select('*').maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          throw new ConflictError(
            'Conflict detected: this interview record was modified by another user. Reload the latest record before saving.'
          );
        }
        return data as InterviewRow;
      });

      return { interview: mapInterviewRow(rowData) };
    }

    return apiFetch<{ interview: InterviewRecord }>(`/api/interviews/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteInterview: async (id: string): Promise<{ ok: boolean }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { error } = await supabase
        .from('interviews')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: current.id,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    return apiFetch<{ ok: boolean }>(`/api/interviews/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  uploadLedgerReceiptFile: async (file: File, ownerId: string): Promise<{ storagePath: string }> => {
    assertProductionBackend();
    if (!supabase) throw new Error('Secure receipt storage is not configured.');
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      throw new Error('Receipt must be JPG, PNG, WEBP, or PDF.');
    }
    if (file.size > 10 * 1024 * 1024) throw new Error('Receipt must be smaller than 10 MB.');
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `${ownerId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await supabase.storage.from('account-receipts').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(`Receipt upload failed: ${error.message}`);
    return { storagePath: path };
  },

  getLedgerReceiptSignedUrl: async (storagePath: string): Promise<string> => {
    if (!supabase) throw new Error('Secure receipt storage is not configured.');
    const { data, error } = await supabase.storage.from('account-receipts').createSignedUrl(storagePath, 3600);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Unable to open receipt.');
    return data.signedUrl;
  },

  verifyLedgerReceipt: async (id: string, verified: boolean): Promise<void> => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const current = await getCurrentSupabaseUser();
    const { error } = await supabase.from('account_ledger').update({
      receipt_status: verified ? 'verified' : 'rejected',
      receipt_verified_at: verified ? new Date().toISOString() : null,
      receipt_verified_by: verified ? current.id : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  createLedgerEntry: async (
    payload: Partial<AccountLedgerEntry>
  ): Promise<{ entry: AccountLedgerEntry }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const rowData = await withRetry(async () => {
        const { data, error } = await supabase!
          .from('account_ledger')
          .insert({
            account_owner_id: current.id,
            entry_type: payload.entryType === 'debit' ? 'debit' : 'credit',
            amount: Number(payload.amount) || 0,
            title: payload.title || '',
            category: payload.category || 'General',
            party_name: payload.partyName || '',
            reference_no: payload.referenceNo || '',
            entry_date: payload.entryDate || new Date().toISOString().slice(0, 10),
            payment_method: payload.paymentMethod || 'Cash',
            notes: payload.notes || '',
            receipt_path: payload.receiptPath || null,
            receipt_status: payload.receiptPath ? 'pending' : 'not_submitted',
            receipt_uploaded_at: payload.receiptPath ? new Date().toISOString() : null,
            created_by_name: current.name,
            client_request_id: payload.clientRequestId || null,
          })
          .select('*')
          .single();

        if (error) {
          if (error.code === '23505' && payload.clientRequestId) {
            const { data: existing } = await supabase!
              .from('account_ledger')
              .select('*')
              .eq('client_request_id', payload.clientRequestId)
              .maybeSingle();
            if (existing) return existing as AccountLedgerRow;
          }
          if (isMissingSupabaseSchemaError(error)) {
            throw new DatabaseSetupError(
              'Accounts ledger table is not installed yet. Run supabase/migrations/20261118_accounts_role_and_ledger.sql (or supabase/setup_all.sql) in Supabase SQL Editor.'
            );
          }
          throw new Error(error.message);
        }
        return data as AccountLedgerRow;
      });

      return { entry: mapAccountLedgerRow(rowData) };
    }

    return apiFetch<{ entry: AccountLedgerEntry }>('/api/ledger', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateLedgerEntry: async (
    id: string,
    payload: Partial<AccountLedgerEntry> & { expectedVersion?: number }
  ): Promise<{ entry: AccountLedgerEntry }> => {
    assertProductionBackend();
    if (supabase) {
      const updateBody: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (payload.entryType !== undefined) updateBody.entry_type = payload.entryType;
      if (payload.amount !== undefined) updateBody.amount = Number(payload.amount) || 0;
      if (payload.title !== undefined) updateBody.title = payload.title;
      if (payload.category !== undefined) updateBody.category = payload.category;
      if (payload.partyName !== undefined) updateBody.party_name = payload.partyName;
      if (payload.referenceNo !== undefined) updateBody.reference_no = payload.referenceNo;
      if (payload.entryDate !== undefined) updateBody.entry_date = payload.entryDate;
      if (payload.paymentMethod !== undefined) updateBody.payment_method = payload.paymentMethod;
      if (payload.notes !== undefined) updateBody.notes = payload.notes;

      const rowData = await withRetry(async () => {
        let query = supabase!.from('account_ledger').update(updateBody).eq('id', id);
        if (payload.expectedVersion !== undefined) {
          query = query.eq('version', payload.expectedVersion);
        }
        const { data, error } = await query.select('*').maybeSingle();
        if (error) {
          if (isMissingSupabaseSchemaError(error)) {
            throw new DatabaseSetupError(
              'Accounts ledger table is not installed yet. Run supabase/setup_all.sql in Supabase SQL Editor.'
            );
          }
          throw new Error(error.message);
        }
        if (!data) {
          throw new ConflictError(
            'Conflict detected or permission denied: reload the ledger before saving.'
          );
        }
        return data as AccountLedgerRow;
      });

      return { entry: mapAccountLedgerRow(rowData) };
    }

    return apiFetch<{ entry: AccountLedgerEntry }>(`/api/ledger/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteLedgerEntry: async (id: string): Promise<{ ok: boolean }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { error } = await supabase
        .from('account_ledger')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: current.id,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    return apiFetch<{ ok: boolean }>(`/api/ledger/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  markAttendance: async (
    payload: Partial<StaffAttendanceRecord>
  ): Promise<{ attendance: StaffAttendanceRecord }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const targetStaffId =
        current.role === 'admin' && payload.staffId ? payload.staffId : current.id;
      const attendanceDate = payload.attendanceDate || getTodayLocalDateStr();

      let targetName = current.name;
      let targetRole = current.role;
      if (targetStaffId !== current.id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('name, role')
          .eq('id', targetStaffId)
          .maybeSingle();
        if (prof) {
          targetName = prof.name || targetName;
          targetRole = (prof.role as UserRole) || targetRole;
        }
      }

      const rowData = await withRetry(async () => {
        const { data: existingRow } = await supabase!
          .from('staff_attendance')
          .select('*')
          .eq('staff_id', targetStaffId)
          .eq('attendance_date', attendanceDate)
          .is('deleted_at', null)
          .maybeSingle();

        if (existingRow) {
          throw new Error('Attendance for this date is already recorded and cannot be edited.');
        }

        const { data: inserted, error: insertErr } = await supabase!
          .from('staff_attendance')
          .insert({
            staff_id: targetStaffId,
            staff_name: targetName,
            staff_role: targetRole,
            attendance_date: attendanceDate,
            status: payload.status || 'Present',
            check_in_time: payload.checkInTime || '',
            check_out_time: payload.checkOutTime || '',
            work_location: payload.workLocation || 'Office',
            notes: payload.notes || '',
            client_request_id: payload.clientRequestId || null,
          })
          .select('*')
          .single();

        if (insertErr) {
          if (isMissingSupabaseSchemaError(insertErr)) {
            throw new DatabaseSetupError(
              'Daily attendance table is not installed yet. Run supabase/migrations/20261119_daily_work_attendance.sql (or supabase/setup_all.sql) in Supabase SQL Editor.'
            );
          }
          throw new Error(insertErr.message);
        }
        return inserted as StaffAttendanceRow;
      });

      return { attendance: mapAttendanceRow(rowData) };
    }

    return apiFetch<{ attendance: StaffAttendanceRecord }>('/api/attendance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateAttendance: async (
    id: string,
    payload: Partial<StaffAttendanceRecord> & { expectedVersion?: number }
  ): Promise<{ attendance: StaffAttendanceRecord }> => {
    assertProductionBackend();
    if (supabase) {
      const nextCheckOut = typeof payload.checkOutTime === 'string' ? payload.checkOutTime.trim() : '';
      const hasOtherChanges =
        payload.status !== undefined ||
        payload.checkInTime !== undefined ||
        payload.attendanceDate !== undefined ||
        payload.workLocation !== undefined ||
        payload.notes !== undefined ||
        payload.staffId !== undefined;

      if (!nextCheckOut || hasOtherChanges) {
        throw new Error(
          'Attendance records are locked and cannot be edited once saved. Only a one-time Check-Out is allowed when Check-Out is empty.'
        );
      }

      const { data: existing, error: fetchErr } = await supabase
        .from('staff_attendance')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
      if (!existing) throw new Error('Attendance record not found.');
      if (existing.status === 'Leave' || (existing.check_out_time || '').trim() !== '') {
        throw new Error('Check-out time is already locked and cannot be edited.');
      }

      const rowData = await withRetry(async () => {
        let query = supabase!
          .from('staff_attendance')
          .update({
            check_out_time: nextCheckOut,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        if (payload.expectedVersion !== undefined) {
          query = query.eq('version', payload.expectedVersion);
        }
        const { data, error } = await query.select('*').maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          throw new ConflictError(
            'Conflict detected: attendance record was modified elsewhere. Reload before saving.'
          );
        }
        return data as StaffAttendanceRow;
      });

      return { attendance: mapAttendanceRow(rowData) };
    }

    return apiFetch<{ attendance: StaffAttendanceRecord }>(
      `/api/attendance/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  },

  deleteAttendance: async (_id: string): Promise<{ ok: boolean }> => {
    assertProductionBackend();
    throw new Error('Attendance records are locked and cannot be deleted once recorded.');
  },

  createDailyLog: async (payload: Partial<StaffDailyLog>): Promise<{ log: StaffDailyLog }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const targetStaffId =
        current.role === 'admin' && payload.staffId ? payload.staffId : current.id;
      let targetName = current.name;
      let targetRole = current.role;
      if (targetStaffId !== current.id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('name, role')
          .eq('id', targetStaffId)
          .maybeSingle();
        if (prof) {
          targetName = prof.name || targetName;
          targetRole = (prof.role as UserRole) || targetRole;
        }
      }

      const rowData = await withRetry(async () => {
        const { data, error } = await supabase!
          .from('staff_daily_logs')
          .insert({
            staff_id: targetStaffId,
            staff_name: targetName,
            staff_role: targetRole,
            client_id: payload.clientId || null,
            log_date: payload.logDate || getTodayLocalDateStr(),
            log_time: payload.logTime || getCurrentLocalTimeStr(),
            contact_name: payload.contactName || '',
            contact_phone: payload.contactPhone || '',
            channel: payload.channel || 'Phone Call',
            topic: payload.topic || '',
            discussion_summary: payload.discussionSummary || '',
            outcome: payload.outcome || 'Follow Up Needed',
            next_follow_up_date: payload.nextFollowUpDate || '',
            client_request_id: payload.clientRequestId || null,
          })
          .select('*')
          .single();

        if (error) {
          if (error.code === '23505' && payload.clientRequestId) {
            const { data: existing } = await supabase!
              .from('staff_daily_logs')
              .select('*')
              .eq('client_request_id', payload.clientRequestId)
              .maybeSingle();
            if (existing) return existing as StaffDailyLogRow;
          }
          if (isMissingSupabaseSchemaError(error)) {
            throw new DatabaseSetupError(
              'Daily conversation logs table is not installed yet. Run supabase/migrations/20261119_daily_work_attendance.sql (or supabase/setup_all.sql) in Supabase SQL Editor.'
            );
          }
          throw new Error(error.message);
        }
        return data as StaffDailyLogRow;
      });

      return { log: mapDailyLogRow(rowData) };
    }

    return apiFetch<{ log: StaffDailyLog }>('/api/daily-logs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateDailyLog: async (
    id: string,
    payload: Partial<StaffDailyLog> & { expectedVersion?: number }
  ): Promise<{ log: StaffDailyLog }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const updateBody: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (current.role === 'admin' && payload.staffId !== undefined) {
        updateBody.staff_id = payload.staffId;
        if (payload.staffName) updateBody.staff_name = payload.staffName;
        if (payload.staffRole) updateBody.staff_role = payload.staffRole;
      }
      if (payload.clientId !== undefined) updateBody.client_id = payload.clientId || null;
      if (payload.logDate !== undefined) updateBody.log_date = payload.logDate;
      if (payload.logTime !== undefined) updateBody.log_time = payload.logTime;
      if (payload.contactName !== undefined) updateBody.contact_name = payload.contactName;
      if (payload.contactPhone !== undefined) updateBody.contact_phone = payload.contactPhone;
      if (payload.channel !== undefined) updateBody.channel = payload.channel;
      if (payload.topic !== undefined) updateBody.topic = payload.topic;
      if (payload.discussionSummary !== undefined) {
        updateBody.discussion_summary = payload.discussionSummary;
      }
      if (payload.outcome !== undefined) updateBody.outcome = payload.outcome;
      if (payload.nextFollowUpDate !== undefined) {
        updateBody.next_follow_up_date = payload.nextFollowUpDate;
      }

      const rowData = await withRetry(async () => {
        let query = supabase!.from('staff_daily_logs').update(updateBody).eq('id', id);
        if (payload.expectedVersion !== undefined) {
          query = query.eq('version', payload.expectedVersion);
        }
        const { data, error } = await query.select('*').maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          throw new ConflictError(
            'Conflict detected: conversation log was modified elsewhere. Reload before saving.'
          );
        }
        return data as StaffDailyLogRow;
      });

      return { log: mapDailyLogRow(rowData) };
    }

    return apiFetch<{ log: StaffDailyLog }>(`/api/daily-logs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteDailyLog: async (id: string): Promise<{ ok: boolean }> => {
    assertProductionBackend();
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { error } = await supabase
        .from('staff_daily_logs')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: current.id,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    return apiFetch<{ ok: boolean }>(`/api/daily-logs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getTeamMessages: async (): Promise<{
    directory: TeamDirectoryMember[];
    messages: TeamMessage[];
    schemaMissing?: boolean;
  }> => {
    assertProductionBackend();
    if (supabase) {
      await getCurrentSupabaseUser();
      const { error: cleanupError } = await supabase.rpc('cleanup_expired_team_messages');
      if (cleanupError && !isMissingSupabaseSchemaError(cleanupError)) {
        throw new Error(cleanupError.message);
      }
      const [dirRes, msgRes] = await Promise.all([
        supabase.rpc('get_team_directory'),
        supabase
          .from('team_messages')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(500),
      ]);

      if (dirRes.error) {
        if (isMissingSupabaseSchemaError(dirRes.error)) {
          return { directory: [], messages: [], schemaMissing: true };
        }
        throw new Error(dirRes.error.message);
      }

      if (msgRes.error) {
        if (isMissingSupabaseSchemaError(msgRes.error)) {
          return { directory: [], messages: [], schemaMissing: true };
        }
        throw new Error(msgRes.error.message);
      }

      const directory: TeamDirectoryMember[] = ((dirRes.data || []) as TeamDirectoryRpcRow[])
        .map((row) => ({
          id: row.id,
          userId: row.user_id,
          role: row.role,
          name: row.name,
          designation: row.designation || 'Team Member',
          phone: row.phone || '',
          personalPhone: row.personal_phone || '',
          whatsapp: row.whatsapp || '',
          socialLink: row.social_link || '',
          photoUrl: row.photo_url || APP_IMAGES.staffAvatarDefault,
          coverUrl: row.cover_url || APP_IMAGES.heroMobilityAgency,
          joiningDate: row.joining_date || '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const messages: TeamMessage[] = ((msgRes.data || []) as TeamMessageRow[]).map(
        mapTeamMessageRow
      );

      return { directory, messages };
    }

    return apiFetch<{ directory: TeamDirectoryMember[]; messages: TeamMessage[] }>(
      '/api/messages'
    );
  },

  sendTeamMessage: async (payload: {
    recipientId: string | null;
    body: string;
    clientRequestId?: string;
    attachment?: File | null;
    expiresInSeconds?: number | null;
  }): Promise<{ message: TeamMessage }> => {
    assertProductionBackend();
    const cleanBody = payload.body.trim();
    if (!cleanBody && !payload.attachment) {
      throw new Error('Write a message or attach a file.');
    }

    if (supabase) {
      const current = await getCurrentSupabaseUser();
      let attachmentPath: string | null = null;
      if (payload.attachment) {
        if (payload.attachment.size > 20 * 1024 * 1024) {
          throw new Error('File size must be 20 MB or less.');
        }
        const safeName = payload.attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
        attachmentPath = `${current.id}/${payload.recipientId || 'all'}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('team-chat-files')
          .upload(attachmentPath, payload.attachment, {
            contentType: payload.attachment.type || 'application/octet-stream',
            upsert: false,
          });
        if (uploadError) throw new Error(uploadError.message);
      }
      const expiresAt = payload.expiresInSeconds && payload.expiresInSeconds > 0
        ? new Date(Date.now() + payload.expiresInSeconds * 1000).toISOString()
        : null;
      const rowData = await withRetry(async () => {
        const { data, error } = await supabase!
          .from('team_messages')
          .insert({
            sender_id: current.id,
            recipient_id: payload.recipientId || null,
            body: cleanBody,
            client_request_id: payload.clientRequestId || null,
            attachment_path: attachmentPath,
            attachment_name: payload.attachment?.name || null,
            attachment_mime: payload.attachment?.type || null,
            attachment_size: payload.attachment?.size || null,
            expires_at: expiresAt,
          })
          .select('*')
          .single();

        if (error) {
          if (error.code === '23505' && payload.clientRequestId) {
            const { data: existing } = await supabase!
              .from('team_messages')
              .select('*')
              .eq('client_request_id', payload.clientRequestId)
              .maybeSingle();
            if (existing) return existing as TeamMessageRow;
          }
          if (isMissingSupabaseSchemaError(error)) {
            throw new DatabaseSetupError(
              'Team messaging table is not installed yet. Run supabase/setup_all.sql in Supabase SQL Editor.'
            );
          }
          throw new Error(error.message);
        }
        return data as TeamMessageRow;
      });

      return { message: mapTeamMessageRow(rowData) };
    }

    return apiFetch<{ message: TeamMessage }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        recipientId: payload.recipientId || null,
        body: cleanBody,
        clientRequestId: payload.clientRequestId,
        expiresInSeconds: payload.expiresInSeconds || null,
      }),
    });
  },

  getTeamChatFileUrl: async (path: string): Promise<string> => {
    if (!supabase) throw new Error('Team chat storage is not configured.');
    const { data, error } = await supabase.storage.from('team-chat-files').createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Unable to open attachment.');
    return data.signedUrl;
  },

  markDirectMessagesRead: async (senderId: string): Promise<void> => {
    assertProductionBackend();
    if (!senderId) return;

    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { error } = await supabase
        .from('team_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('sender_id', senderId)
        .eq('recipient_id', current.id)
        .is('read_at', null);

      if (error && !isMissingSupabaseSchemaError(error)) {
        throw new Error(error.message);
      }
      return;
    }

    await apiFetch<{ ok: boolean }>('/api/messages/read', {
      method: 'POST',
      body: JSON.stringify({ senderId }),
    });
  },

  subscribeToTeamMessages: (
    currentUserId: string,
    callbacks: {
      onMessageCreated: (msg: TeamMessage) => void;
      onMessagesRead: (senderId: string, readerId: string, readAt: string) => void;
      onReconnectSync?: () => void;
      onStatusChange?: (connected: boolean) => void;
    }
  ): (() => void) => {
    if (supabase) {
      const channel = supabase
        .channel(`team-messages-${currentUserId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'team_messages' },
          (payload) => {
            const row = payload.new as TeamMessageRow | undefined;
            if (!row || !row.id) return;
            if (
              row.recipient_id === null ||
              row.sender_id === currentUserId ||
              row.recipient_id === currentUserId
            ) {
              callbacks.onMessageCreated(mapTeamMessageRow(row));
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'team_messages' },
          (payload) => {
            const row = payload.new as TeamMessageRow | undefined;
            if (!row || !row.read_at) return;
            if (
              row.sender_id === currentUserId ||
              row.recipient_id === currentUserId
            ) {
              callbacks.onMessagesRead(
                row.sender_id,
                row.recipient_id || '',
                row.read_at
              );
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            callbacks.onStatusChange?.(true);
            callbacks.onReconnectSync?.();
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            callbacks.onStatusChange?.(false);
          }
        });

      return () => {
        supabase?.removeChannel(channel);
      };
    }

    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let retryDelay = 1000;
    let hasConnectedOnce = false;

    const connect = () => {
      if (closed || typeof window === 'undefined') return;
      const token = getAuthToken();
      if (!token) return;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        callbacks.onStatusChange?.(true);
        retryDelay = 1000;
        if (hasConnectedOnce) {
          callbacks.onReconnectSync?.();
        }
        hasConnectedOnce = true;
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as
            | { type: 'message:created'; message: TeamMessage }
            | { type: 'messages:read'; senderId: string; readerId: string; readAt: string }
            | { type: string };
          if (data.type === 'message:created' && 'message' in data) {
            callbacks.onMessageCreated(data.message);
          } else if (data.type === 'messages:read' && 'senderId' in data) {
            callbacks.onMessagesRead(data.senderId, data.readerId, data.readAt);
          }
        } catch {
          // Ignore invalid socket frames
        }
      };

      ws.onclose = () => {
        callbacks.onStatusChange?.(false);
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!closed) {
          reconnectTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 10000);
        }
      };

      ws.onerror = () => {
        callbacks.onStatusChange?.(false);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (ws) ws.close();
    };
  },
};

export function getTodayLocalDateStr(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentLocalTimeStr(date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function toLocalDateKey(isoOrDate?: string): string {
  if (!isoOrDate) return getTodayLocalDateStr();
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate.trim())) {
    return isoOrDate.trim();
  }
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoOrDate.slice(0, 10);
  }
  return getTodayLocalDateStr(parsed);
}

export function formatBDT(amount: number): string {
  return `৳${Number(amount || 0).toLocaleString('en-US')}`;
}

export function formatDateTime(value: string): string {
  if (!value) return 'TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDateOnly(value: string): string {
  if (!value) return 'TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function buildWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '#';
  const normalized = digits.startsWith('01') && digits.length === 11 ? `88${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

export async function compressImageFile(file: File, maxDim = 960): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
