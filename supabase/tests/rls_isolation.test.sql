-- pgTAP test: user A's swimmers, results, and goals are invisible to user B
-- via RLS. We simulate auth.uid() by setting `request.jwt.claims` per role.
-- Run with: supabase test db

begin;

select plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures: two auth users + profiles + one swimmer each, with results.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com');

insert into public.profiles (id, display_name, is_parent) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', true);

insert into public.swimmers (id, owner_id, name, birthdate, gender) values
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', '2015-01-01', 'F'),
  ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob',   '2015-01-01', 'M');

insert into public.events (distance_m, stroke, course)
  values (50, 'FR', 'SCY')
  on conflict do nothing;

insert into public.meets (id, name, start_date, course, created_by) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Shared Meet', '2026-01-01', 'SCY',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into public.results (swimmer_id, meet_id, event_id, time_ms, age_at_meet)
  select 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
         'cccccccc-cccc-cccc-cccc-cccccccccccc',
         (select id from public.events where distance_m = 50 and stroke = 'FR' and course = 'SCY'),
         40000, 11;

-- ---------------------------------------------------------------------------
-- Switch into "user B" role and check user A's swimmer is invisible.
-- We force RLS by switching role to `authenticated` and setting the JWT claim.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

select is(
  (select count(*) from public.swimmers where id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  0::bigint,
  'user B cannot SELECT user A swimmer'
);

select is(
  (select count(*) from public.results
    where swimmer_id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  0::bigint,
  'user B cannot SELECT user A results'
);

-- Try to write through to user A's swimmer — should fail.
prepare cross_owner_insert as
  insert into public.results (swimmer_id, meet_id, event_id, time_ms, age_at_meet)
  select 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0',
         'cccccccc-cccc-cccc-cccc-cccccccccccc',
         (select id from public.events where distance_m = 50 and stroke = 'FR' and course = 'SCY'),
         99999, 11;

select throws_ok(
  'execute cross_owner_insert',
  '42501',
  null,
  'user B cannot INSERT a result for user A swimmer (RLS blocks it)'
);

-- ---------------------------------------------------------------------------
-- Switch back to user A and verify A still sees their data.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select count(*) from public.swimmers where id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  1::bigint,
  'user A can SELECT their own swimmer'
);

select is(
  (select count(*) from public.results
    where swimmer_id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  1::bigint,
  'user A can SELECT their own results'
);

-- Standards table is world-readable to authenticated users.
select isnt(
  (select count(*) from public.events),
  0::bigint,
  'authenticated users can read the events catalog'
);

reset role;
select * from finish();

rollback;
