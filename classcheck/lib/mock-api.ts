import { LAYER_KEYS } from './layers';
import type {
  CheckIn,
  ClassSession,
  CodeToken,
  Coords,
  Decision,
  DecisionFilter,
  Enrollment,
  LayerKey,
  Layers,
  Role,
  User,
} from './types';
import { ApiError } from './api';

const KEY = {
  db: 'classcheck.mock.db.v1',
  session: 'classcheck.mock.session',
  device: 'classcheck.deviceId',
  force: 'classcheck.mock.outcome',
};

const WINDOW_MS = 30_000;
const DEMO_PASSWORD = 'classcheck';

interface StoredUser extends User {
  password: string;
}

interface StoredEnrollment {
  consentAt: string | null;
  deviceId: string | null;
  deviceLabel: string | null;
  faceEnrolledAt: string | null;
}

interface Db {
  users: StoredUser[];
  enrollments: Record<string, StoredEnrollment>;
  sessions: ClassSession[];
  checkIns: CheckIn[];
  lastSimAt: number;
}

const delay = (ms = 250) => new Promise<void>((r) => setTimeout(r, ms + Math.random() * 150));
const uid = () => Math.random().toString(36).slice(2, 8);
const iso = (ms: number) => new Date(ms).toISOString();

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAIL_NOTES: Record<LayerKey, string> = {
  face: 'Your face did not match your enrolled template. Try again in even light with your whole face inside the oval.',
  liveness: 'We could not confirm a live person. Look straight at the camera and complete the challenge.',
  location: 'You were outside the classroom radius. Move into the classroom and verify Location permissions.',
  device: 'This is not the device registered to your account. Use your registered device or re-register.',
  code: 'The class code was not accepted. Scan the rotating QR code on the instructor screen again.',
  behaviour: 'The check-in pattern looked unusual and is queued for instructor review.',
};

const ROSTER = [
  { name: 'Isha Patel', no: 'EN2021002' },
  { name: 'Rohan Desai', no: 'EN2021011' },
  { name: 'Kavya Nair', no: 'EN2021018' },
  { name: 'Dev Shah', no: 'EN2021023' },
  { name: 'Sana Qureshi', no: 'EN2021031' },
  { name: 'Vikram Joshi', no: 'EN2021037' },
  { name: 'Neha Trivedi', no: 'EN2021052' },
  { name: 'Arjun Rao', no: 'EN2021058' },
  { name: 'Tanvi Mehta', no: 'EN2021064' },
  { name: 'Yash Parikh', no: 'EN2021071' },
];

function buildLayers(fails: Partial<Record<LayerKey, string>>, rnd: () => number): Layers {
  const out = {} as Layers;
  for (const k of LAYER_KEYS) {
    const note = fails[k] ?? null;
    out[k] = note
      ? { passed: false, score: Math.round(18 + rnd() * 44), note }
      : { passed: true, score: Math.round(82 + rnd() * 17), note: null };
  }
  return out;
}

function summarise(layers: Layers): { decision: Decision; confidence: number } {
  const failed = LAYER_KEYS.filter((k) => !layers[k].passed);
  const confidence = Math.round(LAYER_KEYS.reduce((n, k) => n + layers[k].score, 0) / LAYER_KEYS.length);
  if (failed.length === 0) return { decision: 'APPROVED', confidence };
  const hard = failed.some((k) => k === 'face' || k === 'liveness' || k === 'code');
  if (hard || failed.length >= 2) return { decision: 'REJECTED', confidence };
  return { decision: 'REVIEW', confidence };
}

function buildReason(decision: Decision, layers: Layers, title: string): string {
  if (decision === 'APPROVED') return `All six checks passed. Your attendance for ${title} is recorded.`;
  const notes = LAYER_KEYS.filter((k) => !layers[k].passed).map((k) => layers[k].note);
  const lead = decision === 'REVIEW' ? 'Your check-in needs a quick look from your instructor.' : 'Your check-in was not accepted.';
  return `${lead} ${notes.join(' ')}`;
}

function pick<T>(rnd: () => number, a: T[]): T {
  return a[Math.floor(rnd() * a.length)];
}

function randomFails(plan: Decision, rnd: () => number): Partial<Record<LayerKey, string>> {
  const f: Partial<Record<LayerKey, string>> = {};
  if (plan === 'REVIEW') {
    const k = pick<LayerKey>(rnd, ['behaviour', 'location', 'device']);
    f[k] = FAIL_NOTES[k];
  }
  if (plan === 'REJECTED') {
    const k = pick<LayerKey>(rnd, ['face', 'liveness', 'code']);
    f[k] = FAIL_NOTES[k];
    if (rnd() < 0.5) f.behaviour = FAIL_NOTES.behaviour;
  }
  return f;
}

function weightedPlan(rnd: () => number): Decision {
  const r = rnd();
  return r < 0.7 ? 'APPROVED' : r < 0.88 ? 'REVIEW' : 'REJECTED';
}

function readForced(): Decision | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(KEY.force);
  return v === 'APPROVED' || v === 'REVIEW' || v === 'REJECTED' ? v : null;
}

function makeCheckIn(p: {
  session: Pick<ClassSession, 'id' | 'title'>;
  studentId: string;
  name: string;
  enrolmentNo: string;
  at: number;
  fails: Partial<Record<LayerKey, string>>;
  rnd: () => number;
}): CheckIn {
  const layers = buildLayers(p.fails, p.rnd);
  const { decision, confidence } = summarise(layers);
  return {
    id: `c_${uid()}${uid()}`,
    sessionId: p.session.id,
    sessionTitle: p.session.title,
    studentId: p.studentId,
    studentName: p.name,
    enrolmentNo: p.enrolmentNo,
    at: iso(p.at),
    decision,
    confidence,
    layers,
    reason: buildReason(decision, layers, p.session.title),
    resolvedBy: null,
  };
}

function seed(): Db {
  const now = Date.now();
  const rnd = mulberry32(42);
  const users: StoredUser[] = [
    { id: 'u_student', fullName: 'Aarav Mehta', enrolmentNo: 'EN2021045', email: 'student@classcheck.test', role: 'student', password: DEMO_PASSWORD },
    { id: 'u_instructor', fullName: 'Dr. Meera Shah', enrolmentNo: 'STAFF-114', email: 'instructor@classcheck.test', role: 'instructor', password: DEMO_PASSWORD },
    { id: 'u_admin', fullName: 'Admin Office', enrolmentNo: 'STAFF-001', email: 'admin@classcheck.test', role: 'admin', password: DEMO_PASSWORD },
  ];
  const sessions: ClassSession[] = [
    { id: 'SEED01', title: 'Data Structures, Lecture 12', radiusM: 100, durationMin: 60, lat: 21.1702, lng: 72.8311, startedAt: iso(now - 26 * 3600e3), endsAt: iso(now - 25 * 3600e3), instructorId: 'u_instructor', status: 'closed' },
    { id: 'SEED02', title: 'Operating Systems, Lab 4', radiusM: 80, durationMin: 60, lat: 21.1702, lng: 72.8311, startedAt: iso(now - 3 * 3600e3), endsAt: iso(now - 2 * 3600e3), instructorId: 'u_instructor', status: 'closed' },
  ];
  const checkIns: CheckIn[] = [];
  let n = 0;
  for (const s of sessions) {
    const base = Date.parse(s.startedAt);
    ROSTER.forEach((st, i) => {
      n += 1;
      const plan: Decision = n % 6 === 2 ? 'REVIEW' : n % 9 === 5 ? 'REJECTED' : 'APPROVED';
      checkIns.push(
        makeCheckIn({
          session: s,
          studentId: `r_${st.no}`,
          name: st.name,
          enrolmentNo: st.no,
          at: base + (i + 1) * 95_000 + Math.floor(rnd() * 40_000),
          fails: randomFails(plan, rnd),
          rnd,
        }),
      );
    });
  }
  return { users, enrollments: {}, sessions, checkIns, lastSimAt: 0 };
}

function loadDb(): Db {
  if (typeof window === 'undefined') return seed();
  const raw = window.localStorage.getItem(KEY.db);
  if (raw) {
    try {
      return JSON.parse(raw) as Db;
    } catch {
      // fallback
    }
  }
  const db = seed();
  saveDb(db);
  return db;
}

function saveDb(db: Db) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY.db, JSON.stringify(db));
  }
}

function maybeSimulate(db: Db): boolean {
  const open = db.sessions.find((s) => s.status === 'open' && Date.parse(s.endsAt) > Date.now());
  if (!open || Date.now() - db.lastSimAt < 9000) return false;
  const taken = new Set(db.checkIns.filter((c) => c.sessionId === open.id).map((c) => c.enrolmentNo));
  const free = ROSTER.filter((r) => !taken.has(r.no));
  if (free.length === 0) return false;
  const st = pick(Math.random, free);
  db.checkIns.push(
    makeCheckIn({
      session: open,
      studentId: `r_${st.no}`,
      name: st.name,
      enrolmentNo: st.no,
      at: Date.now(),
      fails: randomFails(weightedPlan(Math.random), Math.random),
      rnd: Math.random,
    }),
  );
  db.lastSimAt = Date.now();
  return true;
}

function codeSig(sessionId: string, w: number): string {
  let h = 2166136261;
  const s = `${sessionId}:${w}:classcheck`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
}

function makeCode(sessionId: string, w: number): string {
  return `CC1-${sessionId}-${w}-${codeSig(sessionId, w)}`;
}

function parseCode(code: string): { sessionId: string; window: number; sig: string } | null {
  const parts = code.trim().split('-');
  if (parts.length !== 4 || parts[0] !== 'CC1') return null;
  const w = Number(parts[2]);
  if (!Number.isInteger(w)) return null;
  return { sessionId: parts[1], window: w, sig: parts[3] };
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'mock-server-dev';
  let id = window.localStorage.getItem(KEY.device);
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `dev-${uid()}${uid()}`;
    window.localStorage.setItem(KEY.device, id);
  }
  return id;
}

function describeDevice(): string {
  if (typeof navigator === 'undefined') return 'Mock Device';
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}

const publicUser = ({ password: _p, ...u }: StoredUser): User => u;

function requireMockUser(role?: Role): User {
  if (typeof window === 'undefined') throw new ApiError('You are signed out.', 'Sign in again to continue.');
  const raw = window.localStorage.getItem(KEY.session);
  const db = loadDb();
  const u = raw ? db.users.find((x) => x.id === raw) : undefined;
  if (!u) throw new ApiError('You are signed out.', 'Sign in again to continue.');
  if (role && u.role !== role) throw new ApiError('Your account cannot do this.', `Sign in with a ${role} account.`);
  return publicUser(u);
}

export async function getCurrentUser(): Promise<User | null> {
  await delay(60);
  if (typeof window === 'undefined') return null;
  const id = window.localStorage.getItem(KEY.session);
  if (!id) return null;
  const u = loadDb().users.find((x) => x.id === id);
  return u ? publicUser(u) : null;
}

export async function login(email: string, password: string): Promise<User> {
  await delay(200);
  const u = loadDb().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!u || (u.password && u.password !== password)) {
    throw new ApiError('The email or password is wrong.', 'Check both and try again. Passwords are case-sensitive.');
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY.session, u.id);
  }
  return publicUser(u);
}

export async function register(input: { fullName: string; enrolmentNo: string; email: string; password: string }): Promise<User> {
  await delay(300);
  const db = loadDb();
  const existing = db.users.find((x) => x.email.toLowerCase() === input.email.trim().toLowerCase());
  if (existing) {
    throw new ApiError('An account with this email already exists.', 'Sign in instead, or use a different email.');
  }
  const u: StoredUser = {
    id: `u_${uid()}${uid()}`,
    fullName: input.fullName.trim(),
    enrolmentNo: input.enrolmentNo.trim().toUpperCase(),
    email: input.email.trim(),
    role: 'student',
    password: input.password,
  };
  db.users.push(u);
  saveDb(db);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY.session, u.id);
  }
  return publicUser(u);
}

export async function logout(): Promise<void> {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(KEY.session);
  }
}

function toEnrollment(e: StoredEnrollment | undefined): Enrollment {
  return {
    consentAt: e?.consentAt ?? null,
    faceEnrolled: !!e?.faceEnrolledAt,
    faceEnrolledAt: e?.faceEnrolledAt ?? null,
    deviceRegistered: !!e?.deviceId,
    thisDeviceBound: !!e?.deviceId && e.deviceId === getDeviceId(),
    deviceLabel: e?.deviceLabel ?? null,
  };
}

function mutateEnrollment(fn: (e: StoredEnrollment) => void): Enrollment {
  const u = requireMockUser('student');
  const db = loadDb();
  const e = db.enrollments[u.id] ?? { consentAt: null, deviceId: null, deviceLabel: null, faceEnrolledAt: null };
  fn(e);
  db.enrollments[u.id] = e;
  saveDb(db);
  return toEnrollment(e);
}

export async function getEnrollment(): Promise<Enrollment> {
  await delay(100);
  const u = requireMockUser('student');
  return toEnrollment(loadDb().enrollments[u.id]);
}

export async function giveConsent(): Promise<Enrollment> {
  await delay(150);
  return mutateEnrollment((e) => {
    e.consentAt = iso(Date.now());
  });
}

export async function registerDevice(): Promise<Enrollment> {
  await delay(300);
  return mutateEnrollment((e) => {
    e.deviceId = getDeviceId();
    e.deviceLabel = describeDevice();
  });
}

export async function submitFaceTemplates(templates: number[][]): Promise<Enrollment> {
  await delay(400);
  const u = requireMockUser('student');
  if (!loadDb().enrollments[u.id]?.consentAt) {
    throw new ApiError('Consent has not been saved.', 'Tick the consent box and save it, then capture your face again.');
  }
  if (templates.length < 3) {
    throw new ApiError('Not enough face samples.', 'Capture face samples and try again.');
  }
  return mutateEnrollment((e) => {
    e.faceEnrolledAt = iso(Date.now());
  });
}

export async function withdrawConsentAndDeleteFaceData(): Promise<Enrollment> {
  await delay(300);
  return mutateEnrollment((e) => {
    e.consentAt = null;
    e.faceEnrolledAt = null;
  });
}

export async function getActiveSession(): Promise<ClassSession | null> {
  await delay(100);
  const u = requireMockUser();
  const db = loadDb();
  if (u.role === 'instructor') {
    const s = db.sessions.find((x) => x.instructorId === u.id && x.status === 'open' && Date.parse(x.endsAt) > Date.now());
    return s ?? null;
  }
  const s = db.sessions.find((x) => x.status === 'open' && Date.parse(x.endsAt) > Date.now());
  return s ?? null;
}

export async function startSession(input: { title: string; radiusM: number; durationMin: number; coords: Coords }): Promise<ClassSession> {
  await delay(300);
  const u = requireMockUser('instructor');
  const db = loadDb();
  db.sessions.forEach((s) => {
    if (s.instructorId === u.id && s.status === 'open') s.status = 'closed';
  });
  const now = Date.now();
  const session: ClassSession = {
    id: `S${uid().toUpperCase()}`,
    title: input.title.trim(),
    radiusM: input.radiusM,
    durationMin: input.durationMin,
    lat: input.coords.lat,
    lng: input.coords.lng,
    startedAt: iso(now),
    endsAt: iso(now + input.durationMin * 60_000),
    instructorId: u.id,
    status: 'open',
  };
  db.sessions.push(session);
  saveDb(db);
  return session;
}

export async function endSession(sessionId: string): Promise<void> {
  await delay(150);
  requireMockUser('instructor');
  const db = loadDb();
  const s = db.sessions.find((x) => x.id === sessionId);
  if (s) s.status = 'closed';
  saveDb(db);
}

export async function getSessionCode(sessionId: string): Promise<CodeToken> {
  await delay(80);
  requireMockUser('instructor');
  const s = loadDb().sessions.find((x) => x.id === sessionId);
  if (!s || s.status !== 'open' || Date.parse(s.endsAt) < Date.now()) {
    throw new ApiError('This session has ended.', 'Start a new session to show a new QR code.');
  }
  const w = Math.floor(Date.now() / WINDOW_MS);
  return { code: makeCode(sessionId, w), issuedAt: w * WINDOW_MS, expiresAt: (w + 1) * WINDOW_MS };
}

export async function getAttendanceChallenge(): Promise<{ nonce: string; kind: 'blink' | 'turn_head'; token: string; expiresAt: number }> {
  await delay(100);
  requireMockUser('student');
  return {
    nonce: `nonce_${uid()}${uid()}`,
    kind: Math.random() > 0.5 ? 'blink' : 'turn_head',
    token: `tok_${uid()}${uid()}`,
    expiresAt: Date.now() + 60_000,
  };
}

export async function submitCheckIn(input: {
  qr: string;
  nonce: string;
  challengeToken: string;
  embedding: number[];
  blinkCount: number;
  maxYaw: number;
  coords: Coords | null;
}): Promise<CheckIn> {
  await delay(800);
  const user = requireMockUser('student');
  const db = loadDb();

  const parsed = parseCode(input.qr);
  let session = parsed ? db.sessions.find((s) => s.id === parsed.sessionId) : null;
  if (!session) {
    session = db.sessions.find((s) => s.status === 'open') ?? db.sessions[0];
  }

  const rnd = Math.random;
  const plan = readForced() ?? weightedPlan(rnd);
  const checkIn = makeCheckIn({
    session: session ?? { id: 'MOCK01', title: 'Class Session' },
    studentId: user.id,
    name: user.fullName,
    enrolmentNo: user.enrolmentNo,
    at: Date.now(),
    fails: randomFails(plan, rnd),
    rnd,
  });

  db.checkIns.unshift(checkIn);
  saveDb(db);
  return checkIn;
}

export async function listCheckIns(filter: DecisionFilter = 'ALL'): Promise<CheckIn[]> {
  await delay(100);
  const db = loadDb();
  maybeSimulate(db);
  saveDb(db);
  const items = db.checkIns.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return filter === 'ALL' ? items : items.filter((c) => c.decision === filter);
}

export function subscribeCheckIns(opts: { sessionId?: string }, onData: (items: CheckIn[]) => void): () => void {
  let stopped = false;
  const poll = () => {
    if (stopped) return;
    const db = loadDb();
    if (maybeSimulate(db)) saveDb(db);
    let items = db.checkIns.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    if (opts.sessionId) items = items.filter((x) => x.sessionId === opts.sessionId);
    onData(items);
  };
  poll();
  const timer = window.setInterval(poll, 3000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

export async function decideCheckIn(id: string, decision: Extract<Decision, 'APPROVED' | 'REJECTED'>): Promise<CheckIn> {
  await delay(200);
  const u = requireMockUser('admin');
  const db = loadDb();
  const c = db.checkIns.find((x) => x.id === id);
  if (!c) throw new ApiError('Check-in record not found.', 'Reload the list and try again.');
  c.decision = decision;
  c.resolvedBy = u.fullName;
  saveDb(db);
  return c;
}

export async function exportCheckInsCsv(filter: DecisionFilter = 'ALL'): Promise<string> {
  const items = await listCheckIns(filter);
  const headers = ['ID', 'Student', 'Enrolment No', 'Session', 'Timestamp', 'Decision', 'Confidence %'];
  const rows = items.map((c) => [c.id, c.studentName, c.enrolmentNo, c.sessionTitle, c.at, c.decision, c.confidence]);
  return [headers.join(','), ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
}

export async function switchRole(newRole: Role): Promise<User> {
  const db = loadDb();
  const id = typeof window !== 'undefined' ? window.localStorage.getItem(KEY.session) : null;
  let user = id ? db.users.find((u) => u.id === id) : null;
  if (!user) {
    user = db.users.find((u) => u.role === newRole) ?? db.users[0];
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY.session, user.id);
  } else {
    user.role = newRole;
    saveDb(db);
  }
  return publicUser(user);
}
