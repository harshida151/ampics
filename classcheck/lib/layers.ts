import type { LayerKey } from './types';

export const LAYER_META: { key: LayerKey; label: string; chip: string; hint: string }[] = [
  { key: 'face', label: 'Face match', chip: 'Face', hint: 'Matches your enrolled face template' },
  { key: 'liveness', label: 'Liveness', chip: 'Live', hint: 'Blink twice or turn your head' },
  { key: 'location', label: 'Location', chip: 'Location', hint: 'Inside the classroom radius' },
  { key: 'device', label: 'Device', chip: 'Device', hint: 'Your registered phone' },
  { key: 'code', label: 'Class code', chip: 'Code', hint: 'Live QR that changes every 30 seconds' },
  { key: 'behaviour', label: 'Behaviour', chip: 'Behaviour', hint: 'Timing and usage pattern' },
];

export const LAYER_KEYS: LayerKey[] = LAYER_META.map((l) => l.key);
