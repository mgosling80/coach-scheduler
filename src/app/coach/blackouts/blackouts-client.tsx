'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createBlackout, deleteBlackout } from './actions';

type Blackout = {
  id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function BlackoutsClient({ blackouts }: { blackouts: Blackout[] }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Blackouts</h2>
          <p className="text-sm text-gray-600 mt-1">
            Time off and dates you&apos;re unavailable. Overrides your recurring availability.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add blackout
        </button>
      </div>

      {showForm && <NewBlackoutForm onDone={() => setShowForm(false)} />}

      {blackouts.length === 0 ? (
        <div className="p-10 text-center text-sm text-gray-500">No upcoming blackouts.</div>
      ) : (
        <ul className="divide-y divide-gray-200">
          {blackouts.map((b) => (
            <BlackoutRow key={b.id} blackout={b} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BlackoutRow({ blackout }: { blackout: Blackout }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm('Remove this blackout?')) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBlackout(blackout.id);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  return (
    <li className="flex items-center justify-between p-4 hover:bg-gray-50">
      <div className="text-sm min-w-0">
        <div className="font-medium text-gray-900">
          {formatDateTime(blackout.start_at)} — {formatDateTime(blackout.end_at)}
        </div>
        {blackout.reason && <div className="text-gray-500 mt-0.5">{blackout.reason}</div>}
      </div>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button
          onClick={handleDelete}
          disabled={pending}
          className="text-gray-400 hover:text-red-600 p-1 disabled:opacity-50"
          title="Remove"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}

function NewBlackoutForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createBlackout(formData);
      if (!result.ok) {
        setError(result.error ?? 'Failed.');
      } else {
        onDone();
      }
    });
  }

  return (
    <form action={handleSubmit} className="p-6 bg-gray-50 border-b border-gray-200 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
          <input
            type="datetime-local"
            name="start_at"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
          <input
            type="datetime-local"
            name="end_at"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            name="reason"
            placeholder="e.g. Vacation, conference"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
