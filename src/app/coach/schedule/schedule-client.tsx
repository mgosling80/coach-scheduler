'use client';

import { useState, useMemo, useTransition } from 'react';
import { cancelSession, markNoShow, unmarkNoShow, markSessionCompleted } from './actions';
import { formatDateTime12, formatTime12 } from '@/lib/format';
import {
  ChevronDown,
  ChevronRight,
  X,
  UserX,
  CheckCircle2,
  List,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';

type Booking = {
  booking_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  status: string;
  booked_at: string;
  marked_no_show_at: string | null;
};

type WaitlistRow = {
  waitlist_id: string;
  student_id: string;
  student_name: string;
  wait_position: number;
  joined_at: string;
  promoted_at: string | null;
  promotion_expires_at: string | null;
};

type SessionItem = {
  id: string;
  startAt: string;
  endAt: string;
  classTypeId: string;
  capacity: number;
  cancelled: boolean;
  cancelledReason: string | null;
  bookings: Booking[];
  waitlist: WaitlistRow[];
};

type ClassTypeMap = Record<string, { name: string; color: string | null }>;

type ViewMode = 'list' | 'calendar';

export function ScheduleClient({
  sessions,
  classTypeMap,
  now,
}: {
  sessions: SessionItem[];
  classTypeMap: ClassTypeMap;
  now: string;
}) {
  const [view, setView] = useState<ViewMode>('list');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView('list')}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
            view === 'list'
              ? 'text-white border-transparent'
              : 'bg-white text-[var(--muted)] border-gray-200 hover:bg-gray-50'
          }`}
          style={view === 'list' ? { background: 'var(--blue-600)' } : undefined}
        >
          <List className="w-4 h-4" />
          List
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
            view === 'calendar'
              ? 'text-white border-transparent'
              : 'bg-white text-[var(--muted)] border-gray-200 hover:bg-gray-50'
          }`}
          style={view === 'calendar' ? { background: 'var(--blue-600)' } : undefined}
        >
          <CalendarIcon className="w-4 h-4" />
          Calendar
        </button>
      </div>

      {view === 'list' ? (
        <ListView sessions={sessions} classTypeMap={classTypeMap} now={now} />
      ) : (
        <MonthView sessions={sessions} classTypeMap={classTypeMap} now={now} />
      )}
    </div>
  );
}

// ============================================================
// LIST VIEW
// ============================================================
function ListView({
  sessions,
  classTypeMap,
  now,
}: {
  sessions: SessionItem[];
  classTypeMap: ClassTypeMap;
  now: string;
}) {
  const upcoming = sessions.filter((s) => s.startAt >= now && !s.cancelled);
  const past = sessions.filter((s) => s.startAt < now);
  const cancelled = sessions.filter((s) => s.cancelled && s.startAt >= now);

  return (
    <div className="space-y-4">
      <SessionsSection title="Upcoming" sessions={upcoming} classTypeMap={classTypeMap} mode="upcoming" />
      {cancelled.length > 0 && (
        <SessionsSection title="Cancelled" sessions={cancelled} classTypeMap={classTypeMap} mode="cancelled" />
      )}
      <SessionsSection title="Past" sessions={past} classTypeMap={classTypeMap} mode="past" />
    </div>
  );
}

function SessionsSection({
  title,
  sessions,
  classTypeMap,
  mode,
}: {
  title: string;
  sessions: SessionItem[];
  classTypeMap: ClassTypeMap;
  mode: 'upcoming' | 'past' | 'cancelled';
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-sm font-bold font-display text-[var(--navy-900)] uppercase tracking-wide">
          {title} ({sessions.length})
        </h2>
      </div>
      {sessions.length === 0 ? (
        <div className="p-6 text-center text-sm text-[var(--muted)]">None.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} classTypeMap={classTypeMap} mode={mode} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// MONTH CALENDAR VIEW
// ============================================================
function MonthView({
  sessions,
  classTypeMap,
  now,
}: {
  sessions: SessionItem[];
  classTypeMap: ClassTypeMap;
  now: string;
}) {
  const today = new Date(now);
  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string>(today.toISOString().slice(0, 10));

  // Build the grid of dates to display: from the first Sunday before the month
  // up to enough days to fill the last week. Always 6 rows × 7 cols.
  const gridDates = useMemo(() => {
    const firstOfMonth = new Date(monthAnchor);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay()); // back to Sunday
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [monthAnchor]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionItem[]>();
    for (const s of sessions) {
      const dateKey = new Date(s.startAt).toISOString().slice(0, 10);
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(s);
    }
    return map;
  }, [sessions]);

  const selectedSessions = (sessionsByDate.get(selectedDate) ?? []).sort((a, b) =>
    a.startAt.localeCompare(b.startAt)
  );

  function prevMonth() {
    setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1));
  }
  function nextMonth() {
    setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1));
  }
  function goToToday() {
    const t = new Date();
    setMonthAnchor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDate(t.toISOString().slice(0, 10));
  }

  const monthLabel = monthAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayKey = new Date(now).toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold font-display text-[var(--navy-900)]">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-gray-100 rounded text-gray-600"
              title="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goToToday}
              className="text-sm font-semibold text-[var(--navy-900)] px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 rounded text-gray-600"
              title="Next month"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-gray-100" style={{ background: 'rgba(46,91,212,.04)' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-2 py-2 text-xs font-bold text-[var(--navy-700)] text-center">
              {d}
            </div>
          ))}
        </div>

        {/* Date grid: 6 rows × 7 cols */}
        <div className="grid grid-cols-7 grid-rows-6">
          {gridDates.map((d, idx) => {
            const dateKey = d.toISOString().slice(0, 10);
            const daySessions = sessionsByDate.get(dateKey) ?? [];
            const visibleSessions = daySessions.filter((s) => !s.cancelled);
            const isCurrentMonth = d.getMonth() === monthAnchor.getMonth();
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDate;

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(dateKey)}
                className={`text-left border-b border-r border-gray-200 p-2 min-h-[110px] sm:min-h-[130px] transition relative overflow-hidden ${
                  isSelected ? '' : isCurrentMonth ? 'bg-white hover:bg-gray-50' : 'bg-[#f3f1ec] hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    style={isToday ? { background: 'var(--blue-600)' } : undefined}
                    className={`text-sm ${
                      !isCurrentMonth
                        ? 'text-gray-400'
                        : isToday
                        ? 'inline-flex items-center justify-center w-6 h-6 rounded-full text-white font-bold'
                        : 'text-[var(--navy-900)] font-semibold'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {visibleSessions.length > 0 && (
                    <span className="text-[10px] text-gray-500">
                      {visibleSessions.length}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {visibleSessions.slice(0, 3).map((s) => {
                    const ct = classTypeMap[s.classTypeId];
                    return (
                      <div
                        key={s.id}
                        className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded truncate font-medium"
                        style={{
                          backgroundColor: (ct?.color ?? '#3b82f6') + '20',
                          color: ct?.color ?? '#3b82f6',
                        }}
                        title={`${ct?.name ?? 'Class'} at ${formatTime12(
                          new Date(s.startAt).toTimeString().slice(0, 5)
                        )}`}
                      >
                        {formatTime12(new Date(s.startAt).toTimeString().slice(0, 5))}{' '}
                        {ct?.name ?? ''}
                      </div>
                    );
                  })}
                  {visibleSessions.length > 3 && (
                    <div className="text-[10px] text-gray-500 pl-1">
                      +{visibleSessions.length - 3} more
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day session list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold font-display text-[var(--navy-900)]">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            {selectedSessions.length === 0
              ? 'No sessions'
              : `${selectedSessions.length} session${selectedSessions.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {selectedSessions.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--muted)]">Nothing scheduled.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {selectedSessions.map((s) => {
              const isPast = s.startAt < now;
              const mode: 'upcoming' | 'past' | 'cancelled' = s.cancelled
                ? 'cancelled'
                : isPast
                ? 'past'
                : 'upcoming';
              return <SessionRow key={s.id} session={s} classTypeMap={classTypeMap} mode={mode} />;
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SHARED: SessionRow + SessionDetails
// ============================================================
function SessionRow({
  session,
  classTypeMap,
  mode,
}: {
  session: SessionItem;
  classTypeMap: ClassTypeMap;
  mode: 'upcoming' | 'past' | 'cancelled';
}) {
  const [open, setOpen] = useState(false);
  const ct = classTypeMap[session.classTypeId];
  const confirmedCount = session.bookings.filter(
    (b) => b.status === 'confirmed' || b.status === 'completed'
  ).length;

  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: ct?.color ?? '#3b82f6' }}
          />
          <div className="min-w-0">
            <div className="font-bold font-display text-[var(--navy-900)]">{ct?.name ?? 'Class'}</div>
            <div className="text-xs text-[var(--muted)]">{formatDateTime12(session.startAt)}</div>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {session.cancelled ? (
            <span className="text-red-600 font-medium">Cancelled</span>
          ) : (
            <>
              {confirmedCount}/{session.capacity}
              {session.waitlist.length > 0 && ` · ${session.waitlist.length} waitlist`}
            </>
          )}
        </div>
      </button>

      {open && <SessionDetails session={session} classTypeMap={classTypeMap} mode={mode} />}
    </li>
  );
}

function SessionDetails({
  session,
  classTypeMap,
  mode,
}: {
  session: SessionItem;
  classTypeMap: ClassTypeMap;
  mode: 'upcoming' | 'past' | 'cancelled';
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  function handleCancelSession() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await cancelSession(session.id, cancelReason);
      if (!result.ok) {
        setError(result.error ?? 'Failed.');
      } else {
        const count = (result as { affectedCount?: number }).affectedCount ?? 0;
        setInfo(`Cancelled. ${count} student${count === 1 ? '' : 's'} notified.`);
        setShowCancelForm(false);
        setCancelReason('');
      }
    });
  }

  function handleNoShow(bookingId: string) {
    if (!confirm('Mark this student as no-show?')) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await markNoShow(bookingId);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  function handleUndoNoShow(bookingId: string) {
    if (!confirm('Undo no-show?')) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await unmarkNoShow(bookingId);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  function handleComplete() {
    if (!confirm('Mark this session as completed?')) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await markSessionCompleted(session.id);
      if (!result.ok) setError(result.error ?? 'Failed.');
      else setInfo('Marked completed.');
    });
  }

  const ct = classTypeMap[session.classTypeId];
  const activeBookings = session.bookings.filter(
    (b) => b.status === 'confirmed' || b.status === 'completed' || b.status === 'no_show'
  );
  const cancelledBookings = session.bookings.filter(
    (b) => b.status === 'cancelled_by_student' || b.status === 'cancelled_by_coach'
  );

  return (
    <div className="px-4 pb-4 bg-gray-50 border-t border-gray-200 space-y-4">
      <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div>
          <span className="text-gray-500">Time: </span>
          <span className="text-gray-900">
            {formatDateTime12(session.startAt)} –{' '}
            {new Date(session.endAt).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Class: </span>
          <span className="text-gray-900">{ct?.name ?? 'Unknown'}</span>
        </div>
        <div>
          <span className="text-gray-500">Capacity: </span>
          <span className="text-gray-900">{session.capacity}</span>
        </div>
        {session.cancelledReason && (
          <div className="md:col-span-2">
            <span className="text-gray-500">Cancel reason: </span>
            <span className="text-gray-900">{session.cancelledReason}</span>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-bold font-display text-[var(--navy-700)] mb-2">Bookings ({activeBookings.length})</h4>
        {activeBookings.length === 0 ? (
          <p className="text-xs text-gray-400">No bookings.</p>
        ) : (
          <ul className="space-y-1">
            {activeBookings.map((b) => (
              <li
                key={b.booking_id}
                className="flex items-center justify-between bg-white px-3 py-2 rounded border border-gray-200 text-sm"
              >
                <div>
                  <span className="font-medium">{b.student_name}</span>
                  <span className="text-xs text-gray-500 ml-2">{b.student_email}</span>
                  {b.status === 'no_show' && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                        No-show
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUndoNoShow(b.booking_id); }}
                        disabled={pending}
                        className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                      >
                        Undo
                      </button>
                    </span>
                  )}
                  {b.status === 'completed' && (
                    <span className="ml-2 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                      Completed
                    </span>
                  )}
                </div>
                {mode === 'past' && b.status === 'confirmed' && (
                  <button
                    onClick={() => handleNoShow(b.booking_id)}
                    disabled={pending}
                    className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <UserX className="w-3 h-3" />
                    Mark no-show
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {cancelledBookings.length > 0 && (
        <div>
          <h4 className="text-sm font-bold font-display text-[var(--muted)] mb-2">
            Cancelled ({cancelledBookings.length})
          </h4>
          <ul className="space-y-1">
            {cancelledBookings.map((b) => (
              <li key={b.booking_id} className="text-sm text-gray-500 px-3 py-1">
                {b.student_name}{' '}
                <span className="text-xs">
                  ({b.status === 'cancelled_by_student' ? 'by student' : 'by coach'})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {session.waitlist.length > 0 && (
        <div>
          <h4 className="text-sm font-bold font-display text-[var(--navy-700)] mb-2">Waitlist ({session.waitlist.length})</h4>
          <ul className="space-y-1">
            {session.waitlist.map((w) => (
              <li
                key={w.waitlist_id}
                className="bg-white px-3 py-2 rounded border border-gray-200 text-sm"
              >
                <span className="text-xs text-gray-500">#{w.wait_position}</span>{' '}
                <span className="font-medium">{w.student_name}</span>
                {w.promoted_at && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(240,180,41,.18)', color: 'var(--gold-600)' }}>
                    Offered
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-3 border-t border-gray-200 space-y-2">
        {info && <div className="text-sm text-green-700">{info}</div>}
        {error && <div className="text-sm text-red-700">{error}</div>}

        {mode === 'upcoming' && activeBookings.length > 0 && !showCancelForm && (
          <button
            onClick={() => setShowCancelForm(true)}
            disabled={pending}
            className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
            Cancel session
          </button>
        )}

        {mode === 'upcoming' && showCancelForm && (
          <div className="bg-white p-3 rounded border border-gray-200 space-y-2">
            <label className="block text-sm font-medium text-gray-700">Reason (sent to students)</label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Coach illness, weather, facility unavailable"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCancelSession}
                disabled={pending}
                className="bg-red-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? 'Cancelling...' : 'Confirm cancel'}
              </button>
              <button
                onClick={() => {
                  setShowCancelForm(false);
                  setCancelReason('');
                }}
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {mode === 'past' && activeBookings.some((b) => b.status === 'confirmed') && (
          <button
            onClick={handleComplete}
            disabled={pending}
            className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            Mark session completed
          </button>
        )}
      </div>
    </div>
  );
}
