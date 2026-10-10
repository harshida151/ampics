'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import { homeFor } from '@/lib/roles';
import type { Role, User } from '@/lib/types';

/** Redirects to /login when signed out, and to the user's own home when the role does not match. */
export function useRequireRole(role: Role) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getCurrentUser()
      .then((u) => {
        if (!alive) return;
        if (!u) return router.replace('/login');
        if (u.role !== role) return router.replace(homeFor(u.role));
        setUser(u);
        setReady(true);
      })
      .catch(() => {
        if (alive) router.replace('/login');
      });
    return () => {
      alive = false;
    };
  }, [role, router]);

  return { user, ready };
}
