'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Calendar,
  Users,
  Clock,
  Menu,
  User,
  Layers,
  CalendarOff,
  UserCog,
  LogOut,
  X,
} from 'lucide-react';

type Item = { href: string; label: string; icon: React.ElementType };

const PRIMARY: Item[] = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/coach/schedule', label: 'Schedule', icon: Calendar },
  { href: '/coach/students', label: 'Students', icon: Users },
  { href: '/coach/availability', label: 'Hours', icon: Clock },
];

const MORE: Item[] = [
  { href: '/coach/profile', label: 'My profile', icon: User },
  { href: '/coach/class-types', label: 'Class types', icon: Layers },
  { href: '/coach/blackouts', label: 'Blackouts', icon: CalendarOff },
  { href: '/account', label: 'Account', icon: UserCog },
];

export function CoachMobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(href + '/');
  }

  const moreActive = MORE.some((m) => isActive(m.href));

  return (
    <>
      {moreOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/30"
            onClick={() => setMoreOpen(false)}
          />
          <div className="md:hidden fixed bottom-[60px] inset-x-0 z-50 px-3 pb-2">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-bold font-display text-[var(--navy-900)]">More</span>
                <button onClick={() => setMoreOpen(false)} className="text-gray-400 hover:text-gray-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ul>
                {MORE.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 text-sm border-b border-gray-50 ${
                          active ? 'text-[var(--blue-600)] font-semibold' : 'text-[var(--navy-900)]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <form action="/auth/signout" method="post">
                    <button
                      type="submit"
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </form>
                </li>
              </ul>
            </div>
          </div>
        </>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <ul className="flex">
          {PRIMARY.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
                    active ? 'text-[var(--blue-600)] font-semibold' : 'text-gray-500'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`w-full flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
                moreActive || moreOpen ? 'text-[var(--blue-600)] font-semibold' : 'text-gray-500'
              }`}
            >
              <Menu className="w-5 h-5" />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
