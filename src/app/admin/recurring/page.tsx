import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { RecurringAdminClient } from './client';

export default async function AdminRecurringPage() {
  await requireRole('admin');
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from('recurring_booking_requests')
    .select('*')
    .order('requested_at', { ascending: false });

  const studentIds = Array.from(new Set((requests ?? []).map((r) => r.student_id)));
  const coachIds = Array.from(new Set((requests ?? []).map((r) => r.coach_id)));
  const ctIds = Array.from(new Set((requests ?? []).map((r) => r.class_type_id)));

  const { data: students } = studentIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', studentIds)
    : { data: [] };
  const { data: coaches } = coachIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', coachIds)
    : { data: [] };
  const { data: classTypes } = ctIds.length
    ? await supabase.from('class_types').select('id, name, color').in('id', ctIds)
    : { data: [] };

  return (
    <RecurringAdminClient
      requests={requests ?? []}
      students={students ?? []}
      coaches={coaches ?? []}
      classTypes={classTypes ?? []}
    />
  );
}
