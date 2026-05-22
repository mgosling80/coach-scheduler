import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { AccountClient } from './client';

export default async function AccountPage() {
  const authed = await requireAuth();

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
            <h2 className="text-xl font-semibold text-gray-900">Account</h2>
            <p className="text-sm text-gray-600 mt-1">Signed in as {authed.user.email}</p>
          </div>
          <AccountClient currentEmail={authed.user.email ?? ''} />
        </div>
      </main>
    </div>
  );
}
