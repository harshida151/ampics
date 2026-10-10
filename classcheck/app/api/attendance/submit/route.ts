import { createHash, webcrypto } from 'node:crypto';
import { checkGeofence } from '@/lib/geo';
import { decide } from '@/lib/decision';
import { verifyChallenge, verifyQrPayload, type ChallengeKind } from '@/lib/token';
import { withHandler, requireUser, db, jsonError, isRecord, audit } from '@/lib/server/auth';

function finiteArray(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

export const POST = withHandler(async (req) => {
  const user = await requireUser(req, ['student']);
  const body: unknown = await req.json();
  if (!isRecord(body) || typeof body.qr !== 'string' || body.qr.length > 512 || typeof body.nonce !== 'string' || body.nonce.length > 128 || typeof body.challengeToken !== 'string' || body.challengeToken.length > 2048 || typeof body.signature !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(body.signature) || typeof body.keyId !== 'string' || !/^[a-f0-9]{64}$/.test(body.keyId)) jsonError(400, 'The check-in payload is incomplete.');
  if (!finiteArray(body.embedding, 128) || body.embedding.some((n) => Math.abs(n) > 1)) jsonError(400, 'A valid 128-number face descriptor is required.');
  if (!Number.isInteger(body.blinkCount) || Number(body.blinkCount) < 0 || Number(body.blinkCount) > 100 || typeof body.maxYaw !== 'number' || !Number.isFinite(body.maxYaw) || Math.abs(body.maxYaw) > Math.PI) jsonError(400, 'Invalid liveness metrics.');
  const claims = verifyChallenge(body.challengeToken, user.id);
  if (!claims || claims.nonce !== body.nonce) jsonError(401, 'The liveness challenge is invalid or expired. Request a new challenge.');
  const qr = verifyQrPayload(body.qr);
  const qrParts = body.qr.split('.');
  const sessionId = qrParts.length === 3 && /^[A-Za-z0-9_-]{1,128}$/.test(qrParts[0]) ? qrParts[0] : null;
  if (!sessionId) jsonError(400, 'The class QR code is malformed. Scan the current code.');

  const { data: challengeRow, error: challengeError } = await db().from('attendance_challenges').select('nonce,expires_at,used_at').eq('nonce', claims.nonce).eq('user_id', user.id).maybeSingle();
  if (challengeError) throw challengeError;
  if (!challengeRow || challengeRow.used_at || Date.parse(challengeRow.expires_at) <= Date.now()) jsonError(409, 'This challenge has already been used or expired. Request a new one.');

  const [{ data: device, error: deviceError }, { data: session, error: sessionError }] = await Promise.all([
    db().from('device_keys').select('key_id,public_jwk').eq('user_id', user.id).maybeSingle(),
    db().from('class_sessions').select('*').eq('id', sessionId).maybeSingle(),
  ]);
  if (deviceError) throw deviceError;
  if (sessionError) throw sessionError;
  if (!session || session.status !== 'open' || Date.parse(session.ends_at) <= Date.now()) jsonError(404, 'This class session is not open.');

  let signatureValid = false;
  if (device && device.key_id === body.keyId) {
    const jwk = device.public_jwk as JsonWebKey;
    const computedKeyId = createHash('sha256').update(String(jwk.x)).update(String(jwk.y)).digest('hex');
    if (computedKeyId === device.key_id) {
      try {
        const publicKey = await webcrypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        signatureValid = await webcrypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          publicKey,
          Buffer.from(body.signature, 'base64url'),
          new TextEncoder().encode(`${claims.nonce}|${body.qr}`),
        );
      } catch {
        signatureValid = false;
      }
    }
  }

  const { data: consumed, error: consumeError } = await db().from('attendance_challenges')
    .update({ used_at: new Date().toISOString() }).eq('nonce', claims.nonce).eq('user_id', user.id).is('used_at', null).gt('expires_at', new Date().toISOString()).select('nonce').maybeSingle();
  if (consumeError) throw consumeError;
  if (!consumed) jsonError(409, 'This challenge has already been used or expired. Request a new one.');

  const { data: match, error: matchError } = await db().rpc('match_face', { target_user_id: user.id, query_embedding: body.embedding });
  if (matchError) throw matchError;
  const faceDistance = Array.isArray(match) && typeof match[0]?.distance === 'number' ? match[0].distance : null;

  const coords = isRecord(body.coords) && typeof body.coords.lat === 'number' && Number.isFinite(body.coords.lat) && body.coords.lat >= -90 && body.coords.lat <= 90 && typeof body.coords.lng === 'number' && Number.isFinite(body.coords.lng) && body.coords.lng >= -180 && body.coords.lng <= 180 && typeof body.coords.accuracy === 'number' && Number.isFinite(body.coords.accuracy) && body.coords.accuracy >= 0
    ? { lat: body.coords.lat, lng: body.coords.lng, accuracy: body.coords.accuracy }
    : null;
  const geo = coords ? checkGeofence(coords, { lat: session.lat, lng: session.lng }, session.radius_m) : { passed: false, score: 0, distanceM: 0, reason: 'Location was not provided or was invalid.' };
  const challengeKind: ChallengeKind = claims.kind;
  const [{ count: failures, error: failuresError }, { count: recentCount, error: recentError }] = await Promise.all([
    db().from('check_ins').select('id', { count: 'exact', head: true }).eq('student_id', user.id).eq('decision', 'REJECTED').gte('at', new Date(Date.now() - 10 * 60_000).toISOString()),
    db().from('check_ins').select('id', { count: 'exact', head: true }).eq('student_id', user.id).gte('at', new Date(Date.now() - 15_000).toISOString()),
  ]);
  if (failuresError) throw failuresError;
  if (recentError) throw recentError;
  const decision = decide({
    faceDistance,
    challenge: challengeKind,
    blinkCount: Number(body.blinkCount),
    maxYaw: Number(body.maxYaw),
    location: { passed: geo.passed, score: geo.score, reason: geo.reason },
    devicePassed: signatureValid,
    tokenPassed: !!qr && qr.sessionId === session.id,
    failuresIn10Minutes: (failures ?? 0) + (faceDistance === null || faceDistance > 0.55 || (challengeKind === 'blink' ? Number(body.blinkCount) < 2 : Math.abs(Number(body.maxYaw)) < 0.18) || !geo.passed || !signatureValid || !qr || qr.sessionId !== session.id ? 1 : 0),
    checkInsIn15Seconds: (recentCount ?? 0) + 1,
  });
  const layerMap = {
    face: decision.layers.identity,
    liveness: decision.layers.liveness,
    location: decision.layers.location,
    device: decision.layers.device,
    code: decision.layers.token,
    behaviour: decision.layers.risk,
  };
  const layers = Object.fromEntries(Object.entries(layerMap).map(([key, layer]) => [key, {
    passed: layer.passed,
    score: Math.round(layer.score * 100),
    contribution: Number(layer.contribution.toFixed(4)),
    note: layer.reason,
  }]));
  const reason = decision.decision === 'APPROVED'
    ? `All checks passed. Your attendance for ${session.title} is recorded.`
    : decision.reasons.join(' ');
  const { data: inserted, error: insertError } = await db().from('check_ins').insert({
    session_id: session.id,
    student_id: user.id,
    decision: decision.decision,
    confidence: decision.confidence,
    layers,
    reason,
    signals: { challenge: challengeKind, locationDistanceM: Math.round(geo.distanceM), riskFlags: decision.reasons },
  }).select('id,at').single();
  if (insertError) throw insertError;
  await audit(user.id, 'attendance.submitted', inserted.id, { sessionId: session.id, decision: decision.decision });
  return Response.json({
    id: inserted.id,
    sessionId: session.id,
    sessionTitle: session.title,
    studentId: user.id,
    studentName: user.fullName,
    enrolmentNo: user.enrolmentNo,
    at: inserted.at,
    decision: decision.decision,
    confidence: decision.confidence,
    layers,
    reason,
    resolvedBy: null,
  });
});