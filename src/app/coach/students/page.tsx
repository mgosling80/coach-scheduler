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
        .select('id, full_name, email, phone, photo_url')
        .in('id', studentIds)
    : { data: [] };

  const { data: studentInfos } = studentIds.length
    ? await supabase
        .from('student_profiles')
        .select('user_id, age, gym, level, team, comments')
        .in('user_id', studentIds)
    : { data: [] };

  // Aggregate no-show counts
  const { data: noShowRows } = await supabase.rpc('coach_student_noshow_counts', {
    p_coach_id: authed.user.id,
  });

  type NoShowRow = { student_id: string; no_show_count: number };
  const noShowMap: Record<string, number> = {};
  ((noShowRows as NoShowRow[]) ?? []).forEach((r) => {
    noShowMap[r.student_id] = r.no_show_count;
  });

  return (
    <StudentsListClient
      approvals={approvals ?? []}
      students={students ?? []}
      studentInfos={studentInfos ?? []}
      noShowMap={noShowMap}
    />
  );
}
