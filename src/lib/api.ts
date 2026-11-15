import type {
  ClientDocument,
  ClientLookupResponse,
  ClientPayment,
  ClientProfile,
  ClientStage,
  DashboardData,
  InterviewRecord,
  InterviewStatus,
  MedicalOutcome,
  MedicalRecord,
  MedicalRecordResult,
  MeetingRecord,
  MeetingStatus,
  PublicUser,
  UserRole,
} from '../types';
import { APP_IMAGES } from './assets';
import {
  createEphemeralSupabaseClient,
  isSupabaseConfigured,
  supabase,
} from './supabase';

const TOKEN_KEY = 'gp_portal_auth_token';

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

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
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
  email: string;
  role: UserRole;
  name: string;
  designation: string;
  phone: string;
  whatsapp: string;
  social_link: string;
  photo_url: string;
  cover_url: string;
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
  created_at: string;
}

function mapProfileRow(row: ProfileRow): PublicUser {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    name: row.name,
    designation: row.designation || 'Visa & Recruitment Coordinator',
    phone: row.phone || '',
    whatsapp: row.whatsapp || '',
    socialLink: row.social_link || '',
    photoUrl: row.photo_url || APP_IMAGES.staffAvatarDefault,
    coverUrl: row.cover_url || APP_IMAGES.heroMobilityAgency,
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
    throw new Error(profError.message);
  }

  if (profile) {
    return mapProfileRow(profile as ProfileRow);
  }

  // Fallback self-heal if trigger has not yet created the profile row
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
 * UNIFIED API LAYER (Supabase in Production/Configured, Express Fallback Locally)
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

  lookupClient: async (phone: string): Promise<ClientLookupResponse> => {
    if (supabase) {
      const clean = phone.trim();
      if (!clean) {
        throw new Error('Please enter a phone number.');
      }
      const { data, error } = await supabase.rpc('lookup_client_by_phone', {
        p_phone: clean,
      });
      if (error) {
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
      `/api/client-lookup?phone=${encodeURIComponent(phone)}`
    );
  },

  login: async (identifier: string, password: string): Promise<{ token: string; user: PublicUser }> => {
    if (supabase) {
      const cleanIdentifier = identifier.trim();
      if (!cleanIdentifier || !password) {
        throw new Error('Email / User ID and password are required.');
      }

      let emailToUse = cleanIdentifier;
      if (!cleanIdentifier.includes('@')) {
        const { data: resolvedEmail, error: resolveErr } = await supabase.rpc(
          'resolve_login_email',
          { p_identifier: cleanIdentifier }
        );
        if (resolveErr) {
          throw new Error(resolveErr.message);
        }
        if (!resolvedEmail) {
          throw new Error('No account found for this User ID. Try signing in with your email address.');
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
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: payload.email.trim(),
        password: payload.password,
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
    if (supabase) {
      const user = await getCurrentSupabaseUser();
      return { user };
    }
    return apiFetch<{ user: PublicUser }>('/api/auth/me');
  },

  getDashboard: async (): Promise<DashboardData> => {
    if (supabase) {
      const user = await getCurrentSupabaseUser();
      const isAdmin = user.role === 'admin';

      const [profilesRes, clientsRes, meetingsRes, medicalsRes, interviewsRes] = await Promise.all([
        isAdmin
          ? supabase
              .from('profiles')
              .select('*')
              .eq('role', 'staff')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: null, error: null }),
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
        supabase.from('meetings').select('*').order('created_at', { ascending: false }),
        supabase.from('medicals').select('*').order('created_at', { ascending: false }),
        supabase.from('interviews').select('*').order('created_at', { ascending: false }),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);
      if (clientsRes.error) throw new Error(clientsRes.error.message);
      if (meetingsRes.error) throw new Error(meetingsRes.error.message);
      if (medicalsRes.error) throw new Error(medicalsRes.error.message);
      if (interviewsRes.error) throw new Error(interviewsRes.error.message);

      return {
        user,
        staffList: isAdmin
          ? ((profilesRes.data || []) as ProfileRow[]).map(mapProfileRow)
          : [user],
        clients: ((clientsRes.data || []) as ClientRow[]).map(mapClientRow),
        meetings: ((meetingsRes.data || []) as MeetingRow[]).map(mapMeetingRow),
        medicals: ((medicalsRes.data || []) as MedicalRow[]).map(mapMedicalRow),
        interviews: ((interviewsRes.data || []) as InterviewRow[]).map(mapInterviewRow),
      };
    }

    return apiFetch<DashboardData>('/api/dashboard');
  },

  updateOwnProfile: async (payload: {
    name?: string;
    designation?: string;
    phone?: string;
    whatsapp?: string;
    socialLink?: string;
    photoUrl?: string;
    coverUrl?: string;
    newPassword?: string;
  }): Promise<{ user: PublicUser }> => {
    if (supabase) {
      const current = await getCurrentSupabaseUser();

      if (payload.newPassword && payload.newPassword.trim().length >= 6) {
        const { error: passErr } = await supabase.auth.updateUser({
          password: payload.newPassword.trim(),
        });
        if (passErr) throw new Error(passErr.message);
      } else if (payload.newPassword && payload.newPassword.trim().length > 0) {
        throw new Error('New password must be at least 6 characters.');
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({
          name: payload.name ?? current.name,
          designation: payload.designation ?? current.designation,
          phone: payload.phone ?? current.phone,
          whatsapp: payload.whatsapp ?? current.whatsapp,
          social_link: payload.socialLink ?? current.socialLink,
          photo_url: payload.photoUrl ?? current.photoUrl,
          cover_url: payload.coverUrl ?? current.coverUrl,
        })
        .eq('id', current.id)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return { user: mapProfileRow(data as ProfileRow) };
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
    designation?: string;
    phone?: string;
    whatsapp?: string;
    socialLink?: string;
    photoUrl?: string;
    coverUrl?: string;
  }): Promise<{ staff: PublicUser }> => {
    if (supabase) {
      const staffEmail = (payload.email || '').trim();
      if (!staffEmail) {
        throw new Error('Staff email address is required when using Supabase Auth.');
      }
      if (!payload.password || payload.password.trim().length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      const ephemeral = createEphemeralSupabaseClient();
      const { data: signUpData, error: signUpErr } = await ephemeral.auth.signUp({
        email: staffEmail,
        password: payload.password.trim(),
        options: {
          data: {
            user_id: payload.userId.trim(),
            name: payload.name.trim(),
            designation: (payload.designation || 'Visa & Recruitment Coordinator').trim(),
            phone: (payload.phone || '').trim(),
            whatsapp: (payload.whatsapp || payload.phone || '').trim(),
            social_link: (payload.socialLink || '').trim(),
            photo_url: (payload.photoUrl || '').trim(),
            cover_url: (payload.coverUrl || '').trim(),
          },
        },
      });
      if (signUpErr) throw new Error(signUpErr.message);
      if (!signUpData.user) {
        throw new Error('Staff account could not be created.');
      }

      // Read newly created profile via admin session
      const { data: profileRow, error: fetchErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', signUpData.user.id)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
      if (!profileRow) {
        throw new Error(
          'Staff auth user created, waiting for profile sync. Ask staff to verify their email if confirmation is enabled.'
        );
      }

      return { staff: mapProfileRow(profileRow as ProfileRow) };
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
      email?: string;
      password?: string;
      name?: string;
      designation?: string;
      phone?: string;
      whatsapp?: string;
      socialLink?: string;
      photoUrl?: string;
      coverUrl?: string;
    }
  ): Promise<{ staff: PublicUser }> => {
    if (supabase) {
      const updateBody: Record<string, unknown> = {};
      if (payload.userId !== undefined) updateBody.user_id = payload.userId;
      if (payload.name !== undefined) updateBody.name = payload.name;
      if (payload.designation !== undefined) updateBody.designation = payload.designation;
      if (payload.phone !== undefined) updateBody.phone = payload.phone;
      if (payload.whatsapp !== undefined) updateBody.whatsapp = payload.whatsapp;
      if (payload.socialLink !== undefined) updateBody.social_link = payload.socialLink;
      if (payload.photoUrl !== undefined) updateBody.photo_url = payload.photoUrl;
      if (payload.coverUrl !== undefined) updateBody.cover_url = payload.coverUrl;

      const { data, error } = await supabase
        .from('profiles')
        .update(updateBody)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return { staff: mapProfileRow(data as ProfileRow) };
    }

    return apiFetch<{ staff: PublicUser }>(`/api/staff/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteStaff: async (id: string): Promise<{ ok: boolean }> => {
    if (supabase) {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    return apiFetch<{ ok: boolean }>(`/api/staff/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  createClient: async (payload: Partial<ClientProfile>): Promise<{ client: ClientProfile }> => {
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const payments = Array.isArray(payload.payments) ? payload.payments : [];
      const paidFromEntries = payments.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
      const totalPaid = payments.length > 0 ? paidFromEntries : Number(payload.totalPaid) || 0;

      const { data, error } = await supabase
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
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return { client: mapClientRow(data as ClientRow) };
    }

    return apiFetch<{ client: ClientProfile }>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateClient: async (
    id: string,
    payload: Partial<ClientProfile>
  ): Promise<{ client: ClientProfile }> => {
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

      const { data, error } = await supabase
        .from('clients')
        .update(updateBody)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return { client: mapClientRow(data as ClientRow) };
    }

    return apiFetch<{ client: ClientProfile }>(`/api/clients/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteClient: async (id: string): Promise<{ ok: boolean }> => {
    if (supabase) {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    return apiFetch<{ ok: boolean }>(`/api/clients/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  createMeeting: async (payload: Partial<MeetingRecord>): Promise<{ meeting: MeetingRecord }> => {
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { data, error } = await supabase
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
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return { meeting: mapMeetingRow(data as MeetingRow) };
    }

    return apiFetch<{ meeting: MeetingRecord }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateMeeting: async (
    id: string,
    payload: Partial<MeetingRecord>
  ): Promise<{ meeting: MeetingRecord }> => {
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

      const { data, error } = await supabase
        .from('meetings')
        .update(updateBody)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return { meeting: mapMeetingRow(data as MeetingRow) };
    }

    return apiFetch<{ meeting: MeetingRecord }>(`/api/meetings/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteMeeting: async (id: string): Promise<{ ok: boolean }> => {
    if (supabase) {
      const { error } = await supabase.from('meetings').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    return apiFetch<{ ok: boolean }>(`/api/meetings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  createMedical: async (payload: Partial<MedicalRecord>): Promise<{ medical: MedicalRecord }> => {
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { data, error } = await supabase
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
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return { medical: mapMedicalRow(data as MedicalRow) };
    }

    return apiFetch<{ medical: MedicalRecord }>('/api/medicals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateMedical: async (
    id: string,
    payload: Partial<MedicalRecord>
  ): Promise<{ medical: MedicalRecord }> => {
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

      const { data, error } = await supabase
        .from('medicals')
        .update(updateBody)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return { medical: mapMedicalRow(data as MedicalRow) };
    }

    return apiFetch<{ medical: MedicalRecord }>(`/api/medicals/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteMedical: async (id: string): Promise<{ ok: boolean }> => {
    if (supabase) {
      const { error } = await supabase.from('medicals').delete().eq('id', id);
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
    if (supabase) {
      const current = await getCurrentSupabaseUser();
      const { data, error } = await supabase
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
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return { interview: mapInterviewRow(data as InterviewRow) };
    }

    return apiFetch<{ interview: InterviewRecord }>('/api/interviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateInterview: async (
    id: string,
    payload: Partial<InterviewRecord>
  ): Promise<{ interview: InterviewRecord }> => {
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

      const { data, error } = await supabase
        .from('interviews')
        .update(updateBody)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return { interview: mapInterviewRow(data as InterviewRow) };
    }

    return apiFetch<{ interview: InterviewRecord }>(`/api/interviews/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteInterview: async (id: string): Promise<{ ok: boolean }> => {
    if (supabase) {
      const { error } = await supabase.from('interviews').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    return apiFetch<{ ok: boolean }>(`/api/interviews/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};

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
