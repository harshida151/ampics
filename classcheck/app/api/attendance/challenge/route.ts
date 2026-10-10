import { withHandler, requireUser, db, jsonError, audit } from '@/lib/server/auth';
import { issueChallenge } from '@/lib/token';

export const GET = withHandler(async (req) => {
  const user = await requireUser(req, ['student']);
  const currentKeyId = req.headers.get('x-device-key-id');
  const [{ count: faceCount, error: faceError }, { data: device, error: deviceError }] = await Promise.all([
    db().from('face_templates').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    db().from('device_keys').select('key_id').eq('user_id', user.id).maybeSingle(),
  ]);
  if (faceError) throw faceError;
  if (deviceError) throw deviceError;
  if (!faceCount) jsonError(403, 'Enrol your face before checking in.');
  if (!device || !currentKeyId || currentKeyId !== device.key_id) jsonError(403, 'Register this device before checking in.');
  const challenge = issueChallenge(user.id);
  const { error } = await db().from('attendance_challenges').insert({ nonce: challenge.nonce, user_id: user.id, expires_at: new Date(challenge.expiresAt).toISOString() });
  if (error) throw error;
  await audit(user.id, 'attendance.challenge_issued', challenge.nonce, { kind: challenge.kind });
  return Response.json(challenge);
});