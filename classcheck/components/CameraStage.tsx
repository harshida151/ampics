'use client';

import { useId, type ReactNode } from 'react';
import type { CameraHandle } from '@/hooks/useCamera';
import { cx } from '@/lib/cx';
import { Button, Skeleton } from './ui';

export type OvalTone = 'neutral' | 'good' | 'warn';
// Overlay colours are fixed (not themed) because they sit on top of the camera image.
const OVAL: Record<OvalTone, string> = { neutral: '#ffffff', good: '#4ade80', warn: '#fbbf24' };

export function CameraStage({
  camera,
  caption,
  tone = 'neutral',
  showOval = true,
  mirror = true,
  aspect = 'aspect-[3/4]',
  idleLabel = 'Turn on camera',
  children,
}: {
  camera: CameraHandle;
  caption?: string;
  tone?: OvalTone;
  showOval?: boolean;
  mirror?: boolean;
  aspect?: string;
  idleLabel?: string;
  children?: ReactNode;
}) {
  const maskId = useId().replace(/:/g, '');
  const live = camera.status === 'live';

  return (
    <div className={cx('relative mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-line bg-[#06131a]', aspect)}>
      <video
        ref={camera.videoRef}
        muted
        playsInline
        aria-label="Live camera preview"
        className={cx('absolute inset-0 h-full w-full object-cover', !live && 'invisible')}
        style={mirror ? { transform: 'scaleX(-1)' } : undefined}
      />

      {live && showOval && (
        <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden focusable={false}>
          <defs>
            <mask id={maskId}>
              <rect width="300" height="400" fill="white" />
              <ellipse cx="150" cy="185" rx="95" ry="125" fill="black" />
            </mask>
          </defs>
          <rect width="300" height="400" fill="rgba(6,19,26,0.55)" mask={`url(#${maskId})`} />
          <ellipse cx="150" cy="185" rx="95" ry="125" fill="none" strokeWidth="4" style={{ stroke: OVAL[tone], transition: 'stroke 0.2s' }} />
        </svg>
      )}

      {live && children}

      {live && caption && (
        <p aria-live="polite" className="absolute inset-x-3 bottom-3 rounded-lg bg-[#06131a]/85 px-3 py-2 text-center text-base font-medium text-white">
          {caption}
        </p>
      )}

      {!live && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
          {camera.status === 'idle' && (
            <>
              <p>The camera is off. Nothing is recorded or uploaded.</p>
              <Button onClick={camera.start}>{idleLabel}</Button>
            </>
          )}
          {camera.status === 'requesting' && (
            <div role="status" className="w-full space-y-3">
              <Skeleton className="mx-auto h-4 w-2/3 bg-white/25" />
              <p>Waiting for permission. Tap Allow when your browser asks.</p>
            </div>
          )}
          {(camera.status === 'denied' || camera.status === 'unavailable' || camera.status === 'error') && (
            <>
              <p role="alert" className="font-medium">
                {camera.message}
              </p>
              <Button onClick={camera.start}>Try again</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
