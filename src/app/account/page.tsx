import Link from 'next/link';
import { Wordmark } from '@/components/wordmark';
import { requireAuth } from '@/lib/auth';
import { AccountClient } from './client';

export default async function AccountPage() {
  const authed = await requireAuth();

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <header
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
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-extrabold font-display text-[var(--navy-900)]">Account</h2>
            <p className="text-sm text-[var(--muted)] mt-1">Signed in as {authed.user.email}</p>
          </div>
          <AccountClient currentEmail={authed.user.email ?? ''} />
        </div>
      </main>
    </div>
  );
}
