'use client';

import { Button, Notice } from '@/components/ui';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Notice
        tone="danger"
        title="This page failed to load."
        actions={
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        }
      >
        Reload the page. If the problem continues, sign out and sign in again.
      </Notice>
    </div>
  );
}
