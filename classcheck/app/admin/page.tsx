'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { DownloadIcon } from '@/components/icons';
import { LayerChips } from '@/components/LayerChip';
import { Button, CardSkeleton, DecisionBadge, EmptyState, ErrorNotice, Notice, PageLoading } from '@/components/ui';
import { useRequireRole } from '@/hooks/useRequireRole';
import * as api from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/format';
import type { CheckIn, DecisionFilter } from '@/lib/types';

const TABS: { key: DecisionFilter; label: string; empty: string }[] = [
  { key: 'ALL', label: 'All', empty: 'No check-ins yet. They appear here as students finish.' },
  { key: 'REVIEW', label: 'Needs review', empty: 'Nothing needs review right now.' },
  { key: 'REJECTED', label: 'Rejected', empty: 'No rejected check-ins.' },
  { key: 'APPROVED', label: 'Approved', empty: 'No approved check-ins yet.' },
];

export default function AdminPage() {
  const { user, ready } = useRequireRole('admin');
  const [items, setItems] = useState<CheckIn[] | null>(null);
  const [feedError, setFeedError] = useState<unknown>(null);
  const [feedKey, setFeedKey] = useState(0);
  const [tab, setTab] = useState<DecisionFilter>('ALL');
  const [announce, setAnnounce] = useState('');
  const seen = useRef<Set<string> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; error: unknown } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    setFeedError(null);
    return api.subscribeCheckIns(
      {},
      (list) => {
        if (seen.current) {
          const fresh = list.filter((c) => !seen.current!.has(c.id));
          if (fresh.length) setAnnounce(fresh.length === 1 ? `New check-in from ${fresh[0].studentName}: ${fresh[0].decision.toLowerCase()}.` : `${fresh.length} new check-ins.`);
        }
        seen.current = new Set(list.map((c) => c.id));
        setItems(list);
      },
      setFeedError,
    );
  }, [ready, feedKey]);

  const counts = useMemo(() => {
    const c: Record<DecisionFilter, number> = { ALL: 0, REVIEW: 0, REJECTED: 0, APPROVED: 0 };
    items?.forEach((i) => {
      c.ALL += 1;
      c[i.decision] += 1;
    });
    return c;
  }, [items]);

  const visible = useMemo(() => (items ?? []).filter((c) => tab === 'ALL' || c.decision === tab), [items, tab]);

  const decide = useCallback(async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setBusyId(id);
    setRowError(null);
    try {
      const updated = await api.decideCheckIn(id, decision);
      setItems((list) => list?.map((c) => (c.id === id ? updated : c)) ?? list);
    } catch (e) {
      setRowError({ id, error: e });
    } finally {
      setBusyId(null);
    }
  }, []);

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const csv = await api.exportCheckInsCsv(tab);
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `classcheck-${tab.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e);
    } finally {
      setExporting(false);
    }
  }

  function onTabKey(e: KeyboardEvent, i: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
  }

  if (!ready || !user) return <PageLoading />;
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <AppShell user={user} title="Check-ins">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Check-ins</h1>
          <span className={cx('inline-flex items-center gap-1.5 text-sm font-medium', feedError != null ? 'text-warning' : 'text-success')}>
            <span aria-hidden className={cx('h-2 w-2 rounded-full', feedError != null ? 'bg-warning' : 'bg-success motion-safe:animate-pulse')} />
            {feedError != null ? 'Paused' : 'Live'}
          </span>
        </div>
        <Button variant="secondary" onClick={exportCsv} busy={exporting} disabled={!items || items.length === 0}>
          <DownloadIcon className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {exportError != null && (
        <div className="mb-4">
          <ErrorNotice error={exportError} onRetry={exportCsv} />
        </div>
      )}
      {feedError != null && (
        <Notice
          tone="warning"
          title="Live updates paused"
          className="mb-4"
          actions={
            <Button variant="secondary" onClick={() => setFeedKey((k) => k + 1)}>
              Reconnect
            </Button>
          }
        >
          Check your connection, then reconnect. The list below may be out of date.
        </Notice>
      )}

      <div role="tablist" aria-label="Filter check-ins" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="feed-panel"
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={cx(
              'inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap border-b-2 px-3 font-medium',
              tab === t.key ? 'border-brand-text text-brand-text' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            <span className="rounded-full bg-line px-2 text-sm tabular-nums text-ink">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div id="feed-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {feedError != null && items === null ? null : items === null ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState title={current.empty} />
        ) : (
          <ul className="space-y-3">
            {visible.map((c) => (
              <li key={c.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{c.studentName}</p>
                    <p className="text-sm text-muted">{c.enrolmentNo}</p>
                    <p className="text-sm text-muted">
                      {c.sessionTitle}, {formatDateTime(c.at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums">{c.confidence}% confidence</span>
                    <DecisionBadge decision={c.decision} />
                  </div>
                </div>
                <div className="mt-3">
                  <LayerChips layers={c.layers} />
                </div>
                <p className="mt-3 max-w-prose text-sm text-muted">{c.reason}</p>
                {c.decision === 'REVIEW' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button busy={busyId === c.id} onClick={() => decide(c.id, 'APPROVED')} aria-label={`Approve check-in for ${c.studentName}`}>
                      Approve
                    </Button>
                    <Button variant="danger" busy={busyId === c.id} onClick={() => decide(c.id, 'REJECTED')} aria-label={`Reject check-in for ${c.studentName}`}>
                      Reject
                    </Button>
                  </div>
                )}
                {c.resolvedBy && <p className="mt-3 text-sm font-medium">Decided by {c.resolvedBy}.</p>}
                {rowError?.id === c.id && (
                  <div className="mt-3">
                    <ErrorNotice error={rowError.error} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
