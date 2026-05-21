import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { MyBookingsClient } from './my-bookings-client';

export default async function MyBookingsPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      booked_at,
      sessions!inner (
        id,
        start_at,
        end_at,
        coach_id,
        class_type_id,
        cancelled
      )
    `)
    .eq('student_id', authed.user.id)
    .in('status', ['confirmed'])
    .order('booked_at', { ascending: false });

  // Resolve coach names and class type names
  const sessionList = (bookings ?? []).map((b) => b.sessions).flat();
  const coachIds = Array.from(new Set(sessionList.map((s) => s.coach_id)));
  const classTypeIds = Array.from(new Set(sessionList.map((s) => s.class_type_id)));

  const { data: coaches } = coachIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', coachIds)
    : { data: [] };

  const { data: classTypes } = classTypeIds.length
    ? await supabase.from('class_types').select('id, name, color').in('id', classTypeIds)
    : { data: [] };

  const coachMap = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));
  const ctMap = new Map((classTypes ?? []).map((ct) => [ct.id, ct]));

  const items = (bookings ?? []).map((b) => {
    const s = Array.isArray(b.sessions) ? b.sessions[0] : b.sessions;
    return {
      bookingId: b.id,
      status: b.status as string,
      sessionId: s.id,
      startAt: s.start_at,
      endAt: s.end_at,
      coachId: s.coach_id,
      coachName: coachMap.get(s.coach_id) ?? 'Unknown',
      classTypeName: ctMap.get(s.class_type_id)?.name ?? 'Unknown',
      classTypeColor: ctMap.get(s.class_type_id)?.color ?? '#3b82f6',
      cancelled: s.cancelled,
    };
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">My bookings</h2>
        <MyBookingsClient bookings={items} />
      </main>
    </div>
  );
}
