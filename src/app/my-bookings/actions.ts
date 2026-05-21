'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function cancelBooking(bookingId: string) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, student_id, session_id, sessions!inner(coach_id, class_type_id, start_at)')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking || booking.student_id !== authed.user.id) {
    return { ok: false, error: 'Not allowed.' };
  }

  const session = Array.isArray(booking.sessions) ? booking.sessions[0] : booking.sessions;

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
