import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Coach Scheduler',
  description: 'Schedule private coaching sessions',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
