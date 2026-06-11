#!/usr/bin/env bash
# install-streamline-dashboard.sh
# Streamline the dashboard to 1-2 high-value actions per role.
# Coach panel: Schedule, My students. Admin panel: All students, Recurring requests.
# Removes Notification preferences and Account from dashboard (reachable via nav).
# Run from project root: bash install-streamline-dashboard.sh

set -e
if [ ! -f package.json ]; then echo "ERROR: run from project root."; exit 1; fi

python3 - << 'PYEOF'
path = 'src/app/(student)/dashboard/page.tsx'
with open(path) as f:
    c = f.read()

# 1) Slim icon imports — keep only what's used now
c = c.replace(
    "import { ArrowRight, Calendar, Users, Shield, Bell, Settings, User, Layers, Clock, CalendarOff, ClipboardList } from 'lucide-react';",
    "import { ArrowRight, Calendar, Users, ClipboardList } from 'lucide-react';"
)

# 2) Coach panel: only Schedule + My students
old_coach = """        {isCoach && (
          <SectionPanel
            title="Coach area"
            items={[
              { href: '/coach/schedule', label: 'Schedule', icon: Calendar },
              { href: '/coach/students', label: 'Students', icon: Users },
              { href: '/coach/availability', label: 'Availability', icon: Clock },
              { href: '/coach/class-types', label: 'Class types', icon: Layers },
              { href: '/coach/blackouts', label: 'Blackouts', icon: CalendarOff },
              { href: '/coach/profile', label: 'My profile', icon: User },
            ]}
          />
        )}"""

new_coach = """        {isCoach && (
          <SectionPanel
            title="Coach area"
            items={[
              { href: '/coach/schedule', label: 'Schedule', icon: Calendar },
              { href: '/coach/students', label: 'My students', icon: Users },
            ]}
          />
        )}"""

c = c.replace(old_coach, new_coach)

# 3) Admin panel: relabel Students -> "All students" (Recurring requests already correct)
c = c.replace(
    "{ href: '/admin/students', label: 'Students', icon: Users },",
    "{ href: '/admin/students', label: 'All students', icon: Users },"
)

# 4) Remove the Notification preferences and Account dashboard cards
old_prefs = """        <DashCard
          href="/preferences"
          icon={Bell}
          title="Notification preferences"
          description="Choose how and when we contact you."
        />

"""
c = c.replace(old_prefs, "")

old_account = """        <DashCard
          href="/account"
          icon={Settings}
          title="Account"
          description="Change email, password, or delete account."
        />
"""
c = c.replace(old_account, "")

with open(path, 'w') as f:
    f.write(c)
print("Streamlined dashboard")
PYEOF

echo ""
echo "Done."
echo "Build: npm run build"