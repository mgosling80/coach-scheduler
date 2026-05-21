'use client';

import { useState, useTransition } from 'react';
import { cancelBooking } from './actions';
import { formatDateTime12 } from '@/lib/format';

type Item = {
  bookingId: string;
  status: string;
  sessionId: string;
  startAt: string;
  endAt: string;
  coachName: string;
  classTypeName: string;
  classTypeColor: string;
  cancelled: boolean;
};

export function MyBookingsClient({ bookings }: { bookings: Item[] }) {
  const upcoming = bookings.filter((b) => new Date(b.startAt) > new Date() && !b.cancelled);
  const past = bookings.filter((b) => new Date(b.startAt) <= new Date() || b.cancelled);

  return (
    <div className="space-y-4">
      <Section title="Upcoming" items={upcoming} cancellable />
      <Section title="Past" items={past} cancellable={false} />
    </div>
  );
}

function Section({ title, items, cancellable }: { title: string; items: Item[]; cancellable: boolean }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          {title} ({items.length})
        </h3>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">None.</div>
      ) : (
        <ul className="divide-y divide-gray-200">
          {items.map((i) => (
            <BookingRow key={i.bookingId} item={i} cancellable={cancellable} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingRow({ item, cancellable }: { item: Item; cancellable: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    if (!confirm('Cancel this booking?')) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(item.bookingId);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  return (
    <li className="p-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
          style={{ backgroundColor: item.classTypeColor }}
        />
        <div className="min-w-0">
          <div className="font-medium text-gray-900">{item.classTypeName}</div>
          <div className="text-sm text-gray-600">with {item.coachName}</div>
          <div className="text-sm text-gray-500 mt-0.5">{formatDateTime12(item.startAt)}</div>
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </div>
      </div>
      {cancellable && (
        <button
          onClick={handleCancel}
          disabled={pending}
          className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 flex-shrink-0"
        >
          Cancel
        </button>
      )}
    </li>
  );
}
