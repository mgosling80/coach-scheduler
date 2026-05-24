'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { notifyStudent, notifyGroupMe } from '@/lib/notify/dispatch';
import { formatDateTime12 } from '@/lib/format';

export async function cancelBooking(bookingId: string) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, student_id, session_id, sessions!inner(coach_id, class_type_id, start_at, id)')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking || booking.student_id !== authed.user.id) {
    return { ok: false, error: 'Not allowed.' };
  }

  const session = Array.isArray(booking.sessions) ? booking.sessions[0] : booking.sessions;

  const { data: ct } = await supabase
    .from('class_types')
    .select('cancel_window_hours, name')
    .eq('id', session.class_type_id)
    .maybeSingle();

  const { data: cp } = await supabase
    .from('coach_profiles')
    .select('default_cancel_window_hours, waitlist_offer_window_minutes')
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

  await notifyStudent(supabase, {
    studentId: authed.user.id,
    subject: `Cancelled: ${ct?.name ?? 'session'}`,
    body: `Your ${ct?.name ?? 'session'} on ${formatDateTime12(session.start_at)} has been cancelled.`,
    relatedBookingId: bookingId,
    relatedSessionId: session.id,
  });

  await notifyStudent(supabase, {
    studentId: session.coach_id,
    subject: `Student cancelled: ${ct?.name ?? 'session'}`,
    body: `A student cancelled their ${ct?.name ?? 'session'} on ${formatDateTime12(session.start_at)}.`,
    relatedBookingId: bookingId,
    relatedSessionId: session.id,
    forceChannels: ['email'],
  });

  await notifyGroupMe(supabase, {
    coachId: session.coach_id,
    text: `Slot opened: ${ct?.name ?? 'a session'} on ${formatDateTime12(session.start_at)}. Book in the app.`,
    relatedSessionId: session.id,
  });

  // Promote next waitlist entry, using security definer fns to bypass RLS
  const offerWindowMinutes = cp?.waitlist_offer_window_minutes ?? 120;
  const { data: nextRows } = await supabase.rpc('next_waitlist_entry', {
    p_session_id: session.id,
  });

  const next = Array.isArray(nextRows) && nextRows.length > 0 ? nextRows[0] : null;

  if (next) {
    const promotionExpires = new Date(Date.now() + offerWindowMinutes * 60000).toISOString();
    await supabase.rpc('promote_waitlist_entry', {
      p_entry_id: next.id,
      p_expires_at: promotionExpires,
    });

    await notifyStudent(supabase, {
      studentId: next.student_id,
      subject: `Spot opened: ${ct?.name ?? 'session'}`,
      body:
        `A spot opened for ${ct?.name ?? 'a session'} on ${formatDateTime12(session.start_at)}. ` +
        `Go to My Bookings to accept within the next ${offerWindowMinutes} minutes.`,
      relatedSessionId: session.id,
    });
  }

  revalidatePath('/my-bookings');
  return { ok: true };
}

export async function leaveWaitlist(waitlistId: string) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from('waitlist_entries')
    .delete()
    .eq('id', waitlistId)
    .eq('student_id', authed.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/my-bookings');
  return { ok: true };
}

export async function acceptWaitlistOffer(waitlistId: string) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from('waitlist_entries')
    .select('id, student_id, session_id, promoted_at, promotion_expires_at')
    .eq('id', waitlistId)
    .maybeSingle();

  if (!entry || entry.student_id !== authed.user.id) return { ok: false, error: 'Not allowed.' };
  if (!entry.promoted_at) return { ok: false, error: 'You have not been offered a spot yet.' };
  if (entry.promotion_expires_at && new Date(entry.promotion_expires_at) < new Date()) {
    return { ok: false, error: 'Offer expired.' };
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, capacity, coach_id, class_type_id, start_at')
    .eq('id', entry.session_id)
    .maybeSingle();

  if (!session) return { ok: false, error: 'Session not found.' };

  const { data: countData } = await supabase.rpc('session_confirmed_count', {
    p_session_id: session.id,
  });
  const bookedCount = (countData as number) ?? 0;

  if (bookedCount >= session.capacity) {
    return { ok: false, error: 'Spot was taken before you could accept.' };
  }

  const { data: newBooking, error: bookErr } = await supabase
    .from('bookings')
    .insert({
      session_id: session.id,
      student_id: authed.user.id,
      status: 'confirmed',
    })
    .select('id')
    .single();

  if (bookErr) return { ok: false, error: bookErr.message };

  await supabase.from('waitlist_entries').delete().eq('id', waitlistId);

  const { data: ct } = await supabase
    .from('class_types')
    .select('name')
    .eq('id', session.class_type_id)
    .maybeSingle();

  await notifyStudent(supabase, {
    studentId: authed.user.id,
    subject: `Confirmed from waitlist: ${ct?.name ?? 'session'}`,
    body: `Your spot for ${ct?.name ?? 'a session'} on ${formatDateTime12(session.start_at)} is confirmed.`,
    relatedBookingId: newBooking.id,
    relatedSessionId: session.id,
  });

  revalidatePath('/my-bookings');
  return { ok: true };
}
