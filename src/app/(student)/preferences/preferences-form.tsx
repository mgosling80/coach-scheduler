'use client';

import { useState, useTransition } from 'react';
import { saveNotificationPreferences } from './actions';

type Initial = {
  phone: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  day_of_digest_enabled: boolean;
  day_of_digest_time: string;
  reminder_hours: string;
};

export function PreferencesForm({ initial }: { initial: Initial }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  function handleSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await saveNotificationPreferences(formData);
      if (result.ok) setMessage({ kind: 'success', text: 'Saved.' });
      else setMessage({ kind: 'error', text: result.error ?? 'Failed.' });
    });
  }

  return (
    <form action={handleSubmit} className="p-6 space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Channels</h3>
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="email_enabled"
              defaultChecked={initial.email_enabled}
              className="rounded mt-0.5"
            />
            <span>
              Email
              <span className="block text-xs text-gray-500">Confirmations, reminders, and offers.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              name="sms_enabled"
              disabled
              className="rounded mt-0.5"
            />
            <span>
              Text message <span className="text-xs italic">(coming soon)</span>
              <span className="block text-xs">SMS will be available after launch.</span>
            </span>
          </label>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Phone</h3>
        <input
          type="tel"
          name="phone"
          defaultValue={initial.phone}
          placeholder="2148836464 or (214) 883-6464"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">US numbers only. Any format works. Used once SMS is enabled.</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Reminders</h3>
        <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">Reminder hours before session</label>
        <input
          name="reminder_hours"
          defaultValue={initial.reminder_hours}
          placeholder="24, 2"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">Comma-separated, e.g. 24, 2 = one day before and two hours before.</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Morning digest</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="day_of_digest_enabled"
              defaultChecked={initial.day_of_digest_enabled}
              className="rounded"
            />
            Send morning summary of today&apos;s sessions
          </label>
          <div>
            <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">Digest time</label>
            <input
              type="time"
              name="day_of_digest_time"
              defaultValue={initial.day_of_digest_time}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
            />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
        <button
          type="submit"
          disabled={pending}
          className="cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Save preferences'}
        </button>
        {message && (
          <span className={`text-sm ${message.kind === 'success' ? 'text-green-700' : 'text-red-700'}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
