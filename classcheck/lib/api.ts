'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CheckIn, ClassSession, CodeToken, Coords, Decision, DecisionFilter, Enrollment, Role, User } from './types';
import { ensureDeviceKey, getDeviceKeyId, signDeviceMessage } from './device-key';
import * as mockApi from './mock-api';

export class ApiError extends Error {
  constructor(message: string, public fix = 'Check your connection and try again. If it keeps happening, contact your administrator.') {
    super(message);
    this.name = 'ApiError';
  }
}

export function toErrorInfo(error: unknown): { message: string; fix: string } {
  if (error instanceof ApiError) return { message: error.message, fix: error.fix };
  return { message: 'Something went wrong.', fix: 'Check your connection and try again. If it keeps happening, contact your administrator.' };
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;
  if (url.includes('your-project.supabase.co') || anonKey === 'your-public-anon-key') return false;
  return true;
}

let authClient: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (authClient) return authClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !isSupabaseConfigured()) {
    throw new ApiError(
      'Supabase is not configured.',
      'Update NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local with your real Supabase project credentials.'
    );
  }
  authClient = createClient(url, anonKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
  return authClient;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase().auth.getSession();
  if (!session?.access_token) throw new ApiError('You are signed out.', 'Sign in again to continue.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    const message = payload?.error ?? 'The request could not be completed.';
    throw new ApiError(message, response.status === 401 ? 'Sign in again to continue.' : 'Review the information and try again.');
  }
  return response.status === 204 ? undefined as T : response.headers.get('content-type')?.includes('text/csv')
    ? await response.text() as T
    : await response.json() as T;
}

interface MeResponse { user: User; enrollment: Enrollment }
export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return mockApi.getCurrentUser();
  try {
    const { data: { session } } = await supabase().auth.getSession();
    if (!session) return null;
    return (await request<MeResponse>('/api/me')).user;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<User> {
  if (!isSupabaseConfigured()) return mockApi.login(email, password);
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
      throw new ApiError('Could not reach Supabase.', 'Check your internet connection and verify NEXT_PUBLIC_SUPABASE_URL in .env.local.');
    }
    throw new ApiError('The email or password is wrong.', 'Check both and try again. Passwords are case-sensitive.');
  }
  return (await request<MeResponse>('/api/me')).user;
}

export async function register(input: { fullName: string; enrolmentNo: string; email: string; password: string }): Promise<User> {
  if (!isSupabaseConfigured()) return mockApi.register(input);
  const { data, error } = await supabase().auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { fullName: input.fullName.trim(), enrolmentNo: input.enrolmentNo.trim().toUpperCase() } },
  });
  if (error) {
    if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
      throw new ApiError('Could not reach Supabase.', 'Check your internet connection and verify NEXT_PUBLIC_SUPABASE_URL in .env.local.');
    }
    throw new ApiError(error.message, 'Check your details or sign in if you already have an account.');
  }
  if (!data.session) throw new ApiError('Check your email to finish creating your account.', 'Confirm your email, then sign in.');
  return (await request<MeResponse>('/api/me')).user;
}

export async function logout(): Promise<void> {
  if (!isSupabaseConfigured()) return mockApi.logout();
  const { error } = await supabase().auth.signOut();
  if (error) throw new ApiError('Could not sign out.', 'Check your connection and try again.');
}

export async function getEnrollment(): Promise<Enrollment> {
  if (!isSupabaseConfigured()) return mockApi.getEnrollment();
  const { data: { user } } = await supabase().auth.getUser();
  const keyId = user ? await getDeviceKeyId(user.id) : null;
  return (await request<MeResponse>('/api/me', { headers: keyId ? { 'x-device-key-id': keyId } : {} })).enrollment;
}

export async function giveConsent(): Promise<Enrollment> {
  if (!isSupabaseConfigured()) return mockApi.giveConsent();
  await request('/api/enroll/consent', { method: 'POST', body: JSON.stringify({ consent: true }) });
  return getEnrollment();
}

export async function registerDevice(): Promise<Enrollment> {
  if (!isSupabaseConfigured()) return mockApi.registerDevice();
  const { data: { user }, error } = await supabase().auth.getUser();
  if (error || !user) throw new ApiError('You are signed out.', 'Sign in again to continue.');
  const { publicJwk } = await ensureDeviceKey(user.id);
  await request('/api/device/register', { method: 'POST', body: JSON.stringify({ publicJwk }) });
  return getEnrollment();
}

export async function submitFaceTemplates(templates: number[][]): Promise<Enrollment> {
  if (!isSupabaseConfigured()) return mockApi.submitFaceTemplates(templates);
  await request('/api/enroll', { method: 'POST', body: JSON.stringify({ consent: true, embeddings: templates }) });
  return getEnrollment();
}

export async function withdrawConsentAndDeleteFaceData(): Promise<Enrollment> {
  if (!isSupabaseConfigured()) return mockApi.withdrawConsentAndDeleteFaceData();
  await request('/api/enroll', { method: 'DELETE' });
  return getEnrollment();
}

export interface StartSessionInput { title: string; radiusM: number; durationMin: number; coords: Coords }
interface SessionRow {
  id: string; title: string; radius_m: number; duration_min: number; lat: number; lng: number;
  started_at: string; ends_at: string; instructor_id: string; status: 'open' | 'closed';
}
function mapSession(row: SessionRow): ClassSession {
  return { id: row.id, title: row.title, radiusM: row.radius_m, durationMin: row.duration_min, lat: row.lat, lng: row.lng, startedAt: row.started_at, endsAt: row.ends_at, instructorId: row.instructor_id, status: row.status };
}

export async function getActiveSession(): Promise<ClassSession | null> {
  if (!isSupabaseConfigured()) return mockApi.getActiveSession();
  const rows = await request<SessionRow[]>('/api/sessions');
  const active = rows.find((session) => session.status === 'open' && Date.parse(session.ends_at) > Date.now());
  return active ? mapSession(active) : null;
}

export async function startSession(input: StartSessionInput): Promise<ClassSession> {
  if (!isSupabaseConfigured()) return mockApi.startSession(input);
  return mapSession(await request<SessionRow>('/api/sessions', { method: 'POST', body: JSON.stringify(input) }));
}

export async function endSession(sessionId: string): Promise<void> {
  if (!isSupabaseConfigured()) return mockApi.endSession(sessionId);
  await request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'PATCH' });
}

export async function getSessionCode(sessionId: string): Promise<CodeToken> {
  if (!isSupabaseConfigured()) return mockApi.getSessionCode(sessionId);
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/qr`);
}

export interface AttendanceChallenge { nonce: string; kind: 'blink' | 'turn_head'; token: string; expiresAt: number }
export async function getAttendanceChallenge(): Promise<AttendanceChallenge> {
  if (!isSupabaseConfigured()) return mockApi.getAttendanceChallenge();
  const { data: { user }, error } = await supabase().auth.getUser();
  if (error || !user) throw new ApiError('You are signed out.', 'Sign in again to continue.');
  const keyId = await getDeviceKeyId(user.id);
  if (!keyId) throw new ApiError('This device is not registered.', 'Register this device on the Enrol page.');
  return request('/api/attendance/challenge', { headers: { 'x-device-key-id': keyId } });
}

export interface CheckInInput {
  qr: string; nonce: string; challengeToken: string; embedding: number[]; blinkCount: number; maxYaw: number; coords: Coords | null;
}

export async function submitCheckIn(input: CheckInInput): Promise<CheckIn> {
  if (!isSupabaseConfigured()) return mockApi.submitCheckIn(input);
  const { data: { user }, error } = await supabase().auth.getUser();
  if (error || !user) throw new ApiError('You are signed out.', 'Sign in again to continue.');
  const { keyId, signature } = await signDeviceMessage(user.id, `${input.nonce}|${input.qr}`);
  return request('/api/attendance/submit', { method: 'POST', body: JSON.stringify({ ...input, keyId, signature }) });
}

export async function listCheckIns(filter: DecisionFilter = 'ALL'): Promise<CheckIn[]> {
  if (!isSupabaseConfigured()) return mockApi.listCheckIns(filter);
  return request(`/api/admin/feed${filter === 'ALL' ? '' : `?decision=${filter}`}`);
}

export function subscribeCheckIns(opts: { sessionId?: string }, onData: (items: CheckIn[]) => void, onError?: (error: unknown) => void): () => void {
  if (!isSupabaseConfigured()) return mockApi.subscribeCheckIns(opts, onData);
  let stopped = false;
  const poll = async () => {
    try {
      const params = new URLSearchParams();
      if (opts.sessionId) params.set('sessionId', opts.sessionId);
      const data = await request<CheckIn[]>(`/api/admin/feed${params.size ? `?${params}` : ''}`);
      if (!stopped) onData(data);
    } catch (error) {
      if (!stopped) onError?.(error);
    }
  };
  void poll();
  const interval = window.setInterval(() => void poll(), 3000);
  return () => { stopped = true; window.clearInterval(interval); };
}

export async function decideCheckIn(id: string, decision: Extract<Decision, 'APPROVED' | 'REJECTED'>): Promise<CheckIn> {
  if (!isSupabaseConfigured()) return mockApi.decideCheckIn(id, decision);
  await request('/api/admin/review', { method: 'POST', body: JSON.stringify({ id, decision }) });
  const updated = (await listCheckIns()).find((item) => item.id === id);
  if (!updated) throw new ApiError('The reviewed check-in could not be loaded.', 'Reload the list to see the latest status.');
  return updated;
}

export async function exportCheckInsCsv(filter: DecisionFilter = 'ALL'): Promise<string> {
  if (!isSupabaseConfigured()) return mockApi.exportCheckInsCsv(filter);
  return request(`/api/admin/export?decision=${filter}`, { headers: { accept: 'text/csv' } });
}

export async function switchRole(newRole: Role): Promise<User> {
  if (!isSupabaseConfigured()) return mockApi.switchRole(newRole);
  return mockApi.switchRole(newRole);
}

export async function quickLogin(role: Role): Promise<User> {
  return login(`${role}@classcheck.test`, 'classcheck');
}
