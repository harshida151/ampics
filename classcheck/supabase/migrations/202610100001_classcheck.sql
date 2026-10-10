create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  enrolment_no text not null unique,
  role text not null default 'student' check (role in ('student', 'instructor', 'admin')),
  consent_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.classcheck_create_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name, enrolment_no, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'fullName', ''),
    upper(coalesce(new.raw_user_meta_data->>'enrolmentNo', '')),
    'student'
  );
  return new;
end;
$$;

drop trigger if exists classcheck_auth_user_created on auth.users;
create trigger classcheck_auth_user_created after insert on auth.users
for each row execute procedure public.classcheck_create_profile();

create table if not exists public.face_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  embedding jsonb not null check (jsonb_typeof(embedding) = 'array' and jsonb_array_length(embedding) = 128),
  created_at timestamptz not null default now()
);
create index if not exists face_templates_user_id_idx on public.face_templates(user_id);

create or replace function public.enroll_face_templates(target_user_id uuid, input_embeddings jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if target_user_id is null then raise exception 'user id required'; end if;
  if jsonb_typeof(input_embeddings) <> 'array' or jsonb_array_length(input_embeddings) not between 3 and 8 then
    raise exception 'expected 3 to 8 templates';
  end if;
  perform pg_advisory_xact_lock(hashtext(target_user_id::text));
  if exists (select 1 from public.face_templates where user_id = target_user_id) then
    raise exception 'templates already exist';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id and consent_at is not null) then
    raise exception 'consent required';
  end if;
  insert into public.face_templates(user_id, embedding)
  select target_user_id, value from jsonb_array_elements(input_embeddings) value;
end;
$$;

create or replace function public.match_face(target_user_id uuid, query_embedding double precision[])
returns table(distance double precision) language sql stable security definer set search_path = public as $$
  select sqrt(sum(power((item.value #>> '{}')::double precision - query_embedding[item.ordinality], 2))) as distance
  from public.face_templates template
  cross join lateral jsonb_array_elements(template.embedding) with ordinality as item(value, ordinality)
  where template.user_id = target_user_id
  group by template.id
  order by distance
  limit 1;
$$;

create table if not exists public.device_keys (
  key_id text primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  public_jwk jsonb not null,
  device_label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  radius_m integer not null check (radius_m between 10 and 1000),
  duration_min integer not null check (duration_min between 1 and 240),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  instructor_id uuid not null references public.profiles(id),
  status text not null default 'open' check (status in ('open', 'closed'))
);
create index if not exists class_sessions_owner_idx on public.class_sessions(instructor_id, status, started_at desc);

create table if not exists public.attendance_challenges (
  nonce text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists attendance_challenges_user_idx on public.attendance_challenges(user_id, expires_at);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id),
  student_id uuid not null references public.profiles(id),
  at timestamptz not null default now(),
  decision text not null check (decision in ('APPROVED', 'REVIEW', 'REJECTED')),
  confidence integer not null check (confidence between 0 and 100),
  layers jsonb not null,
  reason text not null,
  resolved_by uuid references public.profiles(id),
  signals jsonb not null default '{}'::jsonb
);
create index if not exists check_ins_feed_idx on public.check_ins(at desc);
create index if not exists check_ins_student_recent_idx on public.check_ins(student_id, at desc);
create index if not exists check_ins_session_idx on public.check_ins(session_id, at desc);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  subject_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_action_idx on public.audit_logs(action, created_at desc);

alter table public.profiles enable row level security;
alter table public.face_templates enable row level security;
alter table public.device_keys enable row level security;
alter table public.class_sessions enable row level security;
alter table public.attendance_challenges enable row level security;
alter table public.check_ins enable row level security;
alter table public.audit_logs enable row level security;

grant execute on function public.enroll_face_templates(uuid, jsonb) to service_role;
revoke all on function public.enroll_face_templates(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.match_face(uuid, double precision[]) from public, anon, authenticated;
grant execute on function public.match_face(uuid, double precision[]) to service_role;