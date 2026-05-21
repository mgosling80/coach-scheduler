import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ArrowRight, Calendar, Users, Shield, Bell, Settings } from 'lucide-react';

export default async function DashboardPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', authed.user.id)
    .single();

  const isCoach = authed.roles.includes('coach') || authed.roles.includes('super_admin');
  const isAdmin = authed.roles.includes('admin') || authed.roles.includes('super_admin');
  const isStudent = authed.roles.includes('student');

  let needsOnboarding = false;
  if (isStudent) {
    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('user_id')
      .eq('user_id', authed.user.id)
      .maybeSingle();
    needsOnboarding = !studentProfile;
  }

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

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Welcome, {profile?.full_name ?? authed.user.email}
          </h2>
          <p className="text-sm text-gray-600">
            Roles: {authed.roles.length > 0 ? authed.roles.join(', ') : 'none assigned yet'}
          </p>
        </div>

        {needsOnboarding && (
          <Link
            href="/onboarding"
            className="block bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-blue-900">Finish your profile</div>
                <div className="text-sm text-blue-800 mt-1">
                  Tell us a bit about yourself so coaches can review your account.
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-blue-600" />
            </div>
          </Link>
        )}

        {isStudent && !needsOnboarding && (
          <DashCard href="/book" icon={Calendar} title="Book a session" description="See available times with your coaches." />
        )}

        {isStudent && !needsOnboarding && (
          <DashCard href="/my-bookings" icon={Calendar} title="My bookings" description="See upcoming and past sessions." />
        )}

        {isCoach && (
          <DashCard
            href="/coach/profile"
            icon={Users}
            title="Coach area"
            description="Manage your profile, class types, availability, and students."
          />
        )}

        {isAdmin && (
          <DashCard
            href="/admin/students"
            icon={Shield}
            title="Admin area"
            description="Assign students to coaches and manage approvals."
          />
        )}

        <DashCard
          href="/preferences"
          icon={Bell}
          title="Notification preferences"
          description="Choose how and when we contact you."
        />

        <DashCard
          href="/account"
          icon={Settings}
          title="Account"
          description="Change email, password, or delete account."
        />
      </main>
    </div>
  );
}

function DashCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="block bg-white rounded-lg shadow p-6 hover:bg-gray-50 transition group">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 text-gray-700 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600 mt-1">{description}</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-700" />
      </div>
    </Link>
  );
}
