function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  photoUrl,
  size = 40,
  ring = false,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const dim = { width: size, height: size };
  const ringClass = ring ? 'ring-2 ring-white/70' : '';

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        style={dim}
        className={`rounded-full object-cover flex-shrink-0 ${ringClass}`}
      />
    );
  }

  return (
    <span
      style={{
        ...dim,
        background: 'linear-gradient(135deg, var(--blue-600), var(--navy-800))',
        fontSize: size * 0.4,
      }}
      className={`rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 font-display ${ringClass}`}
    >
      {initials(name)}
    </span>
  );
}
