import { withHandler, requireUser, db, jsonError, isRecord, audit } from '@/lib/server/auth';

export const GET = withHandler(async (req) => {
  const user = await requireUser(req, ['instructor', 'admin']);
  let query = db().from('class_sessions').select('*').order('started_at', { ascending: false }).limit(100);
  if (user.role === 'instructor') query = query.eq('instructor_id', user.id);
  const { data, error } = await query;
  if (error) throw error;
  return Response.json(data ?? []);
});

export const POST = withHandler(async (req) => {
  const user = await requireUser(req, ['instructor', 'admin']);
  const body: unknown = await req.json();
  if (!isRecord(body) || typeof body.title !== 'string' || body.title.trim().length < 3 || body.title.length > 160) jsonError(400, 'Enter a session title between 3 and 160 characters.');
  if (!Number.isInteger(body.radiusM) || Number(body.radiusM) < 10 || Number(body.radiusM) > 1000) jsonError(400, 'Radius must be between 10 and 1000 metres.');
  if (!Number.isInteger(body.durationMin) || Number(body.durationMin) < 1 || Number(body.durationMin) > 240) jsonError(400, 'Duration must be between 1 and 240 minutes.');
  if (!isRecord(body.coords) || typeof body.coords.lat !== 'number' || !Number.isFinite(body.coords.lat) || body.coords.lat < -90 || body.coords.lat > 90 || typeof body.coords.lng !== 'number' || !Number.isFinite(body.coords.lng) || body.coords.lng < -180 || body.coords.lng > 180) jsonError(400, 'A valid classroom location is required.');
  const { error: closeError } = await db().from('class_sessions').update({ status: 'closed' }).eq('instructor_id', user.id).eq('status', 'open');
  if (closeError) throw closeError;
  const now = new Date();
  const endsAt = new Date(now.getTime() + Number(body.durationMin) * 60_000).toISOString();
  const { data, error } = await db().from('class_sessions').insert({
    title: body.title.trim(), radius_m: body.radiusM, duration_min: body.durationMin,
    lat: body.coords.lat, lng: body.coords.lng, ends_at: endsAt, instructor_id: user.id, status: 'open',
  }).select('*').single();
  if (error) throw error;
  await audit(user.id, 'session.created', data.id, { radiusM: data.radius_m });
  return Response.json(data, { status: 201 });
});