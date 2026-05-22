'use client';

import { useState, useTransition } from 'react';
import { assignStudentToCoach, removeAssignment } from './actions';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

type Student = { id: string; full_name: string; email: string; phone: string | null };
type StudentInfo = { user_id: string; age: number | null; gym: string | null; level: string | null; team: string | null; comments: string | null };
type Coach = { id: string; full_name: string; email: string };
type Approval = { id: string; student_id: string; coach_id: string; status: string; expires_at: string | null };

export function StudentsClient({
  students,
  studentInfos,
  coaches,
  approvals,
}: {
  students: Student[];
  studentInfos: StudentInfo[];
  coaches: Coach[];
  approvals: Approval[];
}) {
  const infoMap = new Map(studentInfos.map((i) => [i.user_id, i]));
  const coachMap = new Map(coaches.map((c) => [c.id, c]));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-xl font-extrabold font-display text-[var(--navy-900)]">All students</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Assign students to coaches. Coaches then approve or decline them.
        </p>
      </div>
      {students.length === 0 ? (
        <div className="p-10 text-center text-sm text-[var(--muted)]">No students yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {students.map((s) => (
            <StudentRow
              key={s.id}
              student={s}
              info={infoMap.get(s.id) ?? null}
              coaches={coaches}
              approvals={approvals.filter((a) => a.student_id === s.id)}
              coachMap={coachMap}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function StudentRow({
  student,
  info,
  coaches,
  approvals,
  coachMap,
}: {
  student: Student;
  info: StudentInfo | null;
  coaches: Coach[];
  approvals: Approval[];
  coachMap: Map<string, Coach>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCoach, setSelectedCoach] = useState('');

  function handleAssign() {
    if (!selectedCoach) return;
    setError(null);
    startTransition(async () => {
      const result = await assignStudentToCoach(student.id, selectedCoach);
      if (!result.ok) setError(result.error ?? 'Failed.');
      else setSelectedCoach('');
    });
  }

  function handleRemove(approvalId: string) {
    if (!confirm('Remove this assignment?')) return;
    setError(null);
    startTransition(async () => {
      const result = await removeAssignment(approvalId);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  const assignedCoachIds = new Set(approvals.map((a) => a.coach_id));
  const availableCoaches = coaches.filter((c) => !assignedCoachIds.has(c.id));

  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <div className="min-w-0">
            <div className="font-semibold text-[var(--navy-900)]">{student.full_name}</div>
            <div className="text-xs text-gray-500">{student.email}</div>
          </div>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-1">
          {approvals.length === 0 ? 'No coaches' : `${approvals.length} coach${approvals.length === 1 ? '' : 'es'}`}
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
          </div>
          {info?.comments && (
            <div className="text-sm">
              <span className="text-gray-500">Comments: </span>
              <span className="text-gray-900">{info.comments}</span>
            </div>
          )}

          <div>
            <h4 className="text-sm font-bold font-display text-[var(--navy-700)] mb-2">Coach assignments</h4>
            {approvals.length === 0 ? (
              <p className="text-xs text-gray-400 mb-2">No coaches assigned.</p>
            ) : (
              <ul className="space-y-1 mb-2">
                {approvals.map((a) => {
                  const c = coachMap.get(a.coach_id);
                  return (
                    <li key={a.id} className="flex items-center justify-between bg-white px-3 py-2 rounded border border-gray-200 text-sm">
                      <div>
                        <span className="font-medium">{c?.full_name ?? 'Unknown'}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {a.status}
                          {a.expires_at && a.status === 'approved' && (
                            <> · expires {new Date(a.expires_at).toLocaleDateString()}</>
                          )}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemove(a.id)}
                        disabled={pending}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {availableCoaches.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedCoach}
                  onChange={(e) => setSelectedCoach(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm flex-1"
                >
                  <option value="">Assign a coach...</option>
                  {availableCoaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAssign}
                  disabled={!selectedCoach || pending}
                  className="cp-btn-primary px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  Assign
                </button>
              </div>
            )}
          </div>

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
