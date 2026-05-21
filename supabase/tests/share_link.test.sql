-- pgTAP test: public share links.
-- Verifies get_shared_swimmer() resolves a swimmer only for a valid token,
-- works for the anon role (SECURITY DEFINER bypasses RLS), leaks nothing for
-- an unknown token, and that share_token stays unique across swimmers.
-- Run with: supabase test db

begin;

select plan(5);

-- ---------------------------------------------------------------------------
-- Fixtures: one user + profile, one swimmer with a known share token, one
-- meet, one result.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'd@example.com');

insert into public.profiles (id, display_name, is_parent) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'D', true);

insert into public.swimmers (id, owner_id, name, birthdate, gender, share_token)
  values ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
          'dddddddd-dddd-dddd-dddd-dddddddddddd',
          'Dana', '2014-03-01', 'F',
          '11111111-1111-1111-1111-111111111111');

insert into public.events (distance_m, stroke, course)
  values (100, 'FR', 'SCY')
  on conflict do nothing;

insert into public.meets (id, name, start_date, course, created_by) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Spring Invite', '2026-03-01', 'SCY',
   'dddddddd-dddd-dddd-dddd-dddddddddddd');

insert into public.results (swimmer_id, meet_id, event_id, time_ms, age_at_meet)
  select 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
         'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
         (select id from public.events
            where distance_m = 100 and stroke = 'FR' and course = 'SCY'),
         72340, 12;

-- ---------------------------------------------------------------------------
-- As the anon role: the SECURITY DEFINER function still resolves the swimmer,
-- but anon cannot read the swimmer row directly.
-- ---------------------------------------------------------------------------

set local role anon;

select is(
  public.get_shared_swimmer('11111111-1111-1111-1111-111111111111')
    -> 'swimmer' ->> 'name',
  'Dana',
  'anon resolves a shared swimmer by valid token'
);

select is(
  jsonb_array_length(
    public.get_shared_swimmer('11111111-1111-1111-1111-111111111111')
      -> 'results'
  ),
  1,
  'shared payload includes the swimmer''s results'
);

select is(
  public.get_shared_swimmer('22222222-2222-2222-2222-222222222222'),
  null,
  'unknown token returns null'
);

select is(
  (select count(*) from public.swimmers
     where id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'),
  0::bigint,
  'anon cannot SELECT the swimmer row directly (only via the function)'
);

reset role;

-- ---------------------------------------------------------------------------
-- share_token is unique — a second swimmer cannot reuse a token.
-- ---------------------------------------------------------------------------

prepare dup_token as
  insert into public.swimmers (owner_id, name, birthdate, gender, share_token)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Dup', '2014-03-01', 'F',
          '11111111-1111-1111-1111-111111111111');

select throws_ok(
  'execute dup_token',
  '23505',
  null,
  'share_token is unique across swimmers'
);

select * from finish();

rollback;
