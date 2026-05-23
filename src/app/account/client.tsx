'use client';

import { useState, useTransition } from 'react';
import { changeEmail, changePassword, deleteAccount } from './actions';
import { ProfilePhotoUpload } from '@/components/profile-photo-upload';

export function AccountClient({ currentEmail, photoUrl }: { currentEmail: string; photoUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [emailMsg, setEmailMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  function handleEmail(formData: FormData) {
    setEmailMsg(null);
    startTransition(async () => {
      const r = await changeEmail(formData);
      setEmailMsg(r.ok ? { kind: 'ok', text: r.message ?? 'Sent.' } : { kind: 'error', text: r.error ?? 'Failed.' });
    });
  }

  function handlePassword(formData: FormData) {
    setPwMsg(null);
    startTransition(async () => {
      const r = await changePassword(formData);
      setPwMsg(r.ok ? { kind: 'ok', text: r.message ?? 'Updated.' } : { kind: 'error', text: r.error ?? 'Failed.' });
    });
  }

  function handleDelete() {
    const ok = confirm(
      'Delete your account? Your past bookings stay on coaches\' records, but your profile will be anonymized. This cannot be undone.'
    );
    if (!ok) return;
    setDeleteMsg(null);
    startTransition(async () => {
      const r = await deleteAccount();
      if (r && !r.ok) setDeleteMsg(r.error ?? 'Failed.');
    });
  }

  return (
    <div className="p-6 space-y-8">
      <section>
        <ProfilePhotoUpload initialUrl={photoUrl} />
      </section>

      <section>
        <h3 className="text-sm font-bold font-display text-[var(--navy-900)] uppercase tracking-wide mb-3">Change email</h3>
        <form action={handleEmail} className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">Current email</label>
            <input type="email" value={currentEmail} disabled className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-100 text-[var(--muted)]" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">New email</label>
            <input type="email" name="new_email" required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {pending ? 'Sending...' : 'Send change link'}
            </button>
            {emailMsg && (
              <span className={`text-xs ${emailMsg.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
                {emailMsg.text}
              </span>
            )}
          </div>
        </form>
      </section>

      <section>
        <h3 className="text-sm font-bold font-display text-[var(--navy-900)] uppercase tracking-wide mb-3">Change password</h3>
        <form action={handlePassword} className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">New password</label>
            <input type="password" name="new_password" required minLength={8} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]" />
            <p className="mt-1 text-xs text-[var(--muted)]">Minimum 8 characters.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {pending ? 'Saving...' : 'Update password'}
            </button>
            {pwMsg && (
              <span className={`text-xs ${pwMsg.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
                {pwMsg.text}
              </span>
            )}
          </div>
        </form>
      </section>

      <section className="pt-6 border-t border-gray-100 flex items-center justify-between">
        <span className="text-sm text-[var(--muted)]">Signed in as {currentEmail}</span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold">
            Sign out
          </button>
        </form>
      </section>

      <section className="pt-6 border-t border-gray-100">
        <h3 className="text-sm font-bold font-display text-red-700 uppercase tracking-wide mb-3">Danger zone</h3>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="text-sm text-red-600 hover:text-red-700 border border-red-300 px-4 py-2 rounded-md hover:bg-red-50 disabled:opacity-50"
        >
          Delete my account
        </button>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Your past bookings remain on coaches&apos; records, but your name and email are removed.
        </p>
        {deleteMsg && <div className="mt-2 text-sm text-red-700">{deleteMsg}</div>}
      </section>
    </div>
  );
}
