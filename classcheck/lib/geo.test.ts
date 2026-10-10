import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkGeofence, haversineDistanceM } from './geo';

describe('geofence logic', () => {
  it('measures zero distance at the same point', () => {
    assert.equal(haversineDistanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  });
  it('passes the exact radius and scores accuracy separately', () => {
    const point = { lat: 0, lng: 0.001, accuracy: 25 };
    const center = { lat: 0, lng: 0 };
    assert.equal(checkGeofence(point, center, haversineDistanceM(point, center)).passed, true);
    assert.equal(checkGeofence({ lat: 0, lng: 0, accuracy: 25 }, { lat: 0, lng: 0 }, 0).score, 1);
    assert.equal(checkGeofence({ lat: 0, lng: 0, accuracy: 101 }, { lat: 0, lng: 0 }, 0).score, 0.5);
    assert.equal(checkGeofence({ lat: 0, lng: 0, accuracy: 0 }, { lat: 0, lng: 0 }, 0).score, 0.3);
  });
  it('fails when outside the radius', () => {
    assert.equal(checkGeofence({ lat: 0, lng: 0.01, accuracy: 1 }, { lat: 0, lng: 0 }, 100).passed, false);
  });
});