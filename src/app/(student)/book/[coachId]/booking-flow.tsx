'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, ChevronLeft } from 'lucide-react';
import { bookSlot } from './actions';

type DurationOption = { minutes: number; endIso: string; state: 'free' | 'joinable' };
type StartTime = { startIso: string; label: string; durations: DurationOption[] };
type DaySlots = { date: string; label: string; starts: StartTime[] };
type ClassType = { id: string; name: string; description: string | null; capacity: number; color: string | null };

export function BookingFlow({
  coachId,
  days,
  classTypes,
}: {
  coachId: string;
  days: DaySlots[];
  classTypes: ClassType[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // selection state
  const [selStart, setSelStart] = useState<StartTime | null>(null);
  const [selDuration, setSelDuration] = useState<DurationOption | null>(null);

  if (days.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-sm text-[var(--muted)]">
        No open times in the next 4 weeks. Check back later or contact your coach.
      </div>
    );
  }

  function reset() {
    setSelStart(null);
    setSelDuration(null);
    setError(null);
  }

  function handleBook(classTypeId: string) {
    if (!selStart || !selDuration) return;
    setError(null);
    setConfirmation(null);
    startTransition(async () => {
      const result = await bookSlot({
        coachId,
        classTypeId,
        startIso: selStart.startIso,
        endIso: selDuration.endIso,
      });
      if (!result.ok) {
        setError(result.error ?? 'Failed.');
      } else {
        setConfirmation(result.waitlisted ? 'Added to waitlist' : 'Booked!');
        reset();
        router.refresh();
      }
    });
  }

  // STEP 3: pick class type
  if (selStart && selDuration) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelDuration(null)} className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--navy-900)]">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-sm text-[var(--muted)] mb-1">Selected</div>
          <div className="font-bold font-display text-[var(--navy-900)]">
            {selStart.label} · {selDuration.minutes} min
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold font-display text-[var(--navy-900)] mb-2">Choose a lesson type</h3>
          {classTypes.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">This coach has no lesson types set up.</p>
          ) : (
            <ul className="space-y-2">
              {classTypes.map((ct) => (
                <li key={ct.id}>
                  <button
                    onClick={() => handleBook(ct.id)}
                    disabled={pending}
                    className="w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition p-4 flex items-center gap-3 disabled:opacity-50"
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ct.color || '#3b82f6' }} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold font-display text-[var(--navy-900)]">{ct.name}</div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">
                        {ct.capacity === 1 ? '1:1' : `Up to ${ct.capacity}`}
                        {ct.description && <> · {ct.description}</>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <div className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{error}</div>}
      </div>
    );
  }

  // STEP 2: pick duration for the chosen start
  if (selStart) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelStart(null)} className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--navy-900)]">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-sm text-[var(--muted)] mb-1">Start time</div>
          <div className="font-bold font-display text-[var(--navy-900)]">{selStart.label}</div>
        </div>
        <h3 className="text-sm font-bold font-display text-[var(--navy-900)] mb-2">How long?</h3>
        <div className="grid grid-cols-2 gap-3">
          {selStart.durations.map((d) => (
            <button
              key={d.minutes}
              onClick={() => setSelDuration(d)}
              className="bg-white rounded-xl shadow-sm border border-gray-100 hover:border-[var(--blue-500)] hover:shadow-md transition p-5 text-center"
            >
              <div className="text-xl font-extrabold font-display text-[var(--navy-900)]">{d.minutes} min</div>
              {d.state === 'joinable' && (
                <div className="text-xs text-[var(--gold-600)] mt-1 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> May join an existing lesson
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // STEP 1: pick a day + start time
  return (
    <div className="space-y-4">
      {confirmation && (
        <div className="text-sm text-green-800 bg-green-50 border border-green-200 p-3 rounded-lg inline-flex items-center gap-2">
          <Check className="w-4 h-4" /> {confirmation}
        </div>
      )}
      {days.map((day) => (
        <div key={day.date} className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-sm font-bold font-display text-[var(--navy-900)]">{day.label}</h3>
          </div>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {day.starts.map((s) => (
              <button
                key={s.startIso}
                onClick={() => { setSelStart(s); setSelDuration(null); }}
                className="px-3 py-3 border border-gray-300 rounded-lg text-sm font-semibold text-[var(--navy-900)] bg-white hover:border-[var(--blue-500)] hover:bg-[rgba(46,91,212,.06)] transition active:scale-[0.98]"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
