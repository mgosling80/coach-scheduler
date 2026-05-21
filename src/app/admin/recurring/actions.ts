'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { computeRecurringInstances, type RecurringInstance } from '@/lib/recurring';
import { notifyStudent } from '@/lib/notify/dispatch';
import { formatDateTime12 } from '@/lib/format';

export async function previewRecurring(requestId: string): Promise<{
  ok: boolean;
  error?: string;
  instances?: RecurringInstance[];
}> {
  await requireRole('admin');
  const supabase = await createClient();

  const { data: req } = await supabase
    .from('recurring_booking_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (!req) return { ok: false, error: 'Request not found.' };

  const instances = await computeRecurringInstances(supabase, {
    studentId: req.student_id,
    coachId: req.coach_id,
    classTypeId: req.class_type_id,
    dayOfWeek: req.day_of_week,
    startTime: req.start_time,
    horizonWeeks: req.horizon_weeks,
  });

  return { ok: true, instances };
}

export async function commitRecurring(requestId: string) {
  const authed = await requireRole('admin');
  const supabase = await createClient();

  const { data: req } = await supabase
    .from('recurring_booking_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (!req) return { ok: false, error: 'Request not found.' };
  if (req.status !== 'pending') return { ok: false, error: 'Already decided.' };

  const { data: classType } = await supabase
    .from('class_types')
    .select('capacity, name')
    .eq('id', req.class_type_id)
    .maybeSingle();

  if (!classType) return { ok: false, error: 'Class type not found.' };

  const instances = await computeRecurringInstances(supabase, {
    studentId: req.student_id,
    coachId: req.coach_id,
    classTypeId: req.class_type_id,
    dayOfWeek: req.day_of_week,
    startTime: req.start_time,
    horizonWeeks: req.horizon_weeks,
  });

  const bookable = instances.filter((i) => i.status === 'available');
  const bookedInstances: string[] = [];
  const failedInstances: { startAt: string; reason: string }[] = [];

  for (const inst of bookable) {
    // Find or create session
    const { data: existingSession } = await supabase
      .from('sessions')
      .select('id, capacity, cancelled')
      .eq('coach_id', req.coach_id)
      .eq('class_type_id', req.class_type_id)
      .eq('start_at', inst.startAt)
      .maybeSingle();

    let sessionId: string;
    if (existingSession) {
      if (existingSession.cancelled) {
        failedInstances.push({ startAt: inst.startAt, reason: 'Session cancelled' });
        continue;
      }
      sessionId = existingSession.id;
    } else {
      const { data: newSession, error: sessErr } = await supabase
        .from('sessions')
        .insert({
          coach_id: req.coach_id,
          class_type_id: req.class_type_id,
          start_at: inst.startAt,
          end_at: inst.endAt,
          capacity: classType.capacity,
        })
        .select('id')
        .single();

      if (sessErr || !newSession) {
        failedInstances.push({ startAt: inst.startAt, reason: sessErr?.message ?? 'Session create failed' });
        continue;
      }
      sessionId = newSession.id;
    }

    const { error: bookErr } = await supabase.from('bookings').insert({
      session_id: sessionId,
      student_id: req.student_id,
      status: 'confirmed',
    });

    if (bookErr) {
      if (!bookErr.message.toLowerCase().includes('duplicate')) {
        failedInstances.push({ startAt: inst.startAt, reason: bookErr.message });
      }
      continue;
    }

    bookedInstances.push(inst.startAt);
  }

  // Mark request approved
  await supabase
    .from('recurring_booking_requests')
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: authed.user.id,
    })
    .eq('id', requestId);

  // Notify student of result
  const skipped = instances.filter((i) => i.status !== 'available' && i.status !== 'past');
  const summary = [
    `Your recurring request for ${classType.name} has been approved.`,
    `Booked ${bookedInstances.length} session${bookedInstances.length === 1 ? '' : 's'}.`,
    skipped.length > 0
      ? `Skipped ${skipped.length}: ${skipped
          .map((s) => `${formatDateTime12(s.startAt)} (${formatStatusReason(s)})`)
          .slice(0, 5)
          .join('; ')}${skipped.length > 5 ? '...' : ''}`
      : '',
    failedInstances.length > 0
      ? `Failed to book ${failedInstances.length} due to errors.`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  await notifyStudent(supabase, {
    studentId: req.student_id,
    subject: `Recurring booking approved: ${classType.name}`,
    body: summary,
  });

  revalidatePath('/admin/recurring');
  revalidatePath('/my-bookings');
  return { ok: true, bookedCount: bookedInstances.length, skippedCount: skipped.length };
}

export async function declineRecurring(requestId: string, reason: string) {
  const authed = await requireRole('admin');
  const supabase = await createClient();

  const { data: req } = await supabase
    .from('recurring_booking_requests')
    .select('*, class_types(name)')
    .eq('id', requestId)
    .maybeSingle();

  if (!req) return { ok: false, error: 'Request not found.' };

  await supabase
    .from('recurring_booking_requests')
    .update({
      status: 'declined',
      decided_at: new Date().toISOString(),
      decided_by: authed.user.id,
      decline_reason: reason || null,
    })
    .eq('id', requestId);

  const className = (Array.isArray(req.class_types) ? req.class_types[0] : req.class_types)?.name ?? 'class';

  await notifyStudent(supabase, {
    studentId: req.student_id,
    subject: `Recurring booking request declined`,
    body: `Your recurring request for ${className} was declined.${reason ? `\n\nReason: ${reason}` : ''}`,
  });

  revalidatePath('/admin/recurring');
  return { ok: true };
}

function formatStatusReason(inst: RecurringInstance): string {
  switch (inst.status) {
    case 'full': return 'full';
    case 'blackout': return 'blackout';
    case 'no_availability': return 'no availability';
    case 'already_booked': return 'already booked';
    case 'past': return 'past';
    default: return inst.status;
  }
}
