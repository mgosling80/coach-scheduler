#!/usr/bin/env bash
# install-general-availability-stage3.sh
# Stage 3: recurring bookings updated for general availability + overlap rule.
# Run from project root: bash install-general-availability-stage3.sh

set -e
if [ ! -f package.json ]; then echo "ERROR: run from project root."; exit 1; fi

# ============================================================
# Schema: add duration_minutes to recurring requests
# ============================================================
echo "Writing schema-recurring-duration.sql"
cat > schema-recurring-duration.sql << 'FILE_EOF'
alter table recurring_booking_requests
  add column if not exists duration_minutes int not null default 60;
FILE_EOF

# ============================================================
# Rewrite recurring instance computation (general + overlap)
# ============================================================
echo "Rewriting src/lib/recurring.ts"
cat > src/lib/recurring.ts << 'FILE_EOF'
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
FILE_EOF

# ============================================================
# Update request action to capture duration
# ============================================================
echo "Updating request-recurring action (duration)"
python3 - << 'PYEOF'
path = 'src/app/request-recurring/actions.ts'
with open(path) as f:
    c = f.read()
c = c.replace(
    "  horizon_weeks: z.coerce.number().int().min(1).max(52),\n});",
    "  duration_minutes: z.coerce.number().int().refine((v) => v === 30 || v === 60, 'Pick 30 or 60'),\n  horizon_weeks: z.coerce.number().int().min(1).max(52),\n});"
)
c = c.replace(
    "    start_time: formData.get('start_time'),\n    horizon_weeks: formData.get('horizon_weeks'),",
    "    start_time: formData.get('start_time'),\n    duration_minutes: formData.get('duration_minutes'),\n    horizon_weeks: formData.get('horizon_weeks'),"
)
c = c.replace(
    "    start_time: parsed.data.start_time,\n    horizon_weeks: parsed.data.horizon_weeks,",
    "    start_time: parsed.data.start_time,\n    duration_minutes: parsed.data.duration_minutes,\n    horizon_weeks: parsed.data.horizon_weeks,"
)
with open(path, 'w') as f:
    f.write(c)
print("Updated request action")
PYEOF

# ============================================================
# Update request form: add duration, drop duration-from-classtype label
# ============================================================
echo "Updating request-recurring form (duration field)"
python3 - << 'PYEOF'
path = 'src/app/request-recurring/form.tsx'
with open(path) as f:
    c = f.read()

# class type option: don't show per-type duration anymore (duration is separate)
c = c.replace(
    "              <option key={ct.id} value={ct.id}>\n                {ct.name} ({ct.duration_minutes} min)\n              </option>",
    "              <option key={ct.id} value={ct.id}>\n                {ct.name}\n              </option>"
)
# relabel "Class type" -> "Lesson type"
c = c.replace(
    '<label className="block text-sm font-medium text-gray-700 mb-1">Class type</label>',
    '<label className="block text-sm font-medium text-gray-700 mb-1">Lesson type</label>'
)

# Add a Duration select next to Start time. Replace the day/start grid block.
old_grid = """      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Day of week</label>
          <select
            name="day_of_week"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="mon">Monday</option>
            <option value="tue">Tuesday</option>
            <option value="wed">Wednesday</option>
            <option value="thu">Thursday</option>
            <option value="fri">Friday</option>
            <option value="sat">Saturday</option>
            <option value="sun">Sunday</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
          <input
            type="time"
            name="start_time"
            required
            defaultValue="16:00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>"""

new_grid = """      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Day of week</label>
          <select
            name="day_of_week"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="mon">Monday</option>
            <option value="tue">Tuesday</option>
            <option value="wed">Wednesday</option>
            <option value="thu">Thursday</option>
            <option value="fri">Friday</option>
            <option value="sat">Saturday</option>
            <option value="sun">Sunday</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
          <input
            type="time"
            name="start_time"
            required
            defaultValue="16:00"
            step={1800}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Length</label>
          <select
            name="duration_minutes"
            required
            defaultValue="60"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </div>
      </div>"""

c = c.replace(old_grid, new_grid)
with open(path, 'w') as f:
    f.write(c)
print("Updated request form")
PYEOF

# ============================================================
# Update admin commit/preview to pass duration + respect overlap
# ============================================================
echo "Updating admin recurring actions (duration + overlap-safe commit)"
python3 - << 'PYEOF'
path = 'src/app/admin/recurring/actions.ts'
with open(path) as f:
    c = f.read()

# previewRecurring: pass durationMinutes
c = c.replace(
    """  const instances = await computeRecurringInstances(supabase, {
    studentId: req.student_id,
    coachId: req.coach_id,
    classTypeId: req.class_type_id,
    dayOfWeek: req.day_of_week,
    startTime: req.start_time,
    horizonWeeks: req.horizon_weeks,
  });

  return { ok: true, instances };""",
    """  const instances = await computeRecurringInstances(supabase, {
    studentId: req.student_id,
    coachId: req.coach_id,
    classTypeId: req.class_type_id,
    dayOfWeek: req.day_of_week,
    startTime: req.start_time,
    durationMinutes: req.duration_minutes ?? 60,
    horizonWeeks: req.horizon_weeks,
  });

  return { ok: true, instances };"""
)

# commitRecurring: pass durationMinutes
c = c.replace(
    """  const instances = await computeRecurringInstances(supabase, {
    studentId: req.student_id,
    coachId: req.coach_id,
    classTypeId: req.class_type_id,
    dayOfWeek: req.day_of_week,
    startTime: req.start_time,
    horizonWeeks: req.horizon_weeks,
  });

  const bookable""",
    """  const instances = await computeRecurringInstances(supabase, {
    studentId: req.student_id,
    coachId: req.coach_id,
    classTypeId: req.class_type_id,
    dayOfWeek: req.day_of_week,
    startTime: req.start_time,
    durationMinutes: req.duration_minutes ?? 60,
    horizonWeeks: req.horizon_weeks,
  });

  const bookable"""
)

# commit: the session create must use the instance end (duration-based), and
# the find should match start AND class type (general model). The existing
# block matches on start_at + class_type_id which is fine. But end_at must be
# inst.endAt (already is). Good. Just ensure capacity from classType stays.

with open(path, 'w') as f:
    f.write(c)
print("Updated admin recurring actions")
PYEOF

echo ""
echo "Done. Stage 3 installed."
echo "NEXT:"
echo "1. Run schema-recurring-duration.sql in Supabase SQL Editor"
echo "2. npm run build"
echo "3. Test: request a recurring booking (now with a Length field), preview + commit as admin"
echo ""
echo "After Stage 3 verifies, the scheduling rework is COMPLETE and deployable."