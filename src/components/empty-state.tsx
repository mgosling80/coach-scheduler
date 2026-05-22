import Link from 'next/link';

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon?: React.ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="p-10 text-center">
      {Icon && (
        <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Icon className="w-6 h-6 text-gray-400" />
        </div>
      )}
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-block mt-4 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
