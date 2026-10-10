'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unavailable' | 'error';

export interface CameraHandle {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: CameraStatus;
  message: string;
  start: () => Promise<void>;
  stop: () => void;
}

/** Opens the camera with getUserMedia. The stream never leaves the browser in this build. */
export function useCamera(facing: 'user' | 'environment' = 'user'): CameraHandle {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [message, setMessage] = useState('');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
    setMessage('');
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      setMessage('This browser cannot open the camera. Use a recent Chrome, Safari or Firefox, and open the site over HTTPS.');
      return;
    }
    setStatus('requesting');
    setMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setStatus('live');
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStatus('denied');
        setMessage('Camera access is blocked. Open your browser site settings, set Camera to Allow, then tap Try again.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setStatus('unavailable');
        setMessage('No camera was found. Plug in or enable a camera, then tap Try again.');
      } else if (name === 'NotReadableError') {
        setStatus('error');
        setMessage('Another app is using the camera. Close it, then tap Try again.');
      } else {
        setStatus('error');
        setMessage('The camera could not start. Reload the page and try again.');
      }
    }
  }, [facing]);

  // Attach the stream once the video element exists.
  useEffect(() => {
    const v = videoRef.current;
    if (status === 'live' && v && streamRef.current) {
      v.srcObject = streamRef.current;
      void v.play().catch(() => undefined);
    }
  }, [status]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { videoRef, status, message, start, stop };
}
