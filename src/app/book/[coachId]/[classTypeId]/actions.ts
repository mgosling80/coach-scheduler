'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { notifyStudent } from '@/lib/notify/dispatch';
import { formatDateTime12 } from '@/lib/format';

export async function bookSlot(params: {
  coachId: string;
  classTypeId: string;
  startIso: string;
  endIso: string;
}) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: approval } = await supabase
    .from('coach_approvals')
    .select('status, expires_at')
    .eq('student_id', authed.user.id)
    .eq('coach_id', params.coachId)
    .eq('status', 'approved')
    .maybeSingle();

  const isApproved =
    approval && (approval.expires_at === null || new Date(approval.expires_at) > new Date());
  if (!isApproved) return { ok: false, error: 'Not approved with this coach.' };

  const { data: classType } = await supabase
    .from('class_types')
    .select('capacity, booking_window_hours, coach_id, name')
    .eq('id', params.classTypeId)
    .eq('coach_id', params.coachId)
    .eq('is_active', true)
    .maybeSingle();

  if (!classType) return { ok: false, error: 'Class type not found.' };

  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('default_booking_window_hours')
    .eq('user_id', params.coachId)
    .maybeSingle();

  const bookingWindowHours =
    classType.booking_window_hours ?? coachProfile?.default_booking_window_hours ?? 24;
  const cutoff = new Date(Date.now() + bookingWindowHours * 3600 * 1000);
  if (new Date(params.startIso) < cutoff) {
    return { ok: false, error: 'Booking window has closed for this slot.' };
  }

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

  // Use the security definer function so we count ALL bookings, not just our own
  const { data: countData } = await supabase.rpc('session_confirmed_count', {
    p_session_id: sessionId,
  });
  const bookedCount = (countData as number) ?? 0;

  const { data: coach } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', params.coachId)
    .maybeSingle();
  const coachName = coach?.full_name ?? 'your coach';
  const startStr = formatDateTime12(params.startIso);

  if (bookedCount >= capacity) {
    const { data: existing } = await supabase
      .from('waitlist_entries')
      .select('id')
      .eq('session_id', sessionId)
      .eq('student_id', authed.user.id)
      .maybeSingle();

    if (existing) return { ok: true, waitlisted: true };

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

    await notifyStudent(supabase, {
      studentId: authed.user.id,
      subject: `Added to waitlist for ${classType.name}`,
      body: `You're on the waitlist for ${classType.name} with ${coachName} on ${startStr}. We'll let you know if a spot opens.`,
      relatedSessionId: sessionId,
    });

    revalidatePath(`/book/${params.coachId}/${params.classTypeId}`);
    revalidatePath('/my-bookings');
    return { ok: true, waitlisted: true };
  }

  const { data: newBooking, error: bookErr } = await supabase
    .from('bookings')
    .insert({
      session_id: sessionId,
      student_id: authed.user.id,
      status: 'confirmed',
    })
    .select('id')
    .single();

  if (bookErr) {
    if (bookErr.message.toLowerCase().includes('duplicate')) {
      return { ok: false, error: 'You are already booked for this session.' };
    }
    return { ok: false, error: bookErr.message };
  }

  await notifyStudent(supabase, {
    studentId: authed.user.id,
    subject: `Confirmed: ${classType.name} with ${coachName}`,
    body: `Your ${classType.name} session with ${coachName} on ${startStr} is confirmed.`,
    relatedBookingId: newBooking.id,
    relatedSessionId: sessionId,
  });

  revalidatePath(`/book/${params.coachId}/${params.classTypeId}`);
  revalidatePath('/my-bookings');
  return { ok: true, waitlisted: false };
}
