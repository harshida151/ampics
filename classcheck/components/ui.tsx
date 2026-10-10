'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { toErrorInfo } from '@/lib/api';
import { cx } from '@/lib/cx';
import type { Decision } from '@/lib/types';
import { AlertIcon, CheckIcon, CrossIcon, InfoIcon, SpinnerIcon } from './icons';

/* ------------------------------------------------------------------ buttons */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANT: Record<Variant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  danger: 'btn btn-danger',
  ghost: 'btn btn-ghost',
};

export function Button({
  variant = 'primary',
  busy = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button {...rest} type={type} disabled={disabled || busy} aria-busy={busy || undefined} className={cx(VARIANT[variant], className)}>
      {busy && <SpinnerIcon className="h-4 w-4 motion-safe:animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = 'primary', className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(VARIANT[variant], className)}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------- notice */

type Tone = 'info' | 'success' | 'warning' | 'danger';
const TONES: Record<Tone, { box: string; icon: string; Icon: typeof InfoIcon }> = {
  info: { box: 'border-line bg-surface', icon: 'text-brand-text', Icon: InfoIcon },
  success: { box: 'border-success bg-success-soft', icon: 'text-success', Icon: CheckIcon },
  warning: { box: 'border-warning bg-warning-soft', icon: 'text-warning', Icon: AlertIcon },
  danger: { box: 'border-danger bg-danger-soft', icon: 'text-danger', Icon: CrossIcon },
};

export function Notice({
  tone = 'info',
  title,
  children,
  actions,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-lg border p-3', t.box, className)}>
      <span className={cx('mt-0.5 shrink-0 text-xl', t.icon)}>
        <t.Icon />
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-base">{children}</div>}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { message, fix } = toErrorInfo(error);
  return (
    <Notice
      tone="danger"
      title={message}
      actions={onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    >
      {fix}
    </Notice>
  );
}

/* ------------------------------------------------------------ states: empty/loading */

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-field p-6 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('rounded-md bg-line motion-safe:animate-pulse', className)} />;
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card space-y-3 p-5" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cx('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-48" />
      <CardSkeleton />
      <CardSkeleton lines={2} />
    </div>
  );
}

/* ------------------------------------------------------------------- badges */

const DECISION: Record<Decision, { label: string; cls: string; Icon: typeof CheckIcon }> = {
  APPROVED: { label: 'Approved', cls: 'border-success bg-success-soft text-success', Icon: CheckIcon },
  REVIEW: { label: 'Needs review', cls: 'border-warning bg-warning-soft text-warning', Icon: AlertIcon },
  REJECTED: { label: 'Rejected', cls: 'border-danger bg-danger-soft text-danger', Icon: CrossIcon },
};

export function DecisionBadge({ decision, large = false }: { decision: Decision; large?: boolean }) {
  const d = DECISION[decision];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border font-semibold', large ? 'px-4 py-1.5 text-lg' : 'px-2.5 py-0.5 text-sm', d.cls)}>
      <d.Icon className={large ? 'h-5 w-5' : 'h-4 w-4'} />
      {d.label}
    </span>
  );
}

/* -------------------------------------------------------------------- field */

export function Field({
  id,
  label,
  hint,
  error,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string; error?: string }) {
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input id={id} {...rest} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={cx('input', error && 'border-danger')} />
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
