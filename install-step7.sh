#!/usr/bin/env bash
# install-step7.sh
# Run from project root: bash install-step7.sh
# Adds notifications (email via Resend, SMS via Twilio, GroupMe broadcasts),
# waitlist promotion on cancellation, and student notification preferences page.

set -e

if [ ! -f package.json ]; then
  echo "ERROR: run this from your project root."
  exit 1
fi

echo "Installing npm packages..."
npm install resend twilio

mkdir -p src/lib/notify
mkdir -p src/app/preferences

# ============================================================
# SCHEMA additions for step 7
# ============================================================
echo "Writing schema-step7.sql"
cat > schema-step7.sql << 'FILE_EOF'
-- Step 7 schema additions

-- Allow students to read class types of coaches they're approved with
-- (booking flow needs this)
drop policy if exists "anyone authed reads class types" on class_types;
create policy "anyone authed reads class types"
on class_types for select
using (auth.uid() is not null);

-- Allow students to read availability/blackouts (needed for slots view)
drop policy if exists "anyone authed reads availability" on availability_blocks;
create policy "anyone authed reads availability"
on availability_blocks for select
using (auth.uid() is not null);

-- Index for finding sessions needing reminders
create index if not exists idx_sessions_start_active
  on sessions (start_at)
  where cancelled = false;
FILE_EOF

# ============================================================
# Notification library
# ============================================================
echo "Writing src/lib/notify/email.ts"
cat > src/lib/notify/email.ts << 'FILE_EOF'
import { Resend } from 'resend';

const FROM = process.env.NOTIFY_FROM_EMAIL || 'Coach Scheduler <onboarding@resend.dev>';

let resendClient: Resend | null = null;
function client() {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY not set');
    resendClient = new Resend(key);
  }
  return resendClient;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const result = await client().emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html ?? `<pre style="font-family: system-ui, sans-serif; white-space: pre-wrap;">${escapeHtml(params.text)}</pre>`,
    });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown email error' };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
FILE_EOF

echo "Writing src/lib/notify/sms.ts"
cat > src/lib/notify/sms.ts << 'FILE_EOF'
import twilio from 'twilio';

let twilioClient: ReturnType<typeof twilio> | null = null;
function client() {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set');
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

export async function sendSms(params: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; error?: string; sid?: string }> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) return { ok: false, error: 'TWILIO_PHONE_NUMBER not set' };

  try {
    const result = await client().messages.create({
      to: params.to,
      from,
      body: params.body,
    });
    return { ok: true, sid: result.sid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown SMS error' };
  }
}
FILE_EOF

echo "Writing src/lib/notify/groupme.ts"
cat > src/lib/notify/groupme.ts << 'FILE_EOF'
export async function postToGroupMe(params: {
  botId: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.groupme.com/v3/bots/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_id: params.botId,
        text: params.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `GroupMe ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown GroupMe error' };
  }
}
FILE_EOF

echo "Writing src/lib/notify/dispatch.ts"
cat > src/lib/notify/dispatch.ts << 'FILE_EOF'
import { sendEmail } from './email';
import { sendSms } from './sms';
import { postToGroupMe } from './groupme';
import type { SupabaseClient } from '@supabase/supabase-js';

export type NotifyChannel = 'email' | 'sms' | 'groupme';

/**
 * Sends a notification to a student through their enabled channels,
 * and logs the result in notifications_sent for auditing/idempotency.
 */
export async function notifyStudent(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    subject: string;
    body: string;
    relatedBookingId?: string;
    relatedSessionId?: string;
    forceChannels?: NotifyChannel[]; // override prefs (e.g. coach cancellation)
  }
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, phone')
    .eq('id', params.studentId)
    .maybeSingle();

  if (!profile) return;

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('email_enabled, sms_enabled')
    .eq('user_id', params.studentId)
    .maybeSingle();

  const channels: NotifyChannel[] = params.forceChannels ?? [];
  if (!params.forceChannels) {
    if (prefs?.email_enabled !== false) channels.push('email');
    if (prefs?.sms_enabled === true) channels.push('sms');
  }

  for (const channel of channels) {
    let success = false;
    let errorMsg: string | null = null;

    if (channel === 'email' && profile.email) {
      const r = await sendEmail({
        to: profile.email,
        subject: params.subject,
        text: params.body,
      });
      success = r.ok;
      errorMsg = r.error ?? null;
    } else if (channel === 'sms' && profile.phone) {
      const r = await sendSms({ to: profile.phone, body: `${params.subject}\n\n${params.body}` });
      success = r.ok;
      errorMsg = r.error ?? null;
    }

    await supabase.from('notifications_sent').insert({
      recipient_id: params.studentId,
      channel,
      subject: params.subject,
      body: params.body,
      related_booking_id: params.relatedBookingId ?? null,
      related_session_id: params.relatedSessionId ?? null,
      delivery_status: success ? 'sent' : 'failed',
      error_message: errorMsg,
    });
  }
}

/**
 * Posts a broadcast to a coach's GroupMe group if they have one configured.
 * Silently skips if no bot is configured.
 */
export async function notifyGroupMe(
  supabase: SupabaseClient,
  params: {
    coachId: string;
    text: string;
    relatedSessionId?: string;
  }
): Promise<void> {
  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('groupme_bot_id')
    .eq('user_id', params.coachId)
    .maybeSingle();

  if (!coachProfile?.groupme_bot_id) return;

  const r = await postToGroupMe({
    botId: coachProfile.groupme_bot_id,
    text: params.text,
  });

  await supabase.from('notifications_sent').insert({
    recipient_id: null,
    channel: 'groupme',
    subject: null,
    body: params.text,
    related_session_id: params.relatedSessionId ?? null,
    delivery_status: r.ok ? 'sent' : 'failed',
    error_message: r.error ?? null,
  });
}
FILE_EOF

# ============================================================
# Format helper additions
# ============================================================
echo "Updating src/lib/format.ts"
cat > src/lib/format.ts << 'FILE_EOF'
export function formatTime12(time: string | null | undefined): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

export function formatDateTime12(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatShortDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
FILE_EOF

# ============================================================
# Update booking action to send confirmation
# ============================================================
echo "Updating src/app/book/[coachId]/[classTypeId]/actions.ts"
cat > "src/app/book/[coachId]/[classTypeId]/actions.ts" << 'FILE_EOF'
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

  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .in('status', ['confirmed', 'completed', 'no_show']);

  const bookedCount = count ?? 0;

  // Pull coach name for messages
  const { data: coach } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', params.coachId)
    .maybeSingle();
  const coachName = coach?.full_name ?? 'your coach';
  const startStr = formatDateTime12(params.startIso);

  if (bookedCount >= capacity) {
    // Waitlist path
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

  // Confirmed booking
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
FILE_EOF

# ============================================================
# Update cancel booking action — notify + promote waitlist
# ============================================================
echo "Updating src/app/my-bookings/actions.ts"
cat > src/app/my-bookings/actions.ts << 'FILE_EOF'
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

  // Notify the cancelling student
  await notifyStudent(supabase, {
    studentId: authed.user.id,
    subject: `Cancelled: ${ct?.name ?? 'session'}`,
    body: `Your ${ct?.name ?? 'session'} on ${formatDateTime12(session.start_at)} has been cancelled.`,
    relatedBookingId: bookingId,
    relatedSessionId: session.id,
  });

  // Notify the coach
  await notifyStudent(supabase, {
    studentId: session.coach_id,
    subject: `Student cancelled: ${ct?.name ?? 'session'}`,
    body: `A student cancelled their ${ct?.name ?? 'session'} on ${formatDateTime12(session.start_at)}.`,
    relatedBookingId: bookingId,
    relatedSessionId: session.id,
    forceChannels: ['email'],
  });

  // Broadcast slot opening to GroupMe (without naming who cancelled)
  await notifyGroupMe(supabase, {
    coachId: session.coach_id,
    text: `Slot opened: ${ct?.name ?? 'a session'} on ${formatDateTime12(session.start_at)}. Book in the app.`,
    relatedSessionId: session.id,
  });

  // Promote next waitlist entry, if any
  const offerWindowMinutes = cp?.waitlist_offer_window_minutes ?? 120;
  const { data: nextOnWaitlist } = await supabase
    .from('waitlist_entries')
    .select('id, student_id, position')
    .eq('session_id', session.id)
    .is('promoted_at', null)
    .order('position')
    .limit(1)
    .maybeSingle();

  if (nextOnWaitlist) {
    const promotionExpires = new Date(Date.now() + offerWindowMinutes * 60000).toISOString();
    await supabase
      .from('waitlist_entries')
      .update({
        promoted_at: new Date().toISOString(),
        promotion_expires_at: promotionExpires,
      })
      .eq('id', nextOnWaitlist.id);

    await notifyStudent(supabase, {
      studentId: nextOnWaitlist.student_id,
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

  // Fetch the waitlist entry
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

  // Verify spot is still available
  const { data: session } = await supabase
    .from('sessions')
    .select('id, capacity, coach_id, class_type_id, start_at')
    .eq('id', entry.session_id)
    .maybeSingle();

  if (!session) return { ok: false, error: 'Session not found.' };

  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .in('status', ['confirmed', 'completed', 'no_show']);

  if ((count ?? 0) >= session.capacity) {
    return { ok: false, error: 'Spot was taken before you could accept.' };
  }

  // Create the booking
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

  // Remove waitlist entry
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
FILE_EOF

# ============================================================
# Update my-bookings UI to show offer with accept button
# ============================================================
echo "Updating src/app/my-bookings/my-bookings-client.tsx"
cat > src/app/my-bookings/my-bookings-client.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { cancelBooking, leaveWaitlist, acceptWaitlistOffer } from './actions';
import { formatDateTime12 } from '@/lib/format';

type BookingItem = {
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

type WaitlistItem = {
  waitlistId: string;
  position: number;
  promotedAt: string | null;
  promotionExpiresAt: string | null;
  sessionId: string;
  startAt: string;
  coachName: string;
  classTypeName: string;
  classTypeColor: string;
};

export function MyBookingsClient({
  bookings,
  waitlist,
}: {
  bookings: BookingItem[];
  waitlist: WaitlistItem[];
}) {
  const upcoming = bookings.filter((b) => new Date(b.startAt) > new Date() && !b.cancelled);
  const past = bookings.filter((b) => new Date(b.startAt) <= new Date() || b.cancelled);
  const upcomingWaitlist = waitlist.filter((w) => new Date(w.startAt) > new Date());
  const offers = upcomingWaitlist.filter(
    (w) => w.promotedAt && (!w.promotionExpiresAt || new Date(w.promotionExpiresAt) > new Date())
  );
  const stillWaiting = upcomingWaitlist.filter(
    (w) => !w.promotedAt || (w.promotionExpiresAt && new Date(w.promotionExpiresAt) <= new Date())
  );

  return (
    <div className="space-y-4">
      {offers.length > 0 && <OffersSection items={offers} />}
      <BookingSection title="Upcoming" items={upcoming} cancellable />
      {stillWaiting.length > 0 && <WaitlistSection items={stillWaiting} />}
      <BookingSection title="Past" items={past} cancellable={false} />
    </div>
  );
}

function BookingSection({
  title,
  items,
  cancellable,
}: {
  title: string;
  items: BookingItem[];
  cancellable: boolean;
}) {
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

function BookingRow({ item, cancellable }: { item: BookingItem; cancellable: boolean }) {
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

function OffersSection({ items }: { items: WaitlistItem[] }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg shadow">
      <div className="p-4 border-b border-green-200">
        <h3 className="text-sm font-semibold text-green-900 uppercase tracking-wide">
          Spots available — accept now
        </h3>
        <p className="text-xs text-green-800 mt-1">
          A spot opened from your waitlist. Accept before the offer expires.
        </p>
      </div>
      <ul className="divide-y divide-green-200">
        {items.map((i) => (
          <OfferRow key={i.waitlistId} item={i} />
        ))}
      </ul>
    </div>
  );
}

function OfferRow({ item }: { item: WaitlistItem }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptWaitlistOffer(item.waitlistId);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  const expiresAt = item.promotionExpiresAt ? new Date(item.promotionExpiresAt) : null;
  const minutesLeft = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000)) : null;

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
          {minutesLeft !== null && (
            <div className="text-xs text-green-700 mt-1">{minutesLeft} min left to accept</div>
          )}
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </div>
      </div>
      <button
        onClick={handleAccept}
        disabled={pending}
        className="bg-green-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex-shrink-0"
      >
        {pending ? 'Accepting...' : 'Accept'}
      </button>
    </li>
  );
}

function WaitlistSection({ items }: { items: WaitlistItem[] }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          On waitlist ({items.length})
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          You&apos;ll be notified if a spot opens.
        </p>
      </div>
      <ul className="divide-y divide-gray-200">
        {items.map((i) => (
          <WaitlistRow key={i.waitlistId} item={i} />
        ))}
      </ul>
    </div>
  );
}

function WaitlistRow({ item }: { item: WaitlistItem }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLeave() {
    if (!confirm('Leave the waitlist for this session?')) return;
    setError(null);
    startTransition(async () => {
      const result = await leaveWaitlist(item.waitlistId);
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
          <div className="font-medium text-gray-900">
            {item.classTypeName}
            <span className="ml-2 text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">
              Position #{item.position}
            </span>
          </div>
          <div className="text-sm text-gray-600">with {item.coachName}</div>
          <div className="text-sm text-gray-500 mt-0.5">{formatDateTime12(item.startAt)}</div>
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </div>
      </div>
      <button
        onClick={handleLeave}
        disabled={pending}
        className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 flex-shrink-0"
      >
        Leave
      </button>
    </li>
  );
}
FILE_EOF

# ============================================================
# Student notification preferences page
# ============================================================
echo "Writing src/app/preferences/actions.ts"
cat > src/app/preferences/actions.ts << 'FILE_EOF'
'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const schema = z.object({
  email_enabled: z.coerce.boolean(),
  sms_enabled: z.coerce.boolean(),
  day_of_digest_enabled: z.coerce.boolean(),
  day_of_digest_time: z.string().regex(/^\d{2}:\d{2}$/),
  reminder_hours: z.string().refine((s) => {
    if (!s.trim()) return true;
    return s.split(',').every((p) => /^\d+$/.test(p.trim()));
  }, 'Comma-separated numbers'),
  phone: z.string().max(30).optional().nullable(),
});

export async function saveNotificationPreferences(formData: FormData) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const parsed = schema.safeParse({
    email_enabled: formData.get('email_enabled') === 'on',
    sms_enabled: formData.get('sms_enabled') === 'on',
    day_of_digest_enabled: formData.get('day_of_digest_enabled') === 'on',
    day_of_digest_time: formData.get('day_of_digest_time'),
    reminder_hours: formData.get('reminder_hours') ?? '',
    phone: formData.get('phone') || null,
  });

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const reminderHours = parsed.data.reminder_hours
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 10));

  await supabase
    .from('profiles')
    .update({ phone: parsed.data.phone })
    .eq('id', authed.user.id);

  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: authed.user.id,
      email_enabled: parsed.data.email_enabled,
      sms_enabled: parsed.data.sms_enabled,
      day_of_digest_enabled: parsed.data.day_of_digest_enabled,
      day_of_digest_time: parsed.data.day_of_digest_time,
      reminder_hours: reminderHours,
    });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/preferences');
  return { ok: true };
}
FILE_EOF

echo "Writing src/app/preferences/page.tsx"
cat > src/app/preferences/page.tsx << 'FILE_EOF'
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PreferencesForm } from './preferences-form';

export default async function PreferencesPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('phone')
    .eq('id', authed.user.id)
    .maybeSingle();

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', authed.user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
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

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Notification preferences</h2>
            <p className="text-sm text-gray-600 mt-1">
              Choose how and when we contact you.
            </p>
          </div>
          <PreferencesForm
            initial={{
              phone: profile?.phone ?? '',
              email_enabled: prefs?.email_enabled ?? true,
              sms_enabled: prefs?.sms_enabled ?? false,
              day_of_digest_enabled: prefs?.day_of_digest_enabled ?? true,
              day_of_digest_time: (prefs?.day_of_digest_time ?? '07:00:00').slice(0, 5),
              reminder_hours: (prefs?.reminder_hours ?? [24, 2]).join(', '),
            }}
          />
        </div>
      </main>
    </div>
  );
}
FILE_EOF

echo "Writing src/app/preferences/preferences-form.tsx"
cat > src/app/preferences/preferences-form.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { saveNotificationPreferences } from './actions';

type Initial = {
  phone: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  day_of_digest_enabled: boolean;
  day_of_digest_time: string;
  reminder_hours: string;
};

export function PreferencesForm({ initial }: { initial: Initial }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  function handleSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await saveNotificationPreferences(formData);
      if (result.ok) setMessage({ kind: 'success', text: 'Saved.' });
      else setMessage({ kind: 'error', text: result.error ?? 'Failed.' });
    });
  }

  return (
    <form action={handleSubmit} className="p-6 space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Channels</h3>
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="email_enabled"
              defaultChecked={initial.email_enabled}
              className="rounded mt-0.5"
            />
            <span>
              Email
              <span className="block text-xs text-gray-500">Confirmations, reminders, and offers.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="sms_enabled"
              defaultChecked={initial.sms_enabled}
              className="rounded mt-0.5"
            />
            <span>
              Text message
              <span className="block text-xs text-gray-500">Requires a phone number below.</span>
            </span>
          </label>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Phone</h3>
        <input
          type="tel"
          name="phone"
          defaultValue={initial.phone}
          placeholder="+15125551234"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">Include country code (e.g. +1 for US).</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Reminders</h3>
        <label className="block text-sm font-medium text-gray-700 mb-1">Reminder hours before session</label>
        <input
          name="reminder_hours"
          defaultValue={initial.reminder_hours}
          placeholder="24, 2"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">Comma-separated, e.g. 24, 2 = one day before and two hours before.</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Morning digest</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="day_of_digest_enabled"
              defaultChecked={initial.day_of_digest_enabled}
              className="rounded"
            />
            Send morning summary of today&apos;s sessions
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Digest time</label>
            <input
              type="time"
              name="day_of_digest_time"
              defaultValue={initial.day_of_digest_time}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
        <button
          type="submit"
          disabled={pending}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Save preferences'}
        </button>
        {message && (
          <span className={`text-sm ${message.kind === 'success' ? 'text-green-700' : 'text-red-700'}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
FILE_EOF

# ============================================================
# Add Preferences link to dashboard
# ============================================================
echo "Updating src/app/dashboard/page.tsx (adds Preferences link)"
cat > src/app/dashboard/page.tsx << 'FILE_EOF'
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ArrowRight, Calendar, Users, Shield, Bell } from 'lucide-react';

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
          <DashCard href="/book" icon={Calendar} title="Book a session" description="See available times with your coaches." />
        )}

        {isStudent && !needsOnboarding && (
          <DashCard href="/my-bookings" icon={Calendar} title="My bookings" description="See upcoming and past sessions." />
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

        <DashCard
          href="/preferences"
          icon={Bell}
          title="Notification preferences"
          description="Choose how and when we contact you."
        />
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
echo "Done. Step 7 installed."
echo ""
echo "IMPORTANT NEXT STEPS:"
echo "1. Add notification credentials to .env.local (see below)"
echo "2. Run schema-step7.sql in Supabase SQL Editor"
echo "3. Restart the dev server"
echo ""
echo "Add to .env.local:"
echo ""
echo "RESEND_API_KEY=re_..."
echo "NOTIFY_FROM_EMAIL=Coach Scheduler <onboarding@resend.dev>"
echo "TWILIO_ACCOUNT_SID=AC..."
echo "TWILIO_AUTH_TOKEN=..."
echo "TWILIO_PHONE_NUMBER=+1..."