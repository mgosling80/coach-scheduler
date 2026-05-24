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
