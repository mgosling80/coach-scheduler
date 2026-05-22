'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type ClassTypeData = {
  name: string;
  description: string;
  duration_minutes: number;
  capacity: number;
  color: string;
  booking_window_hours: string;
  cancel_window_hours: string;
  is_active: boolean;
};

export function ClassTypeForm({
  initial,
  onSubmit,
  onDelete,
}: {
  initial: ClassTypeData;
  onSubmit: (fd: FormData) => Promise<{ ok: boolean; error?: string } | void>;
  onDelete?: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(formData);
      if (result && !result.ok) {
        setError(result.error ?? 'Save failed.');
      }
    });
  }

  function handleDelete() {
    if (!onDelete) return;
    if (!confirm('Mark this class type inactive? Existing bookings are kept; students can no longer book new sessions of this type.')) return;
    setError(null);
    startTransition(async () => {
      const result = await onDelete();
      if (!result.ok) {
        setError(result.error ?? 'Delete failed.');
      } else {
        router.push('/coach/class-types');
      }
    });
  }

  return (
    <form action={handleSubmit} className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            name="name"
            defaultValue={initial.name}
            required
            placeholder="e.g. Hitting"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            name="description"
            defaultValue={initial.description}
            rows={2}
            placeholder="Optional — shown to students when picking a class type."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
          <select
            name="duration_minutes"
            defaultValue={initial.duration_minutes}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          >
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
          <input
            type="number"
            name="capacity"
            min="1"
            max="50"
            defaultValue={initial.capacity}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
          <p className="mt-1 text-xs text-gray-500">1 for one-on-one, 2+ for group classes.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              name="color"
              defaultValue={initial.color}
              className="h-10 w-16 border border-gray-300 rounded cursor-pointer"
            />
            <span className="text-xs text-gray-500">Used on the calendar.</span>
          </div>
        </div>

        <div className="flex items-center pt-6">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={initial.is_active}
              className="rounded"
            />
            Active (students can book)
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Override: booking window (hours)
          </label>
          <input
            type="number"
            name="booking_window_hours"
            min="0"
            defaultValue={initial.booking_window_hours}
            placeholder="Use default"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
          <p className="mt-1 text-xs text-gray-500">Leave blank to use your default.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Override: cancellation window (hours)
          </label>
          <input
            type="number"
            name="cancel_window_hours"
            min="0"
            defaultValue={initial.cancel_window_hours}
            placeholder="Use default"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
          <p className="mt-1 text-xs text-gray-500">Leave blank to use your default.</p>
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded">{error}</div>}

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {pending ? 'Saving...' : 'Save'}
          </button>
          <Link
            href="/coach/class-types"
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
          >
            Cancel
          </Link>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="text-sm text-red-600 hover:text-red-700 px-3 py-2 disabled:opacity-50"
          >
            Deactivate
          </button>
        )}
      </div>
    </form>
  );
}
