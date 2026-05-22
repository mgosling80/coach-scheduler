#!/usr/bin/env bash
# install-theme-prefs-account.sh
# Theme preferences + account pages and the account client.
# Run from project root: bash install-theme-prefs-account.sh

set -e
if [ ! -f package.json ]; then echo "ERROR: run from project root."; exit 1; fi

python3 - << 'PYEOF'
import os

plain_header = '''      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
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
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Wordmark variant="light" />
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm font-semibold text-white/80 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </header>'''

# --- Server pages: preferences + account ---
for path in ['src/app/preferences/page.tsx', 'src/app/account/page.tsx']:
    with open(path) as f:
        c = f.read()
    if "import { Wordmark }" not in c:
        c = c.replace(
            "import Link from 'next/link';",
            "import Link from 'next/link';\nimport { Wordmark } from '@/components/wordmark';",
            1
        )
    c = c.replace('className="min-h-screen bg-gray-50"', 'className="min-h-screen bg-[var(--cream)]"')
    c = c.replace(plain_header, themed_header)
    c = c.replace('<div className="bg-white rounded-lg shadow">',
                  '<div className="bg-white rounded-xl shadow-sm border border-gray-100">')
    c = c.replace('border-b border-gray-200', 'border-b border-gray-100')
    c = c.replace('<h2 className="text-xl font-semibold text-gray-900">',
                  '<h2 className="text-xl font-extrabold font-display text-[var(--navy-900)]">')
    c = c.replace('<p className="text-sm text-gray-600 mt-1">',
                  '<p className="text-sm text-[var(--muted)] mt-1">')
    with open(path, 'w') as f:
        f.write(c)
    print(f"Themed {path}")

# --- Account client ---
path = 'src/app/account/client.tsx'
with open(path) as f:
    c = f.read()
# Section headers -> display
c = c.replace('<h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">',
              '<h3 className="text-sm font-bold font-display text-[var(--navy-900)] uppercase tracking-wide mb-3">')
# Danger zone header keep red but display font
c = c.replace('<h3 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-3">',
              '<h3 className="text-sm font-bold font-display text-red-700 uppercase tracking-wide mb-3">')
# Labels
c = c.replace('<label className="block text-sm font-medium text-gray-700 mb-1">',
              '<label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">')
# Inputs -> rounded + gold focus ring
c = c.replace('className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-100 text-gray-500"',
              'className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-100 text-[var(--muted)]"')
c = c.replace('className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"',
              'className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"')
# Primary buttons -> themed
c = c.replace('className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"',
              'className="cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"')
# Helper text
c = c.replace('<p className="mt-1 text-xs text-gray-500">', '<p className="mt-1 text-xs text-[var(--muted)]">')
c = c.replace('<p className="mt-2 text-xs text-gray-500">', '<p className="mt-2 text-xs text-[var(--muted)]">')
# Danger zone divider
c = c.replace('<section className="pt-6 border-t border-gray-200">', '<section className="pt-6 border-t border-gray-100">')
with open(path, 'w') as f:
    f.write(c)
print(f"Themed {path}")

# --- Preferences form (if it has the standard patterns) ---
path = 'src/app/preferences/preferences-form.tsx'
if os.path.exists(path):
    with open(path) as f:
        c = f.read()
    c = c.replace('<label className="block text-sm font-medium text-gray-700 mb-1">',
                  '<label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">')
    c = c.replace('rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                  'rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]')
    c = c.replace('className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"',
                  'className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"')
    c = c.replace('bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50',
                  'cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50')
    c = c.replace('<p className="mt-1 text-xs text-gray-500">', '<p className="mt-1 text-xs text-[var(--muted)]">')
    with open(path, 'w') as f:
        f.write(c)
    print(f"Themed {path}")
else:
    print("preferences-form.tsx not found at expected path — skipped")

print("Done.")
PYEOF

echo ""
echo "Done. Preferences + account themed. Run: npm run build"