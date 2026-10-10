# ClassCheck

Mobile-first PWA for a six-layer attendance check: face match, liveness, GPS geofence,
device binding, rotating 30-second QR, and a behaviour/risk check. Next.js 14 (App Router),
TypeScript, Tailwind CSS, Supabase Auth and Postgres.

## Run

```bash
npm install
npm test
npm run typecheck
npm run dev        # http://localhost:3000
```

## Supabase setup

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set the project URL, the public anon key, the server-only service-role key, and two distinct
   high-entropy secrets for `QR_SECRET` and `CHALLENGE_SECRET`. Never prefix the service-role
   key or signing secrets with `NEXT_PUBLIC_`.
3. Run `supabase/migrations/202610100001_classcheck.sql` in the Supabase SQL Editor.
4. Enable email/password sign-in in Supabase Auth. New signups create student profiles from
   `fullName` and `enrolmentNo` auth metadata. Assign instructor/admin roles only to trusted
   accounts by updating `public.profiles.role` from the SQL Editor.
5. Set `NEXT_PUBLIC_FACE_MODELS_URL` to a same-origin directory containing the
   `tiny_face_detector`, `face_landmark_68`, and `face_recognition` model weights. When omitted,
   the app loads these browser models from the vladmandic face-api model CDN.

Face images are processed only in the browser. Enrollment stores 3 to 8 numeric 128-value
descriptors; attendance sends one descriptor, blink/head-turn metrics, location, a challenge
nonce, and a device signature. The device's non-extractable P-256 private key is stored in
IndexedDB. Server handlers verify Supabase access tokens and use the service-role key only
server-side. Face matching runs through the `match_face` Postgres RPC.

Camera and location need a secure context. `localhost` works. On a phone, use an HTTPS
tunnel (for example `npx localtunnel --port 3000`) or deploy a preview.

The service worker registers only in production (`npm run build && npm start`). Camera and
location require a secure context. On a phone, use an HTTPS tunnel or deploy a preview.

## Flow

1. Instructor: start a session (use current location), keep the tab open.
2. Student: enrol consent, the current device, and five face samples, then check in with the
   live liveness challenge and instructor QR. Paste the code if QR scanning is unavailable.
3. Admin: monitor check-ins, resolve reviews, and export CSV.

## API and tests

API route handlers are under `app/api`. Protected endpoints require a Supabase access token in
`Authorization: Bearer <token>`. Pure geofence, token-signature, and decision logic live in
`lib/geo.ts`, `lib/token.ts`, and `lib/decision.ts`; their unit tests use Node's native
`node:test` runner via `npm test`. Admin CSV export escapes formula-leading cells.

## Structure

```
app/            pages and API route handlers
components/     LayerLadder (signature element), CameraStage, QrScanner, ui primitives
hooks/          camera and model-backed face capture, useRotatingCode, useRequireRole
lib/api.ts      authenticated browser API client
lib/server/     service-role Supabase auth, audit, and error helpers
supabase/       database migration and match/enrollment RPCs
```
