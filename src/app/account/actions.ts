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
