import { sendEmail } from './email';
// SMS deferred until A2P 10DLC registration after deploy
// import { sendSms } from './sms';
import { postToGroupMe } from './groupme';
import type { SupabaseClient } from '@supabase/supabase-js';

export type NotifyChannel = 'email' | 'sms' | 'groupme';

const SMS_ENABLED = false;

export async function notifyStudent(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    subject: string;
    body: string;
    relatedBookingId?: string;
    relatedSessionId?: string;
    forceChannels?: NotifyChannel[];
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
    if (SMS_ENABLED && prefs?.sms_enabled === true) channels.push('sms');
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
    } else if (channel === 'sms') {
      // SMS path intentionally disabled. Re-enable in step 8 after A2P registration.
      success = false;
      errorMsg = 'SMS disabled pending A2P 10DLC registration';
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
