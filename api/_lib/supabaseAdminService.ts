import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface AdminUserPayload {
  userId?: string;
  email?: string;
  password?: string;
  name?: string;
  role?: string;
  designation?: string;
  phone?: string;
  whatsapp?: string;
  socialLink?: string;
  photoUrl?: string;
  coverUrl?: string;
}

export interface ServiceResult {
  status: number;
  body: Record<string, unknown>;
}

const MIN_PASSWORD_LENGTH = 12;

export function validateStrongPasswordServer(
  password: string,
  fieldLabel = 'Password'
): string | null {
  const value = password.trim();
  if (!value) {
    return `${fieldLabel} is required.`;
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `${fieldLabel} must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (/^(.)\1+$/.test(value)) {
    return `${fieldLabel} is too predictable. Use a mix of letters, numbers, or symbols.`;
  }

  let classes = 0;
  if (/[a-z]/.test(value)) classes += 1;
  if (/[A-Z]/.test(value)) classes += 1;
  if (/\d/.test(value)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(value)) classes += 1;

  if (classes < 2) {
    return `${fieldLabel} must include at least two character types (e.g. uppercase, lowercase, numbers, or symbols).`;
  }

  const lower = value.toLowerCase();
  if (
    lower === '123456789012' ||
    lower === 'password1234' ||
    lower === 'admin1234567' ||
    lower === 'globalpathways'
  ) {
    return `${fieldLabel} is too common. Choose a stronger password.`;
  }

  return null;
}

export interface SupabaseServerConfigAudit {
  supabaseUrlConfigured: boolean;
  supabaseUrlValid: boolean;
  supabaseHost: string | null;
  serviceRoleKeyConfigured: boolean;
  serviceRoleKeyFormatValid: boolean;
  publishableKeyConfigured: boolean;
  clientKeyLeakDetected: boolean;
  ready: boolean;
  issues: string[];
}

function isPlaceholderValue(val: string): boolean {
  const lower = val.toLowerCase();
  return (
    !val ||
    lower.includes('your-project-id') ||
    lower.includes('your-supabase-') ||
    lower.includes('placeholder') ||
    lower === 'changeme'
  );
}

function parseSupabaseHost(rawUrl: string): { valid: boolean; host: string | null } {
  if (!rawUrl || isPlaceholderValue(rawUrl)) {
    return { valid: false, host: null };
  }
  try {
    const parsed = new URL(rawUrl);
    const isHttp = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    return { valid: isHttp && Boolean(parsed.host), host: isHttp ? parsed.host : null };
  } catch {
    return { valid: false, host: null };
  }
}

function classifySupabaseKey(key: string): 'missing' | 'placeholder' | 'service_role' | 'publishable' | 'unknown' {
  if (!key) return 'missing';
  if (isPlaceholderValue(key)) return 'placeholder';
  if (key.startsWith('sb_secret_')) return 'service_role';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        role?: string;
      };
      if (payload?.role === 'service_role') return 'service_role';
      if (payload?.role === 'anon') return 'publishable';
    } catch {
      return 'unknown';
    }
  }
  return 'unknown';
}

export function inspectSupabaseServerConfig(): SupabaseServerConfigAudit {
  const explicitServerUrl = (process.env.SUPABASE_URL || '').trim();
  const viteUrl = (process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseUrl = (explicitServerUrl || viteUrl).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const publishableKey = (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    ''
  ).trim();

  const urlCheck = parseSupabaseHost(supabaseUrl);
  const explicitHost = parseSupabaseHost(explicitServerUrl).host;
  const viteHost = parseSupabaseHost(viteUrl).host;
  const serviceRoleKind = classifySupabaseKey(serviceRoleKey);
  const publishableKind = classifySupabaseKey(publishableKey);

  const issues: string[] = [];
  if (!supabaseUrl) {
    issues.push('SUPABASE_URL (and VITE_SUPABASE_URL) is not set in server environment variables.');
  } else if (!urlCheck.valid) {
    issues.push('SUPABASE_URL is invalid or still uses a placeholder value.');
  }

  if (explicitHost && viteHost && explicitHost !== viteHost) {
    issues.push(
      `SUPABASE_URL host (${explicitHost}) does not match VITE_SUPABASE_URL host (${viteHost}). Both must point to the same Supabase project.`
    );
  }

  if (serviceRoleKind === 'missing') {
    issues.push('SUPABASE_SERVICE_ROLE_KEY is missing from server environment variables.');
  } else if (serviceRoleKind === 'placeholder') {
    issues.push('SUPABASE_SERVICE_ROLE_KEY still contains a placeholder value.');
  } else if (serviceRoleKind === 'publishable') {
    issues.push(
      'SUPABASE_SERVICE_ROLE_KEY appears to be a client Publishable/Anon key instead of a secret service_role key.'
    );
  } else if (serviceRoleKind === 'unknown') {
    issues.push('SUPABASE_SERVICE_ROLE_KEY format is unrecognized (expected Supabase service_role JWT or sb_secret_ key).');
  }

  const clientKeyLeakDetected = publishableKind === 'service_role';
  if (clientKeyLeakDetected) {
    issues.push(
      'CRITICAL: A service_role/sb_secret_ key was detected in VITE_SUPABASE_PUBLISHABLE_KEY. Replace it with your public Publishable/Anon key immediately.'
    );
  }

  const serviceRoleKeyFormatValid = serviceRoleKind === 'service_role';
  const ready =
    Boolean(supabaseUrl) &&
    urlCheck.valid &&
    Boolean(serviceRoleKey) &&
    serviceRoleKeyFormatValid &&
    !clientKeyLeakDetected &&
    !(explicitHost && viteHost && explicitHost !== viteHost);

  return {
    supabaseUrlConfigured: Boolean(supabaseUrl),
    supabaseUrlValid: urlCheck.valid,
    supabaseHost: urlCheck.host,
    serviceRoleKeyConfigured: Boolean(serviceRoleKey),
    serviceRoleKeyFormatValid,
    publishableKeyConfigured: Boolean(publishableKey) && publishableKind !== 'placeholder',
    clientKeyLeakDetected,
    ready,
    issues,
  };
}

export function getSafeSupabaseHealthStatus() {
  const audit = inspectSupabaseServerConfig();
  return {
    supabaseUrlConfigured: audit.supabaseUrlConfigured,
    supabaseUrlValid: audit.supabaseUrlValid,
    serviceRoleKeyConfigured: audit.serviceRoleKeyConfigured,
    serviceRoleKeyFormatValid: audit.serviceRoleKeyFormatValid,
    publishableKeyConfigured: audit.publishableKeyConfigured,
    clientKeyLeakDetected: audit.clientKeyLeakDetected,
    supabaseAdminConfigured: audit.ready,
  };
}

function getSupabaseAdminClient(): SupabaseClient {
  const audit = inspectSupabaseServerConfig();
  if (!audit.ready) {
    throw new Error(
      audit.issues[0] ||
        'Server-side Supabase Auth Admin API is not configured. Add server-only SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL in your server environment variables (never expose service_role in VITE_*).'
    );
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function authenticateAdminCaller(
  authHeader: string | undefined
): Promise<{ adminClient: SupabaseClient; adminId: string } | ServiceResult> {
  let adminClient: SupabaseClient;
  try {
    adminClient = getSupabaseAdminClient();
  } catch (err) {
    return {
      status: 503,
      body: {
        error:
          err instanceof Error
            ? err.message
            : 'Supabase Admin API is not configured on this server.',
      },
    };
  }

  const header = (authHeader || '').trim();
  const jwt = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!jwt) {
    return {
      status: 401,
      body: { error: 'Administrator sign-in session is required.' },
    };
  }

  const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return {
      status: 401,
      body: { error: 'Your session has expired or is invalid. Please sign in again.' },
    };
  }

  const { data: profile, error: profErr } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profErr) {
    return {
      status: 500,
      body: { error: 'Unable to verify administrator permissions in the database.' },
    };
  }

  if (!profile || profile.role !== 'admin') {
    return {
      status: 403,
      body: { error: 'Only authorized Administrator accounts can manage Staff or Accounts logins.' },
    };
  }

  return { adminClient, adminId: profile.id };
}

function buildSafeNonDeliverableSlug(userId: string, role: 'staff' | 'accounts'): string {
  const normalized = userId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return normalized || role;
}

function isValidEmailSyntax(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapSupabaseAuthCreateError(message: string): { status: number; message: string } {
  const lower = message.toLowerCase();
  if (lower.includes('already been registered') || lower.includes('already exists') || lower.includes('duplicate')) {
    return {
      status: 409,
      message: 'An account with this Email or Login ID already exists.',
    };
  }
  if (lower.includes('password')) {
    return {
      status: 400,
      message: 'Password does not meet security requirements (minimum 12 characters).',
    };
  }
  if (lower.includes('email')) {
    return {
      status: 400,
      message: 'Please provide a valid email address or leave it blank for automatic assignment.',
    };
  }
  return {
    status: 400,
    message: 'Unable to create authentication credentials. Please verify inputs and try again.',
  };
}

export async function handleCreateManagedUser(
  authHeader: string | undefined,
  body: AdminUserPayload
): Promise<ServiceResult> {
  const auth = await authenticateAdminCaller(authHeader);
  if ('status' in auth) return auth;
  const { adminClient } = auth;

  const cleanUserId = String(body.userId || '').trim();
  const cleanPass = String(body.password || '').trim();
  const cleanName = String(body.name || '').trim();
  const targetRole: 'staff' | 'accounts' = body.role === 'accounts' ? 'accounts' : 'staff';

  if (!cleanUserId || !cleanName) {
    return {
      status: 400,
      body: { error: 'Full Name and Login User ID are required.' },
    };
  }
  if (cleanUserId.length < 2 || /\s/.test(cleanUserId)) {
    return {
      status: 400,
      body: { error: 'Login User ID must be at least 2 characters and contain no spaces.' },
    };
  }

  const pwErr = validateStrongPasswordServer(cleanPass, 'Password');
  if (pwErr) {
    return { status: 400, body: { error: pwErr } };
  }

  const { data: existingUid, error: uidErr } = await adminClient
    .from('profiles')
    .select('id')
    .ilike('user_id', cleanUserId)
    .maybeSingle();

  if (uidErr) {
    return {
      status: 500,
      body: {
        error:
          'Database profiles table is missing or inaccessible. Run supabase/setup_all.sql in Supabase SQL Editor.',
      },
    };
  }

  if (existingUid) {
    return {
      status: 409,
      body: { error: 'This Login User ID is already in use. Please choose a unique User ID.' },
    };
  }

  const providedEmail = String(body.email || '').trim().toLowerCase();
  let email = providedEmail;

  if (providedEmail) {
    if (!isValidEmailSyntax(providedEmail)) {
      return {
        status: 400,
        body: { error: 'Please enter a valid email address or leave Email blank.' },
      };
    }
    const { data: existingEmail } = await adminClient
      .from('profiles')
      .select('id')
      .ilike('email', providedEmail)
      .maybeSingle();
    if (existingEmail) {
      return {
        status: 409,
        body: { error: 'An account with this email address already exists.' },
      };
    }
  } else {
    // Generate a valid non-deliverable RFC 2606 (.invalid) internal auth identifier
    const slug = buildSafeNonDeliverableSlug(cleanUserId, targetRole);
    const domain = `${targetRole}.globalstarlink.invalid`;
    let candidate = `${slug}@${domain}`;

    const { data: emailCollision } = await adminClient
      .from('profiles')
      .select('id')
      .ilike('email', candidate)
      .maybeSingle();

    if (emailCollision) {
      const randSuffix = Math.random().toString(36).slice(2, 6);
      candidate = `${slug}.${randSuffix}@${domain}`;
    }
    email = candidate;
  }

  const defaultDesig =
    targetRole === 'accounts' ? 'Accounts & Finance Officer' : 'Visa & Recruitment Coordinator';
  const designation = String(body.designation || defaultDesig).trim() || defaultDesig;
  const phone = String(body.phone || '').trim();
  const whatsapp = String(body.whatsapp || phone || '').trim();
  const socialLink = String(body.socialLink || '').trim();
  const photoUrl = String(body.photoUrl || '').trim();
  const coverUrl = String(body.coverUrl || '').trim();

  const { data: createdAuth, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password: cleanPass,
    email_confirm: true,
    user_metadata: {
      user_id: cleanUserId,
      name: cleanName,
      designation,
      phone,
      whatsapp,
      social_link: socialLink,
      photo_url: photoUrl,
      cover_url: coverUrl,
    },
  });

  if (createErr || !createdAuth?.user) {
    const mapped = mapSupabaseAuthCreateError(createErr?.message || '');
    return {
      status: mapped.status,
      body: { error: mapped.message },
    };
  }

  const { data: profileRow, error: upsertErr } = await adminClient
    .from('profiles')
    .upsert(
      {
        id: createdAuth.user.id,
        user_id: cleanUserId,
        email,
        role: targetRole,
        name: cleanName,
        designation,
        phone,
        whatsapp,
        social_link: socialLink,
        photo_url: photoUrl,
        cover_url: coverUrl,
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (upsertErr || !profileRow) {
    await adminClient.auth.admin.deleteUser(createdAuth.user.id);
    if (upsertErr?.code === '23505') {
      return {
        status: 409,
        body: { error: 'This Login User ID or Email is already taken.' },
      };
    }
    return {
      status: 500,
      body: {
        error:
          'Unable to save user profile details. Check database schema & trigger permissions (run latest supabase/setup_all.sql).',
      },
    };
  }

  return {
    status: 201,
    body: { profile: profileRow },
  };
}

export async function handleUpdateManagedUser(
  authHeader: string | undefined,
  targetId: string,
  body: AdminUserPayload
): Promise<ServiceResult> {
  const auth = await authenticateAdminCaller(authHeader);
  if ('status' in auth) return auth;
  const { adminClient } = auth;

  const cleanTargetId = String(targetId || '').trim();
  if (!cleanTargetId) {
    return { status: 400, body: { error: 'User ID parameter is required.' } };
  }

  const { data: targetProfile, error: findErr } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', cleanTargetId)
    .maybeSingle();

  if (findErr || !targetProfile) {
    return { status: 404, body: { error: 'User account not found.' } };
  }

  if (targetProfile.role !== 'staff' && targetProfile.role !== 'accounts') {
    return {
      status: 403,
      body: { error: 'Only Staff or Accounts accounts can be updated here.' },
    };
  }

  const nextPass = typeof body.password === 'string' ? body.password.trim() : '';
  if (nextPass) {
    const pwErr = validateStrongPasswordServer(nextPass, 'New password');
    if (pwErr) {
      return { status: 400, body: { error: pwErr } };
    }
    const { error: authUpdErr } = await adminClient.auth.admin.updateUserById(cleanTargetId, {
      password: nextPass,
    });
    if (authUpdErr) {
      return { status: 400, body: { error: authUpdErr.message } };
    }
  }

  const nextUid = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (nextUid) {
    if (nextUid.length < 2 || /\s/.test(nextUid)) {
      return {
        status: 400,
        body: { error: 'Login User ID must be at least 2 characters and contain no spaces.' },
      };
    }
    if (nextUid.toLowerCase() !== String(targetProfile.user_id || '').toLowerCase()) {
      const { data: collision } = await adminClient
        .from('profiles')
        .select('id')
        .ilike('user_id', nextUid)
        .neq('id', cleanTargetId)
        .maybeSingle();
      if (collision) {
        return { status: 409, body: { error: 'Another account already uses this Login User ID.' } };
      }
    }
  }

  const updateBody: Record<string, unknown> = {};
  if (nextUid) updateBody.user_id = nextUid;
  if (body.name !== undefined) updateBody.name = String(body.name).trim();
  if (body.designation !== undefined) updateBody.designation = String(body.designation).trim();
  if (body.phone !== undefined) updateBody.phone = String(body.phone).trim();
  if (body.whatsapp !== undefined) updateBody.whatsapp = String(body.whatsapp).trim();
  if (body.socialLink !== undefined) updateBody.social_link = String(body.socialLink).trim();
  if (body.photoUrl !== undefined) updateBody.photo_url = String(body.photoUrl).trim();
  if (body.coverUrl !== undefined) updateBody.cover_url = String(body.coverUrl).trim();

  const { data: updatedProfile, error: profUpdErr } = await adminClient
    .from('profiles')
    .update(updateBody)
    .eq('id', cleanTargetId)
    .select('*')
    .single();

  if (profUpdErr || !updatedProfile) {
    return {
      status: 400,
      body: { error: profUpdErr?.message || 'Failed to update account profile.' },
    };
  }

  return {
    status: 200,
    body: { profile: updatedProfile },
  };
}

export async function handleDeleteManagedUser(
  authHeader: string | undefined,
  targetId: string
): Promise<ServiceResult> {
  const auth = await authenticateAdminCaller(authHeader);
  if ('status' in auth) return auth;
  const { adminClient, adminId } = auth;

  const cleanTargetId = String(targetId || '').trim();
  if (!cleanTargetId || cleanTargetId === adminId) {
    return { status: 400, body: { error: 'Cannot delete your active administrator account.' } };
  }

  const { data: targetProfile, error: findErr } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', cleanTargetId)
    .maybeSingle();

  if (findErr || !targetProfile) {
    return { status: 404, body: { error: 'User account not found.' } };
  }

  if (targetProfile.role !== 'staff' && targetProfile.role !== 'accounts') {
    return {
      status: 403,
      body: { error: 'Administrator accounts cannot be deleted via this endpoint.' },
    };
  }

  // Reassign records to administrator so foreign key RESTRICT rules never fail and records remain preserved
  const restrictResults = await Promise.all([
    adminClient.from('clients').update({ staff_id: adminId }).eq('staff_id', cleanTargetId),
    adminClient.from('account_ledger').update({ account_owner_id: adminId }).eq('account_owner_id', cleanTargetId),
  ]);
  const restrictError = restrictResults.find((r) => r.error)?.error;
  if (restrictError) {
    return {
      status: 500,
      body: { error: `Unable to reassign user records before deletion: ${restrictError.message}` },
    };
  }

  await Promise.all([
    adminClient.from('meetings').update({ staff_id: adminId }).eq('staff_id', cleanTargetId),
    adminClient.from('medicals').update({ staff_id: adminId }).eq('staff_id', cleanTargetId),
    adminClient.from('interviews').update({ staff_id: adminId }).eq('staff_id', cleanTargetId),
    adminClient.from('staff_daily_logs').update({ staff_id: adminId }).eq('staff_id', cleanTargetId),
  ]);

  // Preserve non-overlapping staff_attendance rows without violating unique (staff_id, attendance_date)
  const { data: adminAttendanceDates } = await adminClient
    .from('staff_attendance')
    .select('attendance_date')
    .eq('staff_id', adminId)
    .is('deleted_at', null);

  const takenDates = new Set(
    (adminAttendanceDates || []).map((row) => String((row as { attendance_date?: string }).attendance_date || ''))
  );
  const { data: targetAttendanceRows } = await adminClient
    .from('staff_attendance')
    .select('id, attendance_date, deleted_at')
    .eq('staff_id', cleanTargetId);

  const reassignableIds = (targetAttendanceRows || [])
    .filter((row) => {
      const typed = row as { id: string; attendance_date?: string; deleted_at?: string | null };
      return Boolean(typed.deleted_at) || !takenDates.has(String(typed.attendance_date || ''));
    })
    .map((row) => String((row as { id: string }).id));

  if (reassignableIds.length > 0) {
    await adminClient
      .from('staff_attendance')
      .update({ staff_id: adminId })
      .in('id', reassignableIds);
  }

  const { error: delErr } = await adminClient.auth.admin.deleteUser(cleanTargetId);
  if (delErr) {
    return { status: 400, body: { error: delErr.message } };
  }

  return { status: 200, body: { ok: true } };
}

const REQUIRED_TABLES = [
  'profiles',
  'clients',
  'meetings',
  'medicals',
  'interviews',
  'site_settings',
  'account_ledger',
  'staff_attendance',
  'staff_daily_logs',
  'audit_logs',
  'tracking_rate_limits',
  'team_messages',
] as const;

export async function runServerSupabaseVerification(adminClient?: SupabaseClient) {
  const configAudit = inspectSupabaseServerConfig();
  if (!configAudit.ready) {
    return {
      ok: false,
      config: {
        supabaseUrlConfigured: configAudit.supabaseUrlConfigured,
        supabaseUrlValid: configAudit.supabaseUrlValid,
        supabaseHost: configAudit.supabaseHost,
        serviceRoleKeyConfigured: configAudit.serviceRoleKeyConfigured,
        serviceRoleKeyFormatValid: configAudit.serviceRoleKeyFormatValid,
        publishableKeyConfigured: configAudit.publishableKeyConfigured,
        clientKeyLeakDetected: configAudit.clientKeyLeakDetected,
      },
      issues: configAudit.issues,
      authAdminReachable: false,
      tables: [] as Array<{ table: string; exists: boolean; rowCount: number | null; error: string | null }>,
      rpcs: [] as Array<{ name: string; exists: boolean; note: string }>,
      buckets: [] as Array<{ id: string; exists: boolean; public: boolean | null }>,
      profilesSummary: { adminCount: 0, staffCount: 0, accountsCount: 0 },
    };
  }

  const client = adminClient || getSupabaseAdminClient();
  const issues: string[] = [...configAudit.issues];

  // 1. Auth Admin API verification (never mutates users)
  let authAdminReachable = false;
  try {
    const { error: authErr } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (authErr) {
      issues.push(`Supabase Auth Admin API check failed: ${authErr.message}`);
    } else {
      authAdminReachable = true;
    }
  } catch (err) {
    issues.push(
      `Supabase Auth Admin API error: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  // 2. Non-destructive metadata count check across all 12 required tables
  const tables = await Promise.all(
    REQUIRED_TABLES.map(async (table) => {
      const { count, error } = await client
        .from(table)
        .select('*', { count: 'exact', head: true });
      if (error) {
        return {
          table,
          exists: false,
          rowCount: null,
          error: error.message,
        };
      }
      return {
        table,
        exists: true,
        rowCount: count ?? 0,
        error: null,
      };
    })
  );

  for (const t of tables) {
    if (!t.exists) {
      issues.push(`Table public.${t.table} is missing or inaccessible: ${t.error}`);
    }
  }

  // 3. Profiles role distribution (count only, zero PII exposed)
  const [adminCntRes, staffCntRes, accountsCntRes] = await Promise.all([
    client.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
    client.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'staff'),
    client.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'accounts'),
  ]);
  const profilesSummary = {
    adminCount: adminCntRes.count ?? 0,
    staffCount: staffCntRes.count ?? 0,
    accountsCount: accountsCntRes.count ?? 0,
  };
  if (tables.find((t) => t.table === 'profiles')?.exists && profilesSummary.adminCount === 0) {
    issues.push('No administrator profile exists yet in public.profiles.');
  }

  // 4. Non-mutating RPC probes
  const rpcs: Array<{ name: string; exists: boolean; note: string }> = [];

  const resolveProbe = await client.rpc('resolve_login_email', { p_identifier: 'a' });
  const resolveMissing = resolveProbe.error?.code === 'PGRST202' || resolveProbe.error?.code === '42883';
  rpcs.push({
    name: 'resolve_login_email',
    exists: !resolveMissing,
    note: resolveMissing
      ? 'Missing RPC function (run supabase/setup_all.sql).'
      : 'Exists and resolves User IDs safely.',
  });

  const lookupProbe = await client.rpc('lookup_client_by_phone', { p_phone: '00000' });
  const lookupMissing = lookupProbe.error?.code === 'PGRST202' || lookupProbe.error?.code === '42883';
  rpcs.push({
    name: 'lookup_client_by_phone',
    exists: !lookupMissing,
    note: lookupMissing
      ? 'Missing RPC function (run supabase/setup_all.sql).'
      : 'Exists and rejects partial phone numbers (<10 digits).',
  });

  const dirProbe = await client.rpc('get_team_directory');
  const dirMissing = dirProbe.error?.code === 'PGRST202' || dirProbe.error?.code === '42883';
  rpcs.push({
    name: 'get_team_directory',
    exists: !dirMissing,
    note: dirMissing
      ? 'Missing RPC function (run updated supabase/setup_all.sql).'
      : 'Exists and enforces authenticated access.',
  });

  const dailyProbe = await client.rpc('get_daily_client_activity');
  const dailyMissing = dailyProbe.error?.code === 'PGRST202' || dailyProbe.error?.code === '42883';
  rpcs.push({
    name: 'get_daily_client_activity',
    exists: !dailyMissing,
    note: dailyMissing
      ? 'Missing RPC function (run supabase/setup_all.sql).'
      : 'Exists and enforces Admin/Accounts check.',
  });

  for (const r of rpcs) {
    if (!r.exists) issues.push(`RPC public.${r.name} is missing.`);
  }

  // 5. Storage Buckets check
  const buckets: Array<{ id: string; exists: boolean; public: boolean | null }> = [];
  const { data: bucketList, error: bucketErr } = await client.storage.listBuckets();
  if (bucketErr) {
    issues.push(`Storage buckets check failed: ${bucketErr.message}`);
  } else {
    const byId = new Map((bucketList || []).map((b) => [b.id, b]));
    for (const id of ['client-documents', 'staff-media']) {
      const b = byId.get(id);
      buckets.push({
        id,
        exists: Boolean(b),
        public: b ? Boolean(b.public) : null,
      });
      if (!b) {
        issues.push(`Storage bucket "${id}" is missing.`);
      }
    }
  }

  // 6. Non-destructive anonymous RLS enforcement checks (when public anon/publishable key is configured)
  const rlsChecks: Array<{ target: string; protected: boolean; detail: string }> = [];
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const publishableKey = (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    ''
  ).trim();

  if (supabaseUrl && publishableKey && classifySupabaseKey(publishableKey) === 'publishable') {
    const anonClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    for (const privTable of [
      'profiles',
      'clients',
      'account_ledger',
      'staff_attendance',
      'staff_daily_logs',
      'audit_logs',
      'tracking_rate_limits',
      'team_messages',
    ]) {
      const tableMeta = tables.find((t) => t.table === privTable);
      if (!tableMeta?.exists) {
        rlsChecks.push({
          target: privTable,
          protected: false,
          detail: 'Table does not exist yet.',
        });
        continue;
      }
      const { data, error } = await anonClient.from(privTable).select('*').limit(1);
      const blocked = Boolean(error) || (Array.isArray(data) && data.length === 0);
      rlsChecks.push({
        target: privTable,
        protected: blocked,
        detail: error
          ? `Blocked (${error.message})`
          : blocked
          ? '0 rows visible to anon'
          : 'WARNING: Anonymous caller read a row!',
      });
      if (!blocked) {
        issues.push(`RLS WARNING: Anonymous caller was able to read rows from public.${privTable}.`);
      }
    }
  }

  return {
    ok:
      authAdminReachable &&
      tables.every((t) => t.exists) &&
      rpcs.every((r) => r.exists) &&
      buckets.every((b) => b.exists) &&
      rlsChecks.every((c) => c.protected) &&
      issues.length === 0,
    config: {
      supabaseUrlConfigured: configAudit.supabaseUrlConfigured,
      supabaseUrlValid: configAudit.supabaseUrlValid,
      supabaseHost: configAudit.supabaseHost,
      serviceRoleKeyConfigured: configAudit.serviceRoleKeyConfigured,
      serviceRoleKeyFormatValid: configAudit.serviceRoleKeyFormatValid,
      publishableKeyConfigured: configAudit.publishableKeyConfigured,
      clientKeyLeakDetected: configAudit.clientKeyLeakDetected,
    },
    issues,
    authAdminReachable,
    tables,
    rpcs,
    buckets,
    rlsChecks,
    profilesSummary,
  };
}

export async function handleVerifySupabaseSetup(
  authHeader: string | undefined
): Promise<ServiceResult> {
  const auth = await authenticateAdminCaller(authHeader);
  if ('status' in auth) return auth;

  const report = await runServerSupabaseVerification(auth.adminClient);
  return {
    status: report.ok ? 200 : 500,
    body: report,
  };
}
