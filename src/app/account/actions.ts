'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export async function changeEmail(formData: FormData) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const newEmail = formData.get('new_email') as string;
  const parsed = z.string().email().safeParse(newEmail);
  if (!parsed.success) return { ok: false, error: 'Invalid email.' };

  const { error } = await supabase.auth.updateUser({ email: parsed.data });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    message: `A confirmation link was sent to both ${authed.user.email} and ${parsed.data}. Click both to complete the change.`,
  };
}

export async function changePassword(formData: FormData) {
  await requireAuth();
  const supabase = await createClient();

  const newPassword = formData.get('new_password') as string;
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };

  return { ok: true, message: 'Password updated.' };
}

export async function deleteAccount() {
  const authed = await requireAuth();
  const adminClient = createAdminClient();

  // Soft-anonymize profile so booking history remains useful for coaches
  await adminClient
    .from('profiles')
    .update({
      full_name: 'Former user',
      email: `deleted-${authed.user.id}@example.invalid`,
      phone: null,
    })
    .eq('id', authed.user.id);

  // Delete auth user (cascades to profiles via FK)
  const { error } = await adminClient.auth.admin.deleteUser(authed.user.id);
  if (error) return { ok: false, error: error.message };

  redirect('/login');
}

import { revalidatePath } from 'next/cache';

const studentProfileSchema = z.object({
  age: z.coerce.number().int().min(1).max(120).optional().nullable(),
  gym: z.string().max(120).optional().nullable(),
  level: z.string().max(80).optional().nullable(),
  team: z.string().max(120).optional().nullable(),
  comments: z.string().max(1000).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
});

export async function saveStudentProfileFromAccount(formData: FormData) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const parsed = studentProfileSchema.safeParse({
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

  await supabase
    .from('profiles')
    .update({ phone: parsed.data.phone })
    .eq('id', authed.user.id);

  const { error } = await supabase.from('student_profiles').upsert({
    user_id: authed.user.id,
    age: parsed.data.age,
    gym: parsed.data.gym,
    level: parsed.data.level,
    team: parsed.data.team,
    comments: parsed.data.comments,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/account');
  return { ok: true, message: 'Profile saved.' };
}
