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

const cardClass = 'bg-white rounded-xl shadow-sm border border-gray-100';
const sectionHeadClass =
  'text-sm font-bold font-display text-[var(--navy-900)] uppercase tracking-wide';

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
    <div className={cardClass}>
      <div className="p-4 border-b border-gray-100">
        <h3 className={sectionHeadClass}>Recurring requests</h3>
      </div>
      <ul className="divide-y divide-gray-100">
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
          <div className="font-bold font-display text-[var(--navy-900)]">{item.classTypeName}</div>
          {isPending && (
            <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(240,180,41,.18)', color: 'var(--gold-600)' }}>
              Pending review
            </span>
          )}
          {isDeclined && (
            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded font-semibold">Declined</span>
          )}
        </div>
        <div className="text-sm text-[var(--muted)]">with {item.coachName}</div>
        <div className="text-sm text-[var(--muted)] mt-0.5">
          {DAY_LABELS[item.dayOfWeek] ?? item.dayOfWeek} at {formatTime12(item.startTime)} ·{' '}
          {item.horizonWeeks} weeks
        </div>
        {isDeclined && item.declineReason && (
          <div className="text-xs text-[var(--muted)] mt-1">Reason: {item.declineReason}</div>
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
    <div className={cardClass}>
      <div className="p-4 border-b border-gray-100">
        <h3 className={sectionHeadClass}>
          {title} ({items.length})
        </h3>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-[var(--muted)]">
          {title === 'Upcoming' ? 'No upcoming sessions. Tap Book to schedule one.' : 'None.'}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
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
          <div className="font-bold font-display text-[var(--navy-900)]">{item.classTypeName}</div>
          <div className="text-sm text-[var(--muted)]">with {item.coachName}</div>
          <div className="text-sm text-[var(--muted)] mt-0.5">{formatDateTime12(item.startAt)}</div>
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </div>
      </div>
      {cancellable && (
        <button
          onClick={handleCancel}
          disabled={pending}
          className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 flex-shrink-0"
        >
          Cancel
        </button>
      )}
    </li>
  );
}

function OffersSection({ items }: { items: WaitlistItem[] }) {
  return (
    <div
      className="rounded-xl shadow-sm border"
      style={{ background: 'rgba(240,180,41,.10)', borderColor: 'rgba(240,180,41,.45)' }}
    >
      <div className="p-4 border-b" style={{ borderColor: 'rgba(240,180,41,.35)' }}>
        <h3 className="text-sm font-bold font-display uppercase tracking-wide text-[var(--gold-600)]">
          Spots available — accept now
        </h3>
        <p className="text-xs mt-1 text-[var(--navy-700)]">
          A spot opened from your waitlist. Accept before the offer expires.
        </p>
      </div>
      <ul className="divide-y" style={{ borderColor: 'rgba(240,180,41,.25)' }}>
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
          <div className="font-bold font-display text-[var(--navy-900)]">{item.classTypeName}</div>
          <div className="text-sm text-[var(--muted)]">with {item.coachName}</div>
          <div className="text-sm text-[var(--muted)] mt-0.5">{formatDateTime12(item.startAt)}</div>
          {minutesLeft !== null && (
            <div className="text-xs font-semibold mt-1 text-[var(--gold-600)]">{minutesLeft} min left to accept</div>
          )}
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </div>
      </div>
      <button
        onClick={handleAccept}
        disabled={pending}
        className="cp-btn-gold px-4 py-2 rounded-lg text-sm disabled:opacity-50 flex-shrink-0"
      >
        {pending ? 'Accepting...' : 'Accept'}
      </button>
    </li>
  );
}

function WaitlistSection({ items }: { items: WaitlistItem[] }) {
  return (
    <div className={cardClass}>
      <div className="p-4 border-b border-gray-100">
        <h3 className={sectionHeadClass}>On waitlist ({items.length})</h3>
        <p className="text-xs text-[var(--muted)] mt-1">You&apos;ll be notified if a spot opens.</p>
      </div>
      <ul className="divide-y divide-gray-100">
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
          <div className="font-bold font-display text-[var(--navy-900)]">
            {item.classTypeName}
            <span className="ml-2 text-xs px-2 py-0.5 rounded font-semibold align-middle" style={{ background: 'rgba(46,91,212,.1)', color: 'var(--blue-600)' }}>
              Position #{item.position}
            </span>
          </div>
          <div className="text-sm text-[var(--muted)]">with {item.coachName}</div>
          <div className="text-sm text-[var(--muted)] mt-0.5">{formatDateTime12(item.startAt)}</div>
          {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
        </div>
      </div>
      <button
        onClick={handleLeave}
        disabled={pending}
        className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--navy-900)] disabled:opacity-50 flex-shrink-0"
      >
        Leave
      </button>
    </li>
  );
}
