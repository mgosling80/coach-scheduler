#!/usr/bin/env bash
# install-theme-booking-flow.sh
# Theme the booking sub-flow: class-type picker, slots page, slot grid.
# Run from project root: bash install-theme-booking-flow.sh

set -e
if [ ! -f package.json ]; then echo "ERROR: run from project root."; exit 1; fi

python3 - << 'PYEOF'
# Themed gradient header shared by the two server pages
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

# --- Server page: class-type picker ---
path = 'src/app/book/[coachId]/page.tsx'
with open(path) as f:
    c = f.read()
if "import { Wordmark }" not in c:
    c = c.replace(
        "import { ArrowLeft } from 'lucide-react';",
        "import { ArrowLeft } from 'lucide-react';\nimport { Wordmark } from '@/components/wordmark';"
    )
c = c.replace('className="min-h-screen bg-gray-50"', 'className="min-h-screen bg-[var(--cream)]"')
c = c.replace(plain_header, themed_header)
c = c.replace(
    'className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"',
    'className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--navy-900)] mb-4"'
)
c = c.replace(
    '<h2 className="text-xl font-semibold text-gray-900 mb-4">',
    '<h2 className="text-2xl font-extrabold font-display text-[var(--navy-900)] mb-4">'
)
c = c.replace('<div className="text-sm text-gray-500">No active class types.</div>',
              '<div className="text-sm text-[var(--muted)]">No active class types.</div>')
c = c.replace(
    'className="block bg-white rounded-lg shadow hover:shadow-md transition p-4 flex items-center gap-3"',
    'className="block bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition p-4 flex items-center gap-3"'
)
c = c.replace('<div className="font-medium text-gray-900">{ct.name}</div>',
              '<div className="font-bold font-display text-[var(--navy-900)]">{ct.name}</div>')
c = c.replace('<div className="text-xs text-gray-500 mt-0.5">',
              '<div className="text-xs text-[var(--muted)] mt-0.5">')
with open(path, 'w') as f:
    f.write(c)
print("Themed class-type picker")

# --- Server page: slots ---
path = 'src/app/book/[coachId]/[classTypeId]/page.tsx'
with open(path) as f:
    c = f.read()
if "import { Wordmark }" not in c:
    c = c.replace(
        "import { SlotsClient } from './slots-client';",
        "import { SlotsClient } from './slots-client';\nimport { Wordmark } from '@/components/wordmark';"
    )
c = c.replace('className="min-h-screen bg-gray-50"', 'className="min-h-screen bg-[var(--cream)]"')
c = c.replace(plain_header, themed_header)
c = c.replace(
    'className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"',
    'className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--navy-900)] mb-4"'
)
c = c.replace(
    '<h2 className="text-xl font-semibold text-gray-900 mb-1">{classType.name}</h2>',
    '<h2 className="text-2xl font-extrabold font-display text-[var(--navy-900)] mb-1">{classType.name}</h2>'
)
c = c.replace('<p className="text-sm text-gray-600 mb-6">', '<p className="text-sm text-[var(--muted)] mb-6">')
with open(path, 'w') as f:
    f.write(c)
print("Themed slots page")

# --- Slots client (grid + buttons) ---
path = 'src/app/book/[coachId]/[classTypeId]/slots-client.tsx'
with open(path) as f:
    c = f.read()

c = c.replace(
    '<div className="bg-white rounded-lg shadow p-8 text-center text-sm text-gray-500">',
    '<div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-sm text-[var(--muted)]">'
)
c = c.replace('<div key={date} className="bg-white rounded-lg shadow">',
              '<div key={date} className="bg-white rounded-xl shadow-sm border border-gray-100">')
c = c.replace('<div className="p-3 border-b border-gray-200">', '<div className="p-3 border-b border-gray-100">')
c = c.replace('<h3 className="text-sm font-semibold text-gray-900">',
              '<h3 className="text-sm font-bold font-display text-[var(--navy-900)]">')

# Slot button states: available -> blue hover; booked -> blue (brand) instead of green;
# waitlisted -> gold; full -> muted.
c = c.replace(
    "let buttonClass = 'border-gray-300 bg-white hover:bg-blue-50 text-gray-900';",
    "let buttonClass = 'border-gray-300 bg-white hover:border-[var(--blue-500)] hover:bg-[rgba(46,91,212,.06)] text-[var(--navy-900)]';"
)
c = c.replace(
    "    buttonClass = 'border-green-500 bg-green-50 text-green-900';",
    "    buttonClass = 'border-[var(--blue-600)] text-white';"
)
# For booked, also set an inline blue background via style — patch the button to add style when booked.
c = c.replace(
    """      <button
        onClick={handleClick}
        disabled={pending || slot.studentIsBooked || slot.studentIsWaitlisted}
        className={`w-full px-3 py-3 border rounded-md text-sm font-medium transition active:scale-[0.98] ${buttonClass} disabled:opacity-70`}
        title={slot.isFull ? 'Full — booking adds you to the waitlist' : ''}
      >""",
    """      <button
        onClick={handleClick}
        disabled={pending || slot.studentIsBooked || slot.studentIsWaitlisted}
        style={slot.studentIsBooked ? { background: 'var(--blue-600)' } : undefined}
        className={`w-full px-3 py-3 border rounded-lg text-sm font-semibold transition active:scale-[0.98] ${buttonClass} disabled:opacity-70`}
        title={slot.isFull ? 'Full — booking adds you to the waitlist' : ''}
      >"""
)
# Waitlisted -> gold tones
c = c.replace(
    "    buttonClass = 'border-yellow-400 bg-yellow-50 text-yellow-900';",
    "    buttonClass = 'border-[var(--gold-500)] text-[var(--navy-900)]'; "
)
c = c.replace(
    """  } else if (slot.studentIsWaitlisted) {
    buttonClass = 'border-[var(--gold-500)] text-[var(--navy-900)]'; 
    badge = <Clock className="w-3 h-3 inline ml-1" />;""",
    """  } else if (slot.studentIsWaitlisted) {
    buttonClass = 'border-[var(--gold-500)] text-[var(--navy-900)]';
    badge = <Clock className="w-3 h-3 inline ml-1" />;"""
)
# Full -> warm muted
c = c.replace(
    "    buttonClass = 'border-gray-300 bg-gray-50 text-gray-500';",
    "    buttonClass = 'border-gray-200 bg-[#f3f1ec] text-[var(--muted)]';"
)

with open(path, 'w') as f:
    f.write(c)
print("Themed slots client")

print("Done.")
PYEOF

echo ""
echo "Done. Booking sub-flow themed."
echo "Add a gold style to waitlisted buttons manually if needed; run npm run build to verify."