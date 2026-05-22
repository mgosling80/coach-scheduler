import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { StudentMobileNav } from '@/components/student-mobile-nav';

export default async function BookIndexPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: approvals } = await supabase
    .from('coach_approvals')
    .select('coach_id, expires_at')
    .eq('student_id', authed.user.id)
    .eq('status', 'approved');

  const now = new Date();
  const validApprovals = (approvals ?? []).filter(
    (a) => a.expires_at === null || new Date(a.expires_at) > now
  );
  const coachIds = validApprovals.map((a) => a.coach_id);

  const { data: coaches } = coachIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', coachIds)
    : { data: [] };

  const { data: coachProfiles } = coachIds.length
    ? await supabase
        .from('coach_profiles')
        .select('user_id, photo_url, bio')
        .in('user_id', coachIds)
    : { data: [] };

  const photoMap = new Map((coachProfiles ?? []).map((c) => [c.user_id, c.photo_url]));
  const bioMap = new Map((coachProfiles ?? []).map((c) => [c.user_id, c.bio]));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
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

      <main className="max-w-4xl mx-auto px-4 py-8 pb-24 md:pb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Book a session</h2>

        {!coaches || coaches.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
            You&apos;re not approved with any coaches yet. Once an admin assigns you to a coach and the coach approves, you&apos;ll be able to book here.
          </div>
        ) : (
          <ul className="space-y-3">
            {coaches.map((c) => (
              <li key={c.id} className="bg-white rounded-lg shadow hover:shadow-md transition">
                <Link href={`/book/${c.id}`} className="flex items-center gap-4 p-4">
                  <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">
                    {photoMap.get(c.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoMap.get(c.id) ?? ''} alt={c.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">?</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">{c.full_name}</div>
                    {bioMap.get(c.id) && (
                      <div className="text-sm text-gray-600 mt-1 line-clamp-2">{bioMap.get(c.id)}</div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <StudentMobileNav />
    </div>
  );
}
