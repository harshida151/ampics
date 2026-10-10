export type DecisionState = 'APPROVED' | 'REVIEW' | 'REJECTED';
export type VerificationLayer = 'identity' | 'liveness' | 'location' | 'device' | 'token' | 'risk';

export interface DecisionInput {
  faceDistance: number | null;
  challenge: 'blink' | 'turn_head';
  blinkCount: number;
  maxYaw: number;
  location: { passed: boolean; score: number; reason?: string | null };
  devicePassed: boolean;
  tokenPassed: boolean;
  failuresIn10Minutes: number;
  checkInsIn15Seconds: number;
}

export interface DecisionLayer {
  passed: boolean;
  score: number;
  contribution: number;
  reason: string | null;
}

export interface DecisionResult {
  decision: DecisionState;
  score: number;
  confidence: number;
  layers: Record<VerificationLayer, DecisionLayer>;
  reasons: string[];
}

const WEIGHTS: Record<VerificationLayer, number> = {
  identity: 0.3,
  liveness: 0.2,
  location: 0.15,
  device: 0.15,
  token: 0.1,
  risk: 0.1,
};

export function decide(input: DecisionInput): DecisionResult {
  const distance = input.faceDistance;
  const identityScore = distance === null ? 0 : distance <= 0.4 ? 1 : distance > 0.55 ? 0 : (0.55 - distance) / 0.15;
  const identityPassed = distance !== null && distance <= 0.55;
  const livenessPassed = input.challenge === 'blink' ? input.blinkCount >= 2 : Math.abs(input.maxYaw) >= 0.18;
  const riskReasons: string[] = [];
  let riskScore = 1;
  if (input.failuresIn10Minutes >= 3) {
    riskScore -= 0.5;
    riskReasons.push('Three or more failed attempts in ten minutes.');
  } else if (input.failuresIn10Minutes >= 1) {
    riskScore -= 0.15;
    riskReasons.push('One or two failed attempts in ten minutes.');
  }
  if (input.checkInsIn15Seconds >= 8) {
    riskScore -= 0.4;
    riskReasons.push('Eight or more check-ins occurred in fifteen seconds.');
  }
  riskScore = Math.max(0, riskScore);

  const makeLayer = (passed: boolean, score: number, reason: string | null): DecisionLayer => ({
    passed,
    score: Math.max(0, Math.min(1, score)),
    contribution: Math.max(0, Math.min(1, score)) * WEIGHTS.identity,
    reason,
  });
  const layers: Record<VerificationLayer, DecisionLayer> = {
    identity: makeLayer(identityPassed, identityScore, identityPassed ? null : distance === null ? 'No matching face template was found.' : 'Face distance exceeded the acceptance threshold.'),
    liveness: makeLayer(livenessPassed, livenessPassed ? 1 : 0, livenessPassed ? null : 'The required liveness action was not detected.'),
    location: makeLayer(input.location.passed, input.location.score, input.location.reason ?? null),
    device: makeLayer(input.devicePassed, input.devicePassed ? 1 : 0, input.devicePassed ? null : 'Device signature did not match the registered device.'),
    token: makeLayer(input.tokenPassed, input.tokenPassed ? 1 : 0, input.tokenPassed ? null : 'QR token is invalid or expired.'),
    risk: makeLayer(riskReasons.length === 0, riskScore, riskReasons.length ? riskReasons.join(' ') : null),
  };
  for (const key of Object.keys(layers) as VerificationLayer[]) layers[key].contribution = layers[key].score * WEIGHTS[key];
  const score = Object.values(layers).reduce((sum, layer) => sum + layer.contribution, 0);
  const hardFailure = (['identity', 'liveness', 'location', 'device', 'token'] as const).some((key) => !layers[key].passed);
  const decision = hardFailure
    ? 'REJECTED'
    : score >= 0.8 && layers.risk.passed
      ? 'APPROVED'
      : score >= 0.55
        ? 'REVIEW'
        : 'REJECTED';
  const reasons = Object.values(layers).flatMap((layer) => layer.reason ? [layer.reason] : []);
  return { decision, score, confidence: Math.round(score * 100), layers, reasons };
}