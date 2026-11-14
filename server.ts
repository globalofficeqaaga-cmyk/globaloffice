import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import type {
  ClientLookupResponse,
  ClientProfile,
  DashboardData,
  InterviewRecord,
  MedicalRecord,
  MeetingRecord,
  PublicUser,
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
  return pub;
}

function createInitialData(): DatabaseSchema {
  const now = new Date().toISOString();
  const adminId = 'usr_admin_01';
  const staff1Id = 'usr_staff_rafiq';
  const staff2Id = 'usr_staff_nusrat';

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
        whatsapp: '+8801700000000',
        socialLink: 'https://facebook.com',
        photoUrl: '/src/assets/images/staff_avatar_default_1794656907853.jpg',
        coverUrl: '/src/assets/images/hero_mobility_agency_1794656908413.jpg',
        createdAt: now,
        passwordHash: hashPassword('admin'),
      },
      {
        id: staff1Id,
        userId: 'rafiq',
        role: 'staff',
        name: 'Rafiqul Islam',
        designation: 'Senior Visa & Trade Coordinator',
        phone: '+8801711223344',
        whatsapp: '+8801711223344',
        socialLink: 'https://facebook.com/rafiq.globalpathways',
        photoUrl: '/src/assets/images/staff_avatar_default_1794656907853.jpg',
        coverUrl: '/src/assets/images/hero_mobility_agency_1794656908413.jpg',
        createdAt: now,
        passwordHash: hashPassword('staff123'),
      },
      {
        id: staff2Id,
        userId: 'nusrat',
        role: 'staff',
        name: 'Nusrat Jahan',
        designation: 'Medical & Client Relations Officer',
        phone: '+8801811556677',
        whatsapp: '+8801811556677',
        socialLink: 'https://facebook.com/nusrat.globalpathways',
        photoUrl: '/src/assets/images/staff_avatar_default_1794656907853.jpg',
        coverUrl: '/src/assets/images/service_medical_center_1794656908059.jpg',
        createdAt: now,
        passwordHash: hashPassword('staff123'),
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

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Public health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Public Client Lookup by phone number (Landing Page "See Update")
  app.get('/api/client-lookup', (req, res) => {
    const phoneQuery = String(req.query.phone || '').trim();
    if (!phoneQuery) {
      res.status(400).json({ error: 'Please enter a phone number.' });
      return;
    }
    const normalizedQuery = normalizePhone(phoneQuery);
    if (normalizedQuery.length < 6) {
      res.status(400).json({ error: 'Please enter a valid phone number.' });
      return;
    }

    const db = loadDb();
    const client = db.clients.find((c) => {
      const normalizedClient = normalizePhone(c.phone);
      return (
        normalizedClient === normalizedQuery ||
        normalizedClient.endsWith(normalizedQuery) ||
        normalizedQuery.endsWith(normalizedClient)
      );
    });

    if (!client) {
      res.status(404).json({
        error: 'No client record found for this phone number. Please verify the number or contact your coordinator.',
      });
      return;
    }

    const assignedStaff = db.users.find((u) => u.id === client.staffId);
    const meetings = db.meetings.filter(
      (m) => m.clientId === client.id || normalizePhone(m.clientPhone) === normalizePhone(client.phone)
    );
    const medicals = db.medicals.filter(
      (m) => m.clientId === client.id || normalizePhone(m.candidatePhone) === normalizePhone(client.phone)
    );
    const interviews = db.interviews.filter(
      (i) =>
        i.clientId === client.id ||
        i.candidateNames.toLowerCase().includes(client.name.toLowerCase())
    );

    const payload: ClientLookupResponse = {
      client,
      staff: assignedStaff ? toPublicUser(assignedStaff) : null,
      meetings,
      medicals,
      interviews,
    };

    res.json(payload);
  });

  // Login with User ID & Password
  app.post('/api/auth/login', (req, res) => {
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

  // Current user check
  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: toPublicUser(req.currentUser!) });
  });

  // Update own profile (Staff or Admin)
  app.put('/api/profile', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const idx = db.users.findIndex((u) => u.id === req.currentUser!.id);
    if (idx === -1) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const existing = db.users[idx];
    const {
      name,
      designation,
      phone,
      whatsapp,
      socialLink,
      photoUrl,
      coverUrl,
      newPassword,
    } = req.body || {};

    const updated: StoredUser = {
      ...existing,
      name: typeof name === 'string' && name.trim() ? name.trim() : existing.name,
      designation:
        typeof designation === 'string' && designation.trim()
          ? designation.trim()
          : existing.designation,
      phone: typeof phone === 'string' ? phone.trim() : existing.phone,
      whatsapp: typeof whatsapp === 'string' ? whatsapp.trim() : existing.whatsapp,
      socialLink: typeof socialLink === 'string' ? socialLink.trim() : existing.socialLink,
      photoUrl: typeof photoUrl === 'string' && photoUrl.trim() ? photoUrl.trim() : existing.photoUrl,
      coverUrl: typeof coverUrl === 'string' && coverUrl.trim() ? coverUrl.trim() : existing.coverUrl,
      passwordHash:
        typeof newPassword === 'string' && newPassword.trim().length >= 4
          ? hashPassword(newPassword.trim())
          : existing.passwordHash,
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

    const payload: DashboardData = {
      user: toPublicUser(current),
      staffList: isAdmin
        ? db.users.filter((u) => u.role === 'staff').map(toPublicUser)
        : [toPublicUser(current)],
      clients: isAdmin ? db.clients : db.clients.filter((c) => c.staffId === current.id),
      meetings: isAdmin ? db.meetings : db.meetings.filter((m) => m.staffId === current.id),
      medicals: isAdmin ? db.medicals : db.medicals.filter((m) => m.staffId === current.id),
      interviews: isAdmin ? db.interviews : db.interviews.filter((i) => i.staffId === current.id),
    };

    res.json(payload);
  });

  // Admin: Create Staff Account
  app.post('/api/staff', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const {
      userId,
      password,
      name,
      designation,
      phone,
      whatsapp,
      socialLink,
      photoUrl,
      coverUrl,
    } = req.body || {};

    const cleanUserId = String(userId || '').trim();
    const cleanPass = String(password || '').trim();
    const cleanName = String(name || '').trim();

    if (!cleanUserId || !cleanPass || !cleanName) {
      res.status(400).json({ error: 'Name, User ID, and Password are required.' });
      return;
    }

    if (db.users.some((u) => u.userId.toLowerCase() === cleanUserId.toLowerCase())) {
      res.status(409).json({ error: 'A user with this User ID already exists.' });
      return;
    }

    const newStaff: StoredUser = {
      id: generateId('usr_staff'),
      userId: cleanUserId,
      role: 'staff',
      name: cleanName,
      designation: String(designation || 'Visa & Recruitment Coordinator').trim(),
      phone: String(phone || '').trim(),
      whatsapp: String(whatsapp || phone || '').trim(),
      socialLink: String(socialLink || '').trim(),
      photoUrl: String(photoUrl || '/src/assets/images/staff_avatar_default_1794656907853.jpg').trim(),
      coverUrl: String(coverUrl || '/src/assets/images/hero_mobility_agency_1794656908413.jpg').trim(),
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(cleanPass),
    };

    db.users.push(newStaff);
    await saveDb(db);
    res.status(201).json({ staff: toPublicUser(newStaff) });
  });

  // Admin: Edit Staff Account
  app.put('/api/staff/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const idx = db.users.findIndex((u) => u.id === req.params.id && u.role === 'staff');
    if (idx === -1) {
      res.status(404).json({ error: 'Staff member not found.' });
      return;
    }

    const existing = db.users[idx];
    const {
      userId,
      password,
      name,
      designation,
      phone,
      whatsapp,
      socialLink,
      photoUrl,
      coverUrl,
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

    const updated: StoredUser = {
      ...existing,
      name: typeof name === 'string' && name.trim() ? name.trim() : existing.name,
      designation:
        typeof designation === 'string' && designation.trim()
          ? designation.trim()
          : existing.designation,
      phone: typeof phone === 'string' ? phone.trim() : existing.phone,
      whatsapp: typeof whatsapp === 'string' ? whatsapp.trim() : existing.whatsapp,
      socialLink: typeof socialLink === 'string' ? socialLink.trim() : existing.socialLink,
      photoUrl: typeof photoUrl === 'string' && photoUrl.trim() ? photoUrl.trim() : existing.photoUrl,
      coverUrl: typeof coverUrl === 'string' && coverUrl.trim() ? coverUrl.trim() : existing.coverUrl,
      passwordHash:
        typeof password === 'string' && password.trim().length >= 3
          ? hashPassword(password.trim())
          : existing.passwordHash,
    };

    db.users[idx] = updated;
    await saveDb(db);
    res.json({ staff: toPublicUser(updated) });
  });

  // Admin: Delete Staff Account
  app.delete('/api/staff/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const target = db.users.find((u) => u.id === req.params.id && u.role === 'staff');
    if (!target) {
      res.status(404).json({ error: 'Staff member not found.' });
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
    }

    await saveDb(db);
    res.json({ ok: true });
  });

  // Clients CRUD
  app.post('/api/clients', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};

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
      createdAt: now,
      updatedAt: now,
    };

    db.clients.unshift(client);
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

    db.clients[idx] = updated;
    await saveDb(db);
    res.json({ client: updated });
  });

  app.delete('/api/clients/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const target = db.clients.find((c) => c.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    if (current.role !== 'admin' && target.staffId !== current.id) {
      res.status(403).json({ error: 'You can only delete your own clients.' });
      return;
    }

    db.clients = db.clients.filter((c) => c.id !== target.id);
    await saveDb(db);
    res.json({ ok: true });
  });

  // Meetings CRUD
  app.post('/api/meetings', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};

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
      createdAt: new Date().toISOString(),
    };

    db.meetings.unshift(meeting);
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
    const updated: MeetingRecord = {
      ...existing,
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
    await saveDb(db);
    res.json({ meeting: updated });
  });

  app.delete('/api/meetings/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const target = db.meetings.find((m) => m.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Meeting not found.' });
      return;
    }
    if (current.role !== 'admin' && target.staffId !== current.id) {
      res.status(403).json({ error: 'You can only delete your own meetings.' });
      return;
    }

    db.meetings = db.meetings.filter((m) => m.id !== target.id);
    await saveDb(db);
    res.json({ ok: true });
  });

  // Medicals CRUD
  app.post('/api/medicals', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};

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
      createdAt: new Date().toISOString(),
    };

    db.medicals.unshift(medical);
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
    const updated: MedicalRecord = {
      ...existing,
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
    await saveDb(db);
    res.json({ medical: updated });
  });

  app.delete('/api/medicals/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const target = db.medicals.find((m) => m.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Medical record not found.' });
      return;
    }
    if (current.role !== 'admin' && target.staffId !== current.id) {
      res.status(403).json({ error: 'You can only delete your own medical records.' });
      return;
    }

    db.medicals = db.medicals.filter((m) => m.id !== target.id);
    await saveDb(db);
    res.json({ ok: true });
  });

  // Interviews CRUD
  app.post('/api/interviews', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const body = req.body || {};

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
      createdAt: new Date().toISOString(),
    };

    db.interviews.unshift(interview);
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
    const updated: InterviewRecord = {
      ...existing,
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
    await saveDb(db);
    res.json({ interview: updated });
  });

  app.delete('/api/interviews/:id', requireAuth, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const current = req.currentUser!;
    const target = db.interviews.find((i) => i.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Interview record not found.' });
      return;
    }
    if (current.role !== 'admin' && target.staffId !== current.id) {
      res.status(403).json({ error: 'You can only delete your own interview records.' });
      return;
    }

    db.interviews = db.interviews.filter((i) => i.id !== target.id);
    await saveDb(db);
    res.json({ ok: true });
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
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
