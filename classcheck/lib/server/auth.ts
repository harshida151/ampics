import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  enrolmentNo: string;
  role: Role;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

let serviceClient: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return serviceClient;
}

export async function requireUser(req: Request, roles: Role[] = []): Promise<AuthenticatedUser> {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!match) throw new HttpError(401, 'Sign in to continue.');
  const { data: authData, error: authError } = await db().auth.getUser(match[1]);
  if (authError || !authData.user) throw new HttpError(401, 'Your session is invalid or expired. Sign in again.');
  const { data: profile, error } = await db()
    .from('profiles')
    .select('id,email,full_name,enrolment_no,role')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw new HttpError(403, 'Your account profile is not configured. Contact your administrator.');
  const user: AuthenticatedUser = {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    enrolmentNo: profile.enrolment_no,
    role: profile.role,
  };
  if (roles.length && !roles.includes(user.role)) throw new HttpError(403, 'Your account cannot perform this action.');
  return user;
}

export async function audit(
  actorId: string | null,
  action: string,
  subjectId: string | null = null,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db().from('audit_logs').insert({ actor_id: actorId, action, subject_id: subjectId, details });
  if (error) throw error;
}

export function withHandler(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
      if (error instanceof SyntaxError) return Response.json({ error: 'The request body must contain valid JSON.' }, { status: 400 });
      console.error('API handler failed', error);
      return Response.json({ error: 'The request could not be completed.' }, { status: 500 });
    }
  };
}

export function jsonError(status: number, message: string): never {
  throw new HttpError(status, message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}