'use client';

import { useState, useTransition } from 'react';
import { requestRecurring } from './actions';

type Coach = { id: string; full_name: string };
type ClassType = { id: string; coach_id: string; name: string; duration_minutes: number };

export function RecurringRequestForm({
  coaches,
  classTypes,
}: {
  coaches: Coach[];
  classTypes: ClassType[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCoach, setSelectedCoach] = useState(coaches[0]?.id ?? '');

  const filteredClassTypes = classTypes.filter((ct) => ct.coach_id === selectedCoach);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await requestRecurring(formData);
      if (result && !result.ok) setError(result.error ?? 'Failed.');
    });
  }

  return (
    <form action={handleSubmit} className="p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Coach</label>
        <select
          name="coach_id"
          required
          value={selectedCoach}
          onChange={(e) => setSelectedCoach(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Class type</label>
        <select
          name="class_type_id"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          {filteredClassTypes.length === 0 ? (
            <option value="">No active class types</option>
          ) : (
            filteredClassTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.name} ({ct.duration_minutes} min)
              </option>
            ))
          )}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Day of week</label>
          <select
            name="day_of_week"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="mon">Monday</option>
            <option value="tue">Tuesday</option>
            <option value="wed">Wednesday</option>
            <option value="thu">Thursday</option>
            <option value="fri">Friday</option>
            <option value="sat">Saturday</option>
            <option value="sun">Sunday</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
          <input
            type="time"
            name="start_time"
            required
            defaultValue="16:00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">How many weeks?</label>
        <input
          type="number"
          name="horizon_weeks"
          min="1"
          max="52"
          defaultValue="8"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">Up to 52 weeks. Default is 8.</p>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded">{error}</div>}

      <button
        type="submit"
        disabled={pending || filteredClassTypes.length === 0}
        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Submitting...' : 'Submit request'}
      </button>
    </form>
  );
}
