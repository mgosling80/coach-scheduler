#!/usr/bin/env bash
# install-theme-student.sh
# Apply CheerPro theme to my-bookings + book pages.
# Run from project root: bash install-theme-student.sh

set -e

if [ ! -f package.json ]; then
  echo "ERROR: run this from your project root."
  exit 1
fi

python3 - << 'PYEOF'
import re

# The shared plain header markup to replace with the themed gradient header.
plain_header = '''      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold text-gray-900">
            Coach Scheduler
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
              Sign out
            </button>
          </form>
        </div>
      </header>'''

themed_header = '''      <header
        className="sticky top-0 z-30"
        style={{ background: 'linear-gradient(135deg, #2e5bd4 0%, #3d6ae8 55%, #5b8cf5 100%)' }}
      >
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Wordmark variant="light" />
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm font-semibold text-white/80 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </header>'''

files = ['src/app/my-bookings/page.tsx', 'src/app/book/page.tsx']

for path in files:
    with open(path) as f:
        c = f.read()

    # Add Wordmark import if missing
    if "import { Wordmark }" not in c:
        # insert after the StudentMobileNav import (present in both)
        c = c.replace(
            "import { StudentMobileNav } from '@/components/student-mobile-nav';",
            "import { StudentMobileNav } from '@/components/student-mobile-nav';\nimport { Wordmark } from '@/components/wordmark';"
        )

    # Swap background
    c = c.replace('className="min-h-screen bg-gray-50"', 'className="min-h-screen bg-[var(--cream)]"')

    # Swap header
    c = c.replace(plain_header, themed_header)

    with open(path, 'w') as f:
        f.write(c)
    print(f"Themed header + bg: {path}")

# --- my-bookings: theme the title row + recurring link ---
path = 'src/app/my-bookings/page.tsx'
with open(path) as f:
    c = f.read()
c = c.replace(
    '<h2 className="text-xl font-semibold text-gray-900">My bookings</h2>',
    '<h2 className="text-2xl font-extrabold font-display text-[var(--navy-900)]">My bookings</h2>'
)
c = c.replace(
    '<Link href="/request-recurring" className="text-sm text-blue-600 hover:text-blue-700">',
    '<Link href="/request-recurring" className="text-sm font-semibold text-[var(--blue-600)] hover:underline">'
)
with open(path, 'w') as f:
    f.write(c)
print("Themed my-bookings title row")

# --- book: theme the title, empty state, and coach cards ---
path = 'src/app/book/page.tsx'
with open(path) as f:
    c = f.read()

c = c.replace(
    '<h2 className="text-xl font-semibold text-gray-900 mb-4">Book a session</h2>',
    '<h2 className="text-2xl font-extrabold font-display text-[var(--navy-900)] mb-4">Book a session</h2>'
)

# Coach card: themed
c = c.replace(
    '<li key={c.id} className="bg-white rounded-lg shadow hover:shadow-md transition">',
    '<li key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition">'
)
c = c.replace(
    '<div className="font-medium text-gray-900">{c.full_name}</div>',
    '<div className="font-bold font-display text-[var(--navy-900)]">{c.full_name}</div>'
)
c = c.replace(
    '<div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">',
    '<div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0" style={{ background: \'rgba(46,91,212,.08)\' }}>'
)

with open(path, 'w') as f:
    f.write(c)
print("Themed book page")

print("Done.")
PYEOF

echo ""
echo "Done. my-bookings + book themed."