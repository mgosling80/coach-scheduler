/**
 * Convert a "HH:MM" or "HH:MM:SS" string to 12-hour "h:MM AM/PM".
 * e.g. "16:00" -> "4:00 PM", "07:30:00" -> "7:30 AM"
 */
export function formatTime12(time: string | null | undefined): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format an ISO datetime as "Tue, Jan 14, 4:00 PM".
 */
export function formatDateTime12(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
