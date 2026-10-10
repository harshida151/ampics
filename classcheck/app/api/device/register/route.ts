import { createHash } from 'node:crypto';
import { withHandler, requireUser, db, jsonError, isRecord, audit } from '@/lib/server/auth';

export const POST = withHandler(async (req) => {
  const user = await requireUser(req, ['student']);
  const body: unknown = await req.json();
  const jwk = isRecord(body) && isRecord(body.publicJwk) ? body.publicJwk : null;
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x) || typeof jwk.y !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.y) || 'd' in jwk) {
    jsonError(400, 'A valid EC P-256 public JWK is required.');
  }
  const keyId = createHash('sha256').update(jwk.x).update(jwk.y).digest('hex');
  const { data: owner, error: ownerError } = await db().from('device_keys').select('user_id').eq('key_id', keyId).maybeSingle();
  if (ownerError) throw ownerError;
  if (owner && owner.user_id !== user.id) {
    await audit(user.id, 'device.key_conflict', keyId, { existingOwnerId: owner.user_id });
    jsonError(409, 'This device key is already registered to another account.');
  }
  const userAgent = req.headers.get('user-agent') ?? 'Browser';
  const label = /Android/i.test(userAgent) ? 'Android device' : /iPhone|iPad/i.test(userAgent) ? 'iOS device' : 'Browser device';
  const { error } = await db().from('device_keys').upsert({ key_id: keyId, user_id: user.id, public_jwk: jwk, device_label: label }, { onConflict: 'user_id' });
  if (error?.code === '23505') {
    await audit(user.id, 'device.key_conflict', keyId);
    jsonError(409, 'This device key is already registered to another account.');
  }
  if (error) throw error;
  await audit(user.id, 'device.registered', keyId);
  return Response.json({ keyId, deviceLabel: label });
});