import type { SupabaseClient } from '@supabase/supabase-js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = typeof DAY_KEYS[number];

export type RecurringInstance = {
  startAt: string;
  endAt: string;
  status: 'available' | 'full' | 'blackout' | 'no_availability' | 'already_booked' | 'conflict' | 'past';
  reason?: string;
};

type RangeSession = {
  id: string;
  class_type_id: string | null;
  start_at: string;
  end_at: string;
  capacity: number;
  booked_count: number;
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Compute recurring instance statuses against GENERAL availability and the
 * same overlap rule used for one-off booking:
 *  - available: interval fits a general window, no blackout, and either no
 *    overlap OR overlaps only an exact-match same-type session with room.
 *  - already_booked: the student already holds the exact session.
 *  - full: exact-match same-type session exists but is full.
 *  - conflict: overlaps a different/non-joinable session.
 */
export async function computeRecurringInstances(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    coachId: string;
    classTypeId: string;
    dayOfWeek: DayKey;
    startTime: string; // HH:MM
    durationMinutes: number;
    horizonWeeks: number;
  }
): Promise<RecurringInstance[]> {
  const duration = params.durationMinutes;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDayIdx = DAY_KEYS.indexOf(params.dayOfWeek);
  const todayDayIdx = today.getDay();
  let daysUntilFirst = (targetDayIdx - todayDayIdx + 7) % 7;
  if (daysUntilFirst === 0) daysUntilFirst = 7;
  const firstInstance = new Date(today);
  firstInstance.setDate(firstInstance.getDate() + daysUntilFirst);

  const [hh, mm] = params.startTime.split(':').map(Number);

  const instanceStarts: Date[] = [];
  for (let i = 0; i < params.horizonWeeks; i++) {
    const d = new Date(firstInstance);
    d.setDate(d.getDate() + i * 7);
    d.setHours(hh, mm, 0, 0);
    instanceStarts.push(d);
  }
  if (instanceStarts.length === 0) return [];

  const rangeStart = instanceStarts[0];
  const rangeEnd = new Date(instanceStarts[instanceStarts.length - 1].getTime() + duration * 60000);

  // General availability (no class_type filter)
  const { data: availability } = await supabase
    .from('availability_blocks')
    .select('day_of_week, start_time, end_time, effective_from, effective_until')
    .eq('coach_id', params.coachId)
    .eq('is_active', true);

  const { data: blackouts } = await supabase
    .from('blackouts')
    .select('start_at, end_at')
    .eq('coach_id', params.coachId)
    .lt('start_at', rangeEnd.toISOString())
    .gt('end_at', rangeStart.toISOString());

  // All overlapping sessions in range via security-definer fn
  const { data: rangeSessions } = await supabase.rpc('coach_sessions_in_range', {
    p_coach_id: params.coachId,
    p_from: rangeStart.toISOString(),
    p_to: rangeEnd.toISOString(),
  });
  const sessions = (rangeSessions as RangeSession[]) ?? [];

  // Which of those sessions the student already holds
  const sessionIds = sessions.map((s) => s.id);
  const { data: myBookings } = sessionIds.length
    ? await supabase
        .from('bookings')
        .select('session_id')
        .in('session_id', sessionIds)
        .eq('student_id', params.studentId)
        .in('status', ['confirmed', 'completed', 'no_show'])
    : { data: [] };
  const myBookedSessions = new Set((myBookings ?? []).map((b) => b.session_id));

  const instanceEndMinutes = hh * 60 + mm + duration;

  return instanceStarts.map((start): RecurringInstance => {
    const end = new Date(start.getTime() + duration * 60000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const dateStr = start.toISOString().slice(0, 10);
    const startMs = start.getTime();
    const endMs = end.getTime();

    if (start < new Date()) {
      return { startAt: startIso, endAt: endIso, status: 'past' };
    }

    // Fits a general availability window?
    const dayKey = DAY_KEYS[start.getDay()];
    const instanceStartMinutes = hh * 60 + mm;
    const fits = (availability ?? []).some((b) => {
      if (b.day_of_week !== dayKey) return false;
      if (b.effective_from > dateStr) return false;
      if (b.effective_until && b.effective_until < dateStr) return false;
      const bs = timeToMinutes(b.start_time);
      const be = timeToMinutes(b.end_time);
      return instanceStartMinutes >= bs && instanceEndMinutes <= be;
    });
    if (!fits) {
      return { startAt: startIso, endAt: endIso, status: 'no_availability' };
    }

    // Blackout?
    const inBlackout = (blackouts ?? []).some(
      (b) => new Date(b.start_at).getTime() < endMs && new Date(b.end_at).getTime() > startMs
    );
    if (inBlackout) {
      return { startAt: startIso, endAt: endIso, status: 'blackout' };
    }

    // Overlap analysis
    const overlapping = sessions.filter((s) =>
      overlaps(startMs, endMs, new Date(s.start_at).getTime(), new Date(s.end_at).getTime())
    );

    const target = overlapping.find(
      (s) =>
        new Date(s.start_at).getTime() === startMs &&
        new Date(s.end_at).getTime() === endMs &&
        s.class_type_id === params.classTypeId
    );

    // Any non-target overlap = conflict
    const nonTarget = overlapping.find((s) => !target || s.id !== target.id);
    if (nonTarget && (!target || nonTarget.id !== target.id)) {
      return { startAt: startIso, endAt: endIso, status: 'conflict', reason: 'Overlaps another lesson' };
    }

    if (target) {
      if (myBookedSessions.has(target.id)) {
        return { startAt: startIso, endAt: endIso, status: 'already_booked' };
      }
      if (target.booked_count >= target.capacity) {
        return { startAt: startIso, endAt: endIso, status: 'full' };
      }
    }

    return { startAt: startIso, endAt: endIso, status: 'available' };
  });
}
