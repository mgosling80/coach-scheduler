#!/usr/bin/env bash
# install-step6.sh
# Run from project root: bash install-step6.sh
# Adds: student onboarding, admin approval queue, coach student list,
# student booking flow, cancellation, and waitlist.

set -e

if [ ! -f package.json ]; then
  echo "ERROR: run this from your project root."
  exit 1
fi

# ============================================================
# Folder structure
# ============================================================
mkdir -p src/app/onboarding
mkdir -p src/app/book
mkdir -p src/app/book/[coachId]
mkdir -p src/app/book/[coachId]/[classTypeId]
mkdir -p src/app/my-bookings
mkdir -p src/app/coach/students
mkdir -p src/app/admin
mkdir -p src/app/admin/students
mkdir -p src/lib

# ============================================================
# Schema additions
# ============================================================
echo "Writing schema-step6.sql"
cat > schema-step6.sql << 'FILE_EOF'
-- Run this in Supabase SQL Editor.

-- Add waitlist offer window setting to coach_profiles
alter table coach_profiles
  add column if not exists waitlist_offer_window_minutes int not null default 120;

-- Helper: check if user is admin for a given coach (drop and recreate in case signature changed)
create or replace function is_admin_for_coach(check_coach_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from coach_admins
    where coach_id = check_coach_id and admin_id = auth.uid()
  ) or has_role('super_admin');
$$;

-- Allow admins/super_admins to see student profiles regardless of approval state
drop policy if exists "admin reads student profiles" on student_profiles;
create policy "admin reads student profiles"
on student_profiles for select
using (
  has_role('super_admin')
  or exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);

-- Allow admins/super_admins to read all profiles (for the admin queue)
drop policy if exists "admin reads all profiles" on profiles;
create policy "admin reads all profiles"
on profiles for select
using (
  has_role('super_admin')
  or exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);

-- Allow admins/super_admins to read user_roles for visibility into who has what
drop policy if exists "admin reads all roles" on user_roles;
create policy "admin reads all roles"
on user_roles for select
using (
  has_role('super_admin')
  or exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'admin'
  )
);

-- Allow admins to create approval rows for any coach they manage
-- (existing "coach manages approvals" policy already supports this via is_admin_for_coach)

-- Auto-assign 'student' role at signup, only if user has no other role yet.
-- A super_admin or coach inserted by us won't get 'student' overwritten because
-- handle_new_user only runs once (on insert).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  insert into public.notification_preferences (user_id) values (new.id);

  -- Default everyone signing up to student. Admins promote them as needed.
  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict do nothing;

  return new;
end;
$$;
FILE_EOF

# ============================================================
# lib/booking.ts — shared booking logic
# ============================================================
echo "Writing src/lib/booking.ts"
cat > src/lib/booking.ts << 'FILE_EOF'
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

  const sessionsByStart = new Map<string, typeof sessions[number]>();
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
FILE_EOF

# ============================================================
# Onboarding (student fills in their own profile after signup)
# ============================================================
echo "Writing src/app/onboarding/actions.ts"
cat > src/app/onboarding/actions.ts << 'FILE_EOF'
'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const schema = z.object({
  age: z.coerce.number().int().min(1).max(120).optional().nullable(),
  gym: z.string().max(120).optional().nullable(),
  level: z.string().max(80).optional().nullable(),
  team: z.string().max(120).optional().nullable(),
  comments: z.string().max(1000).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
});

export async function saveStudentProfile(formData: FormData) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const parsed = schema.safeParse({
    age: formData.get('age') || null,
    gym: formData.get('gym') || null,
    level: formData.get('level') || null,
    team: formData.get('team') || null,
    comments: formData.get('comments') || null,
    phone: formData.get('phone') || null,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Update phone on profiles
  if (parsed.data.phone !== undefined) {
    await supabase
      .from('profiles')
      .update({ phone: parsed.data.phone })
      .eq('id', authed.user.id);
  }

  const { error } = await supabase
    .from('student_profiles')
    .upsert({
      user_id: authed.user.id,
      age: parsed.data.age,
      gym: parsed.data.gym,
      level: parsed.data.level,
      team: parsed.data.team,
      comments: parsed.data.comments,
    });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard');
  redirect('/dashboard');
}
FILE_EOF

echo "Writing src/app/onboarding/page.tsx"
cat > src/app/onboarding/page.tsx << 'FILE_EOF'
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', authed.user.id)
    .single();

  const { data: student } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', authed.user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">Tell us about yourself</h1>
          <p className="text-sm text-gray-600 mt-1">
            This information goes to administrators reviewing your account. Once approved by a coach, you can book sessions.
          </p>
        </div>
        <OnboardingForm
          fullName={profile?.full_name ?? ''}
          initial={{
            phone: profile?.phone ?? '',
            age: student?.age?.toString() ?? '',
            gym: student?.gym ?? '',
            level: student?.level ?? '',
            team: student?.team ?? '',
            comments: student?.comments ?? '',
          }}
        />
      </div>
    </div>
  );
}
FILE_EOF

echo "Writing src/app/onboarding/onboarding-form.tsx"
cat > src/app/onboarding/onboarding-form.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { saveStudentProfile } from './actions';

type Initial = {
  phone: string;
  age: string;
  gym: string;
  level: string;
  team: string;
  comments: string;
};

export function OnboardingForm({ fullName, initial }: { fullName: string; initial: Initial }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveStudentProfile(formData);
      if (result && !result.ok) setError(result.error ?? 'Failed.');
    });
  }

  return (
    <form action={handleSubmit} className="p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          value={fullName}
          disabled
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-100 text-gray-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            name="phone"
            defaultValue={initial.phone}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
          <input
            type="number"
            name="age"
            min="1"
            max="120"
            defaultValue={initial.age}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gym</label>
          <input
            name="gym"
            defaultValue={initial.gym}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
          <input
            name="level"
            defaultValue={initial.level}
            placeholder="e.g. Beginner, JV, Varsity"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
          <input
            name="team"
            defaultValue={initial.team}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
          <textarea
            name="comments"
            rows={3}
            defaultValue={initial.comments}
            placeholder="Anything the coach should know."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded">{error}</div>}

      <button
        type="submit"
        disabled={pending}
        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Saving...' : 'Save and continue'}
      </button>
    </form>
  );
}
FILE_EOF

# ============================================================
# Admin pages — list and assign students to coaches
# ============================================================
echo "Writing src/app/admin/layout.tsx"
cat > src/app/admin/layout.tsx << 'FILE_EOF'
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { Home, Users, UserPlus } from 'lucide-react';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await requireRole('admin');

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/admin/students', label: 'All students', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold text-gray-900">
            Coach Scheduler — Admin
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600 hidden sm:inline">{authed.user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-gray-600 hover:text-gray-900">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        <nav className="bg-white rounded-lg shadow p-3 h-fit">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
FILE_EOF

echo "Writing src/app/admin/students/actions.ts"
cat > src/app/admin/students/actions.ts << 'FILE_EOF'
'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function assignStudentToCoach(studentId: string, coachId: string) {
  await requireRole('admin');
  const supabase = await createClient();

  // Create approval row (pending) for this coach. If one already exists, no-op.
  const { error } = await supabase
    .from('coach_approvals')
    .insert({
      student_id: studentId,
      coach_id: coachId,
      status: 'pending',
    });

  // Unique constraint on (coach_id, student_id) means duplicate inserts will fail.
  // That's fine — we ignore the duplicate.
  if (error && !error.message.toLowerCase().includes('duplicate')) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/students');
  return { ok: true };
}

export async function removeAssignment(approvalId: string) {
  await requireRole('admin');
  const supabase = await createClient();

  const { error } = await supabase
    .from('coach_approvals')
    .delete()
    .eq('id', approvalId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/students');
  return { ok: true };
}
FILE_EOF

echo "Writing src/app/admin/students/page.tsx"
cat > src/app/admin/students/page.tsx << 'FILE_EOF'
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { StudentsClient } from './students-client';

export default async function AdminStudentsPage() {
  await requireRole('admin');
  const supabase = await createClient();

  // Everyone with the student role
  const { data: studentRoleRows } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'student');

  const studentIds = (studentRoleRows ?? []).map((r) => r.user_id);

  const { data: students } = studentIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .in('id', studentIds)
        .order('full_name')
    : { data: [] };

  const { data: studentInfos } = studentIds.length
    ? await supabase
        .from('student_profiles')
        .select('user_id, age, gym, level, team, comments')
        .in('user_id', studentIds)
    : { data: [] };

  const { data: coachRoleRows } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'coach');

  const coachIds = (coachRoleRows ?? []).map((r) => r.user_id);
  const { data: coaches } = coachIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', coachIds)
        .order('full_name')
    : { data: [] };

  const { data: approvals } = await supabase
    .from('coach_approvals')
    .select('id, student_id, coach_id, status, expires_at');

  return (
    <StudentsClient
      students={students ?? []}
      studentInfos={studentInfos ?? []}
      coaches={coaches ?? []}
      approvals={approvals ?? []}
    />
  );
}
FILE_EOF

echo "Writing src/app/admin/students/students-client.tsx"
cat > src/app/admin/students/students-client.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { assignStudentToCoach, removeAssignment } from './actions';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

type Student = { id: string; full_name: string; email: string; phone: string | null };
type StudentInfo = { user_id: string; age: number | null; gym: string | null; level: string | null; team: string | null; comments: string | null };
type Coach = { id: string; full_name: string; email: string };
type Approval = { id: string; student_id: string; coach_id: string; status: string; expires_at: string | null };

export function StudentsClient({
  students,
  studentInfos,
  coaches,
  approvals,
}: {
  students: Student[];
  studentInfos: StudentInfo[];
  coaches: Coach[];
  approvals: Approval[];
}) {
  const infoMap = new Map(studentInfos.map((i) => [i.user_id, i]));
  const coachMap = new Map(coaches.map((c) => [c.id, c]));

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">All students</h2>
        <p className="text-sm text-gray-600 mt-1">
          Assign students to coaches. Coaches then approve or decline them.
        </p>
      </div>
      {students.length === 0 ? (
        <div className="p-10 text-center text-sm text-gray-500">No students yet.</div>
      ) : (
        <ul className="divide-y divide-gray-200">
          {students.map((s) => (
            <StudentRow
              key={s.id}
              student={s}
              info={infoMap.get(s.id) ?? null}
              coaches={coaches}
              approvals={approvals.filter((a) => a.student_id === s.id)}
              coachMap={coachMap}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function StudentRow({
  student,
  info,
  coaches,
  approvals,
  coachMap,
}: {
  student: Student;
  info: StudentInfo | null;
  coaches: Coach[];
  approvals: Approval[];
  coachMap: Map<string, Coach>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCoach, setSelectedCoach] = useState('');

  function handleAssign() {
    if (!selectedCoach) return;
    setError(null);
    startTransition(async () => {
      const result = await assignStudentToCoach(student.id, selectedCoach);
      if (!result.ok) setError(result.error ?? 'Failed.');
      else setSelectedCoach('');
    });
  }

  function handleRemove(approvalId: string) {
    if (!confirm('Remove this assignment?')) return;
    setError(null);
    startTransition(async () => {
      const result = await removeAssignment(approvalId);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  const assignedCoachIds = new Set(approvals.map((a) => a.coach_id));
  const availableCoaches = coaches.filter((c) => !assignedCoachIds.has(c.id));

  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <div className="min-w-0">
            <div className="font-medium text-gray-900">{student.full_name}</div>
            <div className="text-xs text-gray-500">{student.email}</div>
          </div>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-1">
          {approvals.length === 0 ? 'No coaches' : `${approvals.length} coach${approvals.length === 1 ? '' : 'es'}`}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-gray-50 border-t border-gray-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm pt-4">
            <Detail label="Phone" value={student.phone} />
            <Detail label="Age" value={info?.age?.toString()} />
            <Detail label="Gym" value={info?.gym} />
            <Detail label="Level" value={info?.level} />
            <Detail label="Team" value={info?.team} />
          </div>
          {info?.comments && (
            <div className="text-sm">
              <span className="text-gray-500">Comments: </span>
              <span className="text-gray-900">{info.comments}</span>
            </div>
          )}

          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Coach assignments</h4>
            {approvals.length === 0 ? (
              <p className="text-xs text-gray-400 mb-2">No coaches assigned.</p>
            ) : (
              <ul className="space-y-1 mb-2">
                {approvals.map((a) => {
                  const c = coachMap.get(a.coach_id);
                  return (
                    <li key={a.id} className="flex items-center justify-between bg-white px-3 py-2 rounded border border-gray-200 text-sm">
                      <div>
                        <span className="font-medium">{c?.full_name ?? 'Unknown'}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {a.status}
                          {a.expires_at && a.status === 'approved' && (
                            <> · expires {new Date(a.expires_at).toLocaleDateString()}</>
                          )}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemove(a.id)}
                        disabled={pending}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {availableCoaches.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedCoach}
                  onChange={(e) => setSelectedCoach(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm flex-1"
                >
                  <option value="">Assign a coach...</option>
                  {availableCoaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAssign}
                  disabled={!selectedCoach || pending}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  Assign
                </button>
              </div>
            )}
          </div>

          {error && <div className="text-sm text-red-700">{error}</div>}
        </div>
      )}
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="text-gray-900">{value || '—'}</span>
    </div>
  );
}
FILE_EOF

# ============================================================
# Coach students page — approve / decline
# ============================================================
echo "Writing src/app/coach/students/actions.ts"
cat > src/app/coach/students/actions.ts << 'FILE_EOF'
'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const APPROVAL_DAYS = 14;

export async function approveStudent(approvalId: string) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const expires = new Date();
  expires.setDate(expires.getDate() + APPROVAL_DAYS);

  // Find approval to confirm ownership
  const { data: approval } = await supabase
    .from('coach_approvals')
    .select('coach_id')
    .eq('id', approvalId)
    .maybeSingle();

  if (!approval) return { ok: false, error: 'Approval not found.' };

  // Allow coach (their own) or admin who manages this coach
  const { data: { user } } = await supabase.auth.getUser();
  const isOwnCoach = approval.coach_id === user!.id;
  const isAdmin = authed.roles.includes('admin') || authed.roles.includes('super_admin');
  if (!isOwnCoach && !isAdmin) return { ok: false, error: 'Not allowed.' };

  const { error } = await supabase
    .from('coach_approvals')
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: user!.id,
      expires_at: expires.toISOString(),
    })
    .eq('id', approvalId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/students');
  return { ok: true };
}

export async function declineStudent(approvalId: string, reason: string) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('coach_approvals')
    .update({
      status: 'declined',
      decided_at: new Date().toISOString(),
      decided_by: user!.id,
      decline_reason: reason || null,
    })
    .eq('id', approvalId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/students');
  return { ok: true };
}
FILE_EOF

echo "Writing src/app/coach/students/page.tsx"
cat > src/app/coach/students/page.tsx << 'FILE_EOF'
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { StudentsListClient } from './students-list-client';

export default async function CoachStudentsPage() {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: approvals } = await supabase
    .from('coach_approvals')
    .select('id, student_id, status, requested_at, decided_at, expires_at, decline_reason')
    .eq('coach_id', authed.user.id)
    .order('requested_at', { ascending: false });

  const studentIds = (approvals ?? []).map((a) => a.student_id);
  const { data: students } = studentIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .in('id', studentIds)
    : { data: [] };

  const { data: studentInfos } = studentIds.length
    ? await supabase
        .from('student_profiles')
        .select('user_id, age, gym, level, team, comments')
        .in('user_id', studentIds)
    : { data: [] };

  return (
    <StudentsListClient
      approvals={approvals ?? []}
      students={students ?? []}
      studentInfos={studentInfos ?? []}
    />
  );
}
FILE_EOF

echo "Writing src/app/coach/students/students-list-client.tsx"
cat > src/app/coach/students/students-list-client.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { approveStudent, declineStudent } from './actions';
import { ChevronDown, ChevronRight, Check, X } from 'lucide-react';

type Approval = {
  id: string;
  student_id: string;
  status: string;
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
  decline_reason: string | null;
};
type Student = { id: string; full_name: string; email: string; phone: string | null };
type StudentInfo = { user_id: string; age: number | null; gym: string | null; level: string | null; team: string | null; comments: string | null };

export function StudentsListClient({
  approvals,
  students,
  studentInfos,
}: {
  approvals: Approval[];
  students: Student[];
  studentInfos: StudentInfo[];
}) {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const infoMap = new Map(studentInfos.map((i) => [i.user_id, i]));

  const groups = {
    pending: approvals.filter((a) => a.status === 'pending'),
    approved: approvals.filter((a) => a.status === 'approved'),
    declined: approvals.filter((a) => a.status === 'declined'),
    expired: approvals.filter((a) => a.status === 'expired'),
  };

  return (
    <div className="space-y-4">
      {(['pending', 'approved', 'declined', 'expired'] as const).map((group) => (
        <div key={group} className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              {group} ({groups[group].length})
            </h2>
          </div>
          {groups[group].length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">None.</div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {groups[group].map((a) => (
                <ApprovalRow
                  key={a.id}
                  approval={a}
                  student={studentMap.get(a.student_id)}
                  info={infoMap.get(a.student_id) ?? null}
                />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ApprovalRow({
  approval,
  student,
  info,
}: {
  approval: Approval;
  student: Student | undefined;
  info: StudentInfo | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveStudent(approval.id);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  function handleDecline() {
    if (!confirm('Decline this student?')) return;
    setError(null);
    startTransition(async () => {
      const result = await declineStudent(approval.id, declineReason);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  if (!student) return null;

  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <div className="min-w-0">
            <div className="font-medium text-gray-900">{student.full_name}</div>
            <div className="text-xs text-gray-500">{student.email}</div>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {approval.status === 'approved' && approval.expires_at && (
            <>expires {new Date(approval.expires_at).toLocaleDateString()}</>
          )}
          {approval.status === 'pending' && (
            <>requested {new Date(approval.requested_at).toLocaleDateString()}</>
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-gray-50 border-t border-gray-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm pt-4">
            <Detail label="Phone" value={student.phone} />
            <Detail label="Age" value={info?.age?.toString()} />
            <Detail label="Gym" value={info?.gym} />
            <Detail label="Level" value={info?.level} />
            <Detail label="Team" value={info?.team} />
          </div>
          {info?.comments && (
            <div className="text-sm">
              <span className="text-gray-500">Comments: </span>
              <span className="text-gray-900">{info.comments}</span>
            </div>
          )}

          {approval.status === 'pending' && (
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleApprove}
                  disabled={pending}
                  className="inline-flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={handleDecline}
                  disabled={pending}
                  className="inline-flex items-center gap-1 bg-white text-red-600 border border-red-300 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Decline
                </button>
                <input
                  type="text"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Decline reason (optional)"
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
          )}

          {approval.status === 'declined' && approval.decline_reason && (
            <div className="text-sm text-gray-600 pt-2 border-t border-gray-200">
              Decline reason: {approval.decline_reason}
            </div>
          )}

          {error && <div className="text-sm text-red-700">{error}</div>}
        </div>
      )}
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="text-gray-900">{value || '—'}</span>
    </div>
  );
}
FILE_EOF

# ============================================================
# Booking flow — student facing
# ============================================================
echo "Writing src/app/book/page.tsx"
cat > src/app/book/page.tsx << 'FILE_EOF'
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function BookIndexPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  // Coaches this student is approved with (non-expired)
  const now = new Date().toISOString();
  const { data: approvals } = await supabase
    .from('coach_approvals')
    .select('coach_id, status, expires_at')
    .eq('student_id', authed.user.id)
    .eq('status', 'approved')
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  const coachIds = (approvals ?? []).map((a) => a.coach_id);

  const { data: coaches } = coachIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', coachIds)
    : { data: [] };

  const { data: coachProfiles } = coachIds.length
    ? await supabase
        .from('coach_profiles')
        .select('user_id, photo_url, bio')
        .in('user_id', coachIds)
    : { data: [] };

  const photoMap = new Map((coachProfiles ?? []).map((c) => [c.user_id, c.photo_url]));
  const bioMap = new Map((coachProfiles ?? []).map((c) => [c.user_id, c.bio]));

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
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Book a session</h2>

        {!coaches || coaches.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
            You&apos;re not approved with any coaches yet. Once an admin assigns you to a coach and the coach approves, you&apos;ll be able to book here.
          </div>
        ) : (
          <ul className="space-y-3">
            {coaches.map((c) => (
              <li key={c.id} className="bg-white rounded-lg shadow hover:shadow-md transition">
                <Link href={`/book/${c.id}`} className="flex items-center gap-4 p-4">
                  <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">
                    {photoMap.get(c.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoMap.get(c.id) ?? ''} alt={c.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">?</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">{c.full_name}</div>
                    {bioMap.get(c.id) && (
                      <div className="text-sm text-gray-600 mt-1 line-clamp-2">{bioMap.get(c.id)}</div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
FILE_EOF

echo "Writing src/app/book/[coachId]/page.tsx"
cat > "src/app/book/[coachId]/page.tsx" << 'FILE_EOF'
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft } from 'lucide-react';

export default async function CoachClassTypesPage({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  const { coachId } = await params;
  const authed = await requireAuth();
  const supabase = await createClient();

  // Verify approval
  const now = new Date().toISOString();
  const { data: approval } = await supabase
    .from('coach_approvals')
    .select('status, expires_at')
    .eq('student_id', authed.user.id)
    .eq('coach_id', coachId)
    .eq('status', 'approved')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .maybeSingle();

  if (!approval) notFound();

  const { data: coach } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', coachId)
    .maybeSingle();

  const { data: classTypes } = await supabase
    .from('class_types')
    .select('id, name, description, duration_minutes, capacity, color')
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .order('name');

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
        <Link href="/book" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to coaches
        </Link>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {coach?.full_name ?? 'Coach'} — choose a class type
        </h2>

        {!classTypes || classTypes.length === 0 ? (
          <div className="text-sm text-gray-500">No active class types.</div>
        ) : (
          <ul className="space-y-2">
            {classTypes.map((ct) => (
              <li key={ct.id}>
                <Link
                  href={`/book/${coachId}/${ct.id}`}
                  className="block bg-white rounded-lg shadow hover:shadow-md transition p-4 flex items-center gap-3"
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ct.color || '#3b82f6' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">{ct.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {ct.duration_minutes} min · {ct.capacity === 1 ? '1:1' : `Group of ${ct.capacity}`}
                      {ct.description && <> · {ct.description}</>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
FILE_EOF

echo "Writing src/app/book/[coachId]/[classTypeId]/page.tsx"
cat > "src/app/book/[coachId]/[classTypeId]/page.tsx" << 'FILE_EOF'
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getBookableSlots } from '@/lib/booking';
import { ArrowLeft } from 'lucide-react';
import { SlotsClient } from './slots-client';

export default async function SlotsPage({
  params,
}: {
  params: Promise<{ coachId: string; classTypeId: string }>;
}) {
  const { coachId, classTypeId } = await params;
  const authed = await requireAuth();
  const supabase = await createClient();

  // Verify approval
  const now = new Date().toISOString();
  const { data: approval } = await supabase
    .from('coach_approvals')
    .select('status, expires_at')
    .eq('student_id', authed.user.id)
    .eq('coach_id', coachId)
    .eq('status', 'approved')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .maybeSingle();

  if (!approval) notFound();

  const { data: classType } = await supabase
    .from('class_types')
    .select('id, coach_id, name, duration_minutes, capacity, booking_window_hours, cancel_window_hours')
    .eq('id', classTypeId)
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .maybeSingle();

  if (!classType) notFound();

  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('default_booking_window_hours, default_cancel_window_hours')
    .eq('user_id', coachId)
    .maybeSingle();

  const defaults = {
    default_booking_window_hours: coachProfile?.default_booking_window_hours ?? 24,
    default_cancel_window_hours: coachProfile?.default_cancel_window_hours ?? 6,
  };

  // Show next 4 weeks
  const rangeStart = new Date();
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + 28);

  const slots = await getBookableSlots(
    supabase,
    classType,
    defaults,
    rangeStart,
    rangeEnd,
    authed.user.id
  );

  // Serialize Dates for the client component
  const serializedSlots = slots.map((s) => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    bookedCount: s.bookedCount,
    capacity: s.capacity,
    isFull: s.isFull,
    sessionId: s.sessionId,
    studentIsBooked: s.studentIsBooked,
    studentIsWaitlisted: s.studentIsWaitlisted,
  }));

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
        <Link href={`/book/${coachId}`} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">{classType.name}</h2>
        <p className="text-sm text-gray-600 mb-6">
          {classType.duration_minutes} min · {classType.capacity === 1 ? '1:1' : `Group of ${classType.capacity}`}
        </p>

        <SlotsClient
          slots={serializedSlots}
          coachId={coachId}
          classTypeId={classTypeId}
        />
      </main>
    </div>
  );
}
FILE_EOF

echo "Writing src/app/book/[coachId]/[classTypeId]/actions.ts"
cat > "src/app/book/[coachId]/[classTypeId]/actions.ts" << 'FILE_EOF'
'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function bookSlot(params: {
  coachId: string;
  classTypeId: string;
  startIso: string;
  endIso: string;
}) {
  const authed = await requireAuth();
  const supabase = await createClient();

  // Verify approval
  const now = new Date().toISOString();
  const { data: approval } = await supabase
    .from('coach_approvals')
    .select('status, expires_at')
    .eq('student_id', authed.user.id)
    .eq('coach_id', params.coachId)
    .eq('status', 'approved')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .maybeSingle();

  if (!approval) return { ok: false, error: 'Not approved with this coach.' };

  // Get capacity from class type
  const { data: classType } = await supabase
    .from('class_types')
    .select('capacity, booking_window_hours, coach_id')
    .eq('id', params.classTypeId)
    .eq('coach_id', params.coachId)
    .eq('is_active', true)
    .maybeSingle();

  if (!classType) return { ok: false, error: 'Class type not found.' };

  // Check booking window
  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('default_booking_window_hours')
    .eq('user_id', params.coachId)
    .maybeSingle();

  const bookingWindowHours = classType.booking_window_hours ?? coachProfile?.default_booking_window_hours ?? 24;
  const cutoff = new Date(Date.now() + bookingWindowHours * 3600 * 1000);
  if (new Date(params.startIso) < cutoff) {
    return { ok: false, error: 'Booking window has closed for this slot.' };
  }

  // Find or create session
  const { data: existingSession } = await supabase
    .from('sessions')
    .select('id, capacity, cancelled')
    .eq('coach_id', params.coachId)
    .eq('class_type_id', params.classTypeId)
    .eq('start_at', params.startIso)
    .maybeSingle();

  let sessionId: string;
  let capacity: number;

  if (existingSession) {
    if (existingSession.cancelled) return { ok: false, error: 'This session was cancelled.' };
    sessionId = existingSession.id;
    capacity = existingSession.capacity;
  } else {
    const { data: newSession, error: sessionErr } = await supabase
      .from('sessions')
      .insert({
        coach_id: params.coachId,
        class_type_id: params.classTypeId,
        start_at: params.startIso,
        end_at: params.endIso,
        capacity: classType.capacity,
      })
      .select('id, capacity')
      .single();

    if (sessionErr || !newSession) {
      // Race: someone else just created it
      const { data: retry } = await supabase
        .from('sessions')
        .select('id, capacity, cancelled')
        .eq('coach_id', params.coachId)
        .eq('class_type_id', params.classTypeId)
        .eq('start_at', params.startIso)
        .maybeSingle();
      if (!retry || retry.cancelled) return { ok: false, error: sessionErr?.message ?? 'Could not create session.' };
      sessionId = retry.id;
      capacity = retry.capacity;
    } else {
      sessionId = newSession.id;
      capacity = newSession.capacity;
    }
  }

  // Count current confirmed bookings
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .in('status', ['confirmed', 'completed', 'no_show']);

  const bookedCount = count ?? 0;

  if (bookedCount >= capacity) {
    // Add to waitlist
    const { data: existing } = await supabase
      .from('waitlist_entries')
      .select('id')
      .eq('session_id', sessionId)
      .eq('student_id', authed.user.id)
      .maybeSingle();

    if (existing) return { ok: true, waitlisted: true };

    // Get next position
    const { count: wlCount } = await supabase
      .from('waitlist_entries')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .is('promoted_at', null);

    const { error: wlErr } = await supabase
      .from('waitlist_entries')
      .insert({
        session_id: sessionId,
        student_id: authed.user.id,
        position: (wlCount ?? 0) + 1,
      });

    if (wlErr) return { ok: false, error: wlErr.message };

    revalidatePath(`/book/${params.coachId}/${params.classTypeId}`);
    return { ok: true, waitlisted: true };
  }

  // Book it
  const { error: bookErr } = await supabase
    .from('bookings')
    .insert({
      session_id: sessionId,
      student_id: authed.user.id,
      status: 'confirmed',
    });

  if (bookErr) {
    if (bookErr.message.toLowerCase().includes('duplicate')) {
      return { ok: false, error: 'You are already booked for this session.' };
    }
    return { ok: false, error: bookErr.message };
  }

  revalidatePath(`/book/${params.coachId}/${params.classTypeId}`);
  revalidatePath('/my-bookings');
  return { ok: true, waitlisted: false };
}
FILE_EOF

echo "Writing src/app/book/[coachId]/[classTypeId]/slots-client.tsx"
cat > "src/app/book/[coachId]/[classTypeId]/slots-client.tsx" << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { bookSlot } from './actions';
import { formatTime12 } from '@/lib/format';
import { Check, Clock } from 'lucide-react';

type Slot = {
  start: string;
  end: string;
  bookedCount: number;
  capacity: number;
  isFull: boolean;
  sessionId: string | null;
  studentIsBooked: boolean;
  studentIsWaitlisted: boolean;
};

export function SlotsClient({
  slots,
  coachId,
  classTypeId,
}: {
  slots: Slot[];
  coachId: string;
  classTypeId: string;
}) {
  // Group slots by date
  const byDate = new Map<string, Slot[]>();
  for (const s of slots) {
    const dateKey = new Date(s.start).toISOString().slice(0, 10);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(s);
  }

  const dates = Array.from(byDate.keys()).sort();

  if (dates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-sm text-gray-500">
        No bookable slots in the next 4 weeks. Check back later or contact your coach.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dates.map((date) => (
        <div key={date} className="bg-white rounded-lg shadow">
          <div className="p-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
          </div>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {byDate.get(date)!.map((slot) => (
              <SlotButton
                key={slot.start}
                slot={slot}
                coachId={coachId}
                classTypeId={classTypeId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SlotButton({
  slot,
  coachId,
  classTypeId,
}: {
  slot: Slot;
  coachId: string;
  classTypeId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (slot.studentIsBooked || slot.studentIsWaitlisted) return;
    setError(null);
    startTransition(async () => {
      const result = await bookSlot({
        coachId,
        classTypeId,
        startIso: slot.start,
        endIso: slot.end,
      });
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  const timeStr = formatTime12(new Date(slot.start).toTimeString().slice(0, 5));

  let label = timeStr;
  let buttonClass = 'border-gray-300 bg-white hover:bg-blue-50 text-gray-900';
  let badge: React.ReactNode = null;

  if (slot.studentIsBooked) {
    buttonClass = 'border-green-500 bg-green-50 text-green-900';
    badge = <Check className="w-3 h-3 inline ml-1" />;
  } else if (slot.studentIsWaitlisted) {
    buttonClass = 'border-yellow-400 bg-yellow-50 text-yellow-900';
    badge = <Clock className="w-3 h-3 inline ml-1" />;
  } else if (slot.isFull) {
    buttonClass = 'border-gray-300 bg-gray-50 text-gray-500';
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={pending || slot.studentIsBooked || slot.studentIsWaitlisted}
        className={`w-full px-3 py-2 border rounded-md text-sm font-medium transition ${buttonClass} disabled:opacity-70`}
        title={slot.isFull ? 'Full — booking adds you to the waitlist' : ''}
      >
        {label}
        {badge}
        {slot.capacity > 1 && (
          <div className="text-xs font-normal opacity-70 mt-0.5">
            {slot.bookedCount}/{slot.capacity}
            {slot.isFull && ' · waitlist'}
          </div>
        )}
      </button>
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}
FILE_EOF

# ============================================================
# My bookings page
# ============================================================
echo "Writing src/app/my-bookings/page.tsx"
cat > src/app/my-bookings/page.tsx << 'FILE_EOF'
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
FILE_EOF

echo "Writing src/app/my-bookings/actions.ts"
cat > src/app/my-bookings/actions.ts << 'FILE_EOF'
'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function cancelBooking(bookingId: string) {
  const authed = await requireAuth();
  const supabase = await createClient();

  // Fetch booking + session for window check
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, student_id, session_id, sessions!inner(coach_id, class_type_id, start_at)')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking || booking.student_id !== authed.user.id) {
    return { ok: false, error: 'Not allowed.' };
  }

  const session = Array.isArray(booking.sessions) ? booking.sessions[0] : booking.sessions;

  // Resolve cancel window
  const { data: ct } = await supabase
    .from('class_types')
    .select('cancel_window_hours')
    .eq('id', session.class_type_id)
    .maybeSingle();

  const { data: cp } = await supabase
    .from('coach_profiles')
    .select('default_cancel_window_hours')
    .eq('user_id', session.coach_id)
    .maybeSingle();

  const cancelWindowHours = ct?.cancel_window_hours ?? cp?.default_cancel_window_hours ?? 6;
  const cutoff = new Date(new Date(session.start_at).getTime() - cancelWindowHours * 3600 * 1000);
  if (new Date() > cutoff) {
    return { ok: false, error: `Cancellation closed ${cancelWindowHours}hr before the session.` };
  }

  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled_by_student',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/my-bookings');
  return { ok: true };
}
FILE_EOF

echo "Writing src/app/my-bookings/my-bookings-client.tsx"
cat > src/app/my-bookings/my-bookings-client.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { cancelBooking } from './actions';
import { formatDateTime12 } from '@/lib/format';

type Item = {
  bookingId: string;
  status: string;
  sessionId: string;
  startAt: string;
  endAt: string;
  coachName: string;
  classTypeName: string;
  classTypeColor: string;
  cancelled: boolean;
};

export function MyBookingsClient({ bookings }: { bookings: Item[] }) {
  const upcoming = bookings.filter((b) => new Date(b.startAt) > new Date() && !b.cancelled);
  const past = bookings.filter((b) => new Date(b.startAt) <= new Date() || b.cancelled);

  return (
    <div className="space-y-4">
      <Section title="Upcoming" items={upcoming} cancellable />
      <Section title="Past" items={past} cancellable={false} />
    </div>
  );
}

function Section({ title, items, cancellable }: { title: string; items: Item[]; cancellable: boolean }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          {title} ({items.length})
        </h3>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">None.</div>
      ) : (
        <ul className="divide-y divide-gray-200">
          {items.map((i) => (
            <BookingRow key={i.bookingId} item={i} cancellable={cancellable} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingRow({ item, cancellable }: { item: Item; cancellable: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    if (!confirm('Cancel this booking?')) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(item.bookingId);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  return (
    <li className="p-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
          style={{ backgroundColor: item.classTypeColor }}
        />
        <div className="min-w-0">
          <div className="font-medium text-gray-900">{item.classTypeName}</div>
          <div className="text-sm text-gray-600">with {item.coachName}</div>
          <div className="text-sm text-gray-500 mt-0.5">{formatDateTime12(item.startAt)}</div>
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </div>
      </div>
      {cancellable && (
        <button
          onClick={handleCancel}
          disabled={pending}
          className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 flex-shrink-0"
        >
          Cancel
        </button>
      )}
    </li>
  );
}
FILE_EOF

# ============================================================
# Update coach layout to include Students nav item
# ============================================================
echo "Updating src/app/coach/layout.tsx (adds Students)"
cat > src/app/coach/layout.tsx << 'FILE_EOF'
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { CalendarDays, User, ListChecks, Clock, Home, CalendarOff, Users } from 'lucide-react';

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await requireRole('coach');

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/coach/profile', label: 'My profile', icon: User },
    { href: '/coach/class-types', label: 'Class types', icon: ListChecks },
    { href: '/coach/availability', label: 'Availability', icon: Clock },
    { href: '/coach/blackouts', label: 'Blackouts', icon: CalendarOff },
    { href: '/coach/students', label: 'Students', icon: Users },
    { href: '/coach/schedule', label: 'Schedule', icon: CalendarDays, soon: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold text-gray-900">
            Coach Scheduler
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600 hidden sm:inline">{authed.user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-gray-600 hover:text-gray-900">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        <nav className="bg-white rounded-lg shadow p-3 h-fit">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  {item.soon ? (
                    <span className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 cursor-not-allowed">
                      <Icon className="w-4 h-4" />
                      {item.label}
                      <span className="text-xs ml-auto">soon</span>
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <main>{children}</main>
      </div>
    </div>
  );
}
FILE_EOF

# ============================================================
# Update dashboard to surface role-specific links
# ============================================================
echo "Updating src/app/dashboard/page.tsx"
cat > src/app/dashboard/page.tsx << 'FILE_EOF'
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ArrowRight, Calendar, Users, Shield } from 'lucide-react';

export default async function DashboardPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', authed.user.id)
    .single();

  const isCoach = authed.roles.includes('coach') || authed.roles.includes('super_admin');
  const isAdmin = authed.roles.includes('admin') || authed.roles.includes('super_admin');
  const isStudent = authed.roles.includes('student');

  // Check whether student has filled out their profile
  let needsOnboarding = false;
  if (isStudent) {
    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('user_id')
      .eq('user_id', authed.user.id)
      .maybeSingle();
    needsOnboarding = !studentProfile;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Coach Scheduler</h1>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Welcome, {profile?.full_name ?? authed.user.email}
          </h2>
          <p className="text-sm text-gray-600">
            Roles: {authed.roles.length > 0 ? authed.roles.join(', ') : 'none assigned yet'}
          </p>
        </div>

        {needsOnboarding && (
          <Link
            href="/onboarding"
            className="block bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-blue-900">Finish your profile</div>
                <div className="text-sm text-blue-800 mt-1">
                  Tell us a bit about yourself so coaches can review your account.
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-blue-600" />
            </div>
          </Link>
        )}

        {isStudent && !needsOnboarding && (
          <DashCard
            href="/book"
            icon={Calendar}
            title="Book a session"
            description="See available times with your coaches."
          />
        )}

        {isStudent && !needsOnboarding && (
          <DashCard
            href="/my-bookings"
            icon={Calendar}
            title="My bookings"
            description="See upcoming and past sessions."
          />
        )}

        {isCoach && (
          <DashCard
            href="/coach/profile"
            icon={Users}
            title="Coach area"
            description="Manage your profile, class types, availability, and students."
          />
        )}

        {isAdmin && (
          <DashCard
            href="/admin/students"
            icon={Shield}
            title="Admin area"
            description="Assign students to coaches and manage approvals."
          />
        )}
      </main>
    </div>
  );
}

function DashCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="block bg-white rounded-lg shadow p-6 hover:bg-gray-50 transition group">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 text-gray-700 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600 mt-1">{description}</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-700" />
      </div>
    </Link>
  );
}
FILE_EOF

echo ""
echo "Done. Step 6 installed."
echo ""
echo "IMPORTANT: You must run schema-step6.sql in Supabase before testing."
echo "Open Supabase → SQL Editor → New query → paste schema-step6.sql → Run."