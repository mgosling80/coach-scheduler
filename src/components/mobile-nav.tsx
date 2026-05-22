'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type MobileNavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

/**
 * Fixed bottom navigation bar, shown only on mobile (hidden md+).
 * Add bottom padding to page content so it isn't covered.
 */
export function MobileNav({ items }: { items: MobileNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
      <ul className="flex">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
                  active ? 'text-blue-600' : 'text-gray-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
