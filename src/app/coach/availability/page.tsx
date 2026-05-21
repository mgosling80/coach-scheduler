import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { AvailabilityClient } from './availability-client';

export default async function AvailabilityPage() {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: classTypes } = await supabase
    .from('class_types')
    .select('id, name, color, duration_minutes')
    .eq('coach_id', authed.user.id)
    .eq('is_active', true)
    .order('name');

  const { data: blocks } = await supabase
    .from('availability_blocks')
    .select('id, class_type_id, day_of_week, start_time, end_time, effective_from, effective_until')
    .eq('coach_id', authed.user.id)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');

  return <AvailabilityClient classTypes={classTypes ?? []} blocks={blocks ?? []} />;
}
