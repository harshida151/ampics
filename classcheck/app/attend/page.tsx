'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { CameraStage } from '@/components/CameraStage';
import { LayerLadder, type LadderStatus } from '@/components/LayerLadder';
import { QrScanner } from '@/components/QrScanner';
import { Button, ButtonLink, CardSkeleton, DecisionBadge, ErrorNotice, Notice, PageLoading } from '@/components/ui';
import { useCamera } from '@/hooks/useCamera';
import { detectFaceSample, type FaceSample } from '@/lib/face';
import { useRequireRole } from '@/hooks/useRequireRole';
import * as api from '@/lib/api';
import { cx } from '@/lib/cx';
import { GeoError, getCoords } from '@/lib/geo';
import { LAYER_KEYS } from '@/lib/layers';
import type { CheckIn, Coords, Enrollment, LayerKey } from '@/lib/types';

type Step = 'liveness' | 'code' | 'result';
type Phase = 'ready' | 'running' | 'locating';
type Challenge = { kind: 'blink' | 'turn_head'; nonce: string; token: string };
type Statuses = Record<LayerKey, LadderStatus>;

const initialStatuses = (): Statuses => ({ face: 'idle', liveness: 'idle', location: 'idle', device: 'idle', code: 'idle', behaviour: 'idle' });

export default function AttendPage() {
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

  const missing: string[] = [];
  if (enr) {
    if (!enr.consentAt || !enr.faceEnrolled) missing.push('Consent and face capture');
    if (!enr.thisDeviceBound) missing.push(enr.deviceRegistered ? 'Registering this device (another device is registered)' : 'Registering this device');
  }

  return (
    <AppShell user={user} title="Check in">
      <h1 className="mb-4 text-2xl font-semibold">Check in to class</h1>
      {loadError != null ? (
        <ErrorNotice error={loadError} onRetry={load} />
      ) : !enr ? (
        <CardSkeleton lines={4} />
      ) : missing.length > 0 ? (
        <Notice tone="warning" title="Finish setting up before you check in" actions={<ButtonLink href="/enroll">Go to Enrol</ButtonLink>}>
          <p>These steps are not done yet:</p>
          <ul className="mt-1 list-disc pl-5">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Notice>
      ) : (
        <AttendFlow />
      )}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ the flow */

function AttendFlow() {
  const camera = useCamera('user');
  const stopCamera = camera.stop;
  const [attempt, setAttempt] = useState(0);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [step, setStep] = useState<Step>('liveness');
  const [phase, setPhase] = useState<Phase>('ready');
  const [blinks, setBlinks] = useState(0);
  const [statuses, setStatuses] = useState<Statuses>(initialStatuses);
  const [scores, setScores] = useState<Partial<Record<LayerKey, number>>>({});
  const [geoWarning, setGeoWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [result, setResult] = useState<CheckIn | null>(null);

  const coordsRef = useRef<Coords | null>(null);
  const sampleRef = useRef<FaceSample | null>(null);
  const livenessTimer = useRef<number | null>(null);

  const mark = useCallback((patch: Partial<Statuses>) => setStatuses((s) => ({ ...s, ...patch })), []);
  useEffect(() => {
    let active = true;
    setChallenge(null);
    api.getAttendanceChallenge().then((value) => {
      if (active) setChallenge(value);
    }).catch(setSubmitError);
    return () => {
      active = false;
      if (livenessTimer.current !== null) window.clearTimeout(livenessTimer.current);
    };
  }, [attempt]);

  /* Liveness is measured locally; only landmarks-derived metrics and the descriptor are submitted. */
  function startLiveness() {
    if (!challenge) return;
    const issuedChallenge = challenge;
    const startedAt = Date.now();
    let eyesClosed = false;
    let blinkCount = 0;
    let maxYaw = 0;
    sampleRef.current = null;
    setSubmitError(null);
    setPhase('running');
    setBlinks(0);
    mark({ face: 'active', liveness: 'active' });
    const inspect = async () => {
      try {
        const video = camera.videoRef.current;
        const sample = video ? await detectFaceSample(video) : null;
        if (sample) {
          sampleRef.current = sample;
          maxYaw = Math.max(maxYaw, Math.abs(sample.noseOffset));
          if (sample.eyeAspectRatio < 0.2) eyesClosed = true;
          else if (eyesClosed && sample.eyeAspectRatio > 0.24) {
            blinkCount += 1;
            eyesClosed = false;
            setBlinks(blinkCount);
          }
        }
        const actionDone = issuedChallenge.kind === 'blink' ? blinkCount >= 2 : maxYaw >= 0.18;
        if (actionDone || Date.now() - startedAt >= 15_000) {
          if (!sampleRef.current) {
            setSubmitError(new Error('No face was detected. Centre your face in the camera and try again.'));
            setPhase('ready');
            return;
          }
          setLivenessMetrics({ blinkCount, maxYaw });
          await afterLiveness();
          return;
        }
        livenessTimer.current = window.setTimeout(() => void inspect(), 160);
      } catch (error) {
        setSubmitError(error);
        setPhase('ready');
      }
    };
    void inspect();
  }

  const [livenessMetrics, setLivenessMetrics] = useState({ blinkCount: 0, maxYaw: 0 });

  async function afterLiveness() {
    setPhase('locating');
    mark({ face: 'captured', liveness: 'captured', location: 'active' });
    try {
      coordsRef.current = await getCoords();
      mark({ location: 'captured' });
    } catch (e) {
      coordsRef.current = null;
      const msg = e instanceof GeoError ? e.message : 'Your location could not be read. Turn on Location and try again.';
      setGeoWarning(msg);
      mark({ location: 'failed' });
    }
    stopCamera();
    mark({ device: 'captured', code: 'active' });
    setStep('code');
  }

  /* Step 2: send everything for verification. */
  async function submit(code: string) {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    mark({ code: 'captured', behaviour: 'captured' });
    try {
      const res = await api.submitCheckIn({
        qr: code.trim(),
        nonce: challenge?.nonce ?? '',
        challengeToken: challenge?.token ?? '',
        embedding: sampleRef.current?.descriptor ?? [],
        blinkCount: livenessMetrics.blinkCount,
        maxYaw: livenessMetrics.maxYaw,
        coords: coordsRef.current,
      });
      const s = initialStatuses();
      const sc: Partial<Record<LayerKey, number>> = {};
      for (const k of LAYER_KEYS) {
        s[k] = res.layers[k].passed ? 'passed' : 'failed';
        sc[k] = res.layers[k].score;
      }
      setStatuses(s);
      setScores(sc);
      setResult(res);
      setStep('result');
    } catch (e) {
      setSubmitError(e);
      mark({ code: 'active', behaviour: 'idle' });
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    if (livenessTimer.current !== null) window.clearTimeout(livenessTimer.current);
    stopCamera();
    setAttempt((a) => a + 1);
    setStep('liveness');
    setPhase('ready');
    setBlinks(0);
    setStatuses(initialStatuses());
    setScores({});
    setGeoWarning(null);
    setSubmitError(null);
    setResult(null);
    setChallenge(null);
    setLivenessMetrics({ blinkCount: 0, maxYaw: 0 });
    sampleRef.current = null;
    coordsRef.current = null;
  }

  const caption =
    phase === 'ready'
      ? 'Fit your face inside the oval, then start the check.'
      : phase === 'locating'
        ? 'Liveness confirmed.'
        : challenge?.kind === 'blink'
          ? `Blink twice. Counted ${blinks} of 2.`
          : challenge
            ? 'Turn your head slowly from side to side.'
            : 'Preparing a secure liveness challenge.';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <StepIndicator current={step} />

        {geoWarning && step !== 'liveness' && (
          <Notice tone="warning" title="Location is off">
            {geoWarning} You can continue, but this check-in will probably need review.
          </Notice>
        )}

        {step === 'liveness' && (
          <section aria-labelledby="live-h" className="card space-y-4 p-4 sm:p-5">
            <div>
              <h2 id="live-h" className="text-lg font-semibold">
                Show that you are really here
              </h2>
              <p className="max-w-prose text-muted">
                {challenge?.kind === 'blink' ? 'Blink twice when prompted.' : challenge ? 'Turn your head slowly when prompted.' : 'Preparing your secure challenge.'}
              </p>
            </div>
            <CameraStage camera={camera} caption={caption} tone={phase === 'locating' ? 'good' : 'neutral'} />
            {submitError != null && <ErrorNotice error={submitError} onRetry={restart} />}
            <div className="mx-auto max-w-sm space-y-3">
              {camera.status === 'live' && phase === 'ready' && challenge && (
                <Button onClick={startLiveness} className="w-full">
                  Start liveness check
                </Button>
              )}
              {phase === 'running' && (
                <p role="status" className="text-center text-muted">
                  {challenge?.kind === 'blink' ? 'Checking your blinks.' : 'Checking your head turn.'}
                </p>
              )}
              {phase === 'locating' && (
                <p role="status" className="text-center text-muted">
                  Checking your location. Tap Allow if your browser asks.
                </p>
              )}
            </div>
          </section>
        )}

        {step === 'code' && (
          <section aria-labelledby="code-h" className="card space-y-4 p-4 sm:p-5">
            <div>
              <h2 id="code-h" className="text-lg font-semibold">
                Scan the class QR code
              </h2>
              <p className="max-w-prose text-muted">Point your camera at the QR code on the instructor screen. It changes every 30 seconds, so scan it now.</p>
            </div>
            <QrScanner onCode={submit} busy={submitting} />
            {submitting && (
              <p role="status" className="text-muted">
                Verifying your check-in.
              </p>
            )}
            {submitError != null && <ErrorNotice error={submitError} />}
          </section>
        )}

        {step === 'result' && result && <ResultCard checkIn={result} onRestart={restart} />}
      </div>

      <aside aria-label="Verification progress" className="card self-start p-4 sm:p-5 lg:sticky lg:top-4">
        <h2 className="mb-4 text-lg font-semibold">Verification layers</h2>
        <LayerLadder items={LAYER_KEYS.map((k) => ({ key: k, status: statuses[k], score: scores[k] }))} />
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------ small pieces */

const STEPS: { key: Step; label: string }[] = [
  { key: 'liveness', label: 'Liveness' },
  { key: 'code', label: 'Class code' },
  { key: 'result', label: 'Result' },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Progress">
      <p className="mb-2 text-sm text-muted">
        Step {idx + 1} of {STEPS.length}
      </p>
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            aria-current={i === idx ? 'step' : undefined}
            className={cx('border-t-4 pt-1 text-sm font-medium', i < idx ? 'border-brand text-ink' : i === idx ? 'border-brand-text text-brand-text' : 'border-line text-muted')}
          >
            {s.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ResultCard({ checkIn, onRestart }: { checkIn: CheckIn; onRestart: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const bar = checkIn.decision === 'APPROVED' ? 'bg-success' : checkIn.decision === 'REVIEW' ? 'bg-warning' : 'bg-danger';

  return (
    <section aria-labelledby="result-h" className="card space-y-4 p-5">
      <h2 id="result-h" ref={heading} tabIndex={-1} className="text-lg font-semibold">
        Check-in result
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <DecisionBadge decision={checkIn.decision} large />
        <p className="text-muted">{checkIn.sessionTitle}</p>
      </div>
      <div>
        <p className="text-sm text-muted">Confidence</p>
        <p className="text-4xl font-semibold tabular-nums">{checkIn.confidence}%</p>
        <div aria-hidden className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
          <div className={cx('h-full', bar)} style={{ width: `${checkIn.confidence}%` }} />
        </div>
      </div>
      <p className="max-w-prose text-base">{checkIn.reason}</p>
      <Button onClick={onRestart} variant={checkIn.decision === 'APPROVED' ? 'secondary' : 'primary'}>
        {checkIn.decision === 'APPROVED' ? 'Done' : 'Try again'}
      </Button>
    </section>
  );
}
