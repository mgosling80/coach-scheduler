'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Wordmark } from '@/components/wordmark';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left: brand panel */}
      <div className="cp-sparkle relative md:w-1/2 min-h-[40vh] md:min-h-screen px-8 py-12 flex flex-col justify-center text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #2e5bd4 0%, #3d6ae8 55%, #5b8cf5 100%)' }}>
        <div className="relative z-10 max-w-md mx-auto md:mx-0">
          <Wordmark href="/" variant="light" />
          <h1 className="mt-10 text-3xl md:text-4xl font-extrabold font-display leading-tight">
            Book your mat time.<br />Own your progress.
          </h1>
          <p className="mt-4 text-white/80 text-lg leading-relaxed">
            Private lesson scheduling built for competitive cheer — athletes, coaches, and gyms, all in one place.
          </p>
        </div>
        {/* decorative blue arc */}
        <div
          className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, var(--blue-500), transparent 70%)' }}
        />
      </div>

      {/* Right: form */}
      <div className="md:w-1/2 flex items-center justify-center px-6 py-12 bg-[var(--cream)]">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold font-display text-[var(--navy-900)] mb-1">Welcome back</h2>
          <p className="text-sm text-[var(--muted)] mb-6">Sign in to manage your lessons.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg cp-ring bg-white"
                autoComplete="current-password"
              />
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
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-sm">
            <Link href="/forgot-password" className="text-[var(--muted)] hover:text-[var(--navy-900)]">
              Forgot password?
            </Link>
            <Link href="/signup" className="font-semibold text-[var(--blue-600)] hover:underline">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
