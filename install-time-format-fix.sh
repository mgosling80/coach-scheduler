#!/usr/bin/env bash
# install-time-format-fix.sh
# Adds a time formatting helper and updates displays to use AM/PM.
# Run from project root: bash install-time-format-fix.sh

set -e

if [ ! -f package.json ]; then
  echo "ERROR: run this from your project root."
  exit 1
fi

echo "Writing src/lib/format.ts"
cat > src/lib/format.ts << 'FILE_EOF'
/**
 * Convert a "HH:MM" or "HH:MM:SS" string to 12-hour "h:MM AM/PM".
 * e.g. "16:00" -> "4:00 PM", "07:30:00" -> "7:30 AM"
 */
export function formatTime12(time: string | null | undefined): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format an ISO datetime as "Tue, Jan 14, 4:00 PM".
 */
export function formatDateTime12(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
FILE_EOF

echo "Updating src/app/coach/availability/availability-client.tsx"
# Replace the time display lines with the formatter
# We'll do this by rewriting the file (safer than sed)
cat > src/app/coach/availability/availability-client.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createAvailabilityBlock, deleteAvailabilityBlock } from './actions';
import { formatTime12 } from '@/lib/format';

type ClassType = {
  id: string;
  name: string;
  color: string | null;
  duration_minutes: number;
};

type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type Block = {
  id: string;
  class_type_id: string;
  day_of_week: Day;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_until: string | null;
};

const DAYS: { value: Day; label: string }[] = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
];

export function AvailabilityClient({
  classTypes,
  blocks,
}: {
  classTypes: ClassType[];
  blocks: Block[];
}) {
  const [showForm, setShowForm] = useState(false);

  if (classTypes.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Availability</h2>
        <p className="text-sm text-gray-600">
          Create at least one active class type first, then come back here to set when you&apos;re available.
        </p>
      </div>
    );
  }

  const blocksByDay = DAYS.map((day) => ({
    ...day,
    blocks: blocks.filter((b) => b.day_of_week === day.value),
  }));

  const classTypeMap = new Map(classTypes.map((ct) => [ct.id, ct]));

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Availability</h2>
          <p className="text-sm text-gray-600 mt-1">
            Recurring weekly time windows. Students can only book within these.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add block
        </button>
      </div>

      {showForm && <NewBlockForm classTypes={classTypes} onDone={() => setShowForm(false)} />}

      <div className="divide-y divide-gray-200">
        {blocksByDay.map((day) => (
          <div key={day.value} className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{day.label}</h3>
            {day.blocks.length === 0 ? (
              <p className="text-xs text-gray-400">No availability.</p>
            ) : (
              <ul className="space-y-1">
                {day.blocks.map((block) => (
                  <BlockRow
                    key={block.id}
                    block={block}
                    classType={classTypeMap.get(block.class_type_id)}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockRow({ block, classType }: { block: Block; classType: ClassType | undefined }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm('Remove this availability block?')) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAvailabilityBlock(block.id);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  const dateRange = block.effective_until
    ? `${block.effective_from} → ${block.effective_until}`
    : `from ${block.effective_from}`;

  return (
    <li className="flex items-center justify-between py-2 px-2 hover:bg-gray-50 rounded">
      <div className="flex items-center gap-3 min-w-0">
        {classType && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: classType.color || '#3b82f6' }}
          />
        )}
        <div className="text-sm min-w-0">
          <span className="font-medium text-gray-900">
            {formatTime12(block.start_time)} – {formatTime12(block.end_time)}
          </span>
          <span className="text-gray-500"> · {classType?.name ?? 'Unknown class type'}</span>
          <span className="text-xs text-gray-400 ml-2">({dateRange})</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button
          onClick={handleDelete}
          disabled={pending}
          className="text-gray-400 hover:text-red-600 p-1 disabled:opacity-50"
          title="Remove"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}

function NewBlockForm({
  classTypes,
  onDone,
}: {
  classTypes: ClassType[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAvailabilityBlock(formData);
      if (!result.ok) {
        setError(result.error ?? 'Failed.');
      } else {
        onDone();
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={handleSubmit} className="p-6 bg-gray-50 border-b border-gray-200 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Class type</label>
          <select
            name="class_type_id"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select...</option>
            {classTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.name} ({ct.duration_minutes} min)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Day of week</label>
          <select
            name="day_of_week"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End time</label>
          <input
            type="time"
            name="end_time"
            required
            defaultValue="19:00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Effective from</label>
          <input
            type="date"
            name="effective_from"
            required
            defaultValue={today}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Effective until <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="date"
            name="effective_until"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
FILE_EOF

echo ""
echo "Done. Times in availability list now display as AM/PM."
echo ""
echo "Note: the time pickers themselves (when you're entering times) follow your"
echo "device's locale. On US devices they should show AM/PM automatically."