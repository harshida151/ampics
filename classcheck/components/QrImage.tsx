'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Skeleton } from './ui';

/** QR stays dark on white in both themes so cameras can read it. */
export function QrImage({ value, label, size = 480 }: { value: string; label: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#10222f', light: '#ffffff' } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (!src) return <Skeleton className="aspect-square w-full" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={label} width={size} height={size} className="aspect-square w-full rounded-lg" />;
}
