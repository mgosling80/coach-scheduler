import Link from 'next/link';
import { Wordmark } from '@/components/wordmark';
import { HeaderAvatar } from '@/components/header-avatar';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PreferencesForm } from './preferences-form';

export default async function PreferencesPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('phone')
    .eq('id', authed.user.id)
    .maybeSingle();

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', authed.user.id)
    .maybeSingle();

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
            <h2 className="text-xl font-extrabold font-display text-[var(--navy-900)]">Notification preferences</h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              Choose how and when we contact you.
            </p>
          </div>
          <PreferencesForm
            initial={{
              phone: profile?.phone ?? '',
              email_enabled: prefs?.email_enabled ?? true,
              sms_enabled: prefs?.sms_enabled ?? false,
              day_of_digest_enabled: prefs?.day_of_digest_enabled ?? true,
              day_of_digest_time: (prefs?.day_of_digest_time ?? '07:00:00').slice(0, 5),
              reminder_hours: (prefs?.reminder_hours ?? [24, 2]).join(', '),
            }}
          />
        </div>
      </main>
    </div>
  );
}
