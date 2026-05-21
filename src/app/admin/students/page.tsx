import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { StudentsClient } from './students-client';

export default async function AdminStudentsPage() {
  await requireRole('admin');
  const supabase = await createClient();

  // Everyone with the student role
  const { data: studentRoleRows } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'student');

  const studentIds = (studentRoleRows ?? []).map((r) => r.user_id);

  const { data: students } = studentIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .in('id', studentIds)
        .order('full_name')
    : { data: [] };

  const { data: studentInfos } = studentIds.length
    ? await supabase
        .from('student_profiles')
        .select('user_id, age, gym, level, team, comments')
        .in('user_id', studentIds)
    : { data: [] };

  const { data: coachRoleRows } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'coach');

  const coachIds = (coachRoleRows ?? []).map((r) => r.user_id);
  const { data: coaches } = coachIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', coachIds)
        .order('full_name')
    : { data: [] };

  const { data: approvals } = await supabase
    .from('coach_approvals')
    .select('id, student_id, coach_id, status, expires_at');

  return (
    <StudentsClient
      students={students ?? []}
      studentInfos={studentInfos ?? []}
      coaches={coaches ?? []}
      approvals={approvals ?? []}
    />
  );
}
