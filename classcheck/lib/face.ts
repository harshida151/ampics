'use client';

export interface FaceSample {
  descriptor: number[];
  eyeAspectRatio: number;
  noseOffset: number;
}

type FaceApiModule = typeof import('@vladmandic/face-api');
let faceapiModule: FaceApiModule | null = null;
let models: Promise<void> | null = null;

async function getFaceApi(): Promise<FaceApiModule> {
  if (!faceapiModule) {
    faceapiModule = await import('@vladmandic/face-api');
  }
  return faceapiModule;
}

async function loadModels(): Promise<void> {
  if (!models) {
    const faceapi = await getFaceApi();
    const base = process.env.NEXT_PUBLIC_FACE_MODELS_URL ?? 'https://cdn.jsdelivr.net/gh/vladmandic/face-api/model';
    models = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(base),
      faceapi.nets.faceLandmark68Net.loadFromUri(base),
      faceapi.nets.faceRecognitionNet.loadFromUri(base),
    ]).then(() => undefined).catch((error) => {
      models = null;
      throw error;
    });
  }
  return models;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeRatio(points: { x: number; y: number }[]): number {
  return (distance(points[1], points[5]) + distance(points[2], points[4])) / (2 * distance(points[0], points[3]));
}

export async function detectFaceSample(video: HTMLVideoElement): Promise<FaceSample | null> {
  if (typeof window === 'undefined') return null;
  const faceapi = await getFaceApi();
  await loadModels();
  if (video.readyState < 2) return null;
  const result = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!result) return null;
  const positions = result.landmarks.positions;
  const nose = positions[30];
  const eyeRatioMean = (eyeRatio(positions.slice(36, 42)) + eyeRatio(positions.slice(42, 48))) / 2;
  const centerX = result.detection.box.x + result.detection.box.width / 2;
  return {
    descriptor: Array.from(result.descriptor),
    eyeAspectRatio: eyeRatioMean,
    noseOffset: (nose.x - centerX) / result.detection.box.width,
  };
}