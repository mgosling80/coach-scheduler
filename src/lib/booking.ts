import type { SupabaseClient } from '@supabase/supabase-js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = typeof DAY_KEYS[number];

const GRANULARITY_MIN = 30;
const DURATIONS = [30, 60] as const;

type AvailabilityBlock = {
  day_of_week: DayKey;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_until: string | null;
};

type Blackout = { start_at: string; end_at: string };

type ExistingSession = {
  id: string;
  class_type_id: string | null;
  start_at: string;
  end_at: string;
  capacity: number;
  booked_count: number;
};

export type DurationOption = {
  minutes: number;
  endIso: string;
  // 'free' = no overlap at all; 'joinable' = only overlaps sessions that
  // might be joinable (cap>1 not full) — final eligibility resolved at booking.
  state: 'free' | 'joinable';
};

export type StartTime = {
  startIso: string;
  label: string; // "4:00 PM"
  durations: DurationOption[];
};

export type DaySlots = {
  date: string; // YYYY-MM-DD
  label: string; // "Monday, June 2"
  starts: StartTime[];
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * General slots: every 30 min start across the coach's general availability,
 * each annotated with which durations (30/60) are feasible and their overlap state.
 */
export async function getGeneralSlots(
  supabase: SupabaseClient,
  coachId: string,
  bookingWindowHours: number,
  rangeStart: Date,
  rangeEnd: Date
): Promise<DaySlots[]> {
  const { data: blocks } = await supabase
    .from('availability_blocks')
    .select('day_of_week, start_time, end_time, effective_from, effective_until')
    .eq('coach_id', coachId)
    .eq('is_active', true);

  const { data: blackouts } = await supabase
    .from('blackouts')
    .select('start_at, end_at')
    .eq('coach_id', coachId)
    .lt('start_at', rangeEnd.toISOString())
    .gt('end_at', rangeStart.toISOString());

  const { data: sessions } = await supabase.rpc('coach_sessions_in_range', {
    p_coach_id: coachId,
    p_from: rangeStart.toISOString(),
    p_to: rangeEnd.toISOString(),
  });

  const existing: ExistingSession[] = (sessions as ExistingSession[]) ?? [];
  const blackoutRanges = (blackouts as Blackout[] ?? []).map((b) => [
    new Date(b.start_at).getTime(),
    new Date(b.end_at).getTime(),
  ]);

  const cutoff = Date.now() + bookingWindowHours * 3600 * 1000;

  const days: DaySlots[] = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  const endLimit = new Date(rangeEnd);
  endLimit.setHours(23, 59, 59, 999);

  while (cursor <= endLimit) {
    const dayKey = DAY_KEYS[cursor.getDay()];
    const dateStr = cursor.toISOString().slice(0, 10);
    const starts: StartTime[] = [];

    for (const block of (blocks ?? []) as AvailabilityBlock[]) {
      if (block.day_of_week !== dayKey) continue;
      if (block.effective_from > dateStr) continue;
      if (block.effective_until && block.effective_until < dateStr) continue;

      const [bsh, bsm] = block.start_time.split(':').map(Number);
      const [beh, bem] = block.end_time.split(':').map(Number);
      const blockStart = new Date(cursor); blockStart.setHours(bsh, bsm, 0, 0);
      const blockEnd = new Date(cursor); blockEnd.setHours(beh, bem, 0, 0);

      let t = new Date(blockStart);
      while (t.getTime() < blockEnd.getTime()) {
        const startMs = t.getTime();

        if (startMs >= cutoff) {
          const durations: DurationOption[] = [];

          for (const dur of DURATIONS) {
            const endMs = startMs + dur * 60000;
            if (endMs > blockEnd.getTime()) continue; // doesn't fit window

            // blackout overlap blocks it
            const inBlackout = blackoutRanges.some(([bs, be]) => overlaps(startMs, endMs, bs, be));
            if (inBlackout) continue;

            // Examine overlapping existing sessions
            let blocked = false;
            let onlyJoinable = false;
            for (const s of existing) {
              const ss = new Date(s.start_at).getTime();
              const se = new Date(s.end_at).getTime();
              if (!overlaps(startMs, endMs, ss, se)) continue;

              // An overlap exists. It's potentially joinable ONLY if it's an
              // exact same-interval session with capacity room. Otherwise blocked.
              const exactInterval = ss === startMs && se === endMs;
              const hasRoom = s.booked_count < s.capacity;
              if (exactInterval && s.capacity > 1 && hasRoom) {
                onlyJoinable = true; // could join if type matches
              } else {
                blocked = true;
                break;
              }
            }
            if (blocked) continue;

            durations.push({
              minutes: dur,
              endIso: new Date(endMs).toISOString(),
              state: onlyJoinable ? 'joinable' : 'free',
            });
          }

          if (durations.length > 0) {
            starts.push({
              startIso: new Date(startMs).toISOString(),
              label: new Date(startMs).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              }),
              durations,
            });
          }
        }

        t = new Date(startMs + GRANULARITY_MIN * 60000);
      }
    }

    if (starts.length > 0) {
      // de-dupe starts that could arise from overlapping blocks, keep first
      const seen = new Set<string>();
      const uniqueStarts = starts.filter((s) => {
        if (seen.has(s.startIso)) return false;
        seen.add(s.startIso);
        return true;
      });
      uniqueStarts.sort((a, b) => a.startIso.localeCompare(b.startIso));
      days.push({
        date: dateStr,
        label: new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        }),
        starts: uniqueStarts,
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}
