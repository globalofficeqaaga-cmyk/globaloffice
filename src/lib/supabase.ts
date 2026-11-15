import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export function getSupabaseConfigError(): string | null {
  if (!supabaseUrl && !supabasePublishableKey) {
    return 'Missing VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables.';
  }
  if (!supabaseUrl) {
    return 'Missing VITE_SUPABASE_URL environment variable.';
  }
  if (!supabasePublishableKey) {
    return 'Missing VITE_SUPABASE_PUBLISHABLE_KEY environment variable.';
  }
  return null;
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
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
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(getSupabaseConfigError() || 'Supabase is not configured.');
  }
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getSupabaseSqlEditorUrl(): string {
  const match = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (match && match[1]) {
    return `https://supabase.com/dashboard/project/${match[1]}/sql/new`;
  }
  return 'https://supabase.com/dashboard/projects';
}

