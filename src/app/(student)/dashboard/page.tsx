import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ArrowRight, Calendar, Users, ClipboardList } from 'lucide-react';
import { Wordmark } from '@/components/wordmark';
import { HeaderAvatar } from '@/components/header-avatar';

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

  const firstName = (profile?.full_name ?? authed.user.email ?? '').split(' ')[0];

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <header
        className="sticky top-0 z-30"
        style={{ background: 'linear-gradient(135deg, #2e5bd4 0%, #3d6ae8 55%, #5b8cf5 100%)' }}
      >
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Wordmark variant="light" />
          <HeaderAvatar />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        {/* Welcome hero */}
        <div
          className="rounded-2xl p-6 md:p-8 text-white shadow-sm relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #22356a 0%, #2e5bd4 70%, #3d6ae8 100%)' }}
        >
          <div className="relative z-10">
            <h2 className="text-2xl md:text-3xl font-extrabold font-display">
              Welcome{firstName ? `, ${firstName}` : ''}!
            </h2>
            <p className="text-sm text-white/75 mt-1 capitalize">
              {authed.roles.length > 0 ? authed.roles.join(' · ') : 'No roles assigned yet'}
            </p>
          </div>
          <div
            className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full opacity-40"
            style={{ background: 'radial-gradient(circle, var(--gold-500), transparent 70%)' }}
          />
        </div>

        {needsOnboarding && (
          <Link
            href="/onboarding"
            className="block rounded-xl p-4 transition border"
            style={{ background: 'rgba(240,180,41,.12)', borderColor: 'rgba(240,180,41,.4)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-[var(--navy-900)]">Finish your profile</div>
                <div className="text-sm text-[var(--navy-700)] mt-1">
                  Tell us a bit about yourself so coaches can review your account.
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-[var(--gold-600)]" />
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
          <SectionPanel
            title="Coach area"
            items={[
              { href: '/coach/schedule', label: 'Schedule', icon: Calendar },
              { href: '/coach/students', label: 'My students', icon: Users },
            ]}
          />
        )}

        {isAdmin && (
          <SectionPanel
            title="Admin area"
            items={[
              { href: '/admin/students', label: 'All students', icon: Users },
              { href: '/admin/recurring', label: 'Recurring requests', icon: ClipboardList },
            ]}
          />
        )}

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
    <Link
      href={href}
      className="block bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-gray-200 transition group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-4">
          <span
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(46,91,212,.1)' }}
          >
            <Icon className="w-5 h-5 text-[var(--blue-600)]" />
          </span>
          <div>
            <h3 className="text-lg font-bold font-display text-[var(--navy-900)]">{title}</h3>
            <p className="text-sm text-[var(--muted)] mt-0.5">{description}</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[var(--blue-600)] transition" />
      </div>
    </Link>
  );
}

function SectionPanel({
  title,
  items,
}: {
  title: string;
  items: { href: string; label: string; icon: React.ElementType }[];
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-bold font-display text-[var(--navy-900)]">{title}</h3>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition group"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-[var(--blue-600)]" />
                  <span className="text-sm font-semibold text-[var(--navy-900)]">{item.label}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[var(--blue-600)] transition" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

