import { withHandler, requireUser, db, jsonError, isRecord, audit } from '@/lib/server/auth';

export const POST = withHandler(async (req) => {
  const user = await requireUser(req, ['admin']);
  const body: unknown = await req.json();
  if (!isRecord(body) || typeof body.id !== 'string' || !['APPROVED', 'REJECTED'].includes(String(body.decision))) jsonError(400, 'A check-in id and APPROVED or REJECTED decision are required.');
  const { data, error } = await db().from('check_ins').update({ decision: body.decision, resolved_by: user.id }).eq('id', body.id).eq('decision', 'REVIEW').select('id').maybeSingle();
  if (error) throw error;
  if (!data) jsonError(409, 'This check-in was already reviewed or no longer exists.');
  await audit(user.id, 'attendance.reviewed', body.id, { decision: body.decision });
  return Response.json({ id: body.id, decision: body.decision, resolvedBy: user.fullName });
});