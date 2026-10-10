import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type ChallengeKind = 'blink' | 'turn_head';

function equalSignature(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, 'hex');
  const actualBytes = Buffer.from(actual, 'hex');
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function hmac(secret: string | undefined, value: string): string {
  if (!secret) throw new Error('A required signing secret is not configured.');
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function createQrPayload(sessionId: string, window = Math.floor(Date.now() / 30_000), secret = process.env.QR_SECRET): string {
  const body = `${sessionId}.${window}`;
  return `${body}.${hmac(secret, body)}`;
}

export function verifyQrPayload(payload: string, secret = process.env.QR_SECRET, now = Date.now()): { sessionId: string; window: number } | null {
  const parts = payload.split('.');
  if (parts.length !== 3 || !/^[a-zA-Z0-9_-]{1,128}$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return null;
  const window = Number(parts[1]);
  const currentWindow = Math.floor(now / 30_000);
  if (!Number.isSafeInteger(window) || window > currentWindow || window < currentWindow - 1) return null;
  try {
    return equalSignature(hmac(secret, `${parts[0]}.${window}`), parts[2])
      ? { sessionId: parts[0], window }
      : null;
  } catch {
    return null;
  }
}

export interface ChallengeClaims {
  userId: string;
  nonce: string;
  kind: ChallengeKind;
  issuedAt: number;
  expiresAt: number;
}

export function issueChallenge(userId: string, kind?: ChallengeKind, now = Date.now(), secret = process.env.CHALLENGE_SECRET): { nonce: string; kind: ChallengeKind; token: string; expiresAt: number } {
  const selectedKind = kind ?? (randomBytes(1)[0] % 2 === 0 ? 'blink' : 'turn_head');
  const claims: ChallengeClaims = {
    userId,
    nonce: randomBytes(32).toString('base64url'),
    kind: selectedKind,
    issuedAt: now,
    expiresAt: now + 3 * 60_000,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { nonce: claims.nonce, kind: claims.kind, token: `${body}.${hmac(secret, body)}`, expiresAt: claims.expiresAt };
}

export function verifyChallenge(token: string, userId: string, now = Date.now(), secret = process.env.CHALLENGE_SECRET): ChallengeClaims | null {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  try {
    if (!equalSignature(hmac(secret, body), signature)) return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ChallengeClaims;
    if (
      claims.userId !== userId ||
      !/^[A-Za-z0-9_-]{40,64}$/.test(claims.nonce) ||
      !['blink', 'turn_head'].includes(claims.kind) ||
      !Number.isSafeInteger(claims.issuedAt) ||
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.expiresAt <= now ||
      claims.issuedAt > now ||
      claims.expiresAt - claims.issuedAt > 3 * 60_000
    ) return null;
    return claims;
  } catch {
    return null;
  }
}