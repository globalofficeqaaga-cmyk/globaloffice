import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  getSafeSupabaseHealthStatus,
  handleCreateManagedUser,
  handleDeleteManagedUser,
  handleListTeamAttendance,
  handleListTeamProfiles,
  handleUpdateManagedUser,
  handleVerifyCallerPassword,
  handleVerifySupabaseSetup,
} from './api/_lib/supabaseAdminService.ts';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { validateStrongPassword } from './src/lib/passwordPolicy.ts';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();
import { createServer as createViteServer } from 'vite';
import type {
  AccountLedgerEntry,
  AuditAction,
  AuditLogEntry,
  ClientLookupResponse,
  ClientProfile,
  DailyClientSummary,
  DashboardData,
  InterviewRecord,
  MedicalRecord,
  MeetingRecord,
  PublicTrackedClient,
  PublicTrackedStaff,
  PublicUser,
  SiteSettings,
  StaffAttendanceRecord,
  StaffDailyLog,
  TeamDirectoryMember,
  TeamMessage,
  UserRole,
} from './src/types.ts';

interface StoredUser extends PublicUser {
  passwordHash: string;
}

interface DatabaseSchema {
  authSecret: string;
  users: StoredUser[];
  clients: ClientProfile[];
  meetings: MeetingRecord[];
  medicals: MedicalRecord[];
  interviews: InterviewRecord[];
  ledgerEntries?: AccountLedgerEntry[];
  attendanceRecords?: StaffAttendanceRecord[];
  dailyLogs?: StaffDailyLog[];
  teamMessages?: TeamMessage[];
  auditLogs?: AuditLogEntry[];
  siteSettings?: Partial<SiteSettings>;
}

function toDhakaDateStr(isoOrDate?: string): string {
  const date = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length >= 13) {
    return digits.slice(2);
  }
  return digits;
}

function toPublicUser(u: StoredUser): PublicUser {
  const { passwordHash: _ignored, ...pub } = u;
  return {
    ...pub,
    personalPhone: pub.personalPhone || '',
    joiningDate: pub.joiningDate || '',
  };
}

function generateStrongBootstrapPassword(): string {
  return `${crypto.randomBytes(12).toString('base64url')}!A9x`;
}

function createInitialData(): DatabaseSchema {
  const now = new Date().toISOString();
  const adminId = 'usr_admin_01';
  const staff1Id = 'usr_staff_rafiq';
  const staff2Id = 'usr_staff_nusrat';

  const envAdminPass = (process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim();
  const envAdminPassError = envAdminPass
    ? validateStrongPassword(envAdminPass, 'BOOTSTRAP_ADMIN_PASSWORD')
    : 'missing';
  const adminBootstrapPassword =
    !envAdminPassError ? envAdminPass : generateStrongBootstrapPassword();

  if (envAdminPassError) {
    console.warn(
      '[Global Pathways] Local Express store initialized with a generated strong admin password (configure BOOTSTRAP_ADMIN_PASSWORD >= 12 chars or use Supabase Auth).'
    );
  }

  const client1Id = 'cli_1001';
  const client2Id = 'cli_1002';
  const client3Id = 'cli_1003';

  return {
    authSecret: crypto.randomBytes(32).toString('hex'),
    users: [
      {
        id: adminId,
        userId: 'admin',
        role: 'admin',
        name: 'System Administrator',
        designation: 'Managing Director',
        phone: '+8801700000000',
        personalPhone: '',
        whatsapp: '+8801700000000',
        socialLink: 'https://facebook.com',
        photoUrl: '/src/assets/images/staff_avatar_default_1794656907853.jpg',
        coverUrl: '/src/assets/images/hero_mobility_agency_1794656908413.jpg',
        joiningDate: now.slice(0, 10),
        createdAt: now,
        passwordHash: hashPassword(adminBootstrapPassword),
      },
      {
        id: staff1Id,
        userId: 'rafiq',
        role: 'staff',
        name: 'Rafiqul Islam',
        designation: 'Senior Visa & Trade Coordinator',
        phone: '+8801711223344',
        personalPhone: '',
        whatsapp: '+8801711223344',
        socialLink: 'https://facebook.com/rafiq.globalpathways',
        photoUrl: '/src/assets/images/staff_avatar_default_1794656907853.jpg',
        coverUrl: '/src/assets/images/hero_mobility_agency_1794656908413.jpg',
        joiningDate: now.slice(0, 10),
        createdAt: now,
        passwordHash: hashPassword(generateStrongBootstrapPassword()),
      },
      {
        id: staff2Id,
        userId: 'nusrat',
        role: 'staff',
        name: 'Nusrat Jahan',
        designation: 'Medical & Client Relations Officer',
        phone: '+8801811556677',
        personalPhone: '',
        whatsapp: '+8801811556677',
        socialLink: 'https://facebook.com/nusrat.globalpathways',
        photoUrl: '/src/assets/images/staff_avatar_default_1794656907853.jpg',
        coverUrl: '/src/assets/images/service_medical_center_1794656908059.jpg',
        joiningDate: now.slice(0, 10),
        createdAt: now,
        passwordHash: hashPassword(generateStrongBootstrapPassword()),
      },
    ],
    clients: [
      {
        id: client1Id,
        staffId: staff1Id,
        name: 'Md. Kamrul Hasan',
        phone: '01712345678',
        address: 'House 14, Road 6, Mirpur 10, Dhaka',
        passportNumber: 'A08943211',
        trade: 'Industrial Electrician',
        destinationCountry: 'Saudi Arabia',
        expectedSalary: '1,800 SAR + Overtime',
        status: 'Interview Scheduled',
        medicalDone: true,
        medicalStatus: 'Fit',
        medicalCenter: 'Al-Riyadh Diagnostic & GAMCA Center',
        medicalLocation: 'Banani Road 11, Dhaka',
        totalPayable: 380000,
        totalPaid: 220000,
        pendingItems: 'Original Police Clearance certificate & final visa stamping fee (৳160,000)',
        documents: [
          {
            id: 'doc_1',
            name: 'Valid Passport (MRP/E-Passport)',
            status: 'Verified',
            note: 'Valid until 2031',
            updatedAt: now,
          },
          {
            id: 'doc_2',
            name: 'National ID (NID) Copy',
            status: 'Verified',
            note: 'Front & back scanned',
            updatedAt: now,
          },
          {
            id: 'doc_3',
            name: 'GAMCA Medical Fit Slip',
            status: 'Verified',
            note: 'Declared FIT on Oct 28',
            updatedAt: now,
          },
          {
            id: 'doc_4',
            name: 'Police Clearance Certificate',
            status: 'Pending',
            note: 'Applied online; awaiting SP office sign-off',
            updatedAt: now,
          },
        ],
        payments: [
          {
            id: 'pay_1',
            amount: 50000,
            purpose: 'Passport & File Opening Advance',
            date: '2026-10-12',
            note: 'Receipt #GP-1042',
          },
          {
            id: 'pay_2',
            amount: 20000,
            purpose: 'GAMCA Medical & Lab Fee',
            date: '2026-10-25',
            note: 'Banani center slip settled',
          },
          {
            id: 'pay_3',
            amount: 150000,
            purpose: 'Trade Test & Visa Processing Installment',
            date: '2026-11-04',
            note: 'Bank transfer',
          },
        ],
        notes: 'Strong trade test performance. Client notified for delegate interview.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: client2Id,
        staffId: staff1Id,
        name: 'Tariqul Alam',
        phone: '01911223344',
        address: 'Sadarpur, Faridpur',
        passportNumber: 'B04419822',
        trade: '6G Pipe Welder',
        destinationCountry: 'United Arab Emirates',
        expectedSalary: '2,100 AED + Accommodation',
        status: 'Medical Pending',
        medicalDone: false,
        medicalStatus: 'Pending Result',
        medicalCenter: 'Gulf Medical Screening Center',
        medicalLocation: 'Gulshan 2, Dhaka',
        totalPayable: 350000,
        totalPaid: 100000,
        pendingItems: 'Medical fitness report & trade skill video test',
        documents: [
          {
            id: 'doc_5',
            name: 'Valid Passport',
            status: 'Verified',
            note: 'Submitted original',
            updatedAt: now,
          },
          {
            id: 'doc_6',
            name: 'Welding Experience Certificate',
            status: 'Submitted',
            note: '3 years shipyard experience',
            updatedAt: now,
          },
        ],
        payments: [
          {
            id: 'pay_4',
            amount: 100000,
            purpose: 'Initial Registration & Medical Booking',
            date: '2026-11-02',
            note: 'Cash receipt #GP-1088',
          },
        ],
        notes: 'Scheduled for follow-up lab check.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: client3Id,
        staffId: staff2Id,
        name: 'Sharmin Akter',
        phone: '01855667788',
        address: 'Halishahar, Chattogram',
        passportNumber: 'E07731209',
        trade: 'Hospitality & Caregiver',
        destinationCountry: 'Qatar',
        expectedSalary: '1,650 QAR + Food',
        status: 'Visa Processing',
        medicalDone: true,
        medicalStatus: 'Fit',
        medicalCenter: 'Qatar Visa Center (QVC) Medical',
        medicalLocation: 'Motijheel Commercial Area, Dhaka',
        totalPayable: 290000,
        totalPaid: 240000,
        pendingItems: 'Final BMET Smart Card & Air Ticket confirmation (৳50,000 remaining)',
        documents: [
          {
            id: 'doc_7',
            name: 'E-Passport',
            status: 'Verified',
            note: 'Biometric cleared at QVC',
            updatedAt: now,
          },
          {
            id: 'doc_8',
            name: 'Police Clearance',
            status: 'Verified',
            note: 'Attested by MOFA',
            updatedAt: now,
          },
        ],
        payments: [
          {
            id: 'pay_5',
            amount: 240000,
            purpose: 'QVC Biometric & Visa Stamping Package',
            date: '2026-11-06',
            note: 'Installments 1 & 2 cleared',
          },
        ],
        notes: 'Visa approved; preparing pre-departure briefing.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    meetings: [
      {
        id: 'mtg_1',
        staffId: staff1Id,
        clientId: client1Id,
        clientName: 'Md. Kamrul Hasan',
        clientPhone: '01712345678',
        meetingWith: 'Engr. Khalid Al-Mansoor (Saudi Delegate)',
        location: 'Global Pathways Boardroom 2, Banani',
        dateTime: '2026-11-16T11:00',
        purpose: 'Pre-interview document verification & salary briefing',
        status: 'Scheduled',
        notes: 'Bring original experience letters',
        createdAt: now,
      },
      {
        id: 'mtg_2',
        staffId: staff2Id,
        clientId: client3Id,
        clientName: 'Sharmin Akter',
        clientPhone: '01855667788',
        meetingWith: 'BMET Clearance Desk Officer',
        location: 'Kakrail BMET Office, Room 304',
        dateTime: '2026-11-17T10:30',
        purpose: 'Smart card fingerprinting & orientation sign-off',
        status: 'Scheduled',
        notes: 'Carry passport original & 2 copies',
        createdAt: now,
      },
    ],
    medicals: [
      {
        id: 'med_1',
        staffId: staff1Id,
        clientId: client1Id,
        candidateName: 'Md. Kamrul Hasan',
        candidatePhone: '01712345678',
        medicalCenter: 'Al-Riyadh Diagnostic & GAMCA Center',
        medicalLocation: 'Banani Road 11, Dhaka',
        testDate: '2026-10-25',
        result: 'Fit',
        amountPaid: 10500,
        amountReceivable: 0,
        paymentPurpose: 'GAMCA Slip & Full Medical Panel',
        notes: 'Report collected and uploaded',
        createdAt: now,
      },
      {
        id: 'med_2',
        staffId: staff1Id,
        clientId: client2Id,
        candidateName: 'Tariqul Alam',
        candidatePhone: '01911223344',
        medicalCenter: 'Gulf Medical Screening Center',
        medicalLocation: 'Gulshan 2, Dhaka',
        testDate: '2026-11-12',
        result: 'Pending',
        amountPaid: 8500,
        amountReceivable: 2500,
        paymentPurpose: 'UAE Medical Screening & X-Ray Re-check',
        notes: 'Balance ৳2,500 receivable upon report release',
        createdAt: now,
      },
      {
        id: 'med_3',
        staffId: staff2Id,
        clientId: client3Id,
        candidateName: 'Sharmin Akter',
        candidatePhone: '01855667788',
        medicalCenter: 'Qatar Visa Center (QVC) Medical',
        medicalLocation: 'Motijheel Commercial Area, Dhaka',
        testDate: '2026-10-30',
        result: 'Fit',
        amountPaid: 12000,
        amountReceivable: 3000,
        paymentPurpose: 'QVC Biometric Medical & Vaccination',
        notes: 'Vaccination surcharge due',
        createdAt: now,
      },
    ],
    interviews: [
      {
        id: 'int_1',
        staffId: staff1Id,
        clientId: client1Id,
        candidateNames: 'Md. Kamrul Hasan, Sohel Rana, Mizanur Rahman',
        clientCount: 3,
        interviewerOrCompany: 'Al-Fanar Contracting Co. (KSA)',
        trade: 'Industrial Electrician',
        interviewDate: '2026-11-18',
        interviewTime: '09:30 AM',
        location: 'Technical Trade Center, Mirpur 12, Dhaka',
        status: 'Upcoming',
        notes: 'Practical wiring & safety board test',
        createdAt: now,
      },
      {
        id: 'int_2',
        staffId: staff2Id,
        clientId: client3Id,
        candidateNames: 'Sharmin Akter, Taslima Begum',
        clientCount: 2,
        interviewerOrCompany: 'Hamad Care Group (Qatar)',
        trade: 'Hospitality & Caregiver',
        interviewDate: '2026-11-05',
        interviewTime: '02:00 PM',
        location: 'Global Pathways Interview Hall, Banani',
        status: 'Selected',
        notes: 'Both candidates selected for immediate visa filing',
        createdAt: now,
      },
    ],
  };
}

let dbCache: DatabaseSchema | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function loadDb(): DatabaseSchema {
  if (dbCache) return dbCache;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    dbCache = createInitialData();
    fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf8');
    return dbCache;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  dbCache = JSON.parse(raw) as DatabaseSchema;
  return dbCache;
}

async function saveDb(nextDb: DatabaseSchema): Promise<void> {
  dbCache = nextDb;
  writeQueue = writeQueue.then(async () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpFile = `${DB_FILE}.tmp`;
    await fs.promises.writeFile(tmpFile, JSON.stringify(nextDb, null, 2), 'utf8');
    await fs.promises.rename(tmpFile, DB_FILE);
  });
  await writeQueue;
}

function signToken(payload: { sub: string; role: UserRole; exp: number }, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token: string, secret: string): { sub: string; role: UserRole; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      sub: string;
      role: UserRole;
      exp: number;
    };
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface AuthedRequest extends Request {
  currentUser?: StoredUser;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const db = loadDb();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const verified = verifyToken(token, db.authSecret);
  if (!verified) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }
  const user = db.users.find((u) => u.id === verified.sub);
  if (!user) {
    res.status(401).json({ error: 'Account no longer exists.' });
    return;
  }
  req.currentUser = user;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.currentUser || req.currentUser.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  next();
}

function requireAdminOrAccounts(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.currentUser || (req.currentUser.role !== 'admin' && req.currentUser.role !== 'accounts')) {
    res.status(403).json({ error: 'Administrator or Accounts access required.' });
    return;
  }
  next();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function appendAudit(
  db: DatabaseSchema,
  tableName: string,
  recordId: string,
  action: AuditAction,
  actor: StoredUser,
  changedFields: Record<string, { old?: unknown; new?: unknown; changed?: boolean }>
) {
  if (!db.auditLogs) db.auditLogs = [];
  db.auditLogs.unshift({
    id: generateId('aud'),
    tableName,
    recordId,
    action,
    actorId: actor.id,
    actorName: actor.name,
    changedFields,
    createdAt: new Date().toISOString(),
  });
  if (db.auditLogs.length > 200) {
    db.auditLogs = db.auditLogs.slice(0, 200);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const wsClients = new Map<string, Set<WebSocket>>();

  const registerWsClient = (userId: string, ws: WebSocket) => {
    let bucket = wsClients.get(userId);
    if (!bucket) {
      bucket = new Set();
      wsClients.set(userId, bucket);
    }
    bucket.add(ws);
    ws.on('close', () => {
      const currentBucket = wsClients.get(userId);
      if (currentBucket) {
        currentBucket.delete(ws);
        if (currentBucket.size === 0) {
          wsClients.delete(userId);
        }
      }
    });
  };

  const broadcastWsEvent = (targetUserIds: string[] | null, eventPayload: unknown) => {
    const encoded = JSON.stringify(eventPayload);
    if (targetUserIds === null) {
      for (const sockets of wsClients.values()) {
        for (const socket of sockets) {
          if (socket.readyState === 1) {
            socket.send(encoded);
          }
        }
      }
      return;
    }

    const uniqueTargets = new Set(targetUserIds);
    for (const targetId of uniqueTargets) {
      const sockets = wsClients.get(targetId);
      if (!sockets) continue;
      for (const socket of sockets) {
        if (socket.readyState === 1) {
          socket.send(encoded);
        }
      }
    }
  };

  // Public health check (booleans only, never exposes secret keys)
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      backend: 'express',
      ...getSafeSupabaseHealthStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  // Public Website Settings (Logo, Poster Slider, Contacts, Feature Toggles)
  app.get('/api/site-settings', (_req, res) => {
    const db = loadDb();
    res.json({ siteSettings: db.siteSettings || null });
  });

  // Admin: Update Website Settings
  app.put('/api/site-settings', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const incoming = req.body?.siteSettings;
    if (!incoming || typeof incoming !== 'object') {
      res.status(400).json({ error: 'Valid siteSettings object is required.' });
      return;
    }

    const updated: Partial<SiteSettings> = {
      ...incoming,
      updatedAt: new Date().toISOString(),
    };
    db.siteSettings = updated;
    appendAudit(db, 'site_settings', 'default', 'UPDATE', current, {
      brandName: { new: updated.brandName || 'Global Pathways' },
      postersCount: { new: Array.isArray(updated.posters) ? updated.posters.length : 0 },
      contactsCount: { new: Array.isArray(updated.contacts) ? updated.contacts.length : 0 },
    });
    await saveDb(db);
    res.json({ siteSettings: updated });
  });

  // Rate-limiting buckets for public endpoints
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  function checkExpressRateLimit(key: string, windowMs: number, maxAttempts: number): boolean {
    const nowMs = Date.now();
    const existing = rateBuckets.get(key);
    if (!existing || nowMs >= existing.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: nowMs + windowMs });
      return true;
    }
    if (existing.count >= maxAttempts) {
      return false;
    }
    existing.count += 1;
    return true;
  }

  function getClientIp(req: Request): string {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.ip || 'unknown';
  }

  // Server-side Supabase Setup Verification (Admin session required)
  app.get('/api/supabase-admin/verify', async (req, res) => {
    try {
      const result = await handleVerifySupabaseSetup(req.headers.authorization);
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[Supabase Admin Verify] Unexpected error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Unable to complete Supabase verification check.' });
    }
  });

  // Server-side Supabase Auth Admin API: List Team Profiles (Authenticated team caller)
  app.get('/api/supabase-admin/users', async (req, res) => {
    try {
      const result = await handleListTeamProfiles(req.headers.authorization);
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[Supabase Admin List Users] Unexpected error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Unable to load team profiles from the server.' });
    }
  });

  // Server-side Supabase Auth Admin API: Create Staff or Accounts User
  app.post('/api/supabase-admin/users', async (req, res) => {
    try {
      const result = await handleCreateManagedUser(req.headers.authorization, req.body || {});
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[Supabase Admin Create User] Unexpected error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Unable to create user account on the server. Please verify server logs and database schema.' });
    }
  });

  // Server-side Supabase Auth Admin API: Update Staff/Accounts Credentials & Profile
  app.put('/api/supabase-admin/users/:id', async (req, res) => {
    try {
      const result = await handleUpdateManagedUser(
        req.headers.authorization,
        String(req.params.id || ''),
        req.body || {}
      );
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[Supabase Admin Update User] Unexpected error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Unable to update user account on the server.' });
    }
  });

  // Server-side Supabase Auth Admin API: Delete Staff/Accounts User cleanly
  app.delete('/api/supabase-admin/users/:id', async (req, res) => {
    try {
      const result = await handleDeleteManagedUser(
        req.headers.authorization,
        String(req.params.id || '')
      );
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[Supabase Admin Delete User] Unexpected error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Unable to delete user account on the server.' });
    }
  });

  // Server-side Supabase Team Attendance Read (Admin, Manager/Staff, Accounts)
  app.get('/api/supabase-admin/attendance', async (req, res) => {
    try {
      const result = await handleListTeamAttendance(req.headers.authorization);
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[Supabase Admin List Attendance] Unexpected error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Unable to load team attendance records.' });
    }
  });

  // Server-side Supabase Caller Password Verification before Remove/Delete
  app.post('/api/supabase-admin/verify-password', async (req, res) => {
    try {
      const result = await handleVerifyCallerPassword(
        req.headers.authorization,
        req.body?.password
      );
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[Supabase Admin Verify Password] Unexpected error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Unable to verify password on the server.' });
    }
  });

  // Public Client Lookup by exact normalized phone number (Minimal Non-Sensitive Status Only)
  app.get('/api/client-lookup', (req, res) => {
    const ip = getClientIp(req);
    if (!checkExpressRateLimit(`lookup_ip:${ip}`, 15 * 60 * 1000, 15)) {
      res.status(429).json({
        error: 'Too many tracking requests. Please wait a few minutes before trying again.',
      });
      return;
    }

    const phoneQuery = String(req.query.phone || '').trim();
    if (!phoneQuery) {
      res.status(400).json({ error: 'Please enter a complete phone number.' });
      return;
    }
    const normalizedQuery = normalizePhone(phoneQuery);
    if (normalizedQuery.length < 10 || normalizedQuery.length > 15) {
      res.status(400).json({
        error: 'Please enter a valid complete phone number (at least 10 digits).',
      });
      return;
    }

    if (!checkExpressRateLimit(`lookup_phone:${normalizedQuery}`, 5 * 60 * 1000, 5)) {
      res.status(429).json({
        error: 'Too many tracking attempts for this number. Please wait 5 minutes and try again.',
      });
      return;
    }

    const db = loadDb();
    const client = db.clients.find((c) => {
      if (c.deletedAt) return false;
      return normalizePhone(c.phone) === normalizedQuery;
    });

    if (!client) {
      res.status(404).json({
        error: 'No client record found for this phone number. Please verify the number or contact your coordinator.',
      });
      return;
    }

    const assignedStaff = db.users.find((u) => u.id === client.staffId);
    const meetings = db.meetings
      .filter(
        (m) =>
          !m.deletedAt &&
          (m.clientId === client.id || normalizePhone(m.clientPhone) === normalizedQuery)
      )
      .map((m) => ({
        id: m.id,
        meetingWith: m.meetingWith,
        location: m.location,
        dateTime: m.dateTime,
        status: m.status,
      }));
    const medicals = db.medicals
      .filter(
        (m) =>
          !m.deletedAt &&
          (m.clientId === client.id || normalizePhone(m.candidatePhone) === normalizedQuery)
      )
      .map((m) => ({
        id: m.id,
        medicalCenter: m.medicalCenter,
        medicalLocation: m.medicalLocation,
        testDate: m.testDate,
        result: m.result,
      }));
    const interviews = db.interviews
      .filter((i) => !i.deletedAt && i.clientId === client.id)
      .map((i) => ({
        id: i.id,
        interviewerOrCompany: i.interviewerOrCompany,
        trade: i.trade,
        interviewDate: i.interviewDate,
        interviewTime: i.interviewTime,
        location: i.location,
        status: i.status,
      }));

    const publicClient: PublicTrackedClient = {
      id: client.id,
      name: client.name,
      phone: client.phone,
      trade: client.trade,
      destinationCountry: client.destinationCountry,
      status: client.status,
      medicalDone: client.medicalDone,
      medicalStatus: client.medicalStatus,
      medicalCenter: client.medicalCenter,
      medicalLocation: client.medicalLocation,
      updatedAt: client.updatedAt,
    };

    const publicStaff: PublicTrackedStaff | null = assignedStaff
      ? {
          id: assignedStaff.id,
          name: assignedStaff.name,
          designation: assignedStaff.designation,
          phone: assignedStaff.phone,
          whatsapp: assignedStaff.whatsapp,
          socialLink: assignedStaff.socialLink,
          photoUrl: assignedStaff.photoUrl,
          coverUrl: assignedStaff.coverUrl,
        }
      : null;

    const payload: ClientLookupResponse = {
      client: publicClient,
      staff: publicStaff,
      meetings,
      medicals,
      interviews,
    };

    res.json(payload);
  });

  // Login with User ID & Password
  app.post('/api/auth/login', (req, res) => {
    const ip = getClientIp(req);
    if (!checkExpressRateLimit(`login_ip:${ip}`, 15 * 60 * 1000, 15)) {
      res.status(429).json({
        error: 'Too many sign-in attempts. Please wait a few minutes before trying again.',
      });
      return;
    }

    const userId = String(req.body?.userId || '').trim();
    const password = String(req.body?.password || '');

    if (!userId || !password) {
      res.status(400).json({ error: 'User ID and password are required.' });
      return;
    }

    const db = loadDb();
    const user = db.users.find((u) => u.userId.toLowerCase() === userId.toLowerCase());
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid User ID or password.' });
      return;
    }

    const token = signToken(
      {
        sub: user.id,
        role: user.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
      db.authSecret
    );

    res.json({
      token,
      user: toPublicUser(user),
    });
  });

  // Public self-registration disabled — Admin creates Staff accounts, Staff creates Client profiles
  app.post('/api/auth/register', (_req, res) => {
    res.status(403).json({
      error: 'Self-registration is disabled. Please ask the Administrator for your Staff User ID and password.',
    });
  });

  // Current user check
  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: toPublicUser(req.currentUser!) });
  });

  // Verify caller password before remove/delete in Express mode
  app.post('/api/auth/verify-password', requireAuth, (req: AuthedRequest, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
      res.status(400).json({ error: 'Password is required to confirm deletion.' });
      return;
    }
    if (!verifyPassword(password, req.currentUser!.passwordHash)) {
      res.status(401).json({ error: 'Incorrect password. Removal cancelled.' });
      return;
    }
    res.json({ verified: true });
  });

  // Update own profile & credentials (Staff or Admin)
  app.put('/api/profile', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const idx = db.users.findIndex((u) => u.id === req.currentUser!.id);
    if (idx === -1) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const existing = db.users[idx];
    const {
      userId,
      name,
      designation,
      phone,
      personalPhone,
      whatsapp,
      socialLink,
      photoUrl,
      coverUrl,
      joiningDate,
      newPassword,
      expectedVersion,
    } = req.body || {};

    if (
      expectedVersion !== undefined &&
      (existing.version ?? 1) !== Number(expectedVersion)
    ) {
      res.status(409).json({
        conflict: true,
        error: 'Your profile was updated elsewhere while you were editing. Reload the latest version before saving.',
      });
      return;
    }

    let nextUserId = existing.userId;
    if (typeof userId === 'string' && userId.trim() && userId.trim() !== existing.userId) {
      if (existing.role !== 'admin') {
        res.status(403).json({ error: 'Only administrators can change their own login User ID.' });
        return;
      }
      const cleanNextId = userId.trim();
      const collision = db.users.some(
        (u) => u.id !== existing.id && u.userId.toLowerCase() === cleanNextId.toLowerCase()
      );
      if (collision) {
        res.status(409).json({ error: 'Another account already uses this User ID.' });
        return;
      }
      nextUserId = cleanNextId;
    }

    let nextPasswordHash = existing.passwordHash;
    if (typeof newPassword === 'string' && newPassword.trim().length > 0) {
      const pwErr = validateStrongPassword(newPassword, 'New password');
      if (pwErr) {
        res.status(400).json({ error: pwErr });
        return;
      }
      nextPasswordHash = hashPassword(newPassword.trim());
    }

    const updated: StoredUser = {
      ...existing,
      userId: nextUserId,
      version: (existing.version ?? 1) + 1,
      name: typeof name === 'string' && name.trim() ? name.trim() : existing.name,
      designation:
        typeof designation === 'string' && designation.trim()
          ? designation.trim()
          : existing.designation,
      phone: typeof phone === 'string' ? phone.trim() : existing.phone,
      personalPhone:
        typeof personalPhone === 'string' ? personalPhone.trim() : existing.personalPhone || '',
      whatsapp: typeof whatsapp === 'string' ? whatsapp.trim() : existing.whatsapp,
      socialLink: typeof socialLink === 'string' ? socialLink.trim() : existing.socialLink,
      photoUrl: typeof photoUrl === 'string' && photoUrl.trim() ? photoUrl.trim() : existing.photoUrl,
      coverUrl: typeof coverUrl === 'string' && coverUrl.trim() ? coverUrl.trim() : existing.coverUrl,
      joiningDate:
        typeof joiningDate === 'string' ? joiningDate.trim() : existing.joiningDate || '',
      passwordHash: nextPasswordHash,
    };

    db.users[idx] = updated;
    await saveDb(db);
    res.json({ user: toPublicUser(updated) });
  });

  // Role-scoped Dashboard Fetch
  app.get('/api/dashboard', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const isAdmin = current.role === 'admin';
    const isAccounts = current.role === 'accounts';
    const canViewAllClients =
      isAdmin ||
      Boolean(current.permissions?.includes('view_all_clients') ||
        current.permissions?.includes('sub_admin_view_only') ||
        current.permissions?.includes('sub_admin'));

    const activeClients = db.clients.filter((c) => !c.deletedAt);
    const activeMeetings = db.meetings.filter((m) => !m.deletedAt);
    const activeMedicals = db.medicals.filter((m) => !m.deletedAt);
    const activeInterviews = db.interviews.filter((i) => !i.deletedAt);
    const allLedger = db.ledgerEntries || [];
    const activeLedger = allLedger.filter((l) => !l.deletedAt);
    const allAttendance = db.attendanceRecords || [];
    const activeAttendance = allAttendance.filter((a) => !a.deletedAt);
    const allDailyLogs = db.dailyLogs || [];
    const activeDailyLogs = allDailyLogs.filter((l) => !l.deletedAt);

    const userNameById = new Map<string, string>();
    db.users.forEach((u) => userNameById.set(u.id, u.name));

    const visibleClientsForDaily = canViewAllClients
      ? activeClients
      : activeClients.filter((c) => c.staffId === current.id);

    const dailyClientSummaries: DailyClientSummary[] = visibleClientsForDaily.map((c) => ({
      clientId: c.id,
      staffId: c.staffId,
      staffName: userNameById.get(c.staffId) || 'Unassigned',
      clientName: c.name,
      phone: c.phone,
      trade: c.trade,
      destinationCountry: c.destinationCountry,
      status: c.status,
      createdDate: toDhakaDateStr(c.createdAt),
      createdAt: c.createdAt,
    }));

    const payload: DashboardData = {
      user: toPublicUser(current),
      staffList: db.users.filter((u) => u.role === 'staff').map(toPublicUser),
      accountsList: db.users.filter((u) => u.role === 'accounts').map(toPublicUser),
      teamProfiles: db.users.map(toPublicUser),
      clients: visibleClientsForDaily,
      meetings: isAdmin
        ? activeMeetings
        : current.role === 'staff'
        ? activeMeetings.filter((m) => m.staffId === current.id)
        : [],
      medicals: isAdmin
        ? activeMedicals
        : current.role === 'staff'
        ? activeMedicals.filter((m) => m.staffId === current.id)
        : [],
      interviews: isAdmin
        ? activeInterviews
        : current.role === 'staff'
        ? activeInterviews.filter((i) => i.staffId === current.id)
        : [],
      ledgerEntries: isAdmin || isAccounts ? activeLedger : [],
      attendanceRecords: activeAttendance,
      dailyLogs:
        isAdmin || isAccounts
          ? activeDailyLogs
          : activeDailyLogs.filter((l) => l.staffId === current.id),
      dailyClientSummaries,
      archivedClients: canViewAllClients ? db.clients.filter((c) => Boolean(c.deletedAt)) : [],
      archivedMeetings: isAdmin ? db.meetings.filter((m) => Boolean(m.deletedAt)) : [],
      archivedMedicals: isAdmin ? db.medicals.filter((m) => Boolean(m.deletedAt)) : [],
      archivedInterviews: isAdmin ? db.interviews.filter((i) => Boolean(i.deletedAt)) : [],
      archivedLedgerEntries: isAdmin ? allLedger.filter((l) => Boolean(l.deletedAt)) : [],
      archivedDailyLogs: isAdmin ? allDailyLogs.filter((l) => Boolean(l.deletedAt)) : [],
      auditLogs: isAdmin ? (db.auditLogs || []).slice(0, 100) : [],
    };

    res.json(payload);
  });

  // Admin: Create Staff or Accounts Account
  app.post('/api/staff', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const {
      userId,
      password,
      name,
      role,
      designation,
      phone,
      personalPhone,
      whatsapp,
      socialLink,
      photoUrl,
      coverUrl,
      joiningDate,
    } = req.body || {};

    const cleanUserId = String(userId || '').trim();
    const cleanPass = String(password || '').trim();
    const cleanName = String(name || '').trim();
    const targetRole: 'staff' | 'accounts' = role === 'accounts' ? 'accounts' : 'staff';

    if (!cleanUserId || !cleanPass || !cleanName) {
      res.status(400).json({ error: 'Name, User ID, and Password are required.' });
      return;
    }
    const pwErr = validateStrongPassword(cleanPass, 'Password');
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    if (db.users.some((u) => u.userId.toLowerCase() === cleanUserId.toLowerCase())) {
      res.status(409).json({ error: 'A user with this User ID already exists.' });
      return;
    }

    const defaultDesig =
      targetRole === 'accounts' ? 'Accounts & Finance Officer' : 'Visa & Recruitment Coordinator';

    const newStaff: StoredUser = {
      id: generateId(targetRole === 'accounts' ? 'usr_acc' : 'usr_staff'),
      userId: cleanUserId,
      role: targetRole,
      name: cleanName,
      designation: String(designation || defaultDesig).trim(),
      phone: String(phone || '').trim(),
      personalPhone: String(personalPhone || '').trim(),
      whatsapp: String(whatsapp || phone || '').trim(),
      socialLink: String(socialLink || '').trim(),
      photoUrl: String(photoUrl || '/src/assets/images/staff_avatar_default_1794656907853.jpg').trim(),
      coverUrl: String(coverUrl || '/src/assets/images/hero_mobility_agency_1794656908413.jpg').trim(),
      joiningDate: String(joiningDate || '').trim(),
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(cleanPass),
    };

    db.users.push(newStaff);
    await saveDb(db);
    res.status(201).json({ staff: toPublicUser(newStaff) });
  });

  // Admin: Edit Staff or Accounts Account
  app.put('/api/staff/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const idx = db.users.findIndex(
      (u) => u.id === req.params.id && (u.role === 'staff' || u.role === 'accounts')
    );
    if (idx === -1) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const existing = db.users[idx];
    const {
      userId,
      password,
      name,
      designation,
      phone,
      personalPhone,
      whatsapp,
      socialLink,
      photoUrl,
      coverUrl,
      joiningDate,
    } = req.body || {};

    if (typeof userId === 'string' && userId.trim()) {
      const nextId = userId.trim();
      const collision = db.users.some(
        (u) => u.id !== existing.id && u.userId.toLowerCase() === nextId.toLowerCase()
      );
      if (collision) {
        res.status(409).json({ error: 'Another account already uses this User ID.' });
        return;
      }
      existing.userId = nextId;
    }

    let nextPasswordHash = existing.passwordHash;
    if (typeof password === 'string' && password.trim().length > 0) {
      const pwErr = validateStrongPassword(password, 'New password');
      if (pwErr) {
        res.status(400).json({ error: pwErr });
        return;
      }
      nextPasswordHash = hashPassword(password.trim());
    }

    const updated: StoredUser = {
      ...existing,
      name: typeof name === 'string' && name.trim() ? name.trim() : existing.name,
      designation:
        typeof designation === 'string' && designation.trim()
          ? designation.trim()
          : existing.designation,
      phone: typeof phone === 'string' ? phone.trim() : existing.phone,
      personalPhone:
        typeof personalPhone === 'string' ? personalPhone.trim() : existing.personalPhone || '',
      whatsapp: typeof whatsapp === 'string' ? whatsapp.trim() : existing.whatsapp,
      socialLink: typeof socialLink === 'string' ? socialLink.trim() : existing.socialLink,
      photoUrl: typeof photoUrl === 'string' && photoUrl.trim() ? photoUrl.trim() : existing.photoUrl,
      coverUrl: typeof coverUrl === 'string' && coverUrl.trim() ? coverUrl.trim() : existing.coverUrl,
      joiningDate:
        typeof joiningDate === 'string' ? joiningDate.trim() : existing.joiningDate || '',
      passwordHash: nextPasswordHash,
    };

    db.users[idx] = updated;
    await saveDb(db);
    res.json({ staff: toPublicUser(updated) });
  });

  // Admin: Delete Staff or Accounts Account
  app.delete('/api/staff/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const target = db.users.find(
      (u) => u.id === req.params.id && (u.role === 'staff' || u.role === 'accounts')
    );
    if (!target) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    db.users = db.users.filter((u) => u.id !== target.id);
    // Reassign orphaned records to admin so historical records remain visible in Admin Dashboard
    const adminUser = db.users.find((u) => u.role === 'admin');
    if (adminUser) {
      db.clients = db.clients.map((c) => (c.staffId === target.id ? { ...c, staffId: adminUser.id } : c));
      db.meetings = db.meetings.map((m) => (m.staffId === target.id ? { ...m, staffId: adminUser.id } : m));
      db.medicals = db.medicals.map((m) => (m.staffId === target.id ? { ...m, staffId: adminUser.id } : m));
      db.interviews = db.interviews.map((i) =>
        i.staffId === target.id ? { ...i, staffId: adminUser.id } : i
      );
      if (db.ledgerEntries) {
        db.ledgerEntries = db.ledgerEntries.map((l) =>
          l.accountOwnerId === target.id ? { ...l, accountOwnerId: adminUser.id } : l
        );
      }
      if (db.attendanceRecords) {
        db.attendanceRecords = db.attendanceRecords.map((a) =>
          a.staffId === target.id ? { ...a, staffId: adminUser.id } : a
        );
      }
      if (db.dailyLogs) {
        db.dailyLogs = db.dailyLogs.map((l) =>
          l.staffId === target.id ? { ...l, staffId: adminUser.id } : l
        );
      }
    }

    await saveDb(db);
    res.json({ ok: true });
  });

  // Restore Soft-Deleted Record (Admin)
  app.post('/api/restore', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const rawTable = typeof req.body?.table === 'string' ? req.body.table : '';
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    const tableMap = {
      clients: db.clients,
      meetings: db.meetings,
      medicals: db.medicals,
      interviews: db.interviews,
      account_ledger: db.ledgerEntries || [],
      staff_attendance: db.attendanceRecords || [],
      staff_daily_logs: db.dailyLogs || [],
    } as const;
    if (!id || !(rawTable in tableMap)) {
      res.status(400).json({ error: 'Valid table and record id required.' });
      return;
    }
    const tableName = rawTable as keyof typeof tableMap;
    const list = tableMap[tableName] as Array<{
      id: string;
      deletedAt?: string | null;
      deletedBy?: string | null;
      version?: number;
    }>;
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Archived record not found.' });
      return;
    }
    list[idx] = {
      ...list[idx],
      deletedAt: null,
      deletedBy: null,
      version: (list[idx].version ?? 1) + 1,
    };
    appendAudit(db, rawTable, id, 'RESTORE', current, { restored: { old: 'archived', new: 'active' } });
    await saveDb(db);
    res.json({ ok: true });
  });

  // Clients CRUD
  app.post('/api/clients', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};

    if (body.clientRequestId) {
      const existingByReq = db.clients.find((c) => c.clientRequestId === body.clientRequestId);
      if (existingByReq) {
        res.status(200).json({ client: existingByReq });
        return;
      }
    }

    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    if (!name || !phone) {
      res.status(400).json({ error: 'Client name and phone number are required.' });
      return;
    }

    const assignedStaffId =
      current.role === 'admin' && typeof body.staffId === 'string' && body.staffId
        ? body.staffId
        : current.id;

    const now = new Date().toISOString();
    const payments = Array.isArray(body.payments) ? body.payments : [];
    const computedPaidFromEntries = payments.reduce(
      (sum: number, p: { amount?: number }) => sum + (Number(p?.amount) || 0),
      0
    );
    const totalPaid =
      payments.length > 0 ? computedPaidFromEntries : Number(body.totalPaid) || 0;

    const client: ClientProfile = {
      id: generateId('cli'),
      staffId: assignedStaffId,
      name,
      phone,
      address: String(body.address || '').trim(),
      passportNumber: String(body.passportNumber || '').trim(),
      trade: String(body.trade || '').trim(),
      destinationCountry: String(body.destinationCountry || '').trim(),
      expectedSalary: String(body.expectedSalary || '').trim(),
      status: body.status || 'Document Collection',
      medicalDone: Boolean(body.medicalDone),
      medicalStatus: body.medicalStatus || (body.medicalDone ? 'Fit' : 'Not Started'),
      medicalCenter: String(body.medicalCenter || '').trim(),
      medicalLocation: String(body.medicalLocation || '').trim(),
      totalPayable: Number(body.totalPayable) || 0,
      totalPaid,
      pendingItems: String(body.pendingItems || '').trim(),
      documents: Array.isArray(body.documents) ? body.documents : [],
      payments,
      notes: String(body.notes || '').trim(),
      version: 1,
      clientRequestId: body.clientRequestId || undefined,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    db.clients.unshift(client);
    appendAudit(db, 'clients', client.id, 'INSERT', current, {
      name: { new: client.name },
    });
    await saveDb(db);
    res.status(201).json({ client });
  });

  app.put('/api/clients/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const idx = db.clients.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    const existing = db.clients[idx];
    if (current.role !== 'admin' && existing.staffId !== current.id) {
      res.status(403).json({ error: 'You can only edit your own clients.' });
      return;
    }

    const body = req.body || {};
    if (
      body.expectedVersion !== undefined &&
      (existing.version ?? 1) !== Number(body.expectedVersion)
    ) {
      res.status(409).json({
        conflict: true,
        error:
          'Conflict detected: this client profile was modified by another user. Close and reopen the record to load the latest version.',
      });
      return;
    }

    const payments = Array.isArray(body.payments) ? body.payments : existing.payments;
    const computedPaid = payments.reduce(
      (sum: number, p: { amount?: number }) => sum + (Number(p?.amount) || 0),
      0
    );
    const totalPaid =
      payments.length > 0
        ? computedPaid
        : body.totalPaid !== undefined
        ? Number(body.totalPaid) || 0
        : existing.totalPaid;

    const updated: ClientProfile = {
      ...existing,
      version: (existing.version ?? 1) + 1,
      staffId:
        current.role === 'admin' && typeof body.staffId === 'string' && body.staffId
          ? body.staffId
          : existing.staffId,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name,
      phone: typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : existing.phone,
      address: typeof body.address === 'string' ? body.address.trim() : existing.address,
      passportNumber:
        typeof body.passportNumber === 'string'
          ? body.passportNumber.trim()
          : existing.passportNumber,
      trade: typeof body.trade === 'string' ? body.trade.trim() : existing.trade,
      destinationCountry:
        typeof body.destinationCountry === 'string'
          ? body.destinationCountry.trim()
          : existing.destinationCountry,
      expectedSalary:
        typeof body.expectedSalary === 'string'
          ? body.expectedSalary.trim()
          : existing.expectedSalary,
      status: body.status || existing.status,
      medicalDone: body.medicalDone !== undefined ? Boolean(body.medicalDone) : existing.medicalDone,
      medicalStatus: body.medicalStatus || existing.medicalStatus,
      medicalCenter:
        typeof body.medicalCenter === 'string' ? body.medicalCenter.trim() : existing.medicalCenter,
      medicalLocation:
        typeof body.medicalLocation === 'string'
          ? body.medicalLocation.trim()
          : existing.medicalLocation,
      totalPayable:
        body.totalPayable !== undefined ? Number(body.totalPayable) || 0 : existing.totalPayable,
      totalPaid,
      pendingItems:
        typeof body.pendingItems === 'string' ? body.pendingItems.trim() : existing.pendingItems,
      documents: Array.isArray(body.documents) ? body.documents : existing.documents,
      payments,
      notes: typeof body.notes === 'string' ? body.notes.trim() : existing.notes,
      updatedAt: new Date().toISOString(),
    };

    const diff: Record<string, { old?: unknown; new?: unknown; changed?: boolean }> = {};
    if (existing.status !== updated.status) diff.status = { old: existing.status, new: updated.status };
    if (existing.totalPaid !== updated.totalPaid) diff.total_paid = { old: existing.totalPaid, new: updated.totalPaid };
    if (existing.passportNumber !== updated.passportNumber) diff.passport_number = { changed: true };
    if (Object.keys(diff).length === 0) diff.profile = { changed: true };

    db.clients[idx] = updated;
    appendAudit(db, 'clients', updated.id, 'UPDATE', current, diff);
    await saveDb(db);
    res.json({ client: updated });
  });

  app.delete('/api/clients/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const idx = db.clients.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    const target = db.clients[idx];
    if (current.role !== 'admin' && target.staffId !== current.id) {
      res.status(403).json({ error: 'You can only delete your own clients.' });
      return;
    }

    db.clients[idx] = {
      ...target,
      deletedAt: new Date().toISOString(),
      deletedBy: current.id,
      version: (target.version ?? 1) + 1,
    };
    appendAudit(db, 'clients', target.id, 'SOFT_DELETE', current, { name: { old: target.name, new: 'archived' } });
    await saveDb(db);
    res.json({ ok: true });
  });

  // Meetings CRUD
  app.post('/api/meetings', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};

    if (body.clientRequestId) {
      const existingByReq = db.meetings.find((m) => m.clientRequestId === body.clientRequestId);
      if (existingByReq) {
        res.status(200).json({ meeting: existingByReq });
        return;
      }
    }

    if (!body.clientName || !body.meetingWith || !body.location || !body.dateTime) {
      res.status(400).json({ error: 'Client, meeting partner, location, and date/time are required.' });
      return;
    }

    const meeting: MeetingRecord = {
      id: generateId('mtg'),
      staffId:
        current.role === 'admin' && typeof body.staffId === 'string' && body.staffId
          ? body.staffId
          : current.id,
      clientId: body.clientId || undefined,
      clientName: String(body.clientName).trim(),
      clientPhone: String(body.clientPhone || '').trim(),
      meetingWith: String(body.meetingWith).trim(),
      location: String(body.location).trim(),
      dateTime: String(body.dateTime).trim(),
      purpose: String(body.purpose || '').trim(),
      status: body.status || 'Scheduled',
      notes: String(body.notes || '').trim(),
      version: 1,
      clientRequestId: body.clientRequestId || undefined,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    db.meetings.unshift(meeting);
    appendAudit(db, 'meetings', meeting.id, 'INSERT', current, { client_name: { new: meeting.clientName } });
    await saveDb(db);
    res.status(201).json({ meeting });
  });

  app.put('/api/meetings/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const idx = db.meetings.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Meeting not found.' });
      return;
    }

    const existing = db.meetings[idx];
    if (current.role !== 'admin' && existing.staffId !== current.id) {
      res.status(403).json({ error: 'You can only edit your own meetings.' });
      return;
    }

    const body = req.body || {};
    if (
      body.expectedVersion !== undefined &&
      (existing.version ?? 1) !== Number(body.expectedVersion)
    ) {
      res.status(409).json({
        conflict: true,
        error: 'Conflict detected: this meeting was modified by another user. Reload the latest record before saving.',
      });
      return;
    }

    const updated: MeetingRecord = {
      ...existing,
      version: (existing.version ?? 1) + 1,
      staffId:
        current.role === 'admin' && typeof body.staffId === 'string' && body.staffId
          ? body.staffId
          : existing.staffId,
      clientId: body.clientId !== undefined ? body.clientId || undefined : existing.clientId,
      clientName:
        typeof body.clientName === 'string' ? body.clientName.trim() : existing.clientName,
      clientPhone:
        typeof body.clientPhone === 'string' ? body.clientPhone.trim() : existing.clientPhone,
      meetingWith:
        typeof body.meetingWith === 'string' ? body.meetingWith.trim() : existing.meetingWith,
      location: typeof body.location === 'string' ? body.location.trim() : existing.location,
      dateTime: typeof body.dateTime === 'string' ? body.dateTime.trim() : existing.dateTime,
      purpose: typeof body.purpose === 'string' ? body.purpose.trim() : existing.purpose,
      status: body.status || existing.status,
      notes: typeof body.notes === 'string' ? body.notes.trim() : existing.notes,
    };

    db.meetings[idx] = updated;
    appendAudit(db, 'meetings', updated.id, 'UPDATE', current, { status: { old: existing.status, new: updated.status } });
    await saveDb(db);
    res.json({ meeting: updated });
  });

  app.delete('/api/meetings/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const idx = db.meetings.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Meeting not found.' });
      return;
    }
    const target = db.meetings[idx];
    if (current.role !== 'admin' && target.staffId !== current.id) {
      res.status(403).json({ error: 'You can only delete your own meetings.' });
      return;
    }

    db.meetings[idx] = {
      ...target,
      deletedAt: new Date().toISOString(),
      deletedBy: current.id,
      version: (target.version ?? 1) + 1,
    };
    appendAudit(db, 'meetings', target.id, 'SOFT_DELETE', current, { client_name: { old: target.clientName, new: 'archived' } });
    await saveDb(db);
    res.json({ ok: true });
  });

  // Medicals CRUD
  app.post('/api/medicals', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};

    if (body.clientRequestId) {
      const existingByReq = db.medicals.find((m) => m.clientRequestId === body.clientRequestId);
      if (existingByReq) {
        res.status(200).json({ medical: existingByReq });
        return;
      }
    }

    if (!body.candidateName || !body.medicalCenter || !body.medicalLocation) {
      res
        .status(400)
        .json({ error: 'Candidate name, medical center, and medical location are required.' });
      return;
    }

    const medical: MedicalRecord = {
      id: generateId('med'),
      staffId:
        current.role === 'admin' && typeof body.staffId === 'string' && body.staffId
          ? body.staffId
          : current.id,
      clientId: body.clientId || undefined,
      candidateName: String(body.candidateName).trim(),
      candidatePhone: String(body.candidatePhone || '').trim(),
      medicalCenter: String(body.medicalCenter).trim(),
      medicalLocation: String(body.medicalLocation).trim(),
      testDate: String(body.testDate || new Date().toISOString().slice(0, 10)).trim(),
      result: body.result || 'Pending',
      amountPaid: Number(body.amountPaid) || 0,
      amountReceivable: Number(body.amountReceivable) || 0,
      paymentPurpose: String(body.paymentPurpose || '').trim(),
      notes: String(body.notes || '').trim(),
      version: 1,
      clientRequestId: body.clientRequestId || undefined,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    db.medicals.unshift(medical);
    appendAudit(db, 'medicals', medical.id, 'INSERT', current, { candidate_name: { new: medical.candidateName } });
    await saveDb(db);
    res.status(201).json({ medical });
  });

  app.put('/api/medicals/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const idx = db.medicals.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Medical record not found.' });
      return;
    }

    const existing = db.medicals[idx];
    if (current.role !== 'admin' && existing.staffId !== current.id) {
      res.status(403).json({ error: 'You can only edit your own medical records.' });
      return;
    }

    const body = req.body || {};
    if (
      body.expectedVersion !== undefined &&
      (existing.version ?? 1) !== Number(body.expectedVersion)
    ) {
      res.status(409).json({
        conflict: true,
        error: 'Conflict detected: this medical record was modified by another user. Reload the latest record before saving.',
      });
      return;
    }

    const updated: MedicalRecord = {
      ...existing,
      version: (existing.version ?? 1) + 1,
      staffId:
        current.role === 'admin' && typeof body.staffId === 'string' && body.staffId
          ? body.staffId
          : existing.staffId,
      clientId: body.clientId !== undefined ? body.clientId || undefined : existing.clientId,
      candidateName:
        typeof body.candidateName === 'string' ? body.candidateName.trim() : existing.candidateName,
      candidatePhone:
        typeof body.candidatePhone === 'string'
          ? body.candidatePhone.trim()
          : existing.candidatePhone,
      medicalCenter:
        typeof body.medicalCenter === 'string' ? body.medicalCenter.trim() : existing.medicalCenter,
      medicalLocation:
        typeof body.medicalLocation === 'string'
          ? body.medicalLocation.trim()
          : existing.medicalLocation,
      testDate: typeof body.testDate === 'string' ? body.testDate.trim() : existing.testDate,
      result: body.result || existing.result,
      amountPaid:
        body.amountPaid !== undefined ? Number(body.amountPaid) || 0 : existing.amountPaid,
      amountReceivable:
        body.amountReceivable !== undefined
          ? Number(body.amountReceivable) || 0
          : existing.amountReceivable,
      paymentPurpose:
        typeof body.paymentPurpose === 'string'
          ? body.paymentPurpose.trim()
          : existing.paymentPurpose,
      notes: typeof body.notes === 'string' ? body.notes.trim() : existing.notes,
    };

    db.medicals[idx] = updated;
    appendAudit(db, 'medicals', updated.id, 'UPDATE', current, { result: { old: existing.result, new: updated.result } });
    await saveDb(db);
    res.json({ medical: updated });
  });

  app.delete('/api/medicals/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const idx = db.medicals.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Medical record not found.' });
      return;
    }
    const target = db.medicals[idx];
    if (current.role !== 'admin' && target.staffId !== current.id) {
      res.status(403).json({ error: 'You can only delete your own medical records.' });
      return;
    }

    db.medicals[idx] = {
      ...target,
      deletedAt: new Date().toISOString(),
      deletedBy: current.id,
      version: (target.version ?? 1) + 1,
    };
    appendAudit(db, 'medicals', target.id, 'SOFT_DELETE', current, { candidate_name: { old: target.candidateName, new: 'archived' } });
    await saveDb(db);
    res.json({ ok: true });
  });

  // Interviews CRUD
  app.post('/api/interviews', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};

    if (body.clientRequestId) {
      const existingByReq = db.interviews.find((i) => i.clientRequestId === body.clientRequestId);
      if (existingByReq) {
        res.status(200).json({ interview: existingByReq });
        return;
      }
    }

    if (!body.candidateNames || !body.interviewerOrCompany || !body.interviewDate || !body.location) {
      res.status(400).json({
        error: 'Candidate name(s), interviewer/company, date, and location are required.',
      });
      return;
    }

    const interview: InterviewRecord = {
      id: generateId('int'),
      staffId:
        current.role === 'admin' && typeof body.staffId === 'string' && body.staffId
          ? body.staffId
          : current.id,
      clientId: body.clientId || undefined,
      candidateNames: String(body.candidateNames).trim(),
      clientCount: Math.max(1, Number(body.clientCount) || 1),
      interviewerOrCompany: String(body.interviewerOrCompany).trim(),
      trade: String(body.trade || '').trim(),
      interviewDate: String(body.interviewDate).trim(),
      interviewTime: String(body.interviewTime || '').trim(),
      location: String(body.location).trim(),
      status: body.status || 'Upcoming',
      notes: String(body.notes || '').trim(),
      version: 1,
      clientRequestId: body.clientRequestId || undefined,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    db.interviews.unshift(interview);
    appendAudit(db, 'interviews', interview.id, 'INSERT', current, { candidate_names: { new: interview.candidateNames } });
    await saveDb(db);
    res.status(201).json({ interview });
  });

  app.put('/api/interviews/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const idx = db.interviews.findIndex((i) => i.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Interview record not found.' });
      return;
    }

    const existing = db.interviews[idx];
    if (current.role !== 'admin' && existing.staffId !== current.id) {
      res.status(403).json({ error: 'You can only edit your own interview records.' });
      return;
    }

    const body = req.body || {};
    if (
      body.expectedVersion !== undefined &&
      (existing.version ?? 1) !== Number(body.expectedVersion)
    ) {
      res.status(409).json({
        conflict: true,
        error: 'Conflict detected: this interview record was modified by another user. Reload the latest record before saving.',
      });
      return;
    }

    const updated: InterviewRecord = {
      ...existing,
      version: (existing.version ?? 1) + 1,
      staffId:
        current.role === 'admin' && typeof body.staffId === 'string' && body.staffId
          ? body.staffId
          : existing.staffId,
      clientId: body.clientId !== undefined ? body.clientId || undefined : existing.clientId,
      candidateNames:
        typeof body.candidateNames === 'string'
          ? body.candidateNames.trim()
          : existing.candidateNames,
      clientCount:
        body.clientCount !== undefined ? Math.max(1, Number(body.clientCount) || 1) : existing.clientCount,
      interviewerOrCompany:
        typeof body.interviewerOrCompany === 'string'
          ? body.interviewerOrCompany.trim()
          : existing.interviewerOrCompany,
      trade: typeof body.trade === 'string' ? body.trade.trim() : existing.trade,
      interviewDate:
        typeof body.interviewDate === 'string' ? body.interviewDate.trim() : existing.interviewDate,
      interviewTime:
        typeof body.interviewTime === 'string' ? body.interviewTime.trim() : existing.interviewTime,
      location: typeof body.location === 'string' ? body.location.trim() : existing.location,
      status: body.status || existing.status,
      notes: typeof body.notes === 'string' ? body.notes.trim() : existing.notes,
    };

    db.interviews[idx] = updated;
    appendAudit(db, 'interviews', updated.id, 'UPDATE', current, { status: { old: existing.status, new: updated.status } });
    await saveDb(db);
    res.json({ interview: updated });
  });

  app.delete('/api/interviews/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const idx = db.interviews.findIndex((i) => i.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Interview record not found.' });
      return;
    }
    const target = db.interviews[idx];
    if (current.role !== 'admin' && target.staffId !== current.id) {
      res.status(403).json({ error: 'You can only delete your own interview records.' });
      return;
    }

    db.interviews[idx] = {
      ...target,
      deletedAt: new Date().toISOString(),
      deletedBy: current.id,
      version: (target.version ?? 1) + 1,
    };
    appendAudit(db, 'interviews', target.id, 'SOFT_DELETE', current, { candidate_names: { old: target.candidateNames, new: 'archived' } });
    await saveDb(db);
    res.json({ ok: true });
  });

  // Account Ledger (Debit / Credit) — Accounts & Admin can create; Admin can edit & remove
  app.post('/api/ledger', requireAuth, requireAdminOrAccounts, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};
    if (!db.ledgerEntries) db.ledgerEntries = [];

    if (body.clientRequestId) {
      const existingByReq = db.ledgerEntries.find((l) => l.clientRequestId === body.clientRequestId);
      if (existingByReq) {
        res.status(200).json({ entry: existingByReq });
        return;
      }
    }

    const entryType = body.entryType === 'debit' ? 'debit' : body.entryType === 'credit' ? 'credit' : null;
    const amount = Number(body.amount);
    const title = String(body.title || '').trim();
    const entryDate = String(body.entryDate || new Date().toISOString().slice(0, 10)).trim();

    if (!entryType || !Number.isFinite(amount) || amount <= 0 || !title) {
      res.status(400).json({ error: 'Type (Credit/Debit), positive amount, and title are required.' });
      return;
    }

    const now = new Date().toISOString();
    const entry: AccountLedgerEntry = {
      id: generateId('ldg'),
      accountOwnerId: current.id,
      entryType,
      amount,
      title,
      category: String(body.category || 'General').trim(),
      partyName: String(body.partyName || '').trim(),
      referenceNo: String(body.referenceNo || '').trim(),
      entryDate,
      paymentMethod: String(body.paymentMethod || 'Cash').trim(),
      notes: String(body.notes || '').trim(),
      createdByName: current.name,
      version: 1,
      clientRequestId: body.clientRequestId || undefined,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    db.ledgerEntries.unshift(entry);
    appendAudit(db, 'account_ledger', entry.id, 'INSERT', current, {
      title: { new: `${entry.entryType.toUpperCase()} ৳${entry.amount} — ${entry.title}` },
    });
    await saveDb(db);
    res.status(201).json({ entry });
  });

  app.put('/api/ledger/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    if (!db.ledgerEntries) db.ledgerEntries = [];
    const idx = db.ledgerEntries.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Ledger entry not found.' });
      return;
    }

    const existing = db.ledgerEntries[idx];
    const body = req.body || {};
    if (
      body.expectedVersion !== undefined &&
      (existing.version ?? 1) !== Number(body.expectedVersion)
    ) {
      res.status(409).json({
        conflict: true,
        error: 'Conflict detected: this ledger entry was modified elsewhere. Reload before saving.',
      });
      return;
    }

    const nextAmount = body.amount !== undefined ? Number(body.amount) : existing.amount;
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      res.status(400).json({ error: 'Amount must be greater than zero.' });
      return;
    }

    const updated: AccountLedgerEntry = {
      ...existing,
      version: (existing.version ?? 1) + 1,
      entryType: body.entryType === 'debit' || body.entryType === 'credit' ? body.entryType : existing.entryType,
      amount: nextAmount,
      title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : existing.title,
      category: typeof body.category === 'string' ? body.category.trim() : existing.category,
      partyName: typeof body.partyName === 'string' ? body.partyName.trim() : existing.partyName,
      referenceNo: typeof body.referenceNo === 'string' ? body.referenceNo.trim() : existing.referenceNo,
      entryDate: typeof body.entryDate === 'string' ? body.entryDate.trim() : existing.entryDate,
      paymentMethod: typeof body.paymentMethod === 'string' ? body.paymentMethod.trim() : existing.paymentMethod,
      notes: typeof body.notes === 'string' ? body.notes.trim() : existing.notes,
      updatedAt: new Date().toISOString(),
    };

    db.ledgerEntries[idx] = updated;
    appendAudit(db, 'account_ledger', updated.id, 'UPDATE', current, {
      amount: { old: existing.amount, new: updated.amount },
      entry_type: { old: existing.entryType, new: updated.entryType },
    });
    await saveDb(db);
    res.json({ entry: updated });
  });

  app.delete('/api/ledger/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    if (!db.ledgerEntries) db.ledgerEntries = [];
    const idx = db.ledgerEntries.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Ledger entry not found.' });
      return;
    }

    const target = db.ledgerEntries[idx];
    db.ledgerEntries[idx] = {
      ...target,
      deletedAt: new Date().toISOString(),
      deletedBy: current.id,
      version: (target.version ?? 1) + 1,
    };
    appendAudit(db, 'account_ledger', target.id, 'SOFT_DELETE', current, {
      title: { old: target.title, new: 'archived' },
    });
    await saveDb(db);
    res.json({ ok: true });
  });

  // Daily Attendance (Staff & Accounts mark own attendance; Admin manages all)
  app.post('/api/attendance', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};
    if (!db.attendanceRecords) db.attendanceRecords = [];

    if (body.clientRequestId) {
      const existingByReq = db.attendanceRecords.find(
        (a) => a.clientRequestId === body.clientRequestId
      );
      if (existingByReq) {
        res.status(200).json({ attendance: existingByReq });
        return;
      }
    }

    const targetStaffId =
      current.role === 'admin' && typeof body.staffId === 'string' && body.staffId.trim()
        ? body.staffId.trim()
        : current.id;
    const targetUser = db.users.find((u) => u.id === targetStaffId) || current;
    const attendanceDate = String(body.attendanceDate || toDhakaDateStr()).trim();
    const status = body.status || 'Present';
    const checkInTime = String(body.checkInTime || '').trim();
    const checkOutTime = String(body.checkOutTime || '').trim();
    const workLocation = String(body.workLocation || 'Office').trim();
    const notes = String(body.notes || '').trim();
    const now = new Date().toISOString();

    const existingIdx = db.attendanceRecords.findIndex(
      (a) => !a.deletedAt && a.staffId === targetStaffId && a.attendanceDate === attendanceDate
    );

    if (existingIdx !== -1) {
      res.status(403).json({
        error: 'Attendance for this date is already recorded and cannot be edited.',
      });
      return;
    }

    const record: StaffAttendanceRecord = {
      id: generateId('att'),
      staffId: targetUser.id,
      staffName: targetUser.name,
      staffRole: targetUser.role,
      attendanceDate,
      status,
      checkInTime,
      checkOutTime,
      workLocation,
      notes,
      version: 1,
      clientRequestId: body.clientRequestId || undefined,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    db.attendanceRecords.unshift(record);
    appendAudit(db, 'staff_attendance', record.id, 'INSERT', current, {
      attendance_date: { new: `${record.staffName} (${record.attendanceDate} · ${record.status})` },
    });
    await saveDb(db);
    res.status(201).json({ attendance: record });
  });

  app.put('/api/attendance/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    if (!db.attendanceRecords) db.attendanceRecords = [];
    const idx = db.attendanceRecords.findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Attendance record not found.' });
      return;
    }

    const existing = db.attendanceRecords[idx];
    if (current.role !== 'admin' && existing.staffId !== current.id) {
      res.status(403).json({ error: 'You can only check out your own attendance.' });
      return;
    }

    const body = req.body || {};
    if (
      body.expectedVersion !== undefined &&
      (existing.version ?? 1) !== Number(body.expectedVersion)
    ) {
      res.status(409).json({
        conflict: true,
        error: 'Conflict detected: attendance record was updated elsewhere.',
      });
      return;
    }

    // Strict immutability: only a one-time Check-Out when checkOutTime is empty and status !== 'Leave'
    const nextCheckOut =
      typeof body.checkOutTime === 'string' ? body.checkOutTime.trim() : '';
    const touchesOtherField =
      (body.staffId !== undefined && body.staffId !== existing.staffId) ||
      (body.attendanceDate !== undefined && body.attendanceDate !== existing.attendanceDate) ||
      (body.status !== undefined && body.status !== existing.status) ||
      (body.checkInTime !== undefined && body.checkInTime !== existing.checkInTime) ||
      (body.workLocation !== undefined && body.workLocation !== existing.workLocation) ||
      (body.notes !== undefined && body.notes !== existing.notes);

    if (
      existing.status === 'Leave' ||
      Boolean(existing.checkOutTime && existing.checkOutTime.trim()) ||
      !nextCheckOut ||
      touchesOtherField
    ) {
      res.status(403).json({
        error:
          'Attendance records are locked and cannot be edited once saved. Only a one-time Check-Out is allowed when Check-Out is empty.',
      });
      return;
    }

    const updated: StaffAttendanceRecord = {
      ...existing,
      checkOutTime: nextCheckOut,
      version: (existing.version ?? 1) + 1,
      updatedAt: new Date().toISOString(),
    };

    db.attendanceRecords[idx] = updated;
    appendAudit(db, 'staff_attendance', updated.id, 'UPDATE', current, {
      check_out_time: { old: '', new: nextCheckOut },
    });
    await saveDb(db);
    res.json({ attendance: updated });
  });

  app.delete('/api/attendance/:id', requireAuth, async (_req: AuthedRequest, res) => {
    res.status(403).json({
      error: 'Attendance records are locked and cannot be deleted once recorded.',
    });
  });

  // Daily Conversation / Call Logs ("Kar sathe ki ki kotha holo")
  app.post('/api/daily-logs', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};
    if (!db.dailyLogs) db.dailyLogs = [];

    if (body.clientRequestId) {
      const existingByReq = db.dailyLogs.find((l) => l.clientRequestId === body.clientRequestId);
      if (existingByReq) {
        res.status(200).json({ log: existingByReq });
        return;
      }
    }

    const contactName = String(body.contactName || '').trim();
    const discussionSummary = String(body.discussionSummary || '').trim();
    if (!contactName || !discussionSummary) {
      res.status(400).json({ error: 'Contact person name and discussion summary are required.' });
      return;
    }

    const targetStaffId =
      current.role === 'admin' && typeof body.staffId === 'string' && body.staffId.trim()
        ? body.staffId.trim()
        : current.id;
    const targetUser = db.users.find((u) => u.id === targetStaffId) || current;
    const now = new Date().toISOString();

    const log: StaffDailyLog = {
      id: generateId('dlog'),
      staffId: targetUser.id,
      staffName: targetUser.name,
      staffRole: targetUser.role,
      clientId: body.clientId || undefined,
      logDate: String(body.logDate || toDhakaDateStr()).trim(),
      logTime: String(body.logTime || '').trim(),
      contactName,
      contactPhone: String(body.contactPhone || '').trim(),
      contactAddress: String(body.contactAddress || '').trim(),
      contactAge: body.contactAge === null || body.contactAge === undefined || body.contactAge === '' ? null : Number(body.contactAge),
      channel: body.channel || 'Phone Call',
      topic: String(body.topic || '').trim(),
      discussionSummary,
      outcome: body.outcome || 'Follow Up Needed',
      nextFollowUpDate: String(body.nextFollowUpDate || '').trim(),
      version: 1,
      clientRequestId: body.clientRequestId || undefined,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    db.dailyLogs.unshift(log);
    appendAudit(db, 'staff_daily_logs', log.id, 'INSERT', current, {
      contact_name: { new: `${log.contactName} (${log.channel})` },
    });
    await saveDb(db);
    res.status(201).json({ log });
  });

  app.put('/api/daily-logs/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    if (!db.dailyLogs) db.dailyLogs = [];
    const idx = db.dailyLogs.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Conversation log not found.' });
      return;
    }
    const existing = db.dailyLogs[idx];
    if (current.role !== 'admin' && existing.staffId !== current.id) {
      res.status(403).json({ error: 'You can only edit your own conversation logs.' });
      return;
    }

    const body = req.body || {};
    if (
      body.expectedVersion !== undefined &&
      (existing.version ?? 1) !== Number(body.expectedVersion)
    ) {
      res.status(409).json({
        conflict: true,
        error: 'Conflict detected: this conversation log was modified elsewhere.',
      });
      return;
    }

    const nextStaffId =
      current.role === 'admin' && typeof body.staffId === 'string' && body.staffId.trim()
        ? body.staffId.trim()
        : existing.staffId;
    const targetUser = db.users.find((u) => u.id === nextStaffId);

    const updated: StaffDailyLog = {
      ...existing,
      staffId: nextStaffId,
      staffName: targetUser ? targetUser.name : existing.staffName,
      staffRole: targetUser ? targetUser.role : existing.staffRole,
      clientId: body.clientId !== undefined ? body.clientId || undefined : existing.clientId,
      logDate:
        typeof body.logDate === 'string' && body.logDate.trim()
          ? body.logDate.trim()
          : existing.logDate,
      logTime: typeof body.logTime === 'string' ? body.logTime.trim() : existing.logTime,
      contactName:
        typeof body.contactName === 'string' && body.contactName.trim()
          ? body.contactName.trim()
          : existing.contactName,
      contactPhone:
        typeof body.contactPhone === 'string' ? body.contactPhone.trim() : existing.contactPhone,
      contactAddress:
        typeof body.contactAddress === 'string' ? body.contactAddress.trim() : existing.contactAddress || '',
      contactAge: body.contactAge !== undefined ? (body.contactAge === null || body.contactAge === '' ? null : Number(body.contactAge)) : existing.contactAge ?? null,
      channel: body.channel || existing.channel,
      topic: typeof body.topic === 'string' ? body.topic.trim() : existing.topic,
      discussionSummary:
        typeof body.discussionSummary === 'string' && body.discussionSummary.trim()
          ? body.discussionSummary.trim()
          : existing.discussionSummary,
      outcome: body.outcome || existing.outcome,
      nextFollowUpDate:
        typeof body.nextFollowUpDate === 'string'
          ? body.nextFollowUpDate.trim()
          : existing.nextFollowUpDate,
      version: (existing.version ?? 1) + 1,
      updatedAt: new Date().toISOString(),
    };

    db.dailyLogs[idx] = updated;
    appendAudit(db, 'staff_daily_logs', updated.id, 'UPDATE', current, {
      outcome: { old: existing.outcome, new: updated.outcome },
    });
    await saveDb(db);
    res.json({ log: updated });
  });

  app.delete('/api/daily-logs/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    if (!db.dailyLogs) db.dailyLogs = [];
    const idx = db.dailyLogs.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Conversation log not found.' });
      return;
    }
    const target = db.dailyLogs[idx];
    if (current.role !== 'admin' && target.staffId !== current.id) {
      res.status(403).json({ error: 'You can only delete your own conversation logs.' });
      return;
    }

    db.dailyLogs[idx] = {
      ...target,
      deletedAt: new Date().toISOString(),
      deletedBy: current.id,
      version: (target.version ?? 1) + 1,
    };
    appendAudit(db, 'staff_daily_logs', target.id, 'SOFT_DELETE', current, {
      contact_name: { old: target.contactName, new: 'archived' },
    });
    await saveDb(db);
    res.json({ ok: true });
  });

  // ============================================================================
  // Team Messaging (1-on-1 Direct + Office Group Chat) & Real-Time WebSockets
  // ============================================================================
  app.get('/api/messages', requireAuth, (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const directory: TeamDirectoryMember[] = db.users
      .map((u) => ({
        id: u.id,
        userId: u.userId,
        role: u.role,
        name: u.name,
        designation: u.designation || 'Team Member',
        phone: u.phone || '',
        personalPhone: u.personalPhone || '',
        whatsapp: u.whatsapp || '',
        socialLink: u.socialLink || '',
        photoUrl: u.photoUrl || '/src/assets/images/staff_avatar_default_1794656907853.jpg',
        coverUrl: u.coverUrl || '/src/assets/images/hero_mobility_agency_1794656908413.jpg',
        joiningDate: u.joiningDate || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const allMessages = db.teamMessages || [];
    const visibleMessages = allMessages
      .filter(
        (m) =>
          m.recipientId === null ||
          m.senderId === current.id ||
          m.recipientId === current.id
      )
      .slice(-500);

    res.json({ directory, messages: visibleMessages });
  });

  app.post('/api/messages', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    if (!db.teamMessages) db.teamMessages = [];

    const rawBody = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!rawBody) {
      res.status(400).json({ error: 'Message text cannot be empty.' });
      return;
    }
    if (rawBody.length > 2000) {
      res.status(400).json({ error: 'Message cannot exceed 2,000 characters.' });
      return;
    }

    const rawRecipient =
      typeof req.body?.recipientId === 'string' && req.body.recipientId.trim()
        ? req.body.recipientId.trim()
        : null;

    if (rawRecipient) {
      const targetUser = db.users.find((u) => u.id === rawRecipient);
      if (!targetUser) {
        res.status(404).json({ error: 'Recipient team member not found.' });
        return;
      }
    }

    const clientRequestId =
      typeof req.body?.clientRequestId === 'string' && req.body.clientRequestId.trim()
        ? req.body.clientRequestId.trim()
        : undefined;

    if (clientRequestId) {
      const existing = db.teamMessages.find((m) => m.clientRequestId === clientRequestId);
      if (existing) {
        res.status(200).json({ message: existing });
        return;
      }
    }

    const message: TeamMessage = {
      id: generateId('msg'),
      senderId: current.id,
      recipientId: rawRecipient,
      body: rawBody,
      readAt: null,
      clientRequestId,
      createdAt: new Date().toISOString(),
    };

    db.teamMessages.push(message);
    if (db.teamMessages.length > 2000) {
      db.teamMessages = db.teamMessages.slice(-2000);
    }

    await saveDb(db);

    broadcastWsEvent(
      rawRecipient ? [current.id, rawRecipient] : null,
      { type: 'message:created', message }
    );

    res.status(201).json({ message });
  });

  app.post('/api/messages/read', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    if (!db.teamMessages) db.teamMessages = [];

    const senderId = typeof req.body?.senderId === 'string' ? req.body.senderId.trim() : '';
    if (!senderId) {
      res.status(400).json({ error: 'senderId is required.' });
      return;
    }

    const now = new Date().toISOString();
    let updatedCount = 0;
    db.teamMessages = db.teamMessages.map((m) => {
      if (m.senderId === senderId && m.recipientId === current.id && !m.readAt) {
        updatedCount += 1;
        return { ...m, readAt: now };
      }
      return m;
    });

    if (updatedCount > 0) {
      await saveDb(db);
      broadcastWsEvent([senderId, current.id], {
        type: 'messages:read',
        senderId,
        readerId: current.id,
        readAt: now,
      });
    }

    res.json({ ok: true, readAt: now, updatedCount });
  });

  // Vite or Static Hosting
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexPath = path.join(distDir, 'index.html');
    const runtimeSupabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
    const runtimeSupabaseKey = (
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      ''
    ).trim();
    const isSecretSupabaseKey = (key: string): boolean => {
      if (!key) return false;
      if (key.startsWith('sb_secret_')) return true;
      const parts = key.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
            role?: string;
          };
          if (payload?.role === 'service_role') return true;
        } catch {
          // Non-JWT key
        }
      }
      return false;
    };
    const hasSafeRuntimeSupabase =
      Boolean(runtimeSupabaseUrl && runtimeSupabaseKey) &&
      !isSecretSupabaseKey(runtimeSupabaseKey) &&
      !runtimeSupabaseUrl.includes('your-project-id') &&
      !runtimeSupabaseKey.includes('your-supabase-publishable');

    const sendProdHtml = (_req: Request, res: Response) => {
      if (!fs.existsSync(indexPath)) {
        res.status(404).send('Build output not found.');
        return;
      }
      if (hasSafeRuntimeSupabase) {
        const html = fs.readFileSync(indexPath, 'utf-8');
        const safeConfig = JSON.stringify({
          supabaseUrl: runtimeSupabaseUrl,
          supabaseKey: runtimeSupabaseKey,
        }).replace(/</g, '\\u003c');
        res.type('html').send(
          html.replace(
            '</head>',
            `<script>window.__APP_CONFIG__=${safeConfig};</script></head>`
          )
        );
        return;
      }
      res.sendFile(indexPath);
    };

    app.get('/', sendProdHtml);
    app.use(express.static(distDir, { index: false }));
    app.get('*', sendProdHtml);
  }

  const PORT = 3000;
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || `localhost:${PORT}`;
      const url = new URL(request.url || '/', `http://${host}`);
      if (url.pathname !== '/ws') {
        return;
      }

      const token = (url.searchParams.get('token') || '').trim();
      const db = loadDb();
      const verified = token ? verifyToken(token, db.authSecret) : null;
      const user = verified ? db.users.find((u) => u.id === verified.sub) : null;

      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        registerWsClient(user.id, ws);
        ws.send(JSON.stringify({ type: 'connected', userId: user.id }));
        ws.on('message', (raw) => {
          try {
            const parsed = JSON.parse(String(raw)) as { type?: string };
            if (parsed?.type === 'ping' && ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
          } catch {
            // Ignore malformed client frames
          }
        });
      });
    } catch {
      socket.destroy();
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
