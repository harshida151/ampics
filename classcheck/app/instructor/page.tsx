'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { CopyIcon, PinIcon } from '@/components/icons';
import { QrImage } from '@/components/QrImage';
import { Button, CardSkeleton, DecisionBadge, EmptyState, ErrorNotice, Field, Notice, PageLoading } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useRotatingCode } from '@/hooks/useRotatingCode';
import * as api from '@/lib/api';
import { formatTime } from '@/lib/format';
import { GeoError, getCoords } from '@/lib/geo';
import type { CheckIn, ClassSession, Coords } from '@/lib/types';

export default function InstructorPage() {
  const { user, ready } = useRequireRole('instructor');
  // undefined = loading, null = no open session
  const [session, setSession] = useState<ClassSession | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setSession(undefined);
    try {
      setSession(await api.getActiveSession());
    } catch (e) {
      setLoadError(e);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready || !user) return <PageLoading />;

  return (
    <AppShell user={user} title="Class session">
      <h1 className="mb-4 text-2xl font-semibold">Class session</h1>
      {loadError != null ? (
        <ErrorNotice error={loadError} onRetry={load} />
      ) : session === undefined ? (
        <CardSkeleton lines={4} />
      ) : session ? (
        <RunningSession session={session} onEnded={() => setSession(null)} />
      ) : (
        <StartForm onStarted={setSession} />
      )}
    </AppShell>
  );
}

/* ---------------------------------------------------------------------- form */

function StartForm({ onStarted }: { onStarted: (s: ClassSession) => void }) {
  const [title, setTitle] = useState('');
  const [radius, setRadius] = useState('100');
  const [duration, setDuration] = useState('30');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locError, setLocError] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);
  const [errors, setErrors] = useState<Partial<Record<'title' | 'radius' | 'location', string>>>({});

  async function useMyLocation() {
    setLocBusy(true);
    setLocError('');
    try {
      setCoords(await getCoords());
      setErrors((e) => ({ ...e, location: undefined }));
    } catch (e) {
      setLocError(e instanceof GeoError ? e.message : 'Your location could not be read. Turn on Location and try again.');
    } finally {
      setLocBusy(false);
    }
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setApiError(null);
    const r = Number(radius);
    const e: typeof errors = {};
    if (title.trim().length < 3) e.title = 'Enter a session title of at least 3 characters.';
    if (!Number.isFinite(r) || r < 10 || r > 1000) e.radius = 'Enter a radius between 10 and 1000 metres.';
    if (!coords) e.location = 'Set the classroom location first. Stand in the room and press the button.';
    setErrors(e);
    if (e.title) return document.getElementById('title')?.focus();
    if (e.radius) return document.getElementById('radius')?.focus();
    if (e.location || !coords) return document.getElementById('use-location')?.focus();

    setBusy(true);
    try {
      onStarted(await api.startSession({ title, radiusM: Math.round(r), durationMin: Number(duration), coords }));
    } catch (err) {
      setApiError(err);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card max-w-xl space-y-5 p-5">
      <Field id="title" label="Session title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Data Structures, Lecture 13" autoComplete="off" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="radius"
          label="Radius in metres"
          type="number"
          inputMode="numeric"
          min={10}
          max={1000}
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          error={errors.radius}
          hint="Students must be within this distance."
        />
        <div>
          <label htmlFor="duration" className="mb-1 block text-sm font-medium">
            Duration
          </label>
          <select id="duration" className="input" value={duration} onChange={(e) => setDuration(e.target.value)}>
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-muted">The QR stops working after this.</p>
        </div>
      </div>

      <div>
        <Button id="use-location" variant="secondary" onClick={useMyLocation} busy={locBusy} aria-describedby="loc-status">
          <PinIcon className="h-4 w-4" />
          Use my current location as the classroom
        </Button>
        <div id="loc-status" className="mt-2" aria-live="polite">
          {coords && (
            <p className="text-sm font-medium text-success">
              Location set: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}, accurate to about {coords.accuracy} m.
            </p>
          )}
          {locError && <p className="text-sm font-medium text-danger">{locError}</p>}
          {errors.location && !coords && <p className="text-sm font-medium text-danger">{errors.location}</p>}
        </div>
      </div>

      {apiError != null && <ErrorNotice error={apiError} />}
      <Button type="submit" busy={busy}>
        Start session
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------ running session */

function RunningSession({ session, onEnded }: { session: ClassSession; onEnded: () => void }) {
  const { token, error: codeError, retry } = useRotatingCode(session.id);
  const now = useNow(250);
  const [items, setItems] = useState<CheckIn[] | null>(null);
  const [feedError, setFeedError] = useState<unknown>(null);
  const [feedKey, setFeedKey] = useState(0);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');
  const lastIssued = useRef<number | null>(null);

  useEffect(() => {
    setFeedError(null);
    return api.subscribeCheckIns({ sessionId: session.id }, (list) => setItems(list), setFeedError);
  }, [session.id, feedKey]);

  useEffect(() => {
    if (token && lastIssued.current !== null && lastIssued.current !== token.issuedAt) setRefreshNote('The QR code was refreshed.');
    if (token) lastIssued.current = token.issuedAt;
  }, [token]);

  const secondsLeft = token ? Math.max(0, Math.ceil((token.expiresAt - now) / 1000)) : 30;
  const progress = token ? Math.min(100, Math.max(0, ((token.expiresAt - now) / 30000) * 100)) : 100;
  const minsLeft = Math.max(0, Math.ceil((Date.parse(session.endsAt) - now) / 60000));

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function end() {
    setEnding(true);
    setEndError(null);
    try {
      await api.endSession(session.id);
      onEnded();
    } catch (e) {
      setEndError(e);
      setEnding(false);
    }
  }

  const counts = {
    APPROVED: items?.filter((c) => c.decision === 'APPROVED').length ?? 0,
    REVIEW: items?.filter((c) => c.decision === 'REVIEW').length ?? 0,
    REJECTED: items?.filter((c) => c.decision === 'REJECTED').length ?? 0,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section aria-labelledby="qr-h" className="card space-y-4 p-4 sm:p-5">
        <div>
          <h2 id="qr-h" className="text-lg font-semibold">
            {session.title}
          </h2>
          <p className="text-muted">
            Radius {session.radiusM} m, ends in about {minsLeft} min.
          </p>
        </div>

        {codeError != null && !token ? (
          <ErrorNotice error={codeError} onRetry={retry} />
        ) : (
          <>
            <div className="relative rounded-xl bg-white p-2">
              {token ? <QrImage value={token.code} label={`Class QR code. Text version: ${token.code}`} /> : <CardSkeleton lines={1} />}
              {/* Replays a short ring animation each time the code changes. */}
              <span key={token?.issuedAt} aria-hidden className="pointer-events-none absolute inset-0 rounded-xl motion-safe:animate-refresh" />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <p className="font-medium">
                  New code in <span className="tabular-nums">{secondsLeft}</span> s
                </p>
                {token && <p className="text-sm text-muted">Shown at {formatTime(token.issuedAt)}</p>}
              </div>
              <div aria-hidden className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
                <div className="h-full bg-brand" style={{ width: `${progress}%` }} />
              </div>
              <p className="sr-only" aria-live="polite">
                {refreshNote}
              </p>
            </div>

            {codeError != null && token && (
              <Notice tone="warning" title="Could not refresh the code">
                The code on screen may be out of date. Check your connection; we will keep trying.
              </Notice>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm">{token?.code ?? '...'}</code>
              <Button variant="secondary" onClick={copy} disabled={!token}>
                <CopyIcon className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy code'}
              </Button>
            </div>
            <p className="text-sm text-muted">Students who cannot scan can paste this code.</p>
          </>
        )}

        {endError != null && <ErrorNotice error={endError} />}
        <Button variant="danger" onClick={end} busy={ending}>
          End session
        </Button>
      </section>

      <section aria-labelledby="live-h" className="card min-w-0 self-start p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="live-h" className="text-lg font-semibold">
            Check-ins
          </h2>
          <p className="text-sm text-muted">
            {counts.APPROVED} approved, {counts.REVIEW} need review, {counts.REJECTED} rejected
          </p>
        </div>
        {feedError != null && (
          <Notice
            tone="warning"
            title="Live updates paused"
            className="mb-3"
            actions={
              <Button variant="secondary" onClick={() => setFeedKey((k) => k + 1)}>
                Reconnect
              </Button>
            }
          >
            Check your connection, then reconnect.
          </Notice>
        )}
        {items === null ? (
          <CardSkeleton lines={3} />
        ) : items.length === 0 ? (
          <EmptyState title="No check-ins yet">Students appear here as they finish. Show the QR code to the class.</EmptyState>
        ) : (
          <ul className="divide-y divide-line" aria-live="polite">
            {items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.studentName}</p>
                  <p className="text-sm text-muted">
                    {c.enrolmentNo}, {formatTime(c.at)}
                  </p>
                </div>
                <DecisionBadge decision={c.decision} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
