import type { Coords } from './types';

export class GeoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeoError';
  }
}

export interface GeoCheck {
  passed: boolean;
  score: number;
  distanceM: number;
  reason: string | null;
}

export function haversineDistanceM(a: Pick<Coords, 'lat' | 'lng'>, b: Pick<Coords, 'lat' | 'lng'>): number {
  const earthRadiusM = 6_371_000;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = radians(b.lat - a.lat);
  const lngDelta = radians(b.lng - a.lng);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(haversine));
}

export function checkGeofence(
  point: Coords,
  center: Pick<Coords, 'lat' | 'lng'>,
  radiusM: number,
): GeoCheck {
  const distanceM = haversineDistanceM(point, center);
  const passed = distanceM <= radiusM;
  const score = !passed ? 0 : point.accuracy === 0 ? 0.3 : point.accuracy > 100 ? 0.5 : 1;
  return {
    passed,
    score,
    distanceM,
    reason: !passed
      ? 'Outside the classroom geofence.'
      : point.accuracy === 0
        ? 'Location accuracy is exactly zero, which may indicate spoofed GPS.'
        : point.accuracy > 100
          ? 'Location accuracy is worse than 100 metres.'
          : null,
  };
}

/** Reads the device location. Rejects with a GeoError whose message says how to fix the problem. */
export function getCoords(timeoutMs = 10000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeoError('This browser cannot share location. Use a recent browser and open the site over HTTPS.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new GeoError('Location is blocked for this site. Open your browser site settings, set Location to Allow, then try again.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new GeoError('Finding your location took too long. Check that Location is on and try again near a window.'));
        } else {
          reject(new GeoError('Your device could not work out where it is. Turn on Location services and try again.'));
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}
