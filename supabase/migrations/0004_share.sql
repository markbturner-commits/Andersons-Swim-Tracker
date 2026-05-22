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
-- Like 0003_pr_trigger.sql, the function is written in PL/pgSQL with NO table
-- aliases — it resolves the swimmer id into a local variable and uses
-- single-table correlated subqueries. That keeps every identifier clear of the
-- `alias.column` form the SQL-Editor chat-paste path mangles into
-- `<alias.column>`, so this file is safe both to `supabase db push` and to
-- paste directly.

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
language plpgsql
security definer
set search_path = public
stable
as $func$
declare
  v_swimmer_id uuid;
  v_payload jsonb;
begin
  select id into v_swimmer_id
    from swimmers
   where share_token = p_token;

  if v_swimmer_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'swimmer', (
      select jsonb_build_object(
        'id', id,
        'name', name,
        'birthdate', birthdate,
        'gender', gender
      )
      from swimmers
      where id = v_swimmer_id
    ),
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'swimmer_id', swimmer_id,
          'meet_id', meet_id,
          'event_id', event_id,
          'time_ms', time_ms,
          'place', place,
          'age_at_meet', age_at_meet,
          'is_pr', is_pr,
          'dq', dq,
          'exhibition', exhibition,
          'meet', (
            select jsonb_build_object(
              'id', id,
              'name', name,
              'start_date', start_date,
              'end_date', end_date,
              'course', course,
              'location', location
            )
            from meets
            where id = meet_id
          ),
          'event', (
            select jsonb_build_object(
              'id', id,
              'distance_m', distance_m,
              'stroke', stroke,
              'course', course
            )
            from events
            where id = event_id
          )
        )
      )
      from results
      where swimmer_id = v_swimmer_id and not dq
    ), '[]'::jsonb)
  )
  into v_payload;

  return v_payload;
end;
$func$;

revoke all on function public.get_shared_swimmer(uuid) from public;
grant execute on function public.get_shared_swimmer(uuid) to anon, authenticated;
