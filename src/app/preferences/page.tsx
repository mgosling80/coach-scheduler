import Link from 'next/link';
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
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
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Notification preferences</h2>
            <p className="text-sm text-gray-600 mt-1">
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
