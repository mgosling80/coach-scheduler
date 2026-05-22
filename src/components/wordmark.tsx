import Link from 'next/link';

export function Wordmark({
  href = '/dashboard',
  variant = 'dark',
}: {
  href?: string;
  variant?: 'dark' | 'light';
}) {
  const textColor = variant === 'light' ? 'text-white' : 'text-[var(--navy-900)]';
  return (
    <Link href={href} className="inline-flex items-center gap-2 group">
      <StarMark />
      <span className={`text-xl font-extrabold tracking-tight font-display ${textColor}`}>
        Cheer<span className="text-[var(--gold-500)]">Pro</span>
      </span>
    </Link>
  );
}

export function StarMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, var(--blue-600), var(--navy-800))',
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2l2.6 6.3 6.8.5-5.2 4.4 1.7 6.6L12 16.9 6.1 20.3l1.7-6.6L2.6 9.3l6.8-.5L12 2z"
          fill="var(--gold-500)"
        />
      </svg>
    </span>
  );
}
