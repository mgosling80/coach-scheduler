'use client';

import { Home, Calendar, ClipboardList, Bell, User } from 'lucide-react';
import { MobileNav } from './mobile-nav';

export function StudentMobileNav() {
  return (
    <MobileNav
      items={[
        { href: '/dashboard', label: 'Home', icon: Home },
        { href: '/book', label: 'Book', icon: Calendar },
        { href: '/my-bookings', label: 'Bookings', icon: ClipboardList },
        { href: '/preferences', label: 'Settings', icon: Bell },
        { href: '/account', label: 'Account', icon: User },
      ]}
    />
  );
}
