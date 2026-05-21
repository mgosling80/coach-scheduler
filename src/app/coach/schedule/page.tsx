import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { ScheduleClient } from './schedule-client';

export default async function CoachSchedulePage() {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const fourWeeksAhead = new Date(Date.now() + 28 * 24 * 3600 * 1000).toISOString();
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, start_at, end_at, class_type_id, capacity, cancelled, cancelled_reason')
    .eq('coach_id', authed.user.id)
    .gte('start_at', fourWeeksAgo)
    .lte('start_at', fourWeeksAhead)
    .order('start_at');

  const classTypeIds = Array.from(new Set((sessions ?? []).map((s) => s.class_type_id)));
  const { data: classTypes } = classTypeIds.length
    ? await supabase
        .from('class_types')
        .select('id, name, color')
        .in('id', classTypeIds)
    : { data: [] };

  type BookingRow = {
    booking_id: string;
    student_id: string;
    student_name: string;
    student_email: string;
    status: string;
    booked_at: string;
    marked_no_show_at: string | null;
  };
  type WaitRow = {
    waitlist_id: string;
    student_id: string;
    student_name: string;
    wait_position: number;
    joined_at: string;
    promoted_at: string | null;
    promotion_expires_at: string | null;
  };

  const sessionsWithDetails = await Promise.all(
    (sessions ?? []).map(async (session) => {
      const { data: bookings } = await supabase.rpc('coach_session_bookings', {
        p_session_id: session.id,
      });
      const { data: waitlist } = await supabase.rpc('coach_session_waitlist', {
        p_session_id: session.id,
      });

      return {
        id: session.id,
        startAt: session.start_at,
        endAt: session.end_at,
        classTypeId: session.class_type_id,
        capacity: session.capacity,
        cancelled: session.cancelled,
        cancelledReason: session.cancelled_reason,
        bookings: ((bookings as BookingRow[]) ?? []),
        waitlist: ((waitlist as WaitRow[]) ?? []),
      };
    })
  );

  const classTypeMap = new Map(
    (classTypes ?? []).map((ct) => [ct.id, { name: ct.name, color: ct.color }])
  );

  return (
    <ScheduleClient
      sessions={sessionsWithDetails}
      classTypeMap={Object.fromEntries(classTypeMap)}
      now={now}
    />
  );
}
