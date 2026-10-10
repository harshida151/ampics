'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { CameraStage } from '@/components/CameraStage';
import { CheckIcon } from '@/components/icons';
import { Button, ButtonLink, CardSkeleton, ErrorNotice, Notice, PageLoading } from '@/components/ui';
import { GUIDANCE, useFaceCapture } from '@/hooks/useFaceCapture';
import { useCamera } from '@/hooks/useCamera';
import { useRequireRole } from '@/hooks/useRequireRole';
import * as api from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/format';
import type { Enrollment } from '@/lib/types';

const SAMPLES = 5;

export default function EnrollPage() {
  const { user, ready } = useRequireRole('student');
  const [enr, setEnr] = useState<Enrollment | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setEnr(null);
    try {
      setEnr(await api.getEnrollment());
    } catch (e) {
      setLoadError(e);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready || !user) return <PageLoading />;

  const allDone = !!enr?.consentAt && enr.faceEnrolled && enr.thisDeviceBound;

  return (
    <AppShell user={user} title="Enrol">
      <h1 className="text-2xl font-semibold">Set up your account</h1>
      <p className="mb-6 mt-1 max-w-prose text-muted">Do these steps once. You can change or delete them here at any time.</p>

      {loadError != null ? (
        <ErrorNotice error={loadError} onRetry={load} />
      ) : !enr ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="space-y-4">
          {allDone && (
            <Notice
              tone="success"
              title="You are ready to check in."
              actions={<ButtonLink href="/attend">Go to check in</ButtonLink>}
            >
              Consent, face template and device are all set.
            </Notice>
          )}
          <ConsentStep enr={enr} onChange={setEnr} />
          <DeviceStep enr={enr} onChange={setEnr} />
          <FaceStep enr={enr} onChange={setEnr} />
          <WithdrawStep enr={enr} onChange={setEnr} />
        </div>
      )}
    </AppShell>
  );
}

/* --------------------------------------------------------------------- shell */

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  const id = `step-${n}`;
  return (
    <section aria-labelledby={id} className="card p-5">
      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden
          className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold', done ? 'border-success bg-success text-on-solid' : 'border-field')}
        >
          {done ? <CheckIcon className="h-4 w-4" /> : n}
        </span>
        <h2 id={id} className="text-lg font-semibold">
          {title}
          {done && <span className="sr-only">, done</span>}
        </h2>
      </div>
      <div className="space-y-4 sm:pl-11">{children}</div>
    </section>
  );
}

interface StepProps {
  enr: Enrollment;
  onChange: (e: Enrollment) => void;
}

/* ------------------------------------------------------------------- consent */

function ConsentStep({ enr, onChange }: StepProps) {
  const has = !!enr.consentAt;
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [hint, setHint] = useState('');

  async function save() {
    if (!checked) {
      setHint('Tick the box to agree before saving.');
      return;
    }
    setHint('');
    setBusy(true);
    setError(null);
    try {
      onChange(await api.giveConsent());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Step n={1} title="Give consent" done={has}>
      <label className="flex min-h-[44px] items-start gap-3">
        <input
          type="checkbox"
          checked={has || checked}
          disabled={has}
          onChange={(e) => {
            setChecked(e.target.checked);
            setHint('');
          }}
          aria-describedby={hint ? 'consent-hint' : undefined}
          className="mt-0.5 h-6 w-6 shrink-0 accent-[color:var(--brand)]"
        />
        <span>I agree that my face becomes a numeric template. No photo is stored. I can withdraw my consent and delete the template at any time.</span>
      </label>
      {hint && (
        <p id="consent-hint" role="alert" className="text-sm font-medium text-danger">
          {hint}
        </p>
      )}
      {has ? (
        <p role="status" className="text-sm text-muted">
          Consent saved on {formatDateTime(enr.consentAt!)}.
        </p>
      ) : (
        <Button onClick={save} busy={busy}>
          Save consent
        </Button>
      )}
      {error != null && <ErrorNotice error={error} />}
    </Step>
  );
}

/* -------------------------------------------------------------------- device */

function DeviceStep({ enr, onChange }: StepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function register() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.registerDevice());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Step n={2} title="Register this device" done={enr.thisDeviceBound}>
      <p className="max-w-prose text-muted">Only your registered phone can check you in. If you change phones, register the new one here.</p>
      {enr.thisDeviceBound ? (
        <p role="status" className="font-medium">
          Registered: {enr.deviceLabel}.
        </p>
      ) : (
        <>
          {enr.deviceRegistered && (
            <Notice tone="warning" title="A different device is registered">
              That device is {enr.deviceLabel}. Registering this one replaces it.
            </Notice>
          )}
          <Button onClick={register} busy={busy}>
            Register this device
          </Button>
        </>
      )}
      {error != null && <ErrorNotice error={error} />}
    </Step>
  );
}

/* ---------------------------------------------------------------------- face */

function FaceStep({ enr, onChange }: StepProps) {
  const camera = useCamera('user');
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const hasConsent = !!enr.consentAt;
  const stopCamera = camera.stop;

  const finish = useCallback(async (templates: number[][]) => {
    setCapturing(false);
    setSaving(true);
    setError(null);
    try {
      onChange(await api.submitFaceTemplates(templates));
      stopCamera();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }, [onChange, stopCamera]);

  const { guidance, count, error: captureError } = useFaceCapture({ running: capturing, total: SAMPLES, videoRef: camera.videoRef, onDone: finish });
  const g = GUIDANCE[guidance];
  const showCapture = hasConsent && !enr.faceEnrolled;

  return (
    <Step n={3} title="Capture your face" done={enr.faceEnrolled}>
      {!hasConsent && <Notice tone="info">Save your consent in step 1 to unlock the camera.</Notice>}

      {hasConsent && enr.faceEnrolled && (
        <p role="status" className="font-medium">
          Face template saved on {formatDateTime(enr.faceEnrolledAt!)}. No photo was stored. Withdraw consent below before enrolling again.
        </p>
      )}

      {showCapture && (
        <>
          <p className="max-w-prose text-muted">We take {SAMPLES} numeric face samples. Images stay on this device.</p>
          <CameraStage camera={camera} caption={camera.status === 'live' ? g.text : undefined} tone={g.tone} />
          <div className="mx-auto flex max-w-sm items-center justify-between gap-3">
            <ol aria-label="Samples captured" className="flex gap-2">
              {Array.from({ length: SAMPLES }).map((_, i) => (
                <li key={i} aria-hidden className={cx('h-3 w-3 rounded-full border-2', i < count ? 'border-brand bg-brand' : 'border-field')} />
              ))}
            </ol>
            <p className="text-sm text-muted">
              {count} of {SAMPLES} samples
            </p>
          </div>
          <div className="mx-auto max-w-sm">
            {camera.status === 'live' && !capturing && !saving && (
              <Button onClick={() => setCapturing(true)} className="w-full">
                Start capture
              </Button>
            )}
            {capturing && (
              <Button variant="secondary" onClick={() => setCapturing(false)} className="w-full">
                Cancel
              </Button>
            )}
            {saving && (
              <p role="status" className="text-center text-muted">
                Saving your template.
              </p>
            )}
          </div>
        </>
      )}
      {captureError != null && <ErrorNotice error={captureError} />}
      {error != null && <ErrorNotice error={error} onRetry={() => setCapturing(true)} />}
    </Step>
  );
}

/* ------------------------------------------------------------------ withdraw */

function WithdrawStep({ enr, onChange }: StepProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const hasData = !!enr.consentAt || enr.faceEnrolled;

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.withdrawConsentAndDeleteFaceData());
      setConfirming(false);
      setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="withdraw-h" className="card p-5">
      <h2 id="withdraw-h" className="text-lg font-semibold">
        Withdraw consent
      </h2>
      <p className="mt-1 max-w-prose text-muted">This deletes your face template and removes your consent. You will not be able to check in until you enrol again.</p>
      <div className="mt-4 space-y-3">
        {!confirming && (
          <Button
            variant="danger"
            disabled={!hasData}
            onClick={() => {
              setDone(false);
              setConfirming(true);
            }}
          >
            Withdraw consent and delete my face data
          </Button>
        )}
        {!hasData && !done && <p className="text-sm text-muted">There is no face data to delete.</p>}
        {confirming && (
          <Notice
            tone="warning"
            title="Delete your face data?"
            actions={
              <>
                <Button variant="danger" busy={busy} onClick={withdraw}>
                  Yes, delete it
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </>
            }
          >
            This cannot be undone.
          </Notice>
        )}
        {done && (
          <Notice tone="success" title="Your face data is deleted.">
            Consent is withdrawn. To check in again, repeat steps 1 and 3.
          </Notice>
        )}
        {error != null && <ErrorNotice error={error} />}
      </div>
    </section>
  );
}
