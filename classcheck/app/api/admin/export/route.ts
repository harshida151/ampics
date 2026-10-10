import { withHandler, requireUser, db, jsonError, audit } from '@/lib/server/auth';
import { LAYER_KEYS } from '@/lib/layers';

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const GET = withHandler(async (req) => {
  const user = await requireUser(req, ['admin']);
  const decision = new URL(req.url).searchParams.get('decision') ?? 'ALL';
  if (!['ALL', 'APPROVED', 'REVIEW', 'REJECTED'].includes(decision)) jsonError(400, 'Invalid decision filter.');
  let query = db().from('check_ins').select('*').order('at', { ascending: false }).limit(5000);
  if (decision !== 'ALL') query = query.eq('decision', decision);
  const { data: rows, error } = await query;
  if (error) throw error;
  const ids = [...new Set((rows ?? []).map((row) => row.student_id))];
  const sessions = [...new Set((rows ?? []).map((row) => row.session_id))];
  const [profiles, classes] = await Promise.all([
    ids.length ? db().from('profiles').select('id,full_name,enrolment_no').in('id', ids) : Promise.resolve({ data: [], error: null }),
    sessions.length ? db().from('class_sessions').select('id,title').in('id', sessions) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error) throw profiles.error;
  if (classes.error) throw classes.error;
  const people = new Map((profiles.data ?? []).map((row) => [row.id, row]));
  const classNames = new Map((classes.data ?? []).map((row) => [row.id, row.title]));
  const header = ['id', 'time', 'session', 'student', 'enrolment_no', 'decision', 'confidence', ...LAYER_KEYS.map((key) => `${key}_score`), 'reason', 'resolved_by'];
  const lines = (rows ?? []).map((row) => {
    const person = people.get(row.student_id);
    const layers = row.layers as Record<string, { score?: number }>;
    const values = [row.id, row.at, classNames.get(row.session_id) ?? '', person?.full_name ?? '', person?.enrolment_no ?? '', row.decision, row.confidence, ...LAYER_KEYS.map((key) => layers[key]?.score ?? ''), row.reason, row.resolved_by ?? ''];
    return values.map(csvCell).join(',');
  });
  await audit(user.id, 'attendance.exported', null, { decision, rowCount: lines.length });
  return new Response([header.join(','), ...lines].join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="classcheck-export.csv"', 'cache-control': 'no-store' },
  });
});