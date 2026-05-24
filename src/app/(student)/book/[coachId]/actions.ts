'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { notifyStudent } from '@/lib/notify/dispatch';
import { formatDateTime12 } from '@/lib/format';

type ExistingSession = {
  id: string;
  class_type_id: string | null;
  start_at: string;
  end_at: string;
  capacity: number;
  booked_count: number;
};

export async function bookSlot(params: {
  coachId: string;
  classTypeId: string;
  startIso: string;
  endIso: string;
}) {
  const authed = await requireAuth();
  const supabase = await createClient();

  // Approval check
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

  // Class type (label + capacity)
  const { data: classType } = await supabase
    .from('class_types')
    .select('capacity, booking_window_hours, name')
    .eq('id', params.classTypeId)
    .eq('coach_id', params.coachId)
    .eq('is_active', true)
    .maybeSingle();
  if (!classType) return { ok: false, error: 'Lesson type not found.' };

  // Booking window cutoff
  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('default_booking_window_hours')
    .eq('user_id', params.coachId)
    .maybeSingle();
  const bookingWindowHours =
    classType.booking_window_hours ?? coachProfile?.default_booking_window_hours ?? 24;
  const cutoff = new Date(Date.now() + bookingWindowHours * 3600 * 1000);
  if (new Date(params.startIso) < cutoff) {
    return { ok: false, error: 'Booking window has closed for this time.' };
  }

  const toMs = (v: string) => {
    // Normalize Postgres 'YYYY-MM-DD HH:MM:SS+00' to ISO, then floor to seconds.
    const iso = v.includes('T') ? v : v.replace(' ', 'T').replace('+00', 'Z');
    return Math.floor(new Date(iso).getTime() / 1000) * 1000;
  };

  const startMs = toMs(params.startIso);
  const endMs = toMs(params.endIso);

  // Pull all overlapping sessions via security-definer fn
  const { data: rangeSessions } = await supabase.rpc('coach_sessions_in_range', {
    p_coach_id: params.coachId,
    p_from: params.startIso,
    p_to: params.endIso,
  });
  const overlapping = ((rangeSessions as ExistingSession[]) ?? []).filter((s) => {
    const ss = toMs(s.start_at);
    const se = toMs(s.end_at);
    return ss < endMs && startMs < se;
  });

  // Identify an exact-interval session matching this class type (the join target)
  const target = overlapping.find(
    (s) =>
      toMs(s.start_at) === startMs &&
      toMs(s.end_at) === endMs &&
      s.class_type_id === params.classTypeId
  );

  // Any overlap that is NOT the target blocks the booking
  const conflict = overlapping.find((s) => !target || s.id !== target.id);
  if (conflict && (!target || conflict.id !== target.id)) {
    return {
      ok: false,
      error:
        'That time overlaps another lesson. Pick a different time, or match the existing lesson exactly to share it.',
    };
  }

  const coachName = await getCoachName(supabase, params.coachId);
  const startStr = formatDateTime12(params.startIso);

  // CASE A: a matching session exists -> join or waitlist
  if (target) {
    if (target.booked_count >= target.capacity) {
      // waitlist
      const { data: existing } = await supabase
        .from('waitlist_entries')
        .select('id')
        .eq('session_id', target.id)
        .eq('student_id', authed.user.id)
        .maybeSingle();
      if (existing) return { ok: true, waitlisted: true };

      const { count: wlCount } = await supabase
        .from('waitlist_entries')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', target.id)
        .is('promoted_at', null);

      const { error: wlErr } = await supabase.from('waitlist_entries').insert({
        session_id: target.id,
        student_id: authed.user.id,
        position: (wlCount ?? 0) + 1,
      });
      if (wlErr) return { ok: false, error: wlErr.message };

      await notifyStudent(supabase, {
        studentId: authed.user.id,
        subject: `Added to waitlist for ${classType.name}`,
        body: `You're on the waitlist for ${classType.name} with ${coachName} on ${startStr}. We'll let you know if a spot opens.`,
        relatedSessionId: target.id,
      });
      revalidatePath(`/book/${params.coachId}`);
      revalidatePath('/my-bookings');
      return { ok: true, waitlisted: true };
    }

    return await confirmBooking(supabase, {
      sessionId: target.id,
      studentId: authed.user.id,
      coachId: params.coachId,
      className: classType.name,
      coachName,
      startStr,
    });
  }

  // CASE B: no overlap at all -> create a fresh session, then book
  const { data: newSession, error: sessionErr } = await supabase
    .from('sessions')
    .insert({
      coach_id: params.coachId,
      class_type_id: params.classTypeId,
      start_at: params.startIso,
      end_at: params.endIso,
      capacity: classType.capacity,
    })
    .select('id')
    .single();

  if (sessionErr || !newSession) {
    return { ok: false, error: sessionErr?.message ?? 'Could not create the session.' };
  }

  return await confirmBooking(supabase, {
    sessionId: newSession.id,
    studentId: authed.user.id,
    coachId: params.coachId,
    className: classType.name,
    coachName,
    startStr,
  });
}

async function getCoachName(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, coachId: string) {
  const { data: coach } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', coachId)
    .maybeSingle();
  return coach?.full_name ?? 'your coach';
}

async function confirmBooking(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    sessionId: string;
    studentId: string;
    coachId: string;
    className: string;
    coachName: string;
    startStr: string;
  }
) {
  const { data: newBooking, error: bookErr } = await supabase
    .from('bookings')
    .insert({
      session_id: args.sessionId,
      student_id: args.studentId,
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
    studentId: args.studentId,
    subject: `Confirmed: ${args.className} with ${args.coachName}`,
    body: `Your ${args.className} session with ${args.coachName} on ${args.startStr} is confirmed.`,
    relatedBookingId: newBooking.id,
    relatedSessionId: args.sessionId,
  });

  revalidatePath(`/book/${args.coachId}`);
  revalidatePath('/my-bookings');
  return { ok: true, waitlisted: false };
}
