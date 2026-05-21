'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const classTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
  description: z.string().max(500).optional().nullable(),
  duration_minutes: z.coerce.number().refine((n) => n === 30 || n === 60, '30 or 60 only'),
  capacity: z.coerce.number().int().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use #RRGGBB'),
  booking_window_hours: z
    .union([z.literal(''), z.coerce.number().int().min(0).max(720)])
    .transform((v) => (v === '' ? null : v)),
  cancel_window_hours: z
    .union([z.literal(''), z.coerce.number().int().min(0).max(720)])
    .transform((v) => (v === '' ? null : v)),
  is_active: z.coerce.boolean(),
});

export async function createClassType(formData: FormData) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const parsed = classTypeSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
    duration_minutes: formData.get('duration_minutes'),
    capacity: formData.get('capacity'),
    color: formData.get('color'),
    booking_window_hours: formData.get('booking_window_hours') ?? '',
    cancel_window_hours: formData.get('cancel_window_hours') ?? '',
    is_active: formData.get('is_active') === 'on',
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { error } = await supabase.from('class_types').insert({
    coach_id: authed.user.id,
    ...parsed.data,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/class-types');
  redirect('/coach/class-types');
}

export async function updateClassType(id: string, formData: FormData) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const parsed = classTypeSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
    duration_minutes: formData.get('duration_minutes'),
    capacity: formData.get('capacity'),
    color: formData.get('color'),
    booking_window_hours: formData.get('booking_window_hours') ?? '',
    cancel_window_hours: formData.get('cancel_window_hours') ?? '',
    is_active: formData.get('is_active') === 'on',
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { error } = await supabase
    .from('class_types')
    .update(parsed.data)
    .eq('id', id)
    .eq('coach_id', authed.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/class-types');
  redirect('/coach/class-types');
}

export async function deleteClassType(id: string) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { error } = await supabase
    .from('class_types')
    .update({ is_active: false })
    .eq('id', id)
    .eq('coach_id', authed.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/class-types');
  return { ok: true };
}
