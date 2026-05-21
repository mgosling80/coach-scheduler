import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft } from 'lucide-react';

export default async function CoachClassTypesPage({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  const { coachId } = await params;
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: approval } = await supabase
    .from('coach_approvals')
    .select('status, expires_at')
    .eq('student_id', authed.user.id)
    .eq('coach_id', coachId)
    .eq('status', 'approved')
    .maybeSingle();

  const isValid =
    approval &&
    (approval.expires_at === null || new Date(approval.expires_at) > new Date());

  if (!isValid) notFound();

  const { data: coach } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', coachId)
    .maybeSingle();

  const { data: classTypes } = await supabase
    .from('class_types')
    .select('id, name, description, duration_minutes, capacity, color')
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .order('name');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold text-gray-900">
            Coach Scheduler
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/book" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to coaches
        </Link>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {coach?.full_name ?? 'Coach'} — choose a class type
        </h2>

        {!classTypes || classTypes.length === 0 ? (
          <div className="text-sm text-gray-500">No active class types.</div>
        ) : (
          <ul className="space-y-2">
            {classTypes.map((ct) => (
              <li key={ct.id}>
                <Link
                  href={`/book/${coachId}/${ct.id}`}
                  className="block bg-white rounded-lg shadow hover:shadow-md transition p-4 flex items-center gap-3"
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ct.color || '#3b82f6' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">{ct.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {ct.duration_minutes} min · {ct.capacity === 1 ? '1:1' : `Group of ${ct.capacity}`}
                      {ct.description && <> · {ct.description}</>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
