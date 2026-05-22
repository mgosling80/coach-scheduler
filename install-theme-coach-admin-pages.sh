#!/usr/bin/env bash
# install-theme-coach-admin-pages.sh
# Bundled theme pass across remaining coach + admin page contents.
# Run from project root: bash install-theme-coach-admin-pages.sh

set -e
if [ ! -f package.json ]; then echo "ERROR: run from project root."; exit 1; fi

python3 - << 'PYEOF'
import re

files = [
    'src/app/coach/profile/page.tsx',
    'src/app/coach/class-types/class-type-form.tsx',
    'src/app/coach/class-types/page.tsx',
    'src/app/coach/availability/availability-client.tsx',
    'src/app/coach/blackouts/blackouts-client.tsx',
    'src/app/coach/students/students-list-client.tsx',
    'src/app/admin/students/students-client.tsx',
    'src/app/admin/recurring/client.tsx',
]

# Ordered list of (old, new) generic swaps applied to every file.
swaps = [
    # Cards
    ('bg-white rounded-lg shadow', 'bg-white rounded-xl shadow-sm border border-gray-100'),
    # Soft borders / dividers
    ('border-b border-gray-200', 'border-b border-gray-100'),
    ('divide-y divide-gray-200', 'divide-y divide-gray-100'),
    # Page title headings (xl)
    ('<h2 className="text-xl font-semibold text-gray-900">',
     '<h2 className="text-xl font-extrabold font-display text-[var(--navy-900)]">'),
    # Uppercase section headers (sm)
    ('<h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">',
     '<h2 className="text-sm font-bold font-display text-[var(--navy-900)] uppercase tracking-wide">'),
    # Sub-section h3/h4
    ('<h3 className="text-sm font-semibold text-gray-700 mb-2">',
     '<h3 className="text-sm font-bold font-display text-[var(--navy-700)] mb-2">'),
    ('<h4 className="text-sm font-medium text-gray-700 mb-2">',
     '<h4 className="text-sm font-bold font-display text-[var(--navy-700)] mb-2">'),
    # Helper paragraph text under titles
    ('<p className="text-sm text-gray-600 mt-1">',
     '<p className="text-sm text-[var(--muted)] mt-1">'),
    # Primary blue buttons -> themed blue (keep as solid brand blue)
    ('bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50',
     'cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50'),
    ('bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700',
     'cp-btn-primary px-3 py-2 rounded-lg text-sm font-semibold'),
    ('bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50',
     'cp-btn-primary px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50'),
    # Inline "Edit" link blue
    ('text-sm text-blue-600 hover:text-blue-700 inline-flex items-center gap-1',
     'text-sm font-semibold text-[var(--blue-600)] hover:underline inline-flex items-center gap-1'),
    # Empty-state text
    ('text-center text-sm text-gray-500', 'text-center text-sm text-[var(--muted)]'),
    # Detail panel backgrounds
    ('px-4 pb-4 bg-gray-50 border-t border-gray-100',
     'px-4 pb-4 border-t border-gray-100'),
    # Form section backgrounds (gray-50 forms)
    ('p-6 bg-gray-50 border-b border-gray-100', 'p-6 border-b border-gray-100'),
    # Inputs rounding + focus ring color
    ('rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
     'rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]'),
    # Name labels in rows
    ('<span className="font-medium text-gray-900">', '<span className="font-semibold text-[var(--navy-900)]">'),
    ('<div className="font-medium text-gray-900">', '<div className="font-semibold text-[var(--navy-900)]">'),
]

for path in files:
    with open(path) as f:
        c = f.read()
    for old, new in swaps:
        c = c.replace(old, new)
    with open(path, 'w') as f:
        f.write(c)
    print(f"Themed {path}")

# --- Detail panel inline bg (warm) for the three expandable lists ---
for path in ['src/app/coach/students/students-list-client.tsx',
             'src/app/admin/students/students-client.tsx',
             'src/app/admin/recurring/client.tsx']:
    with open(path) as f:
        c = f.read()
    c = c.replace(
        'px-4 pb-4 border-t border-gray-100 space-y-4">',
        'px-4 pb-4 border-t border-gray-100 space-y-4" style={{ background: \'#f6f4ef\' }}>'
    )
    c = c.replace(
        'px-4 pb-4 border-t border-gray-100 space-y-3">',
        'px-4 pb-4 border-t border-gray-100 space-y-3" style={{ background: \'#f6f4ef\' }}>'
    )
    with open(path, 'w') as f:
        f.write(c)
    print(f"Warm detail panel: {path}")

print("Done.")
PYEOF

echo ""
echo "Done. Coach + admin page contents themed."
echo "Run a local build to be safe: npm run build"