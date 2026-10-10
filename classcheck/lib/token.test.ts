import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createQrPayload, issueChallenge, verifyChallenge, verifyQrPayload } from './token';

describe('signed tokens', () => {
  it('accepts the current and previous QR windows only', () => {
    const now = 90_000;
    assert.equal(verifyQrPayload(createQrPayload('session_1', 3, 'qr-secret'), 'qr-secret', now)?.sessionId, 'session_1');
    assert.equal(verifyQrPayload(createQrPayload('session_1', 2, 'qr-secret'), 'qr-secret', now)?.window, 2);
    assert.equal(verifyQrPayload(createQrPayload('session_1', 1, 'qr-secret'), 'qr-secret', now), null);
    assert.equal(verifyQrPayload(createQrPayload('session_1', 4, 'qr-secret'), 'qr-secret', now), null);
  });
  it('binds a short-lived challenge to its user', () => {
    const issued = issueChallenge('user-1', 'blink', 1_000, 'challenge-secret');
    assert.equal(verifyChallenge(issued.token, 'user-1', 2_000, 'challenge-secret')?.kind, 'blink');
    assert.equal(verifyChallenge(issued.token, 'user-2', 2_000, 'challenge-secret'), null);
    assert.equal(verifyChallenge(issued.token, 'user-1', issued.expiresAt, 'challenge-secret'), null);
  });
});