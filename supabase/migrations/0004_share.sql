-- Public sharing links — read-only swimmer pages for friends & family.
--
-- Adds an opaque, revocable `share_token` to swimmers. When set, anyone with
-- the token can view a read-only summary of that swimmer at /share/<token>
-- without signing in. Revoking a link = setting the token back to NULL.
--
-- Access path: the SECURITY DEFINER function `get_shared_swimmer(token)` is
-- the ONLY way anon traffic reaches swimmer / result / meet rows. It returns
-- one self-contained JSON payload for the swimmer whose token matches, and
-- nothing otherwise — the underlying tables keep their existing owner-only RLS
-- policies untouched. `time_standards` is additionally opened to anon so the
-- public page can render standards badges (published reference data, no user
-- content).
--
-- Apply with the migration tooling (`supabase db push` / `supabase migration
-- up`), not by pasting into the SQL Editor.

-- ---------------------------------------------------------------------------
-- swimmers.share_token — opaque, unique, nullable (NULL = not shared)
-- ---------------------------------------------------------------------------

alter table public.swimmers
  add column if not exists share_token uuid;

-- Unique index; multiple NULLs are allowed, so unshared swimmers don't clash.
create unique index if not exists swimmers_share_token_idx
  on public.swimmers (share_token);

-- ---------------------------------------------------------------------------
-- time_standards — allow anon SELECT so the public share page can render
-- standards badges. Catalog data only (USA Swimming Motivational Times).
-- ---------------------------------------------------------------------------

drop policy if exists "time_standards_select_anon" on public.time_standards;
create policy "time_standards_select_anon" on public.time_standards
  for select to anon using (true);

-- ---------------------------------------------------------------------------
-- get_shared_swimmer — public read path for a shared swimmer.
--
-- SECURITY DEFINER: runs as the function owner and bypasses RLS, but only ever
-- returns the single swimmer whose share_token matches p_token (NULL when no
-- match). DQ'd results are excluded, matching the in-app swimmer view.
-- ---------------------------------------------------------------------------

create or replace function public.get_shared_swimmer(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'swimmer', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'birthdate', s.birthdate,
      'gender', s.gender
    ),
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'swimmer_id', r.swimmer_id,
          'meet_id', r.meet_id,
          'event_id', r.event_id,
          'time_ms', r.time_ms,
          'place', r.place,
          'age_at_meet', r.age_at_meet,
          'is_pr', r.is_pr,
          'dq', r.dq,
          'exhibition', r.exhibition,
          'meet', jsonb_build_object(
            'id', m.id,
            'name', m.name,
            'start_date', m.start_date,
            'end_date', m.end_date,
            'course', m.course,
            'location', m.location
          ),
          'event', jsonb_build_object(
            'id', e.id,
            'distance_m', e.distance_m,
            'stroke', e.stroke,
            'course', e.course
          )
        )
        order by m.start_date desc
      )
      from public.results r
      join public.meets m on m.id = r.meet_id
      join public.events e on e.id = r.event_id
      where r.swimmer_id = s.id and not r.dq
    ), '[]'::jsonb)
  )
  from public.swimmers s
  where s.share_token = p_token;
$$;

revoke all on function public.get_shared_swimmer(uuid) from public;
grant execute on function public.get_shared_swimmer(uuid) to anon, authenticated;
