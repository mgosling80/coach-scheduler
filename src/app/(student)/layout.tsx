import { StudentMobileNav } from '@/components/student-mobile-nav';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Bottom padding on mobile so fixed nav doesn't cover content */}
      <div className="pb-20 md:pb-0">{children}</div>
      <StudentMobileNav />
    </>
  );
}
