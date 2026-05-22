import Link from 'next/link';
import { CalendarDays } from 'lucide-react';

export function Wordmark({ href = '/dashboard' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 group">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white">
        <CalendarDays className="w-5 h-5" />
      </span>
      <span className="text-lg font-semibold text-gray-900 group-hover:text-gray-700">
        Coach Scheduler
      </span>
    </Link>
  );
}
