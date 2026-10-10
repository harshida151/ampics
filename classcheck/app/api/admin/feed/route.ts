import { withHandler, requireUser, db, jsonError } from '@/lib/server/auth';
import type { Decision } from '@/lib/types';

export const GET = withHandler(async (req) => {
  const user = await requireUser(req, ['admin', 'instructor']);
  const url = new URL(req.url);
  const decision = url.searchParams.get('decision');
  const sessionId = url.searchParams.get('sessionId');
  if (user.role === 'instructor' && !sessionId) jsonError(403, 'Instructors may only view an individual class session.');
  if (decision && !['APPROVED', 'REVIEW', 'REJECTED'].includes(decision)) jsonError(400, 'Invalid decision filter.');
  let query = db().from('check_ins').select('*').order('at', { ascending: false }).limit(1000);
  if (decision) query = query.eq('decision', decision);
  if (sessionId) query = query.eq('session_id', sessionId);
  const { data: rows, error } = await query;
  if (error) throw error;
  if (user.role === 'instructor') {
    const { data: session, error: sessionError } = await db().from('class_sessions').select('id').eq('id', sessionId!).eq('instructor_id', user.id).maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) jsonError(403, 'You cannot view this class session.');
  }
  const userIds = [...new Set((rows ?? []).map((row) => row.student_id))];
  const sessionIds = [...new Set((rows ?? []).map((row) => row.session_id))];
  const [profiles, sessions, reviewers] = await Promise.all([
    userIds.length ? db().from('profiles').select('id,full_name,enrolment_no').in('id', userIds) : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? db().from('class_sessions').select('id,title').in('id', sessionIds) : Promise.resolve({ data: [], error: null }),
    [...new Set((rows ?? []).map((row) => row.resolved_by).filter(Boolean))].length
      ? db().from('profiles').select('id,full_name').in('id', [...new Set((rows ?? []).map((row) => row.resolved_by).filter(Boolean))])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error) throw profiles.error;
  if (sessions.error) throw sessions.error;
  if (reviewers.error) throw reviewers.error;
  const profileMap = new Map((profiles.data ?? []).map((row) => [row.id, row]));
  const sessionMap = new Map((sessions.data ?? []).map((row) => [row.id, row]));
  const reviewerMap = new Map((reviewers.data ?? []).map((row) => [row.id, row.full_name]));
  return Response.json((rows ?? []).map((row) => {
    const profile = profileMap.get(row.student_id);
    return {
      id: row.id,
      sessionId: row.session_id,
      sessionTitle: sessionMap.get(row.session_id)?.title ?? 'Class session',
      studentId: row.student_id,
      studentName: profile?.full_name ?? 'Unknown student',
      enrolmentNo: profile?.enrolment_no ?? '',
      at: row.at,
      decision: row.decision as Decision,
      confidence: row.confidence,
      layers: row.layers,
      reason: row.reason,
      resolvedBy: row.resolved_by ? reviewerMap.get(row.resolved_by) ?? 'Administrator' : null,
    };
  }));
});