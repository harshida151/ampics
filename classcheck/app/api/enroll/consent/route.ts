import { withHandler, requireUser, db, jsonError, isRecord, audit } from '@/lib/server/auth';

export const POST = withHandler(async (req) => {
  const user = await requireUser(req, ['student']);
  const body: unknown = await req.json();
  if (!isRecord(body) || body.consent !== true) jsonError(400, 'Explicit consent is required.');
  const { error } = await db().from('profiles').update({ consent_at: new Date().toISOString() }).eq('id', user.id);
  if (error) throw error;
  await audit(user.id, 'face.consent_granted', user.id);
  return Response.json({ consentAt: new Date().toISOString() });
});