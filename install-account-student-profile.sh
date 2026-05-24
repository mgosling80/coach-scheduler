#!/usr/bin/env bash
# install-account-student-profile.sh
# Adds an editable Student profile section to the Account page (students only).
# Run from project root: bash install-account-student-profile.sh

set -e
if [ ! -f package.json ]; then echo "ERROR: run from project root."; exit 1; fi

# ============================================================
# 1) Append a non-redirecting save action to account actions
# ============================================================
echo "Appending saveStudentProfileFromAccount to account actions"
cat >> src/app/account/actions.ts << 'FILE_EOF'

import { revalidatePath } from 'next/cache';

const studentProfileSchema = z.object({
  age: z.coerce.number().int().min(1).max(120).optional().nullable(),
  gym: z.string().max(120).optional().nullable(),
  level: z.string().max(80).optional().nullable(),
  team: z.string().max(120).optional().nullable(),
  comments: z.string().max(1000).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
});

export async function saveStudentProfileFromAccount(formData: FormData) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const parsed = studentProfileSchema.safeParse({
    age: formData.get('age') || null,
    gym: formData.get('gym') || null,
    level: formData.get('level') || null,
    team: formData.get('team') || null,
    comments: formData.get('comments') || null,
    phone: formData.get('phone') || null,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  await supabase
    .from('profiles')
    .update({ phone: parsed.data.phone })
    .eq('id', authed.user.id);

  const { error } = await supabase.from('student_profiles').upsert({
    user_id: authed.user.id,
    age: parsed.data.age,
    gym: parsed.data.gym,
    level: parsed.data.level,
    team: parsed.data.team,
    comments: parsed.data.comments,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/account');
  return { ok: true, message: 'Profile saved.' };
}
FILE_EOF

# ============================================================
# 2) Account page: detect student role, fetch fields, pass to client
# ============================================================
echo "Rewriting account page to load student profile"
cat > src/app/account/page.tsx << 'FILE_EOF'
import { Wordmark } from '@/components/wordmark';
import { HeaderAvatar } from '@/components/header-avatar';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AccountClient } from './client';

export default async function AccountPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, photo_url')
    .eq('id', authed.user.id)
    .maybeSingle();

  const isStudent = authed.roles.includes('student');

  let studentProfile = {
    phone: profile?.phone ?? '',
    age: '',
    gym: '',
    level: '',
    team: '',
    comments: '',
  };

  if (isStudent) {
    const { data: sp } = await supabase
      .from('student_profiles')
      .select('age, gym, level, team, comments')
      .eq('user_id', authed.user.id)
      .maybeSingle();
    studentProfile = {
      phone: profile?.phone ?? '',
      age: sp?.age?.toString() ?? '',
      gym: sp?.gym ?? '',
      level: sp?.level ?? '',
      team: sp?.team ?? '',
      comments: sp?.comments ?? '',
    };
  }

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <header
        className="sticky top-0 z-30"
        style={{ background: 'linear-gradient(135deg, #2e5bd4 0%, #3d6ae8 55%, #5b8cf5 100%)' }}
      >
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Wordmark variant="light" />
          <HeaderAvatar />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-extrabold font-display text-[var(--navy-900)]">Account</h2>
            <p className="text-sm text-[var(--muted)] mt-1">Signed in as {authed.user.email}</p>
          </div>
          <AccountClient
            currentEmail={authed.user.email ?? ''}
            photoUrl={profile?.photo_url ?? ''}
            isStudent={isStudent}
            fullName={profile?.full_name ?? ''}
            studentProfile={studentProfile}
          />
        </div>
      </main>
    </div>
  );
}
FILE_EOF

# ============================================================
# 3) Account client: add the Student profile section
# ============================================================
echo "Patching account client with Student profile section"
python3 - << 'PYEOF'
path = 'src/app/account/client.tsx'
with open(path) as f:
    c = f.read()

# import the new action
c = c.replace(
    "import { changeEmail, changePassword, deleteAccount } from './actions';",
    "import { changeEmail, changePassword, deleteAccount, saveStudentProfileFromAccount } from './actions';"
)

# widen props
c = c.replace(
    "export function AccountClient({ currentEmail, photoUrl }: { currentEmail: string; photoUrl: string }) {",
    """type StudentProfile = {
  phone: string;
  age: string;
  gym: string;
  level: string;
  team: string;
  comments: string;
};

export function AccountClient({
  currentEmail,
  photoUrl,
  isStudent,
  fullName,
  studentProfile,
}: {
  currentEmail: string;
  photoUrl: string;
  isStudent: boolean;
  fullName: string;
  studentProfile: StudentProfile;
}) {"""
)

# Insert the Student profile section right after the photo section
anchor = """      <section>
        <ProfilePhotoUpload initialUrl={photoUrl} />
      </section>"""
new = anchor + """

      {isStudent && (
        <StudentProfileSection fullName={fullName} initial={studentProfile} />
      )}"""
c = c.replace(anchor, new)

# Append the StudentProfileSection component before the final closing of the file.
component = '''

function StudentProfileSection({
  fullName,
  initial,
}: {
  fullName: string;
  initial: StudentProfile;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function handleSave(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const r = await saveStudentProfileFromAccount(formData);
      setMsg(r.ok ? { kind: 'ok', text: r.message ?? 'Saved.' } : { kind: 'error', text: r.error ?? 'Failed.' });
    });
  }

  return (
    <section>
      <h3 className="text-sm font-bold font-display text-[var(--navy-900)] uppercase tracking-wide mb-3">
        My profile
      </h3>
      <form action={handleSave} className="space-y-3">
        <div>
          <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">Name</label>
          <input
            value={fullName}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-100 text-[var(--muted)]"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">Contact your gym if your name needs to change.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">Phone</label>
            <input
              type="tel"
              name="phone"
              defaultValue={initial.phone}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">Age</label>
            <input
              type="number"
              name="age"
              min="1"
              max="120"
              defaultValue={initial.age}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">Gym</label>
            <input
              name="gym"
              defaultValue={initial.gym}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">Level</label>
            <input
              name="level"
              defaultValue={initial.level}
              placeholder="e.g. Beginner, JV, Varsity"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">Team</label>
            <input
              name="team"
              defaultValue={initial.team}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-[var(--navy-900)] mb-1">Comments</label>
            <textarea
              name="comments"
              rows={3}
              defaultValue={initial.comments}
              placeholder="Anything your coach should know."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {pending ? 'Saving...' : 'Save profile'}
          </button>
          {msg && (
            <span className={`text-xs ${msg.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
'''
c = c.rstrip() + component + "\n"

with open(path, 'w') as f:
    f.write(c)
print("Patched account client")
PYEOF

echo ""
echo "Done. Student profile editing added to Account page (students only)."
echo "Run: npm run build"