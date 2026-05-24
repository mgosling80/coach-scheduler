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
