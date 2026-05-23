#!/usr/bin/env bash
# install-signout-cleanup.sh
# Option 1: avatar-only headers; sign-out lives on the account page.
# Run from project root: bash install-signout-cleanup.sh

set -e
if [ ! -f package.json ]; then echo "ERROR: run from project root."; exit 1; fi

python3 - << 'PYEOF'
import os, re

# ---- Student-facing themed pages: replace the avatar+signout cluster with avatar only ----
student_pages = [
    'src/app/dashboard/page.tsx',
    'src/app/my-bookings/page.tsx',
    'src/app/book/page.tsx',
    'src/app/book/[coachId]/page.tsx',
    'src/app/book/[coachId]/[classTypeId]/page.tsx',
    'src/app/preferences/page.tsx',
    'src/app/account/page.tsx',
]

# The cluster we added in the previous script:
cluster = '''          <div className="flex items-center gap-3">
            <HeaderAvatar />
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-sm font-semibold text-white/80 hover:text-white">
                Sign out
              </button>
            </form>
          </div>'''

# Some pages may still have the standalone signout form (avatar not inserted, e.g. dashboard)
standalone_form = '''          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm font-semibold text-white/80 hover:text-white">
              Sign out
            </button>
          </form>'''

avatar_only = '          <HeaderAvatar />'

for path in student_pages:
    if not os.path.exists(path):
        print(f"skip (missing): {path}")
        continue
    with open(path) as f:
        c = f.read()

    # Ensure HeaderAvatar imported
    if "HeaderAvatar" not in c:
        if "import { Wordmark }" in c:
            c = c.replace(
                "import { Wordmark } from '@/components/wordmark';",
                "import { Wordmark } from '@/components/wordmark';\nimport { HeaderAvatar } from '@/components/header-avatar';",
                1
            )
        else:
            c = c.replace("import Link from 'next/link';",
                          "import Link from 'next/link';\nimport { HeaderAvatar } from '@/components/header-avatar';", 1)

    if cluster in c:
        c = c.replace(cluster, avatar_only)
    elif standalone_form in c:
        c = c.replace(standalone_form, avatar_only)
    else:
        print(f"  note: no known signout block matched in {path} (may need manual check)")

    with open(path, 'w') as f:
        f.write(c)
    print(f"Cleaned header: {path}")

# ---- Coach + admin layouts: drop the email + sign-out, keep avatar ----
for path in ['src/app/coach/layout.tsx', 'src/app/admin/layout.tsx']:
    with open(path) as f:
        c = f.read()
    block = '''          <div className="flex items-center gap-4 text-sm">
            <HeaderAvatar />
            <span className="text-white/75 hidden sm:inline">{authed.user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="font-semibold text-white/80 hover:text-white">
                Sign out
              </button>
            </form>
          </div>'''
    replacement = '          <HeaderAvatar />'
    if block in c:
        c = c.replace(block, replacement)
        print(f"Cleaned header: {path}")
    else:
        print(f"  note: header block not matched in {path} (manual check)")
    with open(path, 'w') as f:
        f.write(c)

# ---- Account page: ensure a Sign out control exists ----
path = 'src/app/account/client.tsx'
with open(path) as f:
    c = f.read()

if 'auth/signout' not in c:
    # Add a sign-out section right after the photo section (before Change email),
    # implemented as a plain form posting to /auth/signout.
    anchor = '''      <section>
        <ProfilePhotoUpload initialUrl={photoUrl} />
      </section>'''
    signout_section = anchor + '''

      <section className="flex items-center justify-between rounded-lg border border-gray-100 bg-[#f6f4ef] px-4 py-3">
        <span className="text-sm text-[var(--muted)]">Signed in as {currentEmail}</span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm font-semibold text-[var(--blue-600)] hover:underline">
            Sign out
          </button>
        </form>
      </section>'''
    if anchor in c:
        c = c.replace(anchor, signout_section)
        print("Added sign-out section to account client")
    else:
        print("  note: could not anchor sign-out section in account client (manual add)")
    with open(path, 'w') as f:
        f.write(c)
else:
    print("Account already has a sign-out control")

print("Done.")
PYEOF

echo ""
echo "Done. Headers show avatar only; sign-out is on the Account page."
echo "Run: npm run build"