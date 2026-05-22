import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { Plus, Pencil } from 'lucide-react';

export default async function ClassTypesPage() {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: classTypes } = await supabase
    .from('class_types')
    .select('*')
    .eq('coach_id', authed.user.id)
    .order('is_active', { ascending: false })
    .order('name');

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold font-display text-[var(--navy-900)]">Class types</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            The categories students choose when booking (e.g. Hitting, Pitching, Fielding).
          </p>
        </div>
        <Link
          href="/coach/class-types/new"
          className="inline-flex items-center gap-2 cp-btn-primary px-3 py-2 rounded-lg text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          New class type
        </Link>
      </div>

      {!classTypes || classTypes.length === 0 ? (
        <div className="p-10 text-center text-sm text-[var(--muted)]">
          No class types yet. Create one to start setting availability.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {classTypes.map((ct) => (
            <li key={ct.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ct.color || '#3b82f6' }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--navy-900)]">{ct.name}</span>
                    {!ct.is_active && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {ct.duration_minutes} min · {ct.capacity === 1 ? '1:1' : `Group of ${ct.capacity}`}
                    {ct.description && <span> · {ct.description}</span>}
                  </div>
                </div>
              </div>
              <Link
                href={`/coach/class-types/${ct.id}`}
                className="text-sm font-semibold text-[var(--blue-600)] hover:underline inline-flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
