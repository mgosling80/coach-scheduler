import { NextResponse } from 'next/server';
import { verifyCron } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/notify/email';
import { formatTime12 } from '@/lib/format';

// Runs every 30 minutes; sends digest at each user's configured time if they
// haven't been digested today.
export async function GET(request: Request) {
  const unauth = verifyCron(request);
  if (unauth) return unauth;

  const supabase = createAdminClient();
  const now = new Date();
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // Window of ±15 minutes around the user's configured digest time
  const windowStart = subtractMinutes(currentTime, 15);
  const windowEnd = addMinutes(currentTime, 15);

  // Students with digest enabled and current time in their digest window
  const { data: studentPrefs } = await supabase
    .from('notification_preferences')
    .select('user_id, day_of_digest_time')
    .eq('day_of_digest_enabled', true);

  let studentSent = 0;
  for (const pref of (studentPrefs ?? [])) {
    const digestTime = (pref.day_of_digest_time as string).slice(0, 5);
    if (!inTimeWindow(digestTime, windowStart, windowEnd)) continue;
    if (await wasSentToday(supabase, pref.user_id, 'student_digest')) continue;

    const { data: bookings } = await supabase.rpc('student_bookings_today', {
      p_student_id: pref.user_id,
    });
    type B = { start_at: string; coach_name: string; class_type_name: string };
    const list = (bookings as B[]) ?? [];
    if (list.length === 0) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', pref.user_id)
      .maybeSingle();
    if (!profile?.email) continue;

    const lines = list.map(
      (b) => `• ${formatTime12(new Date(b.start_at).toTimeString().slice(0, 5))} — ${b.class_type_name} with ${b.coach_name}`
    );
    const subject = `Today's sessions (${list.length})`;
    const body = `Good morning${profile.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}.\n\nYou have ${list.length} session${list.length === 1 ? '' : 's'} today:\n\n${lines.join('\n')}`;

    const result = await sendEmail({ to: profile.email, subject, text: body });
    if (result.ok) {
      await supabase.from('notifications_sent').insert({
        recipient_id: pref.user_id,
        channel: 'email',
        subject,
        body,
        delivery_status: 'sent',
      });
      studentSent++;
    }
  }

  // Coaches with morning digest enabled
  const { data: coachProfiles } = await supabase
    .from('coach_profiles')
    .select('user_id, morning_digest_time')
    .eq('morning_digest_enabled', true);

  let coachSent = 0;
  for (const cp of (coachProfiles ?? [])) {
    const digestTime = (cp.morning_digest_time as string).slice(0, 5);
    if (!inTimeWindow(digestTime, windowStart, windowEnd)) continue;
    if (await wasSentToday(supabase, cp.user_id, 'coach_digest')) continue;

    const { data: bookings } = await supabase.rpc('coach_bookings_today', {
      p_coach_id: cp.user_id,
    });
    type B = { start_at: string; student_name: string; class_type_name: string };
    const list = (bookings as B[]) ?? [];
    if (list.length === 0) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', cp.user_id)
      .maybeSingle();
    if (!profile?.email) continue;

    const lines = list.map(
      (b) => `• ${formatTime12(new Date(b.start_at).toTimeString().slice(0, 5))} — ${b.class_type_name} with ${b.student_name}`
    );
    const subject = `Today's schedule (${list.length})`;
    const body = `Good morning${profile.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}.\n\nYou have ${list.length} session${list.length === 1 ? '' : 's'} today:\n\n${lines.join('\n')}`;

    const result = await sendEmail({ to: profile.email, subject, text: body });
    if (result.ok) {
      await supabase.from('notifications_sent').insert({
        recipient_id: cp.user_id,
        channel: 'email',
        subject,
        body,
        delivery_status: 'sent',
      });
      coachSent++;
    }
  }

  return NextResponse.json({ ok: true, studentSent, coachSent });
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function inTimeWindow(t: string, start: string, end: string): boolean {
  // Handle wraparound for early morning ranges
  if (start <= end) return t >= start && t <= end;
  return t >= start || t <= end;
}

function subtractMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m - mins;
  const ph = ((Math.floor(total / 60) % 24) + 24) % 24;
  const pm = ((total % 60) + 60) % 60;
  return `${pad(ph)}:${pad(pm)}`;
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const ph = (Math.floor(total / 60) % 24 + 24) % 24;
  const pm = ((total % 60) + 60) % 60;
  return `${pad(ph)}:${pad(pm)}`;
}

type SupabaseLike = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

async function wasSentToday(supabase: SupabaseLike, userId: string, kind: 'student_digest' | 'coach_digest'): Promise<boolean> {
  const subjectPrefix = kind === 'student_digest' ? "Today's sessions" : "Today's schedule";
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('notifications_sent')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .like('subject', `${subjectPrefix}%`)
    .gte('sent_at', since.toISOString());
  return (count ?? 0) > 0;
}
