'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { detectFaceSample } from '@/lib/face';

export type Guidance = 'waiting' | 'centre' | 'good';
export const GUIDANCE: Record<Guidance, { text: string; tone: 'neutral' | 'warn' | 'good' }> = {
  waiting: { text: 'Fit your face inside the oval, then press Start capture.', tone: 'neutral' },
  centre: { text: 'Centre your face in the oval.', tone: 'warn' },
  good: { text: 'Face detected. Hold still.', tone: 'good' },
};

export function useFaceCapture({
  running,
  total,
  videoRef,
  onDone,
}: {
  running: boolean;
  total: number;
  videoRef: RefObject<HTMLVideoElement>;
  onDone: (templates: number[][]) => void;
}) {
  const [guidance, setGuidance] = useState<Guidance>('waiting');
  const [count, setCount] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!running) {
      setGuidance('waiting');
      setCount(0);
      return;
    }
    let cancelled = false;
    let timer = 0;
    const samples: number[][] = [];
    setError(null);
    setCount(0);
    const capture = async () => {
      const video = videoRef.current;
      try {
        const sample = video ? await detectFaceSample(video) : null;
        if (cancelled) return;
        if (sample) {
          samples.push(sample.descriptor);
          setGuidance('good');
          setCount(samples.length);
          if (samples.length >= total) {
            doneRef.current(samples);
            return;
          }
        } else {
          setGuidance('centre');
        }
        timer = window.setTimeout(capture, sample ? 700 : 250);
      } catch (cause) {
        if (!cancelled) {
          setError(cause);
          setGuidance('centre');
          timer = window.setTimeout(capture, 1500);
        }
      }
    };
    void capture();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [running, total, videoRef]);

  return { guidance, count, error };
}
