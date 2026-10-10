import { cx } from '@/lib/cx';
import { LAYER_META } from '@/lib/layers';
import type { Layers } from '@/lib/types';
import { CheckIcon, CrossIcon } from './icons';

export function LayerChips({ layers }: { layers: Layers }) {
  return (
    <ul aria-label="Layer results" className="flex flex-wrap gap-2">
      {LAYER_META.map((m) => {
        const r = layers[m.key];
        return (
          <li key={m.key} className={cx('chip', r.passed ? 'chip-pass' : 'chip-fail')}>
            {r.passed ? <CheckIcon className="h-3.5 w-3.5" /> : <CrossIcon className="h-3.5 w-3.5" />}
            <span>{m.chip}</span>
            <span className="tabular-nums">{r.score}</span>
            <span className="sr-only">{r.passed ? 'passed' : 'failed'}</span>
          </li>
        );
      })}
    </ul>
  );
}
