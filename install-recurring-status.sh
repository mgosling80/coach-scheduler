#!/usr/bin/env bash
# install-recurring-status.sh
# Adds a recurring-requests section to My Bookings.
# Run from project root: bash install-recurring-status.sh

set -e

if [ ! -f package.json ]; then
  echo "ERROR: run this from your project root."
  exit 1
fi

echo "Updating src/app/my-bookings/page.tsx"
cat > src/app/my-bookings/page.tsx << 'FILE_EOF'
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { MyBookingsClient } from './my-bookings-client';

export default async function MyBookingsPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      booked_at,
      sessions!inner (
        id,
        start_at,
        end_at,
        coach_id,
        class_type_id,
        cancelled
      )
    `)
    .eq('student_id', authed.user.id)
    .in('status', ['confirmed'])
    .order('booked_at', { ascending: false });

  const { data: waitlist } = await supabase
    .from('waitlist_entries')
    .select(`
      id,
      position,
      joined_at,
      promoted_at,
      promotion_expires_at,
      sessions!inner (
        id,
        start_at,
        end_at,
        coach_id,
        class_type_id
      )
    `)
    .eq('student_id', authed.user.id)
    .order('joined_at', { ascending: false });

  const { data: recurring } = await supabase
    .from('recurring_booking_requests')
    .select('id, coach_id, class_type_id, day_of_week, start_time, horizon_weeks, status, requested_at, decided_at, decline_reason')
    .eq('student_id', authed.user.id)
    .order('requested_at', { ascending: false });

  const sessionList = [
    ...(bookings ?? []).map((b) => b.sessions).flat(),
    ...(waitlist ?? []).map((w) => w.sessions).flat(),
  ];
  const coachIds = Array.from(new Set([
    ...sessionList.map((s) => s.coach_id),
    ...(recurring ?? []).map((r) => r.coach_id),
  ]));
  const classTypeIds = Array.from(new Set([
    ...sessionList.map((s) => s.class_type_id),
    ...(recurring ?? []).map((r) => r.class_type_id),
  ]));

  const { data: coaches } = coachIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', coachIds)
    : { data: [] };

  const { data: classTypes } = classTypeIds.length
    ? await supabase.from('class_types').select('id, name, color').in('id', classTypeIds)
    : { data: [] };

  const coachMap = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));
  const ctMap = new Map((classTypes ?? []).map((ct) => [ct.id, ct]));

  const bookingItems = (bookings ?? []).map((b) => {
    const s = Array.isArray(b.sessions) ? b.sessions[0] : b.sessions;
    return {
      bookingId: b.id,
      status: b.status as string,
      sessionId: s.id,
      startAt: s.start_at,
      endAt: s.end_at,
      coachId: s.coach_id,
      coachName: coachMap.get(s.coach_id) ?? 'Unknown',
      classTypeName: ctMap.get(s.class_type_id)?.name ?? 'Unknown',
      classTypeColor: ctMap.get(s.class_type_id)?.color ?? '#3b82f6',
      cancelled: s.cancelled,
    };
  });

  const waitlistItems = (waitlist ?? []).map((w) => {
    const s = Array.isArray(w.sessions) ? w.sessions[0] : w.sessions;
    return {
      waitlistId: w.id,
      position: w.position,
      promotedAt: w.promoted_at,
      promotionExpiresAt: w.promotion_expires_at,
      sessionId: s.id,
      startAt: s.start_at,
      coachName: coachMap.get(s.coach_id) ?? 'Unknown',
      classTypeName: ctMap.get(s.class_type_id)?.name ?? 'Unknown',
      classTypeColor: ctMap.get(s.class_type_id)?.color ?? '#3b82f6',
    };
  });

  const recurringItems = (recurring ?? []).map((r) => ({
    id: r.id,
    coachName: coachMap.get(r.coach_id) ?? 'Unknown',
    classTypeName: ctMap.get(r.class_type_id)?.name ?? 'Unknown',
    classTypeColor: ctMap.get(r.class_type_id)?.color ?? '#3b82f6',
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    horizonWeeks: r.horizon_weeks,
    status: r.status,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
    declineReason: r.decline_reason,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold text-gray-900">
            Coach Scheduler
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">My bookings</h2>
          <Link href="/request-recurring" className="text-sm text-blue-600 hover:text-blue-700">
            Request recurring →
          </Link>
        </div>
        <MyBookingsClient
          bookings={bookingItems}
          waitlist={waitlistItems}
          recurring={recurringItems}
        />
      </main>
    </div>
  );
}
FILE_EOF

echo "Updating src/app/my-bookings/my-bookings-client.tsx"
cat > src/app/my-bookings/my-bookings-client.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { cancelBooking, leaveWaitlist, acceptWaitlistOffer } from './actions';
import { formatDateTime12, formatTime12 } from '@/lib/format';

type BookingItem = {
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

type WaitlistItem = {
  waitlistId: string;
  position: number;
  promotedAt: string | null;
  promotionExpiresAt: string | null;
  sessionId: string;
  startAt: string;
  coachName: string;
  classTypeName: string;
  classTypeColor: string;
};

type RecurringItem = {
  id: string;
  coachName: string;
  classTypeName: string;
  classTypeColor: string;
  dayOfWeek: string;
  startTime: string;
  horizonWeeks: number;
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  declineReason: string | null;
};

const DAY_LABELS: Record<string, string> = {
  mon: 'Mondays',
  tue: 'Tuesdays',
  wed: 'Wednesdays',
  thu: 'Thursdays',
  fri: 'Fridays',
  sat: 'Saturdays',
  sun: 'Sundays',
};

export function MyBookingsClient({
  bookings,
  waitlist,
  recurring,
}: {
  bookings: BookingItem[];
  waitlist: WaitlistItem[];
  recurring: RecurringItem[];
}) {
  const upcoming = bookings.filter((b) => new Date(b.startAt) > new Date() && !b.cancelled);
  const past = bookings.filter((b) => new Date(b.startAt) <= new Date() || b.cancelled);
  const upcomingWaitlist = waitlist.filter((w) => new Date(w.startAt) > new Date());
  const offers = upcomingWaitlist.filter(
    (w) => w.promotedAt && (!w.promotionExpiresAt || new Date(w.promotionExpiresAt) > new Date())
  );
  const stillWaiting = upcomingWaitlist.filter(
    (w) => !w.promotedAt || (w.promotionExpiresAt && new Date(w.promotionExpiresAt) <= new Date())
  );
  const activeRecurring = recurring.filter((r) => r.status === 'pending' || r.status === 'declined');

  return (
    <div className="space-y-4">
      {offers.length > 0 && <OffersSection items={offers} />}
      {activeRecurring.length > 0 && <RecurringSection items={activeRecurring} />}
      <BookingSection title="Upcoming" items={upcoming} cancellable />
      {stillWaiting.length > 0 && <WaitlistSection items={stillWaiting} />}
      <BookingSection title="Past" items={past} cancellable={false} />
    </div>
  );
}

function RecurringSection({ items }: { items: RecurringItem[] }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Recurring requests
        </h3>
      </div>
      <ul className="divide-y divide-gray-200">
        {items.map((r) => (
          <RecurringRow key={r.id} item={r} />
        ))}
      </ul>
    </div>
  );
}

function RecurringRow({ item }: { item: RecurringItem }) {
  const isPending = item.status === 'pending';
  const isDeclined = item.status === 'declined';

  return (
    <li className="p-4 flex items-start gap-3">
      <span
        className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
        style={{ backgroundColor: item.classTypeColor }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="font-medium text-gray-900">{item.classTypeName}</div>
          {isPending && (
            <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">
              Pending review
            </span>
          )}
          {isDeclined && (
            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">Declined</span>
          )}
        </div>
        <div className="text-sm text-gray-600">with {item.coachName}</div>
        <div className="text-sm text-gray-500 mt-0.5">
          {DAY_LABELS[item.dayOfWeek] ?? item.dayOfWeek} at {formatTime12(item.startTime)} ·{' '}
          {item.horizonWeeks} weeks
        </div>
        {isDeclined && item.declineReason && (
          <div className="text-xs text-gray-600 mt-1">Reason: {item.declineReason}</div>
        )}
        <div className="text-xs text-gray-400 mt-1">
          Requested {new Date(item.requestedAt).toLocaleDateString()}
        </div>
      </div>
    </li>
  );
}

function BookingSection({
  title,
  items,
  cancellable,
}: {
  title: string;
  items: BookingItem[];
  cancellable: boolean;
}) {
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

function BookingRow({ item, cancellable }: { item: BookingItem; cancellable: boolean }) {
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

function OffersSection({ items }: { items: WaitlistItem[] }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg shadow">
      <div className="p-4 border-b border-green-200">
        <h3 className="text-sm font-semibold text-green-900 uppercase tracking-wide">
          Spots available — accept now
        </h3>
        <p className="text-xs text-green-800 mt-1">
          A spot opened from your waitlist. Accept before the offer expires.
        </p>
      </div>
      <ul className="divide-y divide-green-200">
        {items.map((i) => (
          <OfferRow key={i.waitlistId} item={i} />
        ))}
      </ul>
    </div>
  );
}

function OfferRow({ item }: { item: WaitlistItem }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptWaitlistOffer(item.waitlistId);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  const expiresAt = item.promotionExpiresAt ? new Date(item.promotionExpiresAt) : null;
  const minutesLeft = expiresAt
    ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000))
    : null;

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
          {minutesLeft !== null && (
            <div className="text-xs text-green-700 mt-1">{minutesLeft} min left to accept</div>
          )}
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </div>
      </div>
      <button
        onClick={handleAccept}
        disabled={pending}
        className="bg-green-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex-shrink-0"
      >
        {pending ? 'Accepting...' : 'Accept'}
      </button>
    </li>
  );
}

function WaitlistSection({ items }: { items: WaitlistItem[] }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          On waitlist ({items.length})
        </h3>
        <p className="text-xs text-gray-500 mt-1">You&apos;ll be notified if a spot opens.</p>
      </div>
      <ul className="divide-y divide-gray-200">
        {items.map((i) => (
          <WaitlistRow key={i.waitlistId} item={i} />
        ))}
      </ul>
    </div>
  );
}

function WaitlistRow({ item }: { item: WaitlistItem }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLeave() {
    if (!confirm('Leave the waitlist for this session?')) return;
    setError(null);
    startTransition(async () => {
      const result = await leaveWaitlist(item.waitlistId);
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
          <div className="font-medium text-gray-900">
            {item.classTypeName}
            <span className="ml-2 text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">
              Position #{item.position}
            </span>
          </div>
          <div className="text-sm text-gray-600">with {item.coachName}</div>
          <div className="text-sm text-gray-500 mt-0.5">{formatDateTime12(item.startAt)}</div>
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </div>
      </div>
      <button
        onClick={handleLeave}
        disabled={pending}
        className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 flex-shrink-0"
      >
        Leave
      </button>
    </li>
  );
}
FILE_EOF

echo ""
echo "Done. Pending and declined recurring requests now show on My Bookings."