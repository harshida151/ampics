import { withHandler, requireUser, db, jsonError, audit } from '@/lib/server/auth';

export const PATCH = withHandler(async (req) => {
  const user = await requireUser(req, ['instructor', 'admin']);
  const id = new URL(req.url).pathname.split('/').filter(Boolean).at(-1)!;
  const query = db().from('class_sessions').update({ status: 'closed' }).eq('id', id).select('*');
  const { data, error } = user.role === 'admin' ? await query : await query.eq('instructor_id', user.id);
  if (error) throw error;
  if (!data?.length) jsonError(404, 'Session not found.');
  await audit(user.id, 'session.closed', id);
  return Response.json(data[0]);
});