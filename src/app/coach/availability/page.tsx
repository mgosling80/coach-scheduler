import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { AvailabilityClient } from './availability-client';

export default async function AvailabilityPage() {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: blocks } = await supabase
    .from('availability_blocks')
    .select('id, day_of_week, start_time, end_time, effective_from, effective_until')
    .eq('coach_id', authed.user.id)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');

  const { data: coach } = await supabase
    .from('coach_profiles')
    .select('groupme_bot_id, availability_last_published_at')
    .eq('user_id', authed.user.id)
    .maybeSingle();

  return (
    <AvailabilityClient
      blocks={blocks ?? []}
      hasGroupMe={!!coach?.groupme_bot_id}
      lastPublishedAt={coach?.availability_last_published_at ?? null}
    />
  );
}
