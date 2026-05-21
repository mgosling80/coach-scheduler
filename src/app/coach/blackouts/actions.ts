'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const blackoutSchema = z
  .object({
    start_at: z.string().min(1, 'Required'),
    end_at: z.string().min(1, 'Required'),
    reason: z.string().max(200).optional().nullable(),
  })
  .refine((d) => new Date(d.end_at) > new Date(d.start_at), {
    message: 'End must be after start',
    path: ['end_at'],
  });

export async function createBlackout(formData: FormData) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const parsed = blackoutSchema.safeParse({
    start_at: formData.get('start_at'),
    end_at: formData.get('end_at'),
    reason: formData.get('reason') || null,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { error } = await supabase.from('blackouts').insert({
    coach_id: authed.user.id,
    start_at: new Date(parsed.data.start_at).toISOString(),
    end_at: new Date(parsed.data.end_at).toISOString(),
    reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/blackouts');
  return { ok: true };
}

export async function deleteBlackout(id: string) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { error } = await supabase
    .from('blackouts')
    .delete()
    .eq('id', id)
    .eq('coach_id', authed.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/blackouts');
  return { ok: true };
}
