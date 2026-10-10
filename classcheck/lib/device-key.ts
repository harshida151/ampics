'use client';

interface DeviceKeyRecord { userId: string; privateKey: CryptoKey; publicJwk: JsonWebKey; keyId: string }

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('classcheck-device-keys', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys', { keyPath: 'userId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readKey(userId: string): Promise<DeviceKeyRecord | null> {
  const database = await openStore();
  return new Promise((resolve, reject) => {
    const request = database.transaction('keys', 'readonly').objectStore('keys').get(userId);
    request.onsuccess = () => resolve((request.result as DeviceKeyRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeKey(record: DeviceKeyRecord): Promise<void> {
  const database = await openStore();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction('keys', 'readwrite').objectStore('keys').put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function keyFingerprint(jwk: JsonWebKey): Promise<string> {
  const bytes = new TextEncoder().encode(`${jwk.x}${jwk.y}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function ensureDeviceKey(userId: string): Promise<{ publicJwk: JsonWebKey; keyId: string }> {
  const existing = await readKey(userId);
  if (existing) return { publicJwk: existing.publicJwk, keyId: existing.keyId };
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const keyId = await keyFingerprint(publicJwk);
  await writeKey({ userId, privateKey: pair.privateKey, publicJwk, keyId });
  return { publicJwk, keyId };
}

export async function getDeviceKeyId(userId: string): Promise<string | null> {
  return (await readKey(userId))?.keyId ?? null;
}

export async function signDeviceMessage(userId: string, value: string): Promise<{ keyId: string; signature: string }> {
  const record = await readKey(userId);
  if (!record) throw new Error('This device has no registered signing key. Register it on the Enrol page.');
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, record.privateKey, new TextEncoder().encode(value));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { keyId: record.keyId, signature: encoded };
}
