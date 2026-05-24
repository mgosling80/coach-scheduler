'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const schema = z.object({
  coach_id: z.string().uuid(),
  class_type_id: z.string().uuid(),
  day_of_week: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().int().refine((v) => v === 30 || v === 60, 'Pick 30 or 60'),
  horizon_weeks: z.coerce.number().int().min(1).max(52),
});

export async function requestRecurring(formData: FormData) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const parsed = schema.safeParse({
    coach_id: formData.get('coach_id'),
    class_type_id: formData.get('class_type_id'),
    day_of_week: formData.get('day_of_week'),
    start_time: formData.get('start_time'),
    duration_minutes: formData.get('duration_minutes'),
    horizon_weeks: formData.get('horizon_weeks'),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  // Verify approval with this coach
  const { data: approval } = await supabase
    .from('coach_approvals')
    .select('status, expires_at')
    .eq('student_id', authed.user.id)
    .eq('coach_id', parsed.data.coach_id)
    .eq('status', 'approved')
    .maybeSingle();

  const isApproved =
    approval && (approval.expires_at === null || new Date(approval.expires_at) > new Date());
  if (!isApproved) return { ok: false, error: 'Not approved with this coach.' };

  const { error } = await supabase.from('recurring_booking_requests').insert({
    student_id: authed.user.id,
    coach_id: parsed.data.coach_id,
    class_type_id: parsed.data.class_type_id,
    day_of_week: parsed.data.day_of_week,
    start_time: parsed.data.start_time,
    duration_minutes: parsed.data.duration_minutes,
    horizon_weeks: parsed.data.horizon_weeks,
    status: 'pending',
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/my-bookings');
  redirect('/my-bookings');
}
