import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface RuntimeAppConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
}

const runtimeConfig = (globalThis as { __APP_CONFIG__?: RuntimeAppConfig }).__APP_CONFIG__;

const rawSupabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ||
  runtimeConfig?.supabaseUrl ||
  ''
).trim();

const rawSupabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  runtimeConfig?.supabaseKey ||
  ''
).trim();

function isPlaceholderValue(val: string): boolean {
  const lower = val.toLowerCase();
  return (
    lower.includes('your-project-id') ||
    lower.includes('your-supabase-publishable') ||
    lower.includes('your-supabase-anon') ||
    lower === 'placeholder'
  );
}

function isValidHttpUrl(val: string): boolean {
  try {
    const parsed = new URL(val);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isUnsafeSecretKey(key: string): boolean {
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded)) as { role?: string };
      if (payload?.role === 'service_role') {
        return true;
      }
    } catch {
      // Non-JWT or malformed token; ignore here
    }
  }
  return false;
}

export function getSupabaseConfigError(): string | null {
  if (!rawSupabaseUrl && !rawSupabasePublishableKey) {
    return 'Missing VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables.';
  }
  if (!rawSupabaseUrl) {
    return 'Missing VITE_SUPABASE_URL environment variable.';
  }
  if (!rawSupabasePublishableKey) {
    return 'Missing VITE_SUPABASE_PUBLISHABLE_KEY environment variable.';
  }
  if (isPlaceholderValue(rawSupabaseUrl) || isPlaceholderValue(rawSupabasePublishableKey)) {
    return 'Supabase environment variables still contain placeholder values. Set your actual VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.';
  }
  if (!isValidHttpUrl(rawSupabaseUrl)) {
    return 'Invalid VITE_SUPABASE_URL environment variable. Expected a full https://<project-ref>.supabase.co URL.';
  }
  if (isUnsafeSecretKey(rawSupabasePublishableKey)) {
    return 'Unsafe key detected: never use a Supabase service_role or sb_secret_ key in VITE_SUPABASE_PUBLISHABLE_KEY. Use your public Publishable (anon) key instead.';
  }
  return null;
}

export const hasPartialOrInvalidSupabaseConfig = Boolean(
  (rawSupabaseUrl || rawSupabasePublishableKey) && getSupabaseConfigError() !== null
);

export const isSupabaseConfigured =
  Boolean(rawSupabaseUrl && rawSupabasePublishableKey) && getSupabaseConfigError() === null;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawSupabaseUrl, rawSupabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Returns a non-persisting Supabase client for creating another user account
 * via signUp without replacing the currently signed-in administrator session.
 */
export function createEphemeralSupabaseClient(): SupabaseClient {
  const err = getSupabaseConfigError();
  if (err || !rawSupabaseUrl || !rawSupabasePublishableKey) {
    throw new Error(err || 'Supabase is not configured.');
  }
  return createClient(rawSupabaseUrl, rawSupabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getSupabaseSqlEditorUrl(): string {
  const match = rawSupabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (match && match[1]) {
    return `https://supabase.com/dashboard/project/${match[1]}/sql/new`;
  }
  return 'https://supabase.com/dashboard/projects';
}

