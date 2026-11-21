import type { PublicApiRequest } from '../_lib/publicApi.js';
import { createPublicApiClients, getRequestIp, readJsonBody, sendJson, takeRateLimit } from '../_lib/publicApi.js';

interface LoginBody extends Record<string, unknown> { identifier?: unknown; password?: unknown; }

function toPublicUser(profile: Record<string, any>, fallbackEmail: string) {
  return {
    id: String(profile.id || ''),
    userId: String(profile.user_id || ''),
    email: String(profile.email || fallbackEmail),
    role: String(profile.role || 'staff'),
    permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
    name: String(profile.name || 'Staff Member'),
    designation: String(profile.designation || 'Visa & Recruitment Coordinator'),
    phone: String(profile.phone || ''),
    personalPhone: String(profile.personal_phone || ''),
    whatsapp: String(profile.whatsapp || ''),
    socialLink: String(profile.social_link || ''),
    photoUrl: String(profile.photo_url || ''),
    coverUrl: String(profile.cover_url || ''),
    joiningDate: String(profile.joining_date || ''),
    version: Number(profile.version || 1),
    createdAt: String(profile.created_at || new Date().toISOString()),
  };
}

export default async function handler(req: PublicApiRequest, res: import('node:http').ServerResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }
  let identifier = '';
  let password = '';
  try {
    const body = await readJsonBody<LoginBody>(req);
    identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    sendJson(res, 400, { error: 'Invalid request payload.' });
    return;
  }
  if (!identifier || !password || identifier.length > 120 || password.length > 256) {
    sendJson(res, 400, { error: 'Please enter a valid User ID and password.' });
    return;
  }
  try {
    const { admin, auth, serviceKey } = createPublicApiClients();
    const ipAllowed = await takeRateLimit(admin, serviceKey, 'login_ip', getRequestIp(req), 20);
    const identifierAllowed = await takeRateLimit(admin, serviceKey, 'login_identifier', identifier.toLowerCase(), 6);
    if (!ipAllowed || !identifierAllowed) {
      sendJson(res, 429, { error: 'Too many sign-in attempts. Please try again after 15 minutes.' });
      return;
    }
    const { data: resolvedEmail, error: resolveError } = await admin.rpc('resolve_login_email', { p_identifier: identifier });
    if (resolveError) {
      console.error('[api/auth/login] User ID resolution failed:', resolveError.message);
      sendJson(res, 503, { error: 'Sign-in is temporarily unavailable. Please try again later.' });
      return;
    }
    if (typeof resolvedEmail !== 'string' || !resolvedEmail) {
      sendJson(res, 401, { error: 'Invalid User ID or password.' });
      return;
    }
    const { data: authData, error: authError } = await auth.auth.signInWithPassword({
      email: resolvedEmail, password,
    });
    if (authError || !authData.user || !authData.session) {
      sendJson(res, 401, { error: 'Invalid User ID or password.' });
      return;
    }
    const { data: profile, error: profileError } = await admin.from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
    if (profileError) {
      console.error('[api/auth/login] Profile lookup failed:', profileError.message);
      sendJson(res, 503, { error: 'Your account profile is temporarily unavailable.' });
      return;
    }
    let finalProfile = profile as Record<string, any> | null;
    if (!finalProfile) {
      const metadata = authData.user.user_metadata || {};
      const fallbackName = String(metadata.name || resolvedEmail.split('@')[0]);
      const fallbackUserId = String(metadata.user_id || (resolvedEmail.split('@')[0] + '_' + authData.user.id.slice(0, 4)));
      const { data: createdProfile, error: createError } = await admin.from('profiles').insert({
        id: authData.user.id, user_id: fallbackUserId, email: resolvedEmail, role: 'staff',
        name: fallbackName, phone: String(metadata.phone || ''), whatsapp: String(metadata.phone || ''),
      }).select('*').single();
      if (createError || !createdProfile) {
        console.error('[api/auth/login] Fallback profile creation failed:', createError?.message);
        sendJson(res, 503, { error: 'Your account profile could not be initialized.' });
        return;
      }
      finalProfile = createdProfile as Record<string, any>;
    }
    sendJson(res, 200, {
      token: authData.session.access_token,
      session: { access_token: authData.session.access_token, refresh_token: authData.session.refresh_token },
      user: toPublicUser(finalProfile, authData.user.email || resolvedEmail),
    });
  } catch (err) {
    console.error('[api/auth/login] Request failed:', err instanceof Error ? err.message : 'Unknown error');
    sendJson(res, 503, { error: 'Sign-in is temporarily unavailable. Please try again later.' });
  }
}
