import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { StudentsListClient } from './students-list-client';

export default async function CoachStudentsPage() {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: approvals } = await supabase
    .from('coach_approvals')
    .select('id, student_id, status, requested_at, decided_at, expires_at, decline_reason')
    .eq('coach_id', authed.user.id)
    .order('requested_at', { ascending: false });

  const studentIds = (approvals ?? []).map((a) => a.student_id);
  const { data: students } = studentIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .in('id', studentIds)
    : { data: [] };

  const { data: studentInfos } = studentIds.length
    ? await supabase
        .from('student_profiles')
        .select('user_id, age, gym, level, team, comments')
        .in('user_id', studentIds)
    : { data: [] };

  return (
    <StudentsListClient
      approvals={approvals ?? []}
      students={students ?? []}
      studentInfos={studentInfos ?? []}
    />
  );
}
