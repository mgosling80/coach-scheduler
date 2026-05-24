import { CardSkeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 h-16" />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </main>
    </div>
  );
}
