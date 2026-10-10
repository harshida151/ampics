-- ============================================================================
-- ClassCheck Supabase Postgres Schema
-- File: supabase/schema.sql
-- Idempotent script for Supabase SQL Editor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 2. PROFILES TABLE & SIGNUP TRIGGER
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  enrollment_no text,
  role text not null default 'student' check (role in ('student', 'instructor', 'admin')),
  biometric_consent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Ensure all required columns exist if the table was previously created
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists enrollment_no text;
alter table public.profiles add column if not exists role text not null default 'student' check (role in ('student', 'instructor', 'admin'));
alter table public.profiles add column if not exists biometric_consent_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Trigger function: creates profile automatically on user signup
-- CRITICAL SECURITY RULE: The trigger NEVER reads role from raw_user_meta_data,
-- preventing users from self-promoting to instructor or admin during registration.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    enrollment_no,
    role,
    biometric_consent_at,
    created_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'fullName', ''),
    upper(coalesce(new.raw_user_meta_data->>'enrollment_no', new.raw_user_meta_data->>'enrolmentNo', '')),
    'student', -- ALWAYS hardcoded to 'student'
    null,
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end,
    enrollment_no = coalesce(public.profiles.enrollment_no, excluded.enrollment_no);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. ORG_SETTINGS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.org_settings (
  id integer primary key default 1 check (id = 1),
  weights jsonb not null default '{"identity": 0.30, "liveness": 0.20, "location": 0.15, "device": 0.15, "token": 0.10, "risk": 0.10}'::jsonb,
  approve_at numeric(4,2) not null default 0.80,
  review_at numeric(4,2) not null default 0.55,
  identity_max_distance numeric(4,2) not null default 0.55,
  gps_max_accuracy_m numeric not null default 100,
  retention_days integer not null default 365,
  updated_at timestamptz not null default now()
);

-- Seed the single settings row if not present
insert into public.org_settings (
  id,
  weights,
  approve_at,
  review_at,
  identity_max_distance,
  gps_max_accuracy_m,
  retention_days
)
values (
  1,
  '{"identity": 0.30, "liveness": 0.20, "location": 0.15, "device": 0.15, "token": 0.10, "risk": 0.10}'::jsonb,
  0.80,
  0.55,
  0.55,
  100,
  365
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. FACE_TEMPLATES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.face_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  embedding vector(128) not null,
  created_at timestamptz not null default now()
);

create index if not exists face_templates_user_id_idx
  on public.face_templates(user_id);

-- ----------------------------------------------------------------------------
-- 5. DEVICES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  key_id text not null unique,
  public_key jsonb not null,
  label text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now()
);

-- Enforce exactly one active device per user
create unique index if not exists devices_user_id_active_idx
  on public.devices(user_id)
  where status = 'active';

-- ----------------------------------------------------------------------------
-- 6. CLASS_SESSIONS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null check (radius_m between 10 and 5000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists class_sessions_instructor_idx
  on public.class_sessions(instructor_id, starts_at desc);

-- ----------------------------------------------------------------------------
-- 7. NONCES TABLE (REPLAY PROTECTION)
-- ----------------------------------------------------------------------------
create table if not exists public.nonces (
  nonce text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists nonces_user_id_idx
  on public.nonces(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 8. ATTENDANCE TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null check (decision in ('APPROVED', 'REVIEW', 'REJECTED')),
  score numeric not null,
  layers jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

-- Partial unique index: only one APPROVED or REVIEW check-in per session per student
create unique index if not exists attendance_session_user_approved_review_idx
  on public.attendance(session_id, user_id)
  where decision in ('APPROVED', 'REVIEW');

-- Queries filtered by student and creation time
create index if not exists attendance_user_created_idx
  on public.attendance(user_id, created_at desc);

-- Queries filtered by review decision and creation time
create index if not exists attendance_decision_created_idx
  on public.attendance(decision, created_at desc);

-- ----------------------------------------------------------------------------
-- 9. AUDIT_LOGS TABLE (APPEND-ONLY)
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor text,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx
  on public.audit_logs(created_at desc);

-- Function and trigger to ensure audit_logs is append-only
create or replace function public.prevent_audit_logs_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only: updates and deletes are prohibited.';
  return null;
end;
$$;

drop trigger if exists trg_audit_logs_append_only on public.audit_logs;
create trigger trg_audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_logs_modification();

-- ----------------------------------------------------------------------------
-- 10. FUNCTIONS
-- ----------------------------------------------------------------------------

-- match_face: calculates the minimum Euclidean distance (<->) across user's face templates
create or replace function public.match_face(
  p_user uuid,
  p_embedding vector(128)
)
returns double precision
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  min_distance double precision;
begin
  select min(embedding <-> p_embedding)
  into min_distance
  from public.face_templates
  where user_id = p_user;

  return min_distance;
end;
$$;

-- Secure match_face: accessible only to service_role
revoke all on function public.match_face(uuid, vector(128)) from public, anon, authenticated;
grant execute on function public.match_face(uuid, vector(128)) to service_role;

-- purge_expired: deletes nonces older than 1 day and attendance older than retention_days
create or replace function public.purge_expired()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer;
begin
  -- 1. Purge nonces older than 24 hours
  delete from public.nonces
  where created_at < now() - interval '1 day';

  -- 2. Retrieve retention_days from org_settings (fallback 365 days)
  select coalesce(retention_days, 365)
  into v_retention_days
  from public.org_settings
  where id = 1;

  if v_retention_days is null then
    v_retention_days := 365;
  end if;

  -- 3. Purge attendance records older than retention period
  delete from public.attendance
  where created_at < now() - (v_retention_days || ' days')::interval;
end;
$$;

-- Secure purge_expired: accessible only to service_role
revoke all on function public.purge_expired() from public, anon, authenticated;
grant execute on function public.purge_expired() to service_role;

-- ----------------------------------------------------------------------------
-- 11. SECURITY & ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.org_settings enable row level security;
alter table public.face_templates enable row level security;
alter table public.devices enable row level security;
alter table public.class_sessions enable row level security;
alter table public.nonces enable row level security;
alter table public.attendance enable row level security;
alter table public.audit_logs enable row level security;

-- The only client-facing policy: users can select their own profile row.
-- All other tables and modifications are restricted to server-side service-role requests.
drop policy if exists "Users can select own profile" on public.profiles;
create policy "Users can select own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- ============================================================================
-- 12. ROLE PROMOTION EXAMPLES (RUN AS NEEDED IN SQL EDITOR)
-- ============================================================================
-- To promote an existing user to 'admin' by email:
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@classcheck.test');

-- To promote an existing user to 'instructor' by email:
-- UPDATE public.profiles
-- SET role = 'instructor'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'instructor@classcheck.test');

-- To view all registered users and their assigned roles:
-- SELECT p.id, u.email, p.full_name, p.enrollment_no, p.role, p.created_at
-- FROM public.profiles p
-- JOIN auth.users u ON u.id = p.id
-- ORDER BY p.created_at DESC;
