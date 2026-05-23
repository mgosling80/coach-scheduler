import { requireRole } from '@/lib/auth';
import { Wordmark } from '@/components/wordmark';
import { SidebarNav } from '@/components/sidebar-nav';
import { HeaderAvatar } from '@/components/header-avatar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = await requireRole('admin');

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: 'home' as const },
    { href: '/admin/students', label: 'All students', icon: 'users' as const },
    { href: '/admin/recurring', label: 'Recurring requests', icon: 'repeat' as const },
  ];

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <header
        className="sticky top-0 z-30"
        style={{ background: 'linear-gradient(135deg, #2e5bd4 0%, #3d6ae8 55%, #5b8cf5 100%)' }}
      >
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wordmark variant="light" />
            <span className="text-xs font-semibold text-white/60 border border-white/30 rounded px-1.5 py-0.5">
              ADMIN
            </span>
          </div>
          <HeaderAvatar />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[210px_1fr] gap-6">
        <SidebarNav items={navItems} />
        <main>{children}</main>
      </div>
    </div>
  );
}
