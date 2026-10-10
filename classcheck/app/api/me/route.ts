import { withHandler, requireUser, db } from '@/lib/server/auth';

export const GET = withHandler(async (req) => {
  const user = await requireUser(req);
  const [face, device] = await Promise.all([
    db().from('face_templates').select('created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
    db().from('device_keys').select('key_id,device_label').eq('user_id', user.id).maybeSingle(),
  ]);
  if (face.error) throw face.error;
  if (device.error) throw device.error;
  const { data: profile, error } = await db().from('profiles').select('consent_at').eq('id', user.id).single();
  if (error) throw error;
  const currentKeyId = req.headers.get('x-device-key-id');
  return Response.json({
    user,
    enrollment: {
      consentAt: profile.consent_at,
      faceEnrolled: (face.data?.length ?? 0) > 0,
      faceEnrolledAt: face.data?.[0]?.created_at ?? null,
      deviceRegistered: !!device.data,
      thisDeviceBound: !!device.data && currentKeyId === device.data.key_id,
      deviceLabel: device.data?.device_label ?? null,
    },
  });
});