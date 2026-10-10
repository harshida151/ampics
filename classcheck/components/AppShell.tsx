'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import * as api from '@/lib/api';
import { cx } from '@/lib/cx';
import type { Role, User } from '@/lib/types';
import { LogoMark } from './icons';
import { Button } from './ui';

const NAV: Record<Role, { href: string; label: string }[]> = {
  student: [
    { href: '/attend', label: 'Check in' },
    { href: '/enroll', label: 'Enrol' },
  ],
  instructor: [{ href: '/instructor', label: 'Class session' }],
  admin: [{ href: '/admin', label: 'Check-ins' }],
};

import { homeFor } from '@/lib/roles';

export function AppShell({ user, title, children }: { user: User; title: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    document.title = `${title} | ClassCheck`;
  }, [title]);

  async function signOut() {
    await api.logout();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3">
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <span className="text-lg font-semibold">ClassCheck</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-sm leading-tight sm:block">
              <p className="font-medium">{user.fullName}</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-line bg-paper px-2 py-1">
              <label htmlFor="role-select" className="text-xs font-medium text-muted">Role:</label>
              <select
                id="role-select"
                value={user.role}
                onChange={async (e) => {
                  const targetRole = e.target.value as Role;
                  await api.switchRole(targetRole);
                  router.replace(homeFor(targetRole));
                }}
                className="bg-transparent text-xs font-semibold capitalize text-brand-text cursor-pointer focus:outline-none"
              >
                <option value="student">Student</option>
                <option value="instructor">Instructor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-5xl overflow-x-auto px-4">
          <ul className="flex gap-1">
            {NAV[user.role].map((n) => {
              const active = pathname === n.href;
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-base font-medium',
                      active ? 'border-brand-text text-brand-text' : 'border-transparent text-muted hover:text-ink',
                    )}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
