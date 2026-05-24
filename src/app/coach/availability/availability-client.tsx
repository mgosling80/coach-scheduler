'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, Megaphone } from 'lucide-react';
import {
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  publishAvailability,
} from './actions';
import { formatTime12 } from '@/lib/format';

type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type Block = {
  id: string;
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
  blocks,
  hasGroupMe,
  lastPublishedAt,
}: {
  blocks: Block[];
  hasGroupMe: boolean;
  lastPublishedAt: string | null;
}) {
  const [showForm, setShowForm] = useState(false);

  const blocksByDay = DAYS.map((day) => ({
    ...day,
    blocks: blocks.filter((b) => b.day_of_week === day.value),
  }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold font-display text-[var(--navy-900)]">Availability</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Your general weekly hours. Students pick a time, length, and lesson type when booking.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 cp-btn-primary px-3 py-2 rounded-lg text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          Add hours
        </button>
      </div>

      {showForm && <NewBlockForm onDone={() => setShowForm(false)} />}

      <PublishBar hasGroupMe={hasGroupMe} lastPublishedAt={lastPublishedAt} />

      <div className="divide-y divide-gray-100">
        {blocksByDay.map((day) => (
          <div key={day.value} className="p-4">
            <h3 className="text-sm font-bold font-display text-[var(--navy-700)] mb-2">{day.label}</h3>
            {day.blocks.length === 0 ? (
              <p className="text-xs text-gray-400">No hours set.</p>
            ) : (
              <ul className="space-y-1">
                {day.blocks.map((block) => (
                  <BlockRow key={block.id} block={block} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PublishBar({
  hasGroupMe,
  lastPublishedAt,
}: {
  hasGroupMe: boolean;
  lastPublishedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(
    'New lesson availability is up! Head to the app to book your spots.'
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<string | null>(lastPublishedAt);

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const result = await publishAvailability(message);
      if (!result.ok) {
        setError(result.error ?? 'Failed.');
      } else {
        setPublished((result as { publishedAt?: string }).publishedAt ?? new Date().toISOString());
        setOpen(false);
      }
    });
  }

  function lastPublishedLabel(iso: string): string {
    const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    return new Date(iso).toLocaleDateString();
  }

  return (
    <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'rgba(240,180,41,.07)' }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-bold font-display text-[var(--navy-900)] flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[var(--gold-600)]" />
            Publish &amp; notify
          </h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            Done editing? Send a GroupMe announcement so families know new times are open.
          </p>
          {published && (
            <p className="text-xs text-[var(--muted)] mt-1">Last published {lastPublishedLabel(published)}.</p>
          )}
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            disabled={!hasGroupMe}
            className="cp-btn-gold px-4 py-2 rounded-lg text-sm disabled:opacity-50 inline-flex items-center gap-2 flex-shrink-0"
            title={hasGroupMe ? '' : 'Add a GroupMe bot ID in your profile first'}
          >
            <Megaphone className="w-4 h-4" />
            Publish &amp; notify
          </button>
        )}
      </div>

      {!hasGroupMe && (
        <p className="text-xs text-red-600 mt-2">
          Add a GroupMe bot ID in your profile to enable announcements.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-2 bg-white rounded-lg border border-gray-200 p-3">
          <label className="block text-sm font-semibold text-[var(--navy-900)]">Announcement message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">{message.length}/500</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setOpen(false)} className="text-sm text-[var(--muted)] hover:text-[var(--navy-900)] px-3 py-1.5">
                Cancel
              </button>
              <button onClick={handlePublish} disabled={pending} className="cp-btn-gold px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">
                {pending ? 'Publishing...' : 'Send to GroupMe'}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

function BlockRow({ block }: { block: Block }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm('Remove these hours?')) return;
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
      <div className="text-sm min-w-0">
        <span className="font-semibold text-[var(--navy-900)]">
          {formatTime12(block.start_time)} – {formatTime12(block.end_time)}
        </span>
        <span className="text-xs text-gray-400 ml-2">({dateRange})</span>
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

function NewBlockForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAvailabilityBlock(formData);
      if (!result.ok) setError(result.error ?? 'Failed.');
      else onDone();
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={handleSubmit} className="p-6 border-b border-gray-100 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Day of week</label>
          <select
            name="day_of_week"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
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
        <div></div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
          <input
            type="time"
            name="start_time"
            required
            defaultValue="16:00"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End time</label>
          <input
            type="time"
            name="end_time"
            required
            defaultValue="19:00"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Effective from</label>
          <input
            type="date"
            name="effective_from"
            required
            defaultValue={today}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Effective until <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="date"
            name="effective_until"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded">{error}</div>}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          {pending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2">
          Cancel
        </button>
      </div>
    </form>
  );
}
