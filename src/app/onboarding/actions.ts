'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const schema = z.object({
  age: z.coerce.number().int().min(1).max(120).optional().nullable(),
  gym: z.string().max(120).optional().nullable(),
  level: z.string().max(80).optional().nullable(),
  team: z.string().max(120).optional().nullable(),
  comments: z.string().max(1000).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
});

export async function saveStudentProfile(formData: FormData) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const parsed = schema.safeParse({
    age: formData.get('age') || null,
    gym: formData.get('gym') || null,
    level: formData.get('level') || null,
    team: formData.get('team') || null,
    comments: formData.get('comments') || null,
    phone: formData.get('phone') || null,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Update phone on profiles
  if (parsed.data.phone !== undefined) {
    await supabase
      .from('profiles')
      .update({ phone: parsed.data.phone })
      .eq('id', authed.user.id);
  }

  const { error } = await supabase
    .from('student_profiles')
    .upsert({
      user_id: authed.user.id,
      age: parsed.data.age,
      gym: parsed.data.gym,
      level: parsed.data.level,
      team: parsed.data.team,
      comments: parsed.data.comments,
    });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard');
  redirect('/dashboard');
}
