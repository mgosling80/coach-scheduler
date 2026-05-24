import { requireRole } from '@/lib/auth';
import { Wordmark } from '@/components/wordmark';
import { SidebarNav } from '@/components/sidebar-nav';
import { HeaderAvatar } from '@/components/header-avatar';
import { CoachMobileNav } from '@/components/coach-mobile-nav';

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
          <div className="flex items-center gap-2">
            <Wordmark variant="light" />
            <span className="text-xs font-semibold text-white/60 border border-white/30 rounded px-1.5 py-0.5">
              COACH
            </span>
          </div>
          <HeaderAvatar />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[210px_1fr] gap-6 pb-20 md:pb-6">
        <SidebarNav items={navItems} />
        <main>{children}</main>
      </div>

      <CoachMobileNav />
    </div>
  );
}
