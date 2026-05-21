'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function uploadCoachPhoto(formData: FormData): Promise<{ ok: boolean; error?: string; url?: string }> {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const file = formData.get('photo') as File | null;
  if (!file || file.size === 0) {
    return { ok: false, error: 'No file selected.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'File too large. Max 5 MB.' };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Use JPEG, PNG, WebP, or GIF.' };
  }

  // Delete previous photo (if any) so we don't accumulate
  const { data: existing } = await supabase.storage
    .from('coach-photos')
    .list(authed.user.id);
  if (existing && existing.length > 0) {
    const paths = existing.map((f) => `${authed.user.id}/${f.name}`);
    await supabase.storage.from('coach-photos').remove(paths);
  }

  // Build a safe filename
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
  const path = `${authed.user.id}/photo-${Date.now()}.${safeExt}`;

  const { error: uploadErr } = await supabase.storage
    .from('coach-photos')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return { ok: false, error: uploadErr.message };
  }

  // Get public URL
  const { data: publicData } = supabase.storage
    .from('coach-photos')
    .getPublicUrl(path);
  const publicUrl = publicData.publicUrl;

  // Save URL to coach_profiles
  const { error: updateErr } = await supabase
    .from('coach_profiles')
    .upsert({
      user_id: authed.user.id,
      photo_url: publicUrl,
    });

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  revalidatePath('/coach/profile');
  return { ok: true, url: publicUrl };
}

export async function removeCoachPhoto(): Promise<{ ok: boolean; error?: string }> {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: existing } = await supabase.storage
    .from('coach-photos')
    .list(authed.user.id);
  if (existing && existing.length > 0) {
    const paths = existing.map((f) => `${authed.user.id}/${f.name}`);
    await supabase.storage.from('coach-photos').remove(paths);
  }

  const { error } = await supabase
    .from('coach_profiles')
    .update({ photo_url: null })
    .eq('user_id', authed.user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/profile');
  return { ok: true };
}
