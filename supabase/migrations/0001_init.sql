-- Anderson's Swim Tracker — initial schema, RLS, and PR trigger.
-- Stores swim-meet results, USA Swimming time standards, and goals.
-- Times are stored as integer milliseconds for exact ordering.
--
-- Tables: profiles, swimmers, events, meets, results, time_standards,
--         goals, pdf_uploads, allowed_signups.
-- All user-owned tables enforce row-level security; catalog tables are
-- world-readable to any authenticated user.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.course as enum ('SCY', 'SCM', 'LCM');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stroke as enum ('FR', 'BK', 'BR', 'FL', 'IM');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender as enum ('M', 'F');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.standard_level as enum ('B', 'BB', 'A', 'AA', 'AAA', 'AAAA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.parse_status as enum ('pending', 'parsed', 'confirmed', 'failed', 'duplicate');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users entry
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  is_parent     boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_self" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- swimmers — owned by a profile
-- ---------------------------------------------------------------------------

create table if not exists public.swimmers (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  name             text not null,
  birthdate        date not null,
  gender           public.gender not null,
  usa_swimming_id  text,
  created_at       timestamptz not null default now()
);

create index if not exists swimmers_owner_idx on public.swimmers(owner_id);

alter table public.swimmers enable row level security;

create policy "swimmers_select_owner" on public.swimmers
  for select using (auth.uid() = owner_id);

create policy "swimmers_insert_owner" on public.swimmers
  for insert with check (auth.uid() = owner_id);

create policy "swimmers_update_owner" on public.swimmers
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "swimmers_delete_owner" on public.swimmers
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- events — static catalog (seeded)
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id          serial primary key,
  distance_m  integer not null,
  stroke      public.stroke not null,
  course      public.course not null,
  unique (distance_m, stroke, course)
);

alter table public.events enable row level security;

create policy "events_select_authenticated" on public.events
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- meets — created on PDF upload or manual entry
-- ---------------------------------------------------------------------------

create table if not exists public.meets (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  location     text,
  start_date   date not null,
  end_date     date,
  course       public.course not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (name, start_date)
);

create index if not exists meets_start_date_idx on public.meets(start_date desc);

alter table public.meets enable row level security;

create policy "meets_select_authenticated" on public.meets
  for select to authenticated using (true);

create policy "meets_insert_authenticated" on public.meets
  for insert to authenticated with check (auth.uid() = created_by);

create policy "meets_update_creator" on public.meets
  for update to authenticated using (auth.uid() = created_by) with check (auth.uid() = created_by);

-- ---------------------------------------------------------------------------
-- results
-- ---------------------------------------------------------------------------

create table if not exists public.results (
  id           uuid primary key default gen_random_uuid(),
  swimmer_id   uuid not null references public.swimmers(id) on delete cascade,
  meet_id      uuid not null references public.meets(id) on delete cascade,
  event_id     integer not null references public.events(id),
  time_ms      integer not null check (time_ms > 0),
  place        integer,
  age_at_meet  integer not null check (age_at_meet >= 0),
  splits       jsonb,
  is_pr        boolean not null default false,
  dq           boolean not null default false,
  exhibition   boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (swimmer_id, meet_id, event_id)
);

create index if not exists results_progression_idx
  on public.results (swimmer_id, event_id, time_ms);

create index if not exists results_pr_idx
  on public.results (swimmer_id, event_id)
  where is_pr;

create index if not exists results_meet_idx
  on public.results (meet_id);

alter table public.results enable row level security;

-- Results are accessible only via the owning swimmer.
create policy "results_select_via_swimmer" on public.results
  for select using (
    exists (
      select 1 from public.swimmers s
      where s.id = results.swimmer_id and s.owner_id = auth.uid()
    )
  );

create policy "results_insert_via_swimmer" on public.results
  for insert with check (
    exists (
      select 1 from public.swimmers s
      where s.id = results.swimmer_id and s.owner_id = auth.uid()
    )
  );

create policy "results_update_via_swimmer" on public.results
  for update using (
    exists (
      select 1 from public.swimmers s
      where s.id = results.swimmer_id and s.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.swimmers s
      where s.id = results.swimmer_id and s.owner_id = auth.uid()
    )
  );

create policy "results_delete_via_swimmer" on public.results
  for delete using (
    exists (
      select 1 from public.swimmers s
      where s.id = results.swimmer_id and s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- time_standards — USA Swimming Motivational Times
-- ---------------------------------------------------------------------------

create table if not exists public.time_standards (
  id         serial primary key,
  event_id   integer not null references public.events(id),
  age_min    integer not null,
  age_max    integer not null,
  gender     public.gender not null,
  standard   public.standard_level not null,
  time_ms    integer not null check (time_ms > 0),
  season     text not null default '2024-2028',
  unique (event_id, age_min, age_max, gender, standard, season)
);

create index if not exists time_standards_lookup_idx
  on public.time_standards (event_id, gender, age_min, age_max);

alter table public.time_standards enable row level security;

create policy "time_standards_select_authenticated" on public.time_standards
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------

create table if not exists public.goals (
  id              uuid primary key default gen_random_uuid(),
  swimmer_id      uuid not null references public.swimmers(id) on delete cascade,
  event_id        integer not null references public.events(id),
  target_time_ms  integer not null check (target_time_ms > 0),
  target_date     date,
  source          text not null default 'manual' check (source in ('manual', 'next_standard')),
  achieved_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- One active goal per (swimmer, event).
create unique index if not exists goals_active_unique
  on public.goals (swimmer_id, event_id)
  where achieved_at is null;

alter table public.goals enable row level security;

create policy "goals_select_via_swimmer" on public.goals
  for select using (
    exists (
      select 1 from public.swimmers s
      where s.id = goals.swimmer_id and s.owner_id = auth.uid()
    )
  );

create policy "goals_insert_via_swimmer" on public.goals
  for insert with check (
    exists (
      select 1 from public.swimmers s
      where s.id = goals.swimmer_id and s.owner_id = auth.uid()
    )
  );

create policy "goals_update_via_swimmer" on public.goals
  for update using (
    exists (
      select 1 from public.swimmers s
      where s.id = goals.swimmer_id and s.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.swimmers s
      where s.id = goals.swimmer_id and s.owner_id = auth.uid()
    )
  );

create policy "goals_delete_via_swimmer" on public.goals
  for delete using (
    exists (
      select 1 from public.swimmers s
      where s.id = goals.swimmer_id and s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- pdf_uploads — audit trail of uploaded meet PDFs
-- ---------------------------------------------------------------------------

create table if not exists public.pdf_uploads (
  id              uuid primary key default gen_random_uuid(),
  uploader_id     uuid not null references public.profiles(id) on delete cascade,
  storage_path    text not null,
  file_sha256     text not null,
  meet_id         uuid references public.meets(id) on delete set null,
  parse_status    public.parse_status not null default 'pending',
  raw_text        text,
  parsed_payload  jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  unique (uploader_id, file_sha256)
);

create index if not exists pdf_uploads_status_idx
  on public.pdf_uploads (parse_status, created_at);

alter table public.pdf_uploads enable row level security;

create policy "pdf_uploads_select_self" on public.pdf_uploads
  for select using (auth.uid() = uploader_id);

create policy "pdf_uploads_insert_self" on public.pdf_uploads
  for insert with check (auth.uid() = uploader_id);

create policy "pdf_uploads_update_self" on public.pdf_uploads
  for update using (auth.uid() = uploader_id) with check (auth.uid() = uploader_id);

create policy "pdf_uploads_delete_self" on public.pdf_uploads
  for delete using (auth.uid() = uploader_id);

-- ---------------------------------------------------------------------------
-- allowed_signups — invite list for signup-gate Edge Function
-- ---------------------------------------------------------------------------

create table if not exists public.allowed_signups (
  email       text primary key,
  note        text,
  added_by    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.allowed_signups enable row level security;
-- No client policies. Service-role only (signup-gate Edge Function).

-- ---------------------------------------------------------------------------
-- PR trigger — per-statement, recomputes is_pr for affected (swimmer, event)
-- pairs using a window function. Bulk inserts (e.g. 30 rows from a PDF parse)
-- fire the trigger exactly once.
-- ---------------------------------------------------------------------------

create or replace function public.recompute_results_pr()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Build the set of (swimmer, event) pairs that changed in this statement.
  with affected as (
    select distinct swimmer_id, event_id from changed_rows
  ),
  ranked as (
    select r.id,
           (r.time_ms = min(r.time_ms) over (partition by r.swimmer_id, r.event_id)
            and not r.dq) as should_be_pr
    from public.results r
    join affected a on a.swimmer_id = r.swimmer_id and a.event_id = r.event_id
  )
  update public.results r
     set is_pr = ranked.should_be_pr
    from ranked
   where r.id = ranked.id
     and r.is_pr is distinct from ranked.should_be_pr;

  return null;
end;
$$;

-- Note: Postgres only allows one transition-table reference per trigger event.
-- We create three triggers (insert, update, delete) all calling the same fn.
-- Each trigger references the appropriate transition table aliased as
-- `changed_rows`.

drop trigger if exists results_pr_after_insert on public.results;
create trigger results_pr_after_insert
  after insert on public.results
  referencing new table as changed_rows
  for each statement
  execute function public.recompute_results_pr();

drop trigger if exists results_pr_after_update on public.results;
create trigger results_pr_after_update
  after update of time_ms, dq, swimmer_id, event_id on public.results
  referencing new table as changed_rows
  for each statement
  execute function public.recompute_results_pr();

-- For deletes the "changed" rows are the OLD ones.
create or replace function public.recompute_results_pr_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  with affected as (
    select distinct swimmer_id, event_id from changed_rows
  ),
  ranked as (
    select r.id,
           (r.time_ms = min(r.time_ms) over (partition by r.swimmer_id, r.event_id)
            and not r.dq) as should_be_pr
    from public.results r
    join affected a on a.swimmer_id = r.swimmer_id and a.event_id = r.event_id
  )
  update public.results r
     set is_pr = ranked.should_be_pr
    from ranked
   where r.id = ranked.id
     and r.is_pr is distinct from ranked.should_be_pr;

  return null;
end;
$$;

drop trigger if exists results_pr_after_delete on public.results;
create trigger results_pr_after_delete
  after delete on public.results
  referencing old table as changed_rows
  for each statement
  execute function public.recompute_results_pr_after_delete();
