'use client';

import { useState, useTransition } from 'react';
import { changeEmail, changePassword, deleteAccount } from './actions';

export function AccountClient({ currentEmail }: { currentEmail: string }) {
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
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Change email</h3>
        <form action={handleEmail} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current email</label>
            <input type="email" value={currentEmail} disabled className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-100 text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New email</label>
            <input type="email" name="new_email" required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
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
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Change password</h3>
        <form action={handlePassword} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input type="password" name="new_password" required minLength={8} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <p className="mt-1 text-xs text-gray-500">Minimum 8 characters.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
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

      <section className="pt-6 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-3">Danger zone</h3>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="text-sm text-red-600 hover:text-red-700 border border-red-300 px-4 py-2 rounded-md hover:bg-red-50 disabled:opacity-50"
        >
          Delete my account
        </button>
        <p className="mt-2 text-xs text-gray-500">
          Your past bookings remain on coaches&apos; records, but your name and email are removed.
        </p>
        {deleteMsg && <div className="mt-2 text-sm text-red-700">{deleteMsg}</div>}
      </section>
    </div>
  );
}
