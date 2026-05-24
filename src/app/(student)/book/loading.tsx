import { ListSkeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 h-16" />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <ListSkeleton rows={4} />
      </main>
    </div>
  );
}
