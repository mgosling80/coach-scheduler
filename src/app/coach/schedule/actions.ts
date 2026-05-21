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
