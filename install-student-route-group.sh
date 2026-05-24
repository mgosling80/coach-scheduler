#!/usr/bin/env bash
# install-student-route-group.sh
# Option B: move student pages into a (student) route group with a shared
# layout that renders the bottom nav everywhere. URLs are unchanged.
# Run from project root: bash install-student-route-group.sh

set -e
if [ ! -f package.json ]; then echo "ERROR: run from project root."; exit 1; fi

GROUP="src/app/(student)"

# ============================================================
# 1) Create the route group folder and move student pages in
# ============================================================
echo "Creating $GROUP and moving student pages"
mkdir -p "$GROUP"

move_in() {
  local name="$1"
  if [ -e "src/app/$name" ]; then
    if [ -e "$GROUP/$name" ]; then
      echo "  already moved: $name"
    else
      git mv "src/app/$name" "$GROUP/$name" 2>/dev/null || mv "src/app/$name" "$GROUP/$name"
      echo "  moved: $name"
    fi
  else
    echo "  skip (missing): $name"
  fi
}

move_in account
move_in book
move_in dashboard
move_in my-bookings
move_in preferences

# ============================================================
# 2) Update the bottom nav: add Account, refine active matching
# ============================================================
echo "Updating student-mobile-nav (adds Account)"
cat > src/components/student-mobile-nav.tsx << 'FILE_EOF'
'use client';

import { Home, Calendar, ClipboardList, Bell, User } from 'lucide-react';
import { MobileNav } from './mobile-nav';

export function StudentMobileNav() {
  return (
    <MobileNav
      items={[
        { href: '/dashboard', label: 'Home', icon: Home },
        { href: '/book', label: 'Book', icon: Calendar },
        { href: '/my-bookings', label: 'Bookings', icon: ClipboardList },
        { href: '/preferences', label: 'Settings', icon: Bell },
        { href: '/account', label: 'Account', icon: User },
      ]}
    />
  );
}
FILE_EOF

echo "Refining mobile-nav active state + theme color"
cat > src/components/mobile-nav.tsx << 'FILE_EOF'
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
 * The (student) layout adds bottom padding so content isn't covered.
 */
export function MobileNav({ items }: { items: MobileNavItem[] }) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
      <ul className="flex">
        {items.map((item) => {
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
      </ul>
    </nav>
  );
}
FILE_EOF

# ============================================================
# 3) Create the (student) layout that renders the nav + padding
# ============================================================
echo "Creating $GROUP/layout.tsx"
cat > "$GROUP/layout.tsx" << 'FILE_EOF'
import { StudentMobileNav } from '@/components/student-mobile-nav';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Bottom padding on mobile so fixed nav doesn't cover content */}
      <div className="pb-20 md:pb-0">{children}</div>
      <StudentMobileNav />
    </>
  );
}
FILE_EOF

# ============================================================
# 4) Remove now-duplicate per-page nav mounts (book + my-bookings)
#    They previously rendered StudentMobileNav themselves; the layout
#    now handles it, so strip the per-page usage to avoid double nav.
# ============================================================
echo "Removing per-page nav mounts (now handled by layout)"
python3 - << 'PYEOF'
import os

pages = [
    'src/app/(student)/book/page.tsx',
    'src/app/(student)/my-bookings/page.tsx',
]
for path in pages:
    if not os.path.exists(path):
        print(f"  skip (missing): {path}")
        continue
    with open(path) as f:
        c = f.read()
    before = c
    # Remove import lines for the nav
    c = c.replace("import { StudentMobileNav } from '@/components/student-mobile-nav';\n", "")
    c = c.replace("import { StudentMobileNav } from '../../components/student-mobile-nav';\n", "")
    # Remove the JSX usage (with or without surrounding whitespace)
    c = c.replace("      <StudentMobileNav />\n", "")
    c = c.replace("        <StudentMobileNav />\n", "")
    c = c.replace("<StudentMobileNav />", "")
    if c != before:
        with open(path, 'w') as f:
            f.write(c)
        print(f"  cleaned: {path}")
    else:
        print(f"  no nav mount found (ok): {path}")
PYEOF

echo ""
echo "Done. Student pages now live under (student) with a shared bottom nav."
echo "URLs are unchanged (route groups don't affect paths)."
echo ""
echo "NEXT:"
echo "1. npm run build"
echo "2. Load each student page and confirm the bottom nav shows everywhere,"
echo "   including the booking sub-flow (/book then into a coach)."
echo "3. Confirm no DOUBLE nav on /book or /my-bookings."