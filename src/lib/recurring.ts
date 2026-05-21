import type { SupabaseClient } from '@supabase/supabase-js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = typeof DAY_KEYS[number];

export type RecurringInstance = {
  startAt: string;
  endAt: string;
  status: 'available' | 'full' | 'blackout' | 'no_availability' | 'already_booked' | 'past';
  reason?: string;
};

/**
 * Given a recurring booking request, produce a list of instance dates and
 * each one's bookability status. Pure computation against availability,
 * blackouts, and existing sessions/bookings.
 */
export async function computeRecurringInstances(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    coachId: string;
    classTypeId: string;
    dayOfWeek: DayKey;
    startTime: string; // HH:MM
    horizonWeeks: number;
  }
): Promise<RecurringInstance[]> {
  const { data: classType } = await supabase
    .from('class_types')
    .select('duration_minutes, capacity')
    .eq('id', params.classTypeId)
    .maybeSingle();

  if (!classType) return [];

  // Find next occurrence of dayOfWeek from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDayIdx = DAY_KEYS.indexOf(params.dayOfWeek);
  const todayDayIdx = today.getDay();
  let daysUntilFirst = (targetDayIdx - todayDayIdx + 7) % 7;
  if (daysUntilFirst === 0) daysUntilFirst = 7; // start next week
  const firstInstance = new Date(today);
  firstInstance.setDate(firstInstance.getDate() + daysUntilFirst);

  const [hh, mm] = params.startTime.split(':').map(Number);

  // Generate all instance start times
  const instanceStarts: Date[] = [];
  for (let i = 0; i < params.horizonWeeks; i++) {
    const d = new Date(firstInstance);
    d.setDate(d.getDate() + i * 7);
    d.setHours(hh, mm, 0, 0);
    instanceStarts.push(d);
  }

  if (instanceStarts.length === 0) return [];

  const rangeStart = instanceStarts[0];
  const rangeEnd = new Date(instanceStarts[instanceStarts.length - 1].getTime() + classType.duration_minutes * 60000);

  // Availability for this class type
  const { data: availability } = await supabase
    .from('availability_blocks')
    .select('day_of_week, start_time, end_time, effective_from, effective_until')
    .eq('coach_id', params.coachId)
    .eq('class_type_id', params.classTypeId)
    .eq('is_active', true);

  // Blackouts overlapping range
  const { data: blackouts } = await supabase
    .from('blackouts')
    .select('start_at, end_at')
    .eq('coach_id', params.coachId)
    .lt('start_at', rangeEnd.toISOString())
    .gt('end_at', rangeStart.toISOString());

  // Existing sessions in range
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, start_at, capacity, cancelled')
    .eq('coach_id', params.coachId)
    .eq('class_type_id', params.classTypeId)
    .gte('start_at', rangeStart.toISOString())
    .lte('start_at', rangeEnd.toISOString());

  // Booking counts and existing bookings for this student
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: bookings } = sessionIds.length
    ? await supabase
        .from('bookings')
        .select('session_id, student_id, status')
        .in('session_id', sessionIds)
        .in('status', ['confirmed', 'completed', 'no_show'])
    : { data: [] };

  const sessionMap = new Map<string, typeof sessions[number]>();
  (sessions ?? []).forEach((s) => sessionMap.set(s.start_at, s));

  const bookingCountBySession = new Map<string, number>();
  const studentBookedSessions = new Set<string>();
  (bookings ?? []).forEach((b) => {
    bookingCountBySession.set(b.session_id, (bookingCountBySession.get(b.session_id) ?? 0) + 1);
    if (b.student_id === params.studentId) studentBookedSessions.add(b.session_id);
  });

  return instanceStarts.map((start): RecurringInstance => {
    const end = new Date(start.getTime() + classType.duration_minutes * 60000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const dateStr = start.toISOString().slice(0, 10);

    // Past?
    if (start < new Date()) {
      return { startAt: startIso, endAt: endIso, status: 'past' };
    }

    // Inside availability window?
    const dayKey = DAY_KEYS[start.getDay()];
    const matchingBlock = (availability ?? []).find((b) => {
      if (b.day_of_week !== dayKey) return false;
      if (b.effective_from > dateStr) return false;
      if (b.effective_until && b.effective_until < dateStr) return false;
      // Check if the instance time fits within the block
      const blockStartMinutes = timeToMinutes(b.start_time);
      const blockEndMinutes = timeToMinutes(b.end_time);
      const instanceStartMinutes = hh * 60 + mm;
      const instanceEndMinutes = instanceStartMinutes + classType.duration_minutes;
      return instanceStartMinutes >= blockStartMinutes && instanceEndMinutes <= blockEndMinutes;
    });
    if (!matchingBlock) {
      return { startAt: startIso, endAt: endIso, status: 'no_availability' };
    }

    // Inside blackout?
    const inBlackout = (blackouts ?? []).some(
      (b) => new Date(b.start_at) < end && new Date(b.end_at) > start
    );
    if (inBlackout) {
      return { startAt: startIso, endAt: endIso, status: 'blackout' };
    }

    // Existing session?
    const existing = sessionMap.get(startIso);
    if (existing) {
      if (existing.cancelled) {
        return { startAt: startIso, endAt: endIso, status: 'no_availability', reason: 'Session cancelled' };
      }
      if (studentBookedSessions.has(existing.id)) {
        return { startAt: startIso, endAt: endIso, status: 'already_booked' };
      }
      const bookedCount = bookingCountBySession.get(existing.id) ?? 0;
      if (bookedCount >= existing.capacity) {
        return { startAt: startIso, endAt: endIso, status: 'full' };
      }
    }

    return { startAt: startIso, endAt: endIso, status: 'available' };
  });
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
