#!/usr/bin/env bash
# install-student-list-photos.sh
# Show student avatars in coach Students list + admin All Students list.
# Run from project root: bash install-student-list-photos.sh

set -e
if [ ! -f package.json ]; then echo "ERROR: run from project root."; exit 1; fi

python3 - << 'PYEOF'
# ============================================================
# Coach students: fetch photo_url, pass through, render avatar
# ============================================================
path = 'src/app/coach/students/page.tsx'
with open(path) as f:
    c = f.read()
c = c.replace(
    ".select('id, full_name, email, phone')",
    ".select('id, full_name, email, phone, photo_url')"
)
with open(path, 'w') as f:
    f.write(c)
print("Patched coach students page query")

path = 'src/app/coach/students/students-list-client.tsx'
with open(path) as f:
    c = f.read()
# import Avatar
if "import { Avatar }" not in c:
    c = c.replace(
        "import { ChevronDown, ChevronRight, Check, X, UserX } from 'lucide-react';",
        "import { ChevronDown, ChevronRight, Check, X, UserX } from 'lucide-react';\nimport { Avatar } from '@/components/avatar';"
    )
# extend Student type
c = c.replace(
    "type Student = { id: string; full_name: string; email: string; phone: string | null };",
    "type Student = { id: string; full_name: string; email: string; phone: string | null; photo_url: string | null };"
)
# render avatar in the row header — before the name/email block
c = c.replace(
    '''          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[var(--navy-900)]">{student.full_name}</span>
              {noShowBadge}
            </div>
            <div className="text-xs text-gray-500">{student.email}</div>
          </div>''',
    '''          <Avatar name={student.full_name} photoUrl={student.photo_url} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[var(--navy-900)]">{student.full_name}</span>
              {noShowBadge}
            </div>
            <div className="text-xs text-gray-500">{student.email}</div>
          </div>'''
)
with open(path, 'w') as f:
    f.write(c)
print("Patched coach students list client")

# ============================================================
# Admin students: fetch photo_url, render avatar
# ============================================================
path = 'src/app/admin/students/page.tsx'
with open(path) as f:
    c = f.read()
c = c.replace(
    ".select('id, full_name, email, phone')",
    ".select('id, full_name, email, phone, photo_url')"
)
with open(path, 'w') as f:
    f.write(c)
print("Patched admin students page query")

path = 'src/app/admin/students/students-client.tsx'
with open(path) as f:
    c = f.read()
if "import { Avatar }" not in c:
    c = c.replace(
        "import { ChevronDown, ChevronRight, X } from 'lucide-react';",
        "import { ChevronDown, ChevronRight, X } from 'lucide-react';\nimport { Avatar } from '@/components/avatar';"
    )
c = c.replace(
    "type Student = { id: string; full_name: string; email: string; phone: string | null };",
    "type Student = { id: string; full_name: string; email: string; phone: string | null; photo_url: string | null };"
)
c = c.replace(
    '''          <div className="min-w-0">
            <div className="font-semibold text-[var(--navy-900)]">{student.full_name}</div>
            <div className="text-xs text-gray-500">{student.email}</div>
          </div>''',
    '''          <Avatar name={student.full_name} photoUrl={student.photo_url} size={36} />
          <div className="min-w-0">
            <div className="font-semibold text-[var(--navy-900)]">{student.full_name}</div>
            <div className="text-xs text-gray-500">{student.email}</div>
          </div>'''
)
with open(path, 'w') as f:
    f.write(c)
print("Patched admin students list client")

print("Done.")
PYEOF

echo ""
echo "Done. Student avatars added to coach + admin lists."
echo "Run: npm run build"