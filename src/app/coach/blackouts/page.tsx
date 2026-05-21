import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { BlackoutsClient } from './blackouts-client';

export default async function BlackoutsPage() {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const now = new Date().toISOString();
  const { data: blackouts } = await supabase
    .from('blackouts')
    .select('id, start_at, end_at, reason')
    .eq('coach_id', authed.user.id)
    .gte('end_at', now)
    .order('start_at');

  return <BlackoutsClient blackouts={blackouts ?? []} />;
}
