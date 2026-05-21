import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ArrowRight } from 'lucide-react';

export default async function DashboardPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', authed.user.id)
    .single();

  const isCoach = authed.roles.includes('coach') || authed.roles.includes('super_admin');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Coach Scheduler</h1>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Welcome, {profile?.full_name ?? authed.user.email}
          </h2>
          <p className="text-sm text-gray-600">
            Roles: {authed.roles.length > 0 ? authed.roles.join(', ') : 'none assigned yet'}
          </p>
        </div>

        {isCoach && (
          <Link
            href="/coach/profile"
            className="block bg-white rounded-lg shadow p-6 hover:bg-gray-50 transition group"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Coach area</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Manage your profile, class types, availability, and bookings.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-700" />
            </div>
          </Link>
        )}

        {authed.roles.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
            No roles assigned yet. Ask an admin to add you.
          </div>
        )}
      </main>
    </div>
  );
}
