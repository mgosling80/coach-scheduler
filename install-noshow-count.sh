#!/usr/bin/env bash
# install-noshow-count.sh
# Adds no-show counts to the coach Students list and an undo option on past sessions.
# Run from project root: bash install-noshow-count.sh

set -e

if [ ! -f package.json ]; then
  echo "ERROR: run this from your project root."
  exit 1
fi

# ============================================================
# SCHEMA: function to count no-shows per student for a coach
# ============================================================
echo "Writing schema-noshow-counts.sql"
cat > schema-noshow-counts.sql << 'FILE_EOF'
-- Return a count of no_show bookings per student for a given coach.
-- security definer so the coach can see all bookings, not just their own.
create or replace function coach_student_noshow_counts(p_coach_id uuid)
returns table(
  student_id uuid,
  no_show_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select b.student_id, count(*)::int as no_show_count
  from bookings b
  join sessions s on s.id = b.session_id
  where s.coach_id = p_coach_id
    and b.status = 'no_show'
  group by b.student_id;
$$;

grant execute on function coach_student_noshow_counts(uuid) to authenticated;

-- Undo a no-show (sets back to confirmed)
create or replace function unmark_no_show(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach uuid;
begin
  select s.coach_id into v_coach
  from bookings b
  join sessions s on s.id = b.session_id
  where b.id = p_booking_id;

  if v_coach is null then raise exception 'Booking not found'; end if;
  if v_coach <> auth.uid() and not is_admin_for_coach(v_coach) then
    raise exception 'Not allowed';
  end if;

  update bookings
  set status = 'confirmed',
      marked_no_show_at = null,
      marked_no_show_by = null
  where id = p_booking_id;
end;
$$;

grant execute on function unmark_no_show(uuid) to authenticated;
FILE_EOF

# ============================================================
# Update coach students page to fetch + display counts
# ============================================================
echo "Updating src/app/coach/students/page.tsx"
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

  // Aggregate no-show counts
  const { data: noShowRows } = await supabase.rpc('coach_student_noshow_counts', {
    p_coach_id: authed.user.id,
  });

  type NoShowRow = { student_id: string; no_show_count: number };
  const noShowMap: Record<string, number> = {};
  ((noShowRows as NoShowRow[]) ?? []).forEach((r) => {
    noShowMap[r.student_id] = r.no_show_count;
  });

  return (
    <StudentsListClient
      approvals={approvals ?? []}
      students={students ?? []}
      studentInfos={studentInfos ?? []}
      noShowMap={noShowMap}
    />
  );
}
FILE_EOF

echo "Updating src/app/coach/students/students-list-client.tsx"
cat > src/app/coach/students/students-list-client.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { approveStudent, declineStudent } from './actions';
import { ChevronDown, ChevronRight, Check, X, UserX } from 'lucide-react';

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
type StudentInfo = {
  user_id: string;
  age: number | null;
  gym: string | null;
  level: string | null;
  team: string | null;
  comments: string | null;
};

export function StudentsListClient({
  approvals,
  students,
  studentInfos,
  noShowMap,
}: {
  approvals: Approval[];
  students: Student[];
  studentInfos: StudentInfo[];
  noShowMap: Record<string, number>;
}) {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const infoMap = new Map(studentInfos.map((i) => [i.user_id, i]));

  const groups = {
    pending: approvals.filter((a) => a.status === 'pending'),
    approved: approvals.filter((a) => a.status === 'approved'),
    declined: approvals.filter((a) => a.status === 'declined'),
    expired: approvals.filter((a) => a.status === 'expired'),
  };

  // For Approved, sort by no-show count desc so problem students surface
  groups.approved.sort((a, b) => (noShowMap[b.student_id] ?? 0) - (noShowMap[a.student_id] ?? 0));

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
                  noShowCount={noShowMap[a.student_id] ?? 0}
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
  noShowCount,
}: {
  approval: Approval;
  student: Student | undefined;
  info: StudentInfo | null;
  noShowCount: number;
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

  const noShowBadge = noShowCount > 0 && (
    <span
      className={`text-xs px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 ${
        noShowCount >= 3
          ? 'bg-red-100 text-red-800'
          : noShowCount === 2
          ? 'bg-orange-100 text-orange-800'
          : 'bg-yellow-100 text-yellow-800'
      }`}
      title={`${noShowCount} no-show${noShowCount === 1 ? '' : 's'}`}
    >
      <UserX className="w-3 h-3" />
      {noShowCount}
    </span>
  );

  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">{student.full_name}</span>
              {noShowBadge}
            </div>
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
            <Detail label="No-shows" value={noShowCount > 0 ? String(noShowCount) : '—'} />
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
# Add "Undo no-show" to schedule view
# ============================================================
echo "Updating src/app/coach/schedule/actions.ts (adds unmarkNoShow)"
cat > src/app/coach/schedule/actions.ts << 'FILE_EOF'
'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { notifyStudent, notifyGroupMe } from '@/lib/notify/dispatch';
import { formatDateTime12 } from '@/lib/format';

export async function cancelSession(sessionId: string, reason: string) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: session } = await supabase
    .from('sessions')
    .select('id, coach_id, class_type_id, start_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) return { ok: false, error: 'Session not found.' };

  const isOwn = session.coach_id === authed.user.id;
  const isAdmin = authed.roles.includes('admin') || authed.roles.includes('super_admin');
  if (!isOwn && !isAdmin) return { ok: false, error: 'Not allowed.' };

  const { data: ct } = await supabase
    .from('class_types')
    .select('name')
    .eq('id', session.class_type_id)
    .maybeSingle();

  const { data: result, error: cancelErr } = await supabase.rpc('cancel_session', {
    p_session_id: sessionId,
    p_reason: reason,
  });

  if (cancelErr) return { ok: false, error: cancelErr.message };

  const affected =
    Array.isArray(result) && result.length > 0
      ? (result[0] as { affected_student_ids: string[] }).affected_student_ids ?? []
      : [];

  const startStr = formatDateTime12(session.start_at);
  const className = ct?.name ?? 'session';

  for (const studentId of affected) {
    await notifyStudent(supabase, {
      studentId,
      subject: `Session cancelled: ${className}`,
      body:
        `Your ${className} on ${startStr} has been cancelled by the coach.` +
        (reason ? `\n\nReason: ${reason}` : '') +
        `\n\nGo to the app to rebook another time.`,
      relatedSessionId: sessionId,
      forceChannels: ['email'],
    });
  }

  await notifyGroupMe(supabase, {
    coachId: session.coach_id,
    text:
      `Session cancelled: ${className} on ${startStr}.` +
      (reason ? ` Reason: ${reason}.` : '') +
      ` Affected students have been notified directly.`,
    relatedSessionId: sessionId,
  });

  revalidatePath('/coach/schedule');
  return { ok: true, affectedCount: affected.length };
}

export async function markNoShow(bookingId: string) {
  await requireRole('coach');
  const supabase = await createClient();

  const { error } = await supabase.rpc('mark_no_show', { p_booking_id: bookingId });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/schedule');
  revalidatePath('/coach/students');
  return { ok: true };
}

export async function unmarkNoShow(bookingId: string) {
  await requireRole('coach');
  const supabase = await createClient();

  const { error } = await supabase.rpc('unmark_no_show', { p_booking_id: bookingId });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/schedule');
  revalidatePath('/coach/students');
  return { ok: true };
}

export async function markSessionCompleted(sessionId: string) {
  await requireRole('coach');
  const supabase = await createClient();

  const { error } = await supabase.rpc('mark_session_completed', { p_session_id: sessionId });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/schedule');
  return { ok: true };
}
FILE_EOF

# Patch the schedule client to surface the undo button on no-shows
echo "Patching src/app/coach/schedule/schedule-client.tsx (adds Undo no-show button)"
python3 - << 'PYEOF'
import re

path = 'src/app/coach/schedule/schedule-client.tsx'
with open(path, 'r') as f:
    content = f.read()

# Add unmarkNoShow to the import line
content = content.replace(
    "import { cancelSession, markNoShow, markSessionCompleted } from './actions';",
    "import { cancelSession, markNoShow, unmarkNoShow, markSessionCompleted } from './actions';"
)

# Add a handleUndoNoShow function after handleNoShow
hook = (
    "  function handleNoShow(bookingId: string) {\n"
    "    if (!confirm('Mark this student as no-show?')) return;\n"
    "    setError(null);\n"
    "    setInfo(null);\n"
    "    startTransition(async () => {\n"
    "      const result = await markNoShow(bookingId);\n"
    "      if (!result.ok) setError(result.error ?? 'Failed.');\n"
    "    });\n"
    "  }"
)
new_hook = hook + "\n\n" + (
    "  function handleUndoNoShow(bookingId: string) {\n"
    "    if (!confirm('Undo no-show?')) return;\n"
    "    setError(null);\n"
    "    setInfo(null);\n"
    "    startTransition(async () => {\n"
    "      const result = await unmarkNoShow(bookingId);\n"
    "      if (!result.ok) setError(result.error ?? 'Failed.');\n"
    "    });\n"
    "  }"
)
content = content.replace(hook, new_hook)

# Add the Undo button next to the No-show badge
old_block = (
    "                  {b.status === 'no_show' && (\n"
    "                    <span className=\"ml-2 text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded\">\n"
    "                      No-show\n"
    "                    </span>\n"
    "                  )}"
)
new_block = (
    "                  {b.status === 'no_show' && (\n"
    "                    <span className=\"ml-2 inline-flex items-center gap-1\">\n"
    "                      <span className=\"text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded\">\n"
    "                        No-show\n"
    "                      </span>\n"
    "                      <button\n"
    "                        onClick={(e) => { e.stopPropagation(); handleUndoNoShow(b.booking_id); }}\n"
    "                        disabled={pending}\n"
    "                        className=\"text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50\"\n"
    "                      >\n"
    "                        Undo\n"
    "                      </button>\n"
    "                    </span>\n"
    "                  )}"
)
content = content.replace(old_block, new_block)

with open(path, 'w') as f:
    f.write(content)

print("Patched schedule-client.tsx")
PYEOF

echo ""
echo "Done. No-show counts on Students list + undo on Schedule."
echo ""
echo "NEXT: run schema-noshow-counts.sql in Supabase SQL Editor."