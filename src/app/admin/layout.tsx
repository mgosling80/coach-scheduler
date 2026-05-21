import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { Home, Users, Repeat } from 'lucide-react';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await requireRole('admin');

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/admin/students', label: 'All students', icon: Users },
    { href: '/admin/recurring', label: 'Recurring requests', icon: Repeat },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold text-gray-900">
            Coach Scheduler — Admin
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600 hidden sm:inline">{authed.user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-gray-600 hover:text-gray-900">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        <nav className="bg-white rounded-lg shadow p-3 h-fit">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
