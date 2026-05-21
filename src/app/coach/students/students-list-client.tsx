'use client';

import { useState, useTransition } from 'react';
import { approveStudent, declineStudent } from './actions';
import { ChevronDown, ChevronRight, Check, X, UserX } from 'lucide-react';

type Approval = {
  id: string;
  student_id: string;
  status: string;
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
  decline_reason: string | null;
};
type Student = { id: string; full_name: string; email: string; phone: string | null };
type StudentInfo = {
  user_id: string;
  age: number | null;
  gym: string | null;
  level: string | null;
  team: string | null;
  comments: string | null;
};

export function StudentsListClient({
  approvals,
  students,
  studentInfos,
  noShowMap,
}: {
  approvals: Approval[];
  students: Student[];
  studentInfos: StudentInfo[];
  noShowMap: Record<string, number>;
}) {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const infoMap = new Map(studentInfos.map((i) => [i.user_id, i]));

  const groups = {
    pending: approvals.filter((a) => a.status === 'pending'),
    approved: approvals.filter((a) => a.status === 'approved'),
    declined: approvals.filter((a) => a.status === 'declined'),
    expired: approvals.filter((a) => a.status === 'expired'),
  };

  // For Approved, sort by no-show count desc so problem students surface
  groups.approved.sort((a, b) => (noShowMap[b.student_id] ?? 0) - (noShowMap[a.student_id] ?? 0));

  return (
    <div className="space-y-4">
      {(['pending', 'approved', 'declined', 'expired'] as const).map((group) => (
        <div key={group} className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              {group} ({groups[group].length})
            </h2>
          </div>
          {groups[group].length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">None.</div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {groups[group].map((a) => (
                <ApprovalRow
                  key={a.id}
                  approval={a}
                  student={studentMap.get(a.student_id)}
                  info={infoMap.get(a.student_id) ?? null}
                  noShowCount={noShowMap[a.student_id] ?? 0}
                />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ApprovalRow({
  approval,
  student,
  info,
  noShowCount,
}: {
  approval: Approval;
  student: Student | undefined;
  info: StudentInfo | null;
  noShowCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveStudent(approval.id);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  function handleDecline() {
    if (!confirm('Decline this student?')) return;
    setError(null);
    startTransition(async () => {
      const result = await declineStudent(approval.id, declineReason);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  if (!student) return null;

  const noShowBadge = noShowCount > 0 && (
    <span
      className={`text-xs px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 ${
        noShowCount >= 3
          ? 'bg-red-100 text-red-800'
          : noShowCount === 2
          ? 'bg-orange-100 text-orange-800'
          : 'bg-yellow-100 text-yellow-800'
      }`}
      title={`${noShowCount} no-show${noShowCount === 1 ? '' : 's'}`}
    >
      <UserX className="w-3 h-3" />
      {noShowCount}
    </span>
  );

  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">{student.full_name}</span>
              {noShowBadge}
            </div>
            <div className="text-xs text-gray-500">{student.email}</div>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {approval.status === 'approved' && approval.expires_at && (
            <>expires {new Date(approval.expires_at).toLocaleDateString()}</>
          )}
          {approval.status === 'pending' && (
            <>requested {new Date(approval.requested_at).toLocaleDateString()}</>
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-gray-50 border-t border-gray-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm pt-4">
            <Detail label="Phone" value={student.phone} />
            <Detail label="Age" value={info?.age?.toString()} />
            <Detail label="Gym" value={info?.gym} />
            <Detail label="Level" value={info?.level} />
            <Detail label="Team" value={info?.team} />
            <Detail label="No-shows" value={noShowCount > 0 ? String(noShowCount) : '—'} />
          </div>
          {info?.comments && (
            <div className="text-sm">
              <span className="text-gray-500">Comments: </span>
              <span className="text-gray-900">{info.comments}</span>
            </div>
          )}

          {approval.status === 'pending' && (
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleApprove}
                  disabled={pending}
                  className="inline-flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={handleDecline}
                  disabled={pending}
                  className="inline-flex items-center gap-1 bg-white text-red-600 border border-red-300 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Decline
                </button>
                <input
                  type="text"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Decline reason (optional)"
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
          )}

          {approval.status === 'declined' && approval.decline_reason && (
            <div className="text-sm text-gray-600 pt-2 border-t border-gray-200">
              Decline reason: {approval.decline_reason}
            </div>
          )}

          {error && <div className="text-sm text-red-700">{error}</div>}
        </div>
      )}
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="text-gray-900">{value || '—'}</span>
    </div>
  );
}
