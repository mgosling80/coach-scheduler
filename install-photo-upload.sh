#!/usr/bin/env bash
# install-photo-upload.sh
# Run from project root: bash install-photo-upload.sh

set -e

if [ ! -f package.json ]; then
  echo "ERROR: run this from your project root."
  exit 1
fi

echo "Writing src/app/coach/profile/photo-upload-actions.ts"
cat > src/app/coach/profile/photo-upload-actions.ts << 'FILE_EOF'
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
FILE_EOF

echo "Writing src/app/coach/profile/photo-upload.tsx"
cat > src/app/coach/profile/photo-upload.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition, useRef } from 'react';
import Image from 'next/image';
import { Upload, X, ImageIcon } from 'lucide-react';
import { uploadCoachPhoto, removeCoachPhoto } from './photo-upload-actions';

export function PhotoUpload({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const formData = new FormData();
    formData.append('photo', file);

    startTransition(async () => {
      const result = await uploadCoachPhoto(formData);
      if (result.ok && result.url) {
        // Cache-bust the URL so the new image shows immediately
        setUrl(`${result.url}?t=${Date.now()}`);
      } else {
        setError(result.error ?? 'Upload failed.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  function handleRemove() {
    if (!confirm('Remove your profile photo?')) return;
    setError(null);
    startTransition(async () => {
      const result = await removeCoachPhoto();
      if (result.ok) {
        setUrl('');
      } else {
        setError(result.error ?? 'Remove failed.');
      }
    });
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Profile photo</label>
      <div className="flex items-start gap-4">
        <div className="w-24 h-24 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-8 h-8 text-gray-400" />
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
              <Upload className="w-4 h-4" />
              {url ? 'Replace' : 'Upload'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                disabled={pending}
                className="hidden"
              />
            </label>
            {url && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={pending}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            JPEG, PNG, WebP, or GIF. Max 5 MB. Square photos look best.
          </p>
          {pending && <p className="text-xs text-gray-500">Uploading...</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
FILE_EOF

echo "Writing src/app/coach/profile/profile-form.tsx (updated)"
cat > src/app/coach/profile/profile-form.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { updateCoachProfile } from './actions';
import { PhotoUpload } from './photo-upload';

type Initial = {
  full_name: string;
  email: string;
  phone: string;
  bio: string;
  photo_url: string;
  groupme_bot_id: string;
  default_booking_window_hours: number;
  default_cancel_window_hours: number;
  default_reminder_hours: string;
  morning_digest_enabled: boolean;
  morning_digest_time: string;
};

export function ProfileForm({ initial }: { initial: Initial }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  function handleSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateCoachProfile(formData);
      if (result.ok) {
        setMessage({ kind: 'success', text: 'Saved.' });
      } else {
        setMessage({ kind: 'error', text: result.error ?? 'Something went wrong.' });
      }
    });
  }

  return (
    <div className="p-6 space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Photo</h3>
        <PhotoUpload initialUrl={initial.photo_url} />
      </section>

      <form action={handleSubmit} className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Identity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full name" name="full_name" defaultValue={initial.full_name} required />
            <Field label="Email" name="email" defaultValue={initial.email} disabled />
            <Field label="Phone" name="phone" defaultValue={initial.phone} type="tel" />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
            <textarea
              name="bio"
              defaultValue={initial.bio}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">GroupMe</h3>
          <Field
            label="GroupMe bot ID"
            name="groupme_bot_id"
            defaultValue={initial.groupme_bot_id}
            help="Create a bot in your GroupMe group and paste its ID here. We'll post schedule and cancellation messages."
          />
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Default windows</h3>
          <p className="text-sm text-gray-600 mb-3">
            Used by all class types unless overridden. Hours, not days.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Booking closes (hours before)"
              name="default_booking_window_hours"
              defaultValue={String(initial.default_booking_window_hours)}
              type="number"
              min="0"
            />
            <Field
              label="Cancellation closes (hours before)"
              name="default_cancel_window_hours"
              defaultValue={String(initial.default_cancel_window_hours)}
              type="number"
              min="0"
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Reminders &amp; digest</h3>
          <Field
            label="Default reminder hours before session"
            name="default_reminder_hours"
            defaultValue={initial.default_reminder_hours}
            help="Comma-separated. Default: 24, 2 (a day before and two hours before)."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="morning_digest_enabled"
                defaultChecked={initial.morning_digest_enabled}
                className="rounded"
              />
              Send morning digest of today&apos;s bookings
            </label>
            <Field
              label="Morning digest time"
              name="morning_digest_time"
              defaultValue={initial.morning_digest_time}
              type="time"
            />
          </div>
        </section>

        <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
          <button
            type="submit"
            disabled={pending}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? 'Saving...' : 'Save changes'}
          </button>
          {message && (
            <span
              className={`text-sm ${
                message.kind === 'success' ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {message.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required,
  disabled,
  placeholder,
  help,
  min,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  help?: string;
  min?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        min={min}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:text-gray-500"
      />
      {help && <p className="mt-1 text-xs text-gray-500">{help}</p>}
    </div>
  );
}
FILE_EOF

echo "Writing src/app/coach/profile/actions.ts (updated to remove photo_url field)"
cat > src/app/coach/profile/actions.ts << 'FILE_EOF'
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
FILE_EOF

echo ""
echo "Done. Photo upload installed."
echo ""
echo "Files written:"
ls src/app/coach/profile/