'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const BUCKET = 'profile-photos';

export async function uploadProfilePhoto(
  formData: FormData
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const authed = await requireAuth();
  const supabase = await createClient();

  const file = formData.get('photo') as File | null;
  if (!file || file.size === 0) return { ok: false, error: 'No file selected.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'File too large. Max 5 MB.' };
  if (!ALLOWED_TYPES.includes(file.type)) return { ok: false, error: 'Use JPEG, PNG, WebP, or GIF.' };

  // Remove existing files in the user's folder
  const { data: existing } = await supabase.storage.from(BUCKET).list(authed.user.id);
  if (existing && existing.length > 0) {
    await supabase.storage
      .from(BUCKET)
      .remove(existing.map((f) => `${authed.user.id}/${f.name}`));
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
  const path = `${authed.user.id}/photo-${Date.now()}.${safeExt}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = publicData.publicUrl;

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ photo_url: publicUrl })
    .eq('id', authed.user.id);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath('/account');
  revalidatePath('/onboarding');
  revalidatePath('/dashboard');
  return { ok: true, url: publicUrl };
}

export async function removeProfilePhoto(): Promise<{ ok: boolean; error?: string }> {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: existing } = await supabase.storage.from(BUCKET).list(authed.user.id);
  if (existing && existing.length > 0) {
    await supabase.storage
      .from(BUCKET)
      .remove(existing.map((f) => `${authed.user.id}/${f.name}`));
  }

  const { error } = await supabase
    .from('profiles')
    .update({ photo_url: null })
    .eq('id', authed.user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/account');
  return { ok: true };
}
