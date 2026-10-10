'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { CameraStage } from './CameraStage';
import { Button, Field, Notice } from './ui';

interface Detector {
  detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (o: { formats: string[] }) => Detector;

export function QrScanner({ onCode, busy }: { onCode: (code: string, via: 'scan' | 'paste') => void; busy: boolean }) {
  const camera = useCamera('environment');
  const [supported, setSupported] = useState(true);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState('');
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const last = useRef({ code: '', at: 0 });

  useEffect(() => {
    setSupported('BarcodeDetector' in window);
  }, []);

  useEffect(() => {
    if (camera.status !== 'live' || !supported || busy) return;
    const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
    const detector = new Ctor({ formats: ['qr_code'] });
    let stopped = false;
    const id = setInterval(async () => {
      const v = camera.videoRef.current;
      if (stopped || !v || v.readyState < 2) return;
      try {
        const found = await detector.detect(v);
        const value = found[0]?.rawValue;
        // Ignore the same code for 4 seconds so a rejected code is not resent in a loop.
        if (value && !(value === last.current.code && Date.now() - last.current.at < 4000)) {
          last.current = { code: value, at: Date.now() };
          stopped = true;
          onCodeRef.current(value, 'scan');
        }
      } catch {
        /* a frame failed to decode; try the next one */
      }
    }, 350);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [camera.status, camera.videoRef, supported, busy]);

  function submitManual(e: FormEvent) {
    e.preventDefault();
    if (!manual.trim()) {
      setManualError('Enter the code shown under the instructor QR, then submit.');
      return;
    }
    setManualError('');
    onCodeRef.current(manual.trim(), 'paste');
  }

  return (
    <div className="space-y-5">
      <CameraStage camera={camera} showOval={false} mirror={false} aspect="aspect-square" idleLabel="Turn on camera to scan">
        <div aria-hidden className="absolute left-1/2 top-1/2 h-3/5 w-3/5 -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 border-white/90" />
      </CameraStage>

      {!supported && (
        <Notice tone="info" title="This browser cannot read QR codes automatically">
          Paste the code shown under the instructor QR instead.
        </Notice>
      )}

      <form onSubmit={submitManual} noValidate className="space-y-3">
        <Field
          id="manual-code"
          label="Or paste the class code"
          hint="The instructor screen shows the code as text under the QR."
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          error={manualError}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="CC1-..."
        />
        <Button type="submit" variant="secondary" busy={busy}>
          Submit code
        </Button>
      </form>
    </div>
  );
}
