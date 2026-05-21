'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const profileSchema = z.object({
  full_name: z.string().min(1, 'Required').max(100),
  phone: z.string().max(30).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  groupme_bot_id: z.string().max(100).optional().nullable(),
  default_booking_window_hours: z.coerce.number().int().min(0).max(720),
  default_cancel_window_hours: z.coerce.number().int().min(0).max(720),
  default_reminder_hours: z.string().refine((s) => {
    if (!s.trim()) return true;
    return s.split(',').every((p) => /^\d+$/.test(p.trim()));
  }, 'Use comma-separated whole numbers, e.g. 24, 2'),
  morning_digest_enabled: z.coerce.boolean(),
  morning_digest_time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
});

export type UpdateProfileResult = {
  ok: boolean;
  error?: string;
};

export async function updateCoachProfile(formData: FormData): Promise<UpdateProfileResult> {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const raw = {
    full_name: formData.get('full_name'),
    phone: formData.get('phone') || null,
    bio: formData.get('bio') || null,
    groupme_bot_id: formData.get('groupme_bot_id') || null,
    default_booking_window_hours: formData.get('default_booking_window_hours'),
    default_cancel_window_hours: formData.get('default_cancel_window_hours'),
    default_reminder_hours: formData.get('default_reminder_hours') ?? '',
    morning_digest_enabled: formData.get('morning_digest_enabled') === 'on',
    morning_digest_time: formData.get('morning_digest_time'),
  };

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const data = parsed.data;
  const reminderHours = data.default_reminder_hours
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 10));

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      full_name: data.full_name,
      phone: data.phone,
    })
    .eq('id', authed.user.id);

  if (profileErr) return { ok: false, error: profileErr.message };

  // Note: photo_url is managed separately via photo-upload-actions.ts
  // We do not include it here so we don't overwrite it on a regular save.
  // First, fetch current photo_url to preserve it.
  const { data: existing } = await supabase
    .from('coach_profiles')
    .select('photo_url')
    .eq('user_id', authed.user.id)
    .maybeSingle();

  const { error: coachErr } = await supabase
    .from('coach_profiles')
    .upsert({
      user_id: authed.user.id,
      bio: data.bio,
      photo_url: existing?.photo_url ?? null,
      groupme_bot_id: data.groupme_bot_id,
      default_booking_window_hours: data.default_booking_window_hours,
      default_cancel_window_hours: data.default_cancel_window_hours,
      default_reminder_hours: reminderHours,
      morning_digest_enabled: data.morning_digest_enabled,
      morning_digest_time: data.morning_digest_time,
    });

  if (coachErr) return { ok: false, error: coachErr.message };

  revalidatePath('/coach/profile');
  return { ok: true };
}
