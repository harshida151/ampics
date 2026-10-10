import { withHandler, requireUser, db, jsonError, isRecord, audit } from '@/lib/server/auth';

export const POST = withHandler(async (req) => {
  const user = await requireUser(req, ['student']);
  const body: unknown = await req.json();
  if (!isRecord(body) || body.consent !== true || !Array.isArray(body.embeddings) || body.embeddings.length < 3 || body.embeddings.length > 8) {
    jsonError(400, 'Consent and 3 to 8 face templates are required.');
  }
  const valid = body.embeddings.every((embedding) =>
    Array.isArray(embedding) && embedding.length === 128 && embedding.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 1),
  );
  if (!valid) jsonError(400, 'Every face template must contain exactly 128 finite numbers.');
  const { data: existing, error: existingError } = await db().from('face_templates').select('id').eq('user_id', user.id).limit(1);
  if (existingError) throw existingError;
  if (existing?.length) jsonError(409, 'Face templates already exist. Withdraw consent before enrolling again.');
  const { data: profile, error: profileError } = await db().from('profiles').select('consent_at').eq('id', user.id).single();
  if (profileError) throw profileError;
  if (!profile.consent_at) jsonError(403, 'Save consent before enrolling your face.');
  const { error } = await db().rpc('enroll_face_templates', { target_user_id: user.id, input_embeddings: body.embeddings });
  if (error) {
    if (/templates already exist/i.test(error.message)) jsonError(409, 'Face templates already exist. Withdraw consent before enrolling again.');
    throw error;
  }
  await audit(user.id, 'face.enrolled', user.id, { templateCount: body.embeddings.length });
  return Response.json({ enrolled: true }, { status: 201 });
});

export const DELETE = withHandler(async (req) => {
  const user = await requireUser(req, ['student']);
  const { error: faceError } = await db().from('face_templates').delete().eq('user_id', user.id);
  if (faceError) throw faceError;
  const { error } = await db().from('profiles').update({ consent_at: null }).eq('id', user.id);
  if (error) throw error;
  await audit(user.id, 'face.consent_withdrawn', user.id);
  return Response.json({ withdrawn: true });
});