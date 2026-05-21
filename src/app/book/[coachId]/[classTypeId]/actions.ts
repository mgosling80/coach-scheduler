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
