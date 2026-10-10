'use client';

import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { LAYER_META } from '@/lib/layers';
import type { LayerKey } from '@/lib/types';
import { CheckIcon, CrossIcon } from './icons';

export type LadderStatus = 'idle' | 'active' | 'captured' | 'passed' | 'failed';
export interface LadderItem {
  key: LayerKey;
  status: LadderStatus;
  score?: number;
}

const STATUS_TEXT: Record<LadderStatus, string> = {
  idle: 'Waiting',
  active: 'In progress',
  captured: 'Captured',
  passed: 'Passed',
  failed: 'Failed',
};
const STATUS_COLOUR: Record<LadderStatus, string> = {
  idle: 'text-muted',
  active: 'text-brand-text',
  captured: 'text-ink',
  passed: 'text-success',
  failed: 'text-danger',
};

function Dot({ status }: { status: LadderStatus }) {
  const base = 'relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full';
  switch (status) {
    case 'idle':
      return <span aria-hidden className={cx(base, 'border-2 border-field bg-surface')} />;
    case 'active':
      return (
        <span aria-hidden className={cx(base, 'border-2 border-brand-text bg-surface')}>
          <span className="h-2.5 w-2.5 rounded-full bg-brand-text motion-safe:animate-pulse" />
        </span>
      );
    case 'captured':
      return <span aria-hidden className={cx(base, 'bg-brand')} />;
    case 'passed':
      return (
        <span aria-hidden className={cx(base, 'bg-success text-on-solid')}>
          <CheckIcon className="h-4 w-4" />
        </span>
      );
    case 'failed':
      return (
        <span aria-hidden className={cx(base, 'bg-danger text-on-solid')}>
          <CrossIcon className="h-4 w-4" />
        </span>
      );
  }
}

/**
 * The signature element: six layers, one dot each. A dot moves through
 * idle, in progress, captured, then passed or failed as the check-in advances.
 */
export function LayerLadder({ items }: { items: LadderItem[] }) {
  const prev = useRef<Record<string, LadderStatus>>({});
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    for (const it of items) {
      const before = prev.current[it.key];
      if (before !== undefined && before !== it.status && it.status !== 'idle') {
        const label = LAYER_META.find((m) => m.key === it.key)?.label ?? it.key;
        setAnnouncement(`${label}: ${STATUS_TEXT[it.status].toLowerCase()}`);
      }
      prev.current[it.key] = it.status;
    }
  }, [items]);

  return (
    <>
      <ol aria-label="Verification layers">
        {LAYER_META.map((m, i) => {
          const it = items.find((x) => x.key === m.key);
          const status = it?.status ?? 'idle';
          const last = i === LAYER_META.length - 1;
          return (
            <li key={m.key} className="relative flex gap-3 pb-5 last:pb-0">
              {!last && <span aria-hidden className="absolute left-[13px] top-7 -bottom-1 w-0.5 bg-line" />}
              <Dot status={status} />
              <div className="min-w-0">
                <p className="font-medium leading-tight">{m.label}</p>
                <p className={cx('text-sm font-medium', STATUS_COLOUR[status])}>
                  {STATUS_TEXT[status]}
                  {(status === 'passed' || status === 'failed') && it?.score !== undefined ? `, score ${it.score}` : ''}
                </p>
                <p className="text-sm text-muted">{m.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
