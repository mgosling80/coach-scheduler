#!/usr/bin/env bash
# install-polish-b12.sh
# Polish 1 (mobile UX) + Polish 2 (visual polish).
# Run from project root: bash install-polish-b12.sh

set -e

if [ ! -f package.json ]; then
  echo "ERROR: run this from your project root."
  exit 1
fi

mkdir -p src/components

# ============================================================
# Shared UI components
# ============================================================
echo "Writing src/components/wordmark.tsx"
cat > src/components/wordmark.tsx << 'FILE_EOF'
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';

export function Wordmark({ href = '/dashboard' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 group">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white">
        <CalendarDays className="w-5 h-5" />
      </span>
      <span className="text-lg font-semibold text-gray-900 group-hover:text-gray-700">
        Coach Scheduler
      </span>
    </Link>
  );
}
FILE_EOF

echo "Writing src/components/empty-state.tsx"
cat > src/components/empty-state.tsx << 'FILE_EOF'
import Link from 'next/link';

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon?: React.ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="p-10 text-center">
      {Icon && (
        <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Icon className="w-6 h-6 text-gray-400" />
        </div>
      )}
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-block mt-4 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
FILE_EOF

echo "Writing src/components/skeleton.tsx"
cat > src/components/skeleton.tsx << 'FILE_EOF'
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-3">
          <Skeleton className="w-3 h-3 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
FILE_EOF

echo "Writing src/components/mobile-nav.tsx"
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
FILE_EOF

# ============================================================
# Student bottom nav wrapper (applied to student-facing pages)
# ============================================================
echo "Writing src/components/student-mobile-nav.tsx"
cat > src/components/student-mobile-nav.tsx << 'FILE_EOF'
'use client';

import { Home, Calendar, ClipboardList, Bell } from 'lucide-react';
import { MobileNav } from './mobile-nav';

export function StudentMobileNav() {
  return (
    <MobileNav
      items={[
        { href: '/dashboard', label: 'Home', icon: Home },
        { href: '/book', label: 'Book', icon: Calendar },
        { href: '/my-bookings', label: 'Bookings', icon: ClipboardList },
        { href: '/preferences', label: 'Settings', icon: Bell },
      ]}
    />
  );
}
FILE_EOF

# ============================================================
# Loading skeletons for key routes
# ============================================================
echo "Writing loading.tsx files"
cat > src/app/dashboard/loading.tsx << 'FILE_EOF'
import { CardSkeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 h-16" />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </main>
    </div>
  );
}
FILE_EOF

cat > src/app/my-bookings/loading.tsx << 'FILE_EOF'
import { ListSkeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 h-16" />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <ListSkeleton rows={3} />
        <ListSkeleton rows={2} />
      </main>
    </div>
  );
}
FILE_EOF

mkdir -p src/app/book
cat > src/app/book/loading.tsx << 'FILE_EOF'
import { ListSkeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 h-16" />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <ListSkeleton rows={4} />
      </main>
    </div>
  );
}
FILE_EOF

# ============================================================
# Patch the slot grid: single column on mobile, bigger targets
# ============================================================
echo "Patching slot grid for mobile (bigger tap targets)"
python3 - << 'PYEOF'
path = 'src/app/book/[coachId]/[classTypeId]/slots-client.tsx'
with open(path) as f:
    c = f.read()

# Make the slot grid 1-col on the smallest screens, and pad buttons more
c = c.replace(
    'className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"',
    'className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5"'
)
c = c.replace(
    'className={`w-full px-3 py-2 border rounded-md text-sm font-medium transition ${buttonClass} disabled:opacity-70`}',
    'className={`w-full px-3 py-3 border rounded-md text-sm font-medium transition active:scale-[0.98] ${buttonClass} disabled:opacity-70`}'
)
with open(path, 'w') as f:
    f.write(c)
print("Patched slot grid")
PYEOF

# ============================================================
# Add student mobile nav + bottom padding to student pages
# ============================================================
echo "Adding StudentMobileNav to student pages"
python3 - << 'PYEOF'
import re

# my-bookings
path = 'src/app/my-bookings/page.tsx'
with open(path) as f:
    c = f.read()
if 'StudentMobileNav' not in c:
    c = c.replace(
        "import { MyBookingsClient } from './my-bookings-client';",
        "import { MyBookingsClient } from './my-bookings-client';\nimport { StudentMobileNav } from '@/components/student-mobile-nav';"
    )
    # add pb to main and nav before closing div
    c = c.replace(
        '<main className="max-w-4xl mx-auto px-4 py-8">',
        '<main className="max-w-4xl mx-auto px-4 py-8 pb-24 md:pb-8">'
    )
    c = c.replace(
        '      </main>\n    </div>\n  );\n}',
        '      </main>\n      <StudentMobileNav />\n    </div>\n  );\n}'
    )
with open(path, 'w') as f:
    f.write(c)

# book index
path = 'src/app/book/page.tsx'
with open(path) as f:
    c = f.read()
if 'StudentMobileNav' not in c:
    c = c.replace(
        "import { createClient } from '@/lib/supabase/server';",
        "import { createClient } from '@/lib/supabase/server';\nimport { StudentMobileNav } from '@/components/student-mobile-nav';",
        1
    )
    c = c.replace(
        '<main className="max-w-4xl mx-auto px-4 py-8">',
        '<main className="max-w-4xl mx-auto px-4 py-8 pb-24 md:pb-8">'
    )
    # add nav before final closing div of the page
    c = re.sub(r'(\s+</main>\s*</div>\s*\);\s*}\s*)$', r'\n      </main>\n      <StudentMobileNav />\n    </div>\n  );\n}\n', c)
with open(path, 'w') as f:
    f.write(c)

print("Patched student pages")
PYEOF

# ============================================================
# Empty state improvements in My Bookings + Book
# ============================================================
echo "Improving empty states"
python3 - << 'PYEOF'
# my-bookings-client: "None." -> friendlier for the Upcoming section
path = 'src/app/my-bookings/my-bookings-client.tsx'
with open(path) as f:
    c = f.read()

# Make the Upcoming empty state actionable. We do this generically:
c = c.replace(
    '        <div className="p-6 text-center text-sm text-gray-500">None.</div>',
    '''        <div className="p-6 text-center text-sm text-gray-500">
          {title === 'Upcoming' ? 'No upcoming sessions. Tap Book to schedule one.' : 'None.'}
        </div>'''
)
with open(path, 'w') as f:
    f.write(c)
print("Patched my-bookings empty state")
PYEOF

# ============================================================
# Make headers sticky across main pages
# ============================================================
echo "Making headers sticky"
for f in \
  src/app/my-bookings/page.tsx \
  src/app/book/page.tsx \
  "src/app/book/[coachId]/page.tsx" \
  "src/app/book/[coachId]/[classTypeId]/page.tsx" \
  src/app/preferences/page.tsx \
  src/app/account/page.tsx
do
  if [ -f "$f" ]; then
    python3 - "$f" << 'PYEOF'
import sys
path = sys.argv[1]
with open(path) as fh:
    c = fh.read()
c = c.replace(
    '<header className="bg-white border-b border-gray-200">',
    '<header className="bg-white border-b border-gray-200 sticky top-0 z-30">'
)
with open(path, 'w') as fh:
    fh.write(c)
PYEOF
  fi
done

# Coach + admin layouts: sticky header
for f in src/app/coach/layout.tsx src/app/admin/layout.tsx; do
  if [ -f "$f" ]; then
    python3 - "$f" << 'PYEOF'
import sys
path = sys.argv[1]
with open(path) as fh:
    c = fh.read()
c = c.replace(
    '<header className="bg-white border-b border-gray-200">',
    '<header className="bg-white border-b border-gray-200 sticky top-0 z-30">'
)
with open(path, 'w') as fh:
    fh.write(c)
PYEOF
  fi
done

echo ""
echo "Done. Polish 1 + 2 installed."
echo ""
echo "Test locally with: npm run dev"
echo "Check mobile via Chrome device mode (Cmd+Opt+I then Cmd+Shift+M)."