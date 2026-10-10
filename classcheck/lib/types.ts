export type Role = 'student' | 'instructor' | 'admin';

export interface User {
  id: string;
  fullName: string;
  enrolmentNo: string;
  email: string;
  role: Role;
}

export interface Enrollment {
  consentAt: string | null;
  faceEnrolled: boolean;
  faceEnrolledAt: string | null;
  deviceRegistered: boolean;
  /** True when the device in use right now is the registered one. */
  thisDeviceBound: boolean;
  deviceLabel: string | null;
}

export type LayerKey = 'face' | 'liveness' | 'location' | 'device' | 'code' | 'behaviour';

export interface LayerResult {
  passed: boolean;
  /** 0 to 100, higher is better. */
  score: number;
  /** Plain-language explanation when the layer failed, otherwise null. */
  note: string | null;
}

export type Layers = Record<LayerKey, LayerResult>;

export type Decision = 'APPROVED' | 'REVIEW' | 'REJECTED';
export type DecisionFilter = 'ALL' | Decision;

export interface CheckIn {
  id: string;
  sessionId: string;
  sessionTitle: string;
  studentId: string;
  studentName: string;
  enrolmentNo: string;
  /** ISO timestamp */
  at: string;
  decision: Decision;
  /** 0 to 100 */
  confidence: number;
  layers: Layers;
  reason: string;
  resolvedBy: string | null;
}

export interface Coords {
  lat: number;
  lng: number;
  /** metres */
  accuracy: number;
}

export interface ClassSession {
  id: string;
  title: string;
  radiusM: number;
  durationMin: number;
  lat: number;
  lng: number;
  startedAt: string;
  endsAt: string;
  instructorId: string;
  status: 'open' | 'closed';
}

export interface CodeToken {
  code: string;
  /** epoch ms */
  issuedAt: number;
  /** epoch ms */
  expiresAt: number;
}
