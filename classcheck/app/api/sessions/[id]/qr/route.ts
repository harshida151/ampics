import { withHandler, requireUser, db, jsonError } from '@/lib/server/auth';
import { createQrPayload } from '@/lib/token';

export const GET = withHandler(async (req) => {
  const user = await requireUser(req, ['instructor', 'admin']);
  const id = new URL(req.url).pathname.split('/').filter(Boolean).at(-2)!;
  let query = db().from('class_sessions').select('id,instructor_id,status,ends_at').eq('id', id).maybeSingle();
  if (user.role === 'instructor') query = db().from('class_sessions').select('id,instructor_id,status,ends_at').eq('id', id).eq('instructor_id', user.id).maybeSingle();
  const { data: session, error } = await query;
  if (error) throw error;
  if (!session || session.status !== 'open' || Date.parse(session.ends_at) <= Date.now()) jsonError(404, 'This class session has ended.');
  const window = Math.floor(Date.now() / 30_000);
  return Response.json({ code: createQrPayload(id, window), issuedAt: window * 30_000, expiresAt: (window + 1) * 30_000, expiresInMs: (window + 1) * 30_000 - Date.now() });
});