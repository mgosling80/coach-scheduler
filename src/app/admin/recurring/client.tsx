'use client';

import { useState, useTransition } from 'react';
import { previewRecurring, commitRecurring, declineRecurring } from './actions';
import { formatDateTime12, formatTime12 } from '@/lib/format';
import { ChevronDown, ChevronRight, Check, X, Eye } from 'lucide-react';

type Request = {
  id: string;
  student_id: string;
  coach_id: string;
  class_type_id: string;
  day_of_week: string;
  start_time: string;
  horizon_weeks: number;
  status: string;
  requested_at: string;
  decided_at: string | null;
  decline_reason: string | null;
};

type Student = { id: string; full_name: string; email: string };
type Coach = { id: string; full_name: string };
type ClassType = { id: string; name: string; color: string | null };

type Instance = {
  startAt: string;
  endAt: string;
  status: string;
  reason?: string;
};

const DAY_LABELS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export function RecurringAdminClient({
  requests,
  students,
  coaches,
  classTypes,
}: {
  requests: Request[];
  students: Student[];
  coaches: Coach[];
  classTypes: ClassType[];
}) {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const coachMap = new Map(coaches.map((c) => [c.id, c]));
  const ctMap = new Map(classTypes.map((ct) => [ct.id, ct]));

  const groups = {
    pending: requests.filter((r) => r.status === 'pending'),
    approved: requests.filter((r) => r.status === 'approved'),
    declined: requests.filter((r) => r.status === 'declined'),
  };

  return (
    <div className="space-y-4">
      {(['pending', 'approved', 'declined'] as const).map((group) => (
        <div key={group} className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-bold font-display text-[var(--navy-900)] uppercase tracking-wide">
              {group} ({groups[group].length})
            </h2>
          </div>
          {groups[group].length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--muted)]">None.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {groups[group].map((r) => (
                <RequestRow
                  key={r.id}
                  request={r}
                  student={studentMap.get(r.student_id)}
                  coach={coachMap.get(r.coach_id)}
                  classType={ctMap.get(r.class_type_id)}
                />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function RequestRow({
  request,
  student,
  coach,
  classType,
}: {
  request: Request;
  student: Student | undefined;
  coach: Coach | undefined;
  classType: ClassType | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineForm, setShowDeclineForm] = useState(false);

  function handlePreview() {
    setPreviewError(null);
    setActionError(null);
    startTransition(async () => {
      const result = await previewRecurring(request.id);
      if (!result.ok) setPreviewError(result.error ?? 'Failed.');
      else setInstances(result.instances ?? []);
    });
  }

  function handleConfirm() {
    setActionError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await commitRecurring(request.id);
      if (!result.ok) {
        setActionError(result.error ?? 'Failed.');
      } else {
        const r = result as { ok: boolean; bookedCount?: number; skippedCount?: number };
        setInfo(`Booked ${r.bookedCount ?? 0}, skipped ${r.skippedCount ?? 0}.`);
      }
    });
  }

  function handleDecline() {
    if (!confirm('Decline this recurring request?')) return;
    setActionError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await declineRecurring(request.id, declineReason);
      if (!result.ok) setActionError(result.error ?? 'Failed.');
      else {
        setInfo('Declined.');
        setShowDeclineForm(false);
        setDeclineReason('');
      }
    });
  }

  if (!student) return null;

  const available = instances?.filter((i) => i.status === 'available').length ?? 0;
  const skipped = instances?.filter((i) => i.status !== 'available' && i.status !== 'past').length ?? 0;

  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          {classType && (
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: classType.color ?? '#3b82f6' }}
            />
          )}
          <div className="min-w-0">
            <div className="font-semibold text-[var(--navy-900)]">{student.full_name}</div>
            <div className="text-xs text-gray-500">
              {classType?.name ?? 'Class'} with {coach?.full_name ?? 'Coach'} ·{' '}
              {DAY_LABELS[request.day_of_week]} at {formatTime12(request.start_time)} · {request.horizon_weeks} wks
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-gray-50 border-t border-gray-200 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-sm pt-4">
            <Detail label="Day" value={DAY_LABELS[request.day_of_week]} />
            <Detail label="Time" value={formatTime12(request.start_time)} />
            <Detail label="Weeks" value={String(request.horizon_weeks)} />
            <Detail label="Requested" value={new Date(request.requested_at).toLocaleDateString()} />
          </div>

          {request.decline_reason && (
            <div className="text-sm">
              <span className="text-gray-500">Decline reason: </span>
              <span className="text-gray-900">{request.decline_reason}</span>
            </div>
          )}

          {request.status === 'pending' && !instances && (
            <button
              onClick={handlePreview}
              disabled={pending}
              className="inline-flex items-center gap-1 bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              {pending ? 'Loading...' : 'Preview instances'}
            </button>
          )}

          {previewError && <div className="text-sm text-red-700">{previewError}</div>}

          {instances && (
            <div className="bg-white rounded border border-gray-200 p-3 space-y-2">
              <div className="text-sm text-gray-700">
                <span className="font-medium text-green-700">{available} bookable</span>
                {skipped > 0 && (
                  <span> · <span className="font-medium text-yellow-700">{skipped} will be skipped</span></span>
                )}
              </div>
              <ul className="text-xs space-y-0.5 max-h-64 overflow-y-auto">
                {instances.map((inst, idx) => (
                  <li key={idx} className="flex items-center justify-between py-0.5">
                    <span className="text-gray-700">{formatDateTime12(inst.startAt)}</span>
                    <StatusBadge status={inst.status} reason={inst.reason} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {info && <div className="text-sm text-green-700">{info}</div>}
          {actionError && <div className="text-sm text-red-700">{actionError}</div>}

          {request.status === 'pending' && instances && !showDeclineForm && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleConfirm}
                disabled={pending || available === 0}
                className="inline-flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {pending ? 'Booking...' : `Confirm and book ${available}`}
              </button>
              <button
                onClick={() => setShowDeclineForm(true)}
                disabled={pending}
                className="inline-flex items-center gap-1 bg-white text-red-600 border border-red-300 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-50 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Decline
              </button>
            </div>
          )}

          {showDeclineForm && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Decline reason (optional)"
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm"
              />
              <button
                onClick={handleDecline}
                disabled={pending}
                className="bg-red-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Confirm decline
              </button>
              <button
                onClick={() => setShowDeclineForm(false)}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function StatusBadge({ status, reason }: { status: string; reason?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    available: { label: 'Available', cls: 'bg-green-100 text-green-800' },
    full: { label: 'Full', cls: 'bg-yellow-100 text-yellow-800' },
    blackout: { label: 'Blackout', cls: 'bg-red-100 text-red-800' },
    no_availability: { label: 'No availability', cls: 'bg-gray-100 text-gray-700' },
    already_booked: { label: 'Already booked', cls: 'bg-blue-100 text-blue-800' },
    past: { label: 'Past', cls: 'bg-gray-100 text-gray-500' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${s.cls}`} title={reason}>
      {s.label}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}
