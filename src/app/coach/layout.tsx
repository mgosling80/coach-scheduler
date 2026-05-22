import { requireRole } from '@/lib/auth';
import { Wordmark } from '@/components/wordmark';
import { SidebarNav } from '@/components/sidebar-nav';

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const authed = await requireRole('coach');

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: 'home' as const },
    { href: '/coach/profile', label: 'My profile', icon: 'user' as const },
    { href: '/coach/class-types', label: 'Class types', icon: 'classTypes' as const },
    { href: '/coach/availability', label: 'Availability', icon: 'clock' as const },
    { href: '/coach/blackouts', label: 'Blackouts', icon: 'blackout' as const },
    { href: '/coach/students', label: 'Students', icon: 'users' as const },
    { href: '/coach/schedule', label: 'Schedule', icon: 'calendar' as const },
  ];

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <header
        className="sticky top-0 z-30"
        style={{ background: 'linear-gradient(135deg, #2e5bd4 0%, #3d6ae8 55%, #5b8cf5 100%)' }}
      >
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Wordmark variant="light" />
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/75 hidden sm:inline">{authed.user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="font-semibold text-white/80 hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[210px_1fr] gap-6">
        <SidebarNav items={navItems} />
        <main>{children}</main>
      </div>
    </div>
  );
}
