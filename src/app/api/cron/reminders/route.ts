import { NextResponse } from 'next/server';
import { verifyCron } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/notify/email';
import { formatDateTime12 } from '@/lib/format';

export async function GET(request: Request) {
  const unauth = verifyCron(request);
  if (unauth) return unauth;

  const supabase = createAdminClient();

  // Look ahead 25 hours so we catch the 24hr reminder window
  const { data: rows, error } = await supabase.rpc('bookings_needing_reminders', {
    p_lookahead_hours: 25,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    booking_id: string;
    student_id: string;
    coach_id: string;
    class_type_id: string;
    session_id: string;
    start_at: string;
    hours_before: number;
  };

  const targets = (rows as Row[]) ?? [];
  let sent = 0;
  let failed = 0;

  for (const r of targets) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', r.student_id)
      .maybeSingle();

    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', r.student_id)
      .maybeSingle();

    if (!profile?.email || prefs?.email_enabled === false) continue;

    const { data: coach } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', r.coach_id)
      .maybeSingle();

    const { data: ct } = await supabase
      .from('class_types')
      .select('name')
      .eq('id', r.class_type_id)
      .maybeSingle();

    const subject = `Reminder: ${ct?.name ?? 'session'} in ${r.hours_before}hr`;
    const body = `Reminder — your ${ct?.name ?? 'session'} with ${coach?.full_name ?? 'your coach'} is on ${formatDateTime12(r.start_at)}.`;

    const result = await sendEmail({ to: profile.email, subject, text: body });

    if (result.ok) {
      await supabase.from('reminders_sent').insert({
        booking_id: r.booking_id,
        hours_before: r.hours_before,
      });
      await supabase.from('notifications_sent').insert({
        recipient_id: r.student_id,
        channel: 'email',
        subject,
        body,
        related_booking_id: r.booking_id,
        related_session_id: r.session_id,
        delivery_status: 'sent',
      });
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed, candidates: targets.length });
}
