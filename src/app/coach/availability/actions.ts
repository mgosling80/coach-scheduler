'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const dayEnum = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

const availabilitySchema = z
  .object({
    class_type_id: z.string().uuid('Pick a class type'),
    day_of_week: dayEnum,
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    effective_until: z
      .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
      .transform((v) => (v === '' ? null : v)),
  })
  .refine((d) => d.start_time < d.end_time, {
    message: 'End must be after start',
    path: ['end_time'],
  });

export async function createAvailabilityBlock(formData: FormData) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const parsed = availabilitySchema.safeParse({
    class_type_id: formData.get('class_type_id'),
    day_of_week: formData.get('day_of_week'),
    start_time: formData.get('start_time'),
    end_time: formData.get('end_time'),
    effective_from: formData.get('effective_from'),
    effective_until: formData.get('effective_until') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { error } = await supabase.from('availability_blocks').insert({
    coach_id: authed.user.id,
    class_type_id: parsed.data.class_type_id,
    day_of_week: parsed.data.day_of_week,
    start_time: parsed.data.start_time,
    end_time: parsed.data.end_time,
    effective_from: parsed.data.effective_from,
    effective_until: parsed.data.effective_until,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/availability');
  return { ok: true };
}

export async function deleteAvailabilityBlock(id: string) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { error } = await supabase
    .from('availability_blocks')
    .update({ is_active: false })
    .eq('id', id)
    .eq('coach_id', authed.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/availability');
  return { ok: true };
}
