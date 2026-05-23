'use client';

import { useState, useTransition } from 'react';
import { updateCoachProfile } from './actions';
import { ProfilePhotoUpload } from '@/components/profile-photo-upload';

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
        <ProfilePhotoUpload initialUrl={initial.photo_url} />
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
