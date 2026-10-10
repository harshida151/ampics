'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageLoading } from '@/components/ui';
import * as api from '@/lib/api';
import { homeFor } from '@/lib/roles';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api
      .getCurrentUser()
      .then((u) => router.replace(u ? homeFor(u.role) : '/login'))
      .catch(() => router.replace('/login'));
  }, [router]);
  return <PageLoading />;
}
