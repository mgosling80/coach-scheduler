'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bookSlot } from './actions';
import { formatTime12 } from '@/lib/format';
import { Check, Clock } from 'lucide-react';

type Slot = {
  start: string;
  end: string;
  bookedCount: number;
  capacity: number;
  isFull: boolean;
  sessionId: string | null;
  studentIsBooked: boolean;
  studentIsWaitlisted: boolean;
};

export function SlotsClient({
  slots,
  coachId,
  classTypeId,
}: {
  slots: Slot[];
  coachId: string;
  classTypeId: string;
}) {
  const byDate = new Map<string, Slot[]>();
  for (const s of slots) {
    const dateKey = new Date(s.start).toISOString().slice(0, 10);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(s);
  }

  const dates = Array.from(byDate.keys()).sort();

  if (dates.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-sm text-[var(--muted)]">
        No bookable slots in the next 4 weeks. Check back later or contact your coach.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dates.map((date) => (
        <div key={date} className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-sm font-bold font-display text-[var(--navy-900)]">
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
          </div>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {byDate.get(date)!.map((slot) => (
              <SlotButton
                key={slot.start}
                slot={slot}
                coachId={coachId}
                classTypeId={classTypeId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SlotButton({
  slot,
  coachId,
  classTypeId,
}: {
  slot: Slot;
  coachId: string;
  classTypeId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  function handleClick() {
    if (slot.studentIsBooked || slot.studentIsWaitlisted) return;
    setError(null);
    setConfirmation(null);
    startTransition(async () => {
      const result = await bookSlot({
        coachId,
        classTypeId,
        startIso: slot.start,
        endIso: slot.end,
      });
      if (!result.ok) {
        setError(result.error ?? 'Failed.');
      } else {
        setConfirmation(result.waitlisted ? 'Added to waitlist' : 'Booked');
        router.refresh();
      }
    });
  }

  const timeStr = formatTime12(new Date(slot.start).toTimeString().slice(0, 5));

  let buttonClass = 'border-gray-300 bg-white hover:border-[var(--blue-500)] hover:bg-[rgba(46,91,212,.06)] text-[var(--navy-900)]';
  let badge: React.ReactNode = null;

  if (slot.studentIsBooked) {
    buttonClass = 'border-[var(--blue-600)] text-white';
    badge = <Check className="w-3 h-3 inline ml-1" />;
  } else if (slot.studentIsWaitlisted) {
    buttonClass = 'border-[var(--gold-500)] text-[var(--navy-900)]';
    badge = <Clock className="w-3 h-3 inline ml-1" />;
  } else if (slot.isFull) {
    buttonClass = 'border-gray-200 bg-[#f3f1ec] text-[var(--muted)]';
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={pending || slot.studentIsBooked || slot.studentIsWaitlisted}
        style={slot.studentIsBooked ? { background: 'var(--blue-600)' } : undefined}
        className={`w-full px-3 py-3 border rounded-lg text-sm font-semibold transition active:scale-[0.98] ${buttonClass} disabled:opacity-70`}
        title={slot.isFull ? 'Full — booking adds you to the waitlist' : ''}
      >
        {timeStr}
        {badge}
        {slot.capacity > 1 && (
          <div className="text-xs font-normal opacity-70 mt-0.5">
            {slot.bookedCount}/{slot.capacity}
            {slot.isFull && ' · waitlist'}
          </div>
        )}
      </button>
      {confirmation && <div className="text-xs text-green-700 mt-1">{confirmation}</div>}
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}
