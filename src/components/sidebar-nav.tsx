'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  User,
  ListChecks,
  Clock,
  CalendarOff,
  Users,
  CalendarDays,
  Repeat,
} from 'lucide-react';

const ICONS = {
  home: Home,
  user: User,
  classTypes: ListChecks,
  clock: Clock,
  blackout: CalendarOff,
  users: Users,
  calendar: CalendarDays,
  repeat: Repeat,
} as const;

export type IconKey = keyof typeof ICONS;

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: IconKey;
};

export function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 p-2 h-fit">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`relative flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg transition ${
                  active
                    ? 'font-semibold text-[var(--navy-900)]'
                    : 'text-[var(--muted)] hover:bg-gray-50 hover:text-[var(--navy-900)]'
                }`}
                style={active ? { background: 'rgba(46,91,212,.10)' } : undefined}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full"
                    style={{ background: 'var(--gold-500)' }}
                  />
                )}
                <Icon className={`w-4 h-4 ${active ? 'text-[var(--blue-600)]' : ''}`} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
