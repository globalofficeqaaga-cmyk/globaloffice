import type {
  ClientLookupResponse,
  ClientProfile,
  DashboardData,
  InterviewRecord,
  MedicalRecord,
  MeetingRecord,
  PublicUser,
} from '../types';

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

export const api = {
  lookupClient: (phone: string) =>
    apiFetch<ClientLookupResponse>(`/api/client-lookup?phone=${encodeURIComponent(phone)}`),

  login: (userId: string, password: string) =>
    apiFetch<{ token: string; user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ userId, password }),
    }),

  me: () => apiFetch<{ user: PublicUser }>('/api/auth/me'),

  getDashboard: () => apiFetch<DashboardData>('/api/dashboard'),

  updateOwnProfile: (payload: {
    name?: string;
    designation?: string;
    phone?: string;
    whatsapp?: string;
    socialLink?: string;
    photoUrl?: string;
    coverUrl?: string;
    newPassword?: string;
  }) =>
    apiFetch<{ user: PublicUser }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  createStaff: (payload: {
    userId: string;
    password: string;
    name: string;
    designation?: string;
    phone?: string;
    whatsapp?: string;
    socialLink?: string;
    photoUrl?: string;
    coverUrl?: string;
  }) =>
    apiFetch<{ staff: PublicUser }>('/api/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateStaff: (
    id: string,
    payload: {
      userId?: string;
      password?: string;
      name?: string;
      designation?: string;
      phone?: string;
      whatsapp?: string;
      socialLink?: string;
      photoUrl?: string;
      coverUrl?: string;
    }
  ) =>
    apiFetch<{ staff: PublicUser }>(`/api/staff/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteStaff: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/staff/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createClient: (payload: Partial<ClientProfile>) =>
    apiFetch<{ client: ClientProfile }>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateClient: (id: string, payload: Partial<ClientProfile>) =>
    apiFetch<{ client: ClientProfile }>(`/api/clients/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteClient: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/clients/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createMeeting: (payload: Partial<MeetingRecord>) =>
    apiFetch<{ meeting: MeetingRecord }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMeeting: (id: string, payload: Partial<MeetingRecord>) =>
    apiFetch<{ meeting: MeetingRecord }>(`/api/meetings/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteMeeting: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/meetings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createMedical: (payload: Partial<MedicalRecord>) =>
    apiFetch<{ medical: MedicalRecord }>('/api/medicals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMedical: (id: string, payload: Partial<MedicalRecord>) =>
    apiFetch<{ medical: MedicalRecord }>(`/api/medicals/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteMedical: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/medicals/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createInterview: (payload: Partial<InterviewRecord>) =>
    apiFetch<{ interview: InterviewRecord }>('/api/interviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateInterview: (id: string, payload: Partial<InterviewRecord>) =>
    apiFetch<{ interview: InterviewRecord }>(`/api/interviews/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteInterview: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/interviews/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
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
