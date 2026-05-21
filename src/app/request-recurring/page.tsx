import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RecurringRequestForm } from './form';

export default async function RecurringRequestPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const now = new Date().toISOString();
  const { data: approvals } = await supabase
    .from('coach_approvals')
    .select('coach_id, expires_at')
    .eq('student_id', authed.user.id)
    .eq('status', 'approved');

  const valid = (approvals ?? []).filter(
    (a) => a.expires_at === null || new Date(a.expires_at) > new Date(now)
  );
  const coachIds = valid.map((a) => a.coach_id);

  const { data: coaches } = coachIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', coachIds).order('full_name')
    : { data: [] };

  const { data: classTypes } = coachIds.length
    ? await supabase
        .from('class_types')
        .select('id, coach_id, name, duration_minutes')
        .in('coach_id', coachIds)
        .eq('is_active', true)
        .order('name')
    : { data: [] };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold text-gray-900">
            Coach Scheduler
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/my-bookings" className="text-sm text-gray-600 hover:text-gray-900 mb-2 inline-block">
          ← Back to my bookings
        </Link>
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Request recurring booking</h2>
            <p className="text-sm text-gray-600 mt-1">
              An admin will review your request. If approved, the system books all available instances.
            </p>
          </div>
          {coaches && coaches.length > 0 ? (
            <RecurringRequestForm coaches={coaches} classTypes={classTypes ?? []} />
          ) : (
            <div className="p-6 text-sm text-gray-500">
              You&apos;re not approved with any coaches yet.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
