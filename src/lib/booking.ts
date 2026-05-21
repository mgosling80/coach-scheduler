import type { SupabaseClient } from '@supabase/supabase-js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = typeof DAY_KEYS[number];

type AvailabilityBlock = {
  day_of_week: DayKey;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_until: string | null;
};

type Blackout = {
  start_at: string;
  end_at: string;
};

type ClassTypeInfo = {
  id: string;
  coach_id: string;
  duration_minutes: number;
  capacity: number;
  booking_window_hours: number | null;
  cancel_window_hours: number | null;
};

type CoachDefaults = {
  default_booking_window_hours: number;
  default_cancel_window_hours: number;
};

export type Slot = {
  start: Date;
  end: Date;
  bookedCount: number;
  capacity: number;
  isFull: boolean;
  sessionId: string | null;
  studentIsBooked: boolean;
  studentIsWaitlisted: boolean;
};

/**
 * Generate bookable slots for a class type over a date range.
 * Filters out: slots already past the booking window, slots inside blackouts.
 * Annotates: capacity, booked count, and whether the current student is booked or waitlisted.
 */
export async function getBookableSlots(
  supabase: SupabaseClient,
  classType: ClassTypeInfo,
  coachDefaults: CoachDefaults,
  rangeStart: Date,
  rangeEnd: Date,
  studentId: string | null
): Promise<Slot[]> {
  // Pull availability blocks for this class type
  const { data: blocks } = await supabase
    .from('availability_blocks')
    .select('day_of_week, start_time, end_time, effective_from, effective_until')
    .eq('coach_id', classType.coach_id)
    .eq('class_type_id', classType.id)
    .eq('is_active', true);

  // Pull blackouts that overlap the range
  const { data: blackouts } = await supabase
    .from('blackouts')
    .select('start_at, end_at')
    .eq('coach_id', classType.coach_id)
    .lt('start_at', rangeEnd.toISOString())
    .gt('end_at', rangeStart.toISOString());

  // Pull existing sessions for this class type in range
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, start_at, capacity, cancelled')
    .eq('coach_id', classType.coach_id)
    .eq('class_type_id', classType.id)
    .gte('start_at', rangeStart.toISOString())
    .lte('start_at', rangeEnd.toISOString());

  // Booking counts per session
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: bookings } = sessionIds.length
    ? await supabase
        .from('bookings')
        .select('session_id, student_id, status')
        .in('session_id', sessionIds)
        .in('status', ['confirmed', 'completed', 'no_show'])
    : { data: [] };

  // Waitlist for the current student
  const { data: waitlist } = sessionIds.length && studentId
    ? await supabase
        .from('waitlist_entries')
        .select('session_id, student_id')
        .in('session_id', sessionIds)
        .eq('student_id', studentId)
    : { data: [] };

  const sessionsByStart = new Map<string, NonNullable<typeof sessions>[number]>();
  (sessions ?? []).forEach((s) => {
    if (!s.cancelled) sessionsByStart.set(s.start_at, s);
  });

  const bookingCountBySession = new Map<string, number>();
  const studentBookedSessions = new Set<string>();
  (bookings ?? []).forEach((b) => {
    bookingCountBySession.set(b.session_id, (bookingCountBySession.get(b.session_id) ?? 0) + 1);
    if (studentId && b.student_id === studentId) studentBookedSessions.add(b.session_id);
  });

  const studentWaitlistedSessions = new Set((waitlist ?? []).map((w) => w.session_id));

  const bookingWindowHours = classType.booking_window_hours ?? coachDefaults.default_booking_window_hours;
  const cutoff = new Date(Date.now() + bookingWindowHours * 3600 * 1000);

  const slots: Slot[] = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  const endLimit = new Date(rangeEnd);
  endLimit.setHours(23, 59, 59, 999);

  while (cursor <= endLimit) {
    const dayKey = DAY_KEYS[cursor.getDay()];
    const dateStr = cursor.toISOString().slice(0, 10);

    for (const block of (blocks ?? []) as AvailabilityBlock[]) {
      if (block.day_of_week !== dayKey) continue;
      if (block.effective_from > dateStr) continue;
      if (block.effective_until && block.effective_until < dateStr) continue;

      // Emit slots at duration intervals
      const [bsh, bsm] = block.start_time.split(':').map(Number);
      const [beh, bem] = block.end_time.split(':').map(Number);
      const blockStart = new Date(cursor);
      blockStart.setHours(bsh, bsm, 0, 0);
      const blockEnd = new Date(cursor);
      blockEnd.setHours(beh, bem, 0, 0);

      let slotStart = new Date(blockStart);
      while (slotStart.getTime() + classType.duration_minutes * 60000 <= blockEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + classType.duration_minutes * 60000);

        // Skip past booking window
        if (slotStart < cutoff) {
          slotStart = new Date(slotStart.getTime() + classType.duration_minutes * 60000);
          continue;
        }

        // Skip if overlaps a blackout
        const inBlackout = (blackouts ?? []).some(
          (b) => new Date(b.start_at) < slotEnd && new Date(b.end_at) > slotStart
        );
        if (inBlackout) {
          slotStart = new Date(slotStart.getTime() + classType.duration_minutes * 60000);
          continue;
        }

        const existingSession = sessionsByStart.get(slotStart.toISOString());
        const sessionId = existingSession?.id ?? null;
        const capacity = existingSession?.capacity ?? classType.capacity;
        const bookedCount = sessionId ? bookingCountBySession.get(sessionId) ?? 0 : 0;

        slots.push({
          start: new Date(slotStart),
          end: new Date(slotEnd),
          bookedCount,
          capacity,
          isFull: bookedCount >= capacity,
          sessionId,
          studentIsBooked: sessionId ? studentBookedSessions.has(sessionId) : false,
          studentIsWaitlisted: sessionId ? studentWaitlistedSessions.has(sessionId) : false,
        });

        slotStart = new Date(slotStart.getTime() + classType.duration_minutes * 60000);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return slots;
}
