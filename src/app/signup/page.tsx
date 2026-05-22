'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Wordmark } from '@/components/wordmark';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // If email confirmation is on, there's no session yet
    if (!data.session) {
      setConfirmSent(true);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="cp-sparkle relative md:w-1/2 min-h-[40vh] md:min-h-screen px-8 py-12 flex flex-col justify-center text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #2e5bd4 0%, #3d6ae8 55%, #5b8cf5 100%)' }}>
        <div className="relative z-10 max-w-md mx-auto md:mx-0">
          <Wordmark href="/" variant="light" />
          <h1 className="mt-10 text-3xl md:text-4xl font-extrabold font-display leading-tight">
            Join your gym&apos;s<br />lesson community.
          </h1>
          <p className="mt-4 text-white/80 text-lg leading-relaxed">
            Create an account to request approval, book private lessons, and stay in the loop.
          </p>
        </div>
        <div
          className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, var(--blue-500), transparent 70%)' }}
        />
      </div>

      <div className="md:w-1/2 flex items-center justify-center px-6 py-12 bg-[var(--cream)]">
        <div className="w-full max-w-sm">
          {confirmSent ? (
            <div className="text-center">
              <h2 className="text-2xl font-bold font-display text-[var(--navy-900)] mb-2">Check your email</h2>
              <p className="text-sm text-[var(--muted)]">
                We sent a confirmation link to <span className="font-semibold">{email}</span>. Click it to finish creating your account.
              </p>
              <Link href="/login" className="inline-block mt-6 text-sm font-semibold text-[var(--blue-600)] hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold font-display text-[var(--navy-900)] mb-1">Create account</h2>
              <p className="text-sm text-[var(--muted)] mb-6">It only takes a minute.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="fullName" className="block text-sm font-semibold text-[var(--navy-900)] mb-1">
                    Full name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg cp-ring bg-white"
                    autoComplete="name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-[var(--navy-900)] mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg cp-ring bg-white"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-[var(--navy-900)] mb-1">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg cp-ring bg-white"
                    autoComplete="new-password"
                  />
                  <p className="mt-1 text-xs text-[var(--muted)]">Minimum 8 characters.</p>
                </div>

                {error && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-100 p-2.5 rounded-lg">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="cp-btn-gold w-full py-2.5 px-4 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Creating account...' : 'Create account'}
                </button>
              </form>

              <p className="mt-5 text-sm text-center text-[var(--muted)]">
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-[var(--blue-600)] hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
