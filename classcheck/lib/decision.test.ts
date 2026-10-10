import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide } from './decision';

const validInput = {
  faceDistance: 0.35,
  challenge: 'blink' as const,
  blinkCount: 2,
  maxYaw: 0,
  location: { passed: true, score: 1 },
  devicePassed: true,
  tokenPassed: true,
  failuresIn10Minutes: 0,
  checkInsIn15Seconds: 0,
};

describe('decision engine', () => {
  it('approves a fully passing low-risk check and reports contributions', () => {
    const result = decide(validInput);
    assert.equal(result.decision, 'APPROVED');
    assert.ok(Math.abs(result.layers.identity.contribution - 0.3) < 1e-10);
  });
  it('hard rejects failed identity regardless of aggregate score', () => {
    assert.equal(decide({ ...validInput, faceDistance: 0.56 }).decision, 'REJECTED');
  });
  it('applies attempt and burst penalties', () => {
    const result = decide({ ...validInput, failuresIn10Minutes: 3, checkInsIn15Seconds: 8 });
    assert.ok(Math.abs(result.layers.risk.score - 0.1) < 1e-10);
    assert.notEqual(result.decision, 'APPROVED');
  });
  it('requires the requested liveness metric', () => {
    assert.equal(decide({ ...validInput, blinkCount: 1 }).layers.liveness.passed, false);
  });
});