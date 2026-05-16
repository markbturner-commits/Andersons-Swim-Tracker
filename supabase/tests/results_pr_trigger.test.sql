-- pgTAP tests for the per-statement is_pr trigger on public.results.
-- Run with: supabase test db

begin;

select plan(8);

-- ---------------------------------------------------------------------------
-- Fixtures: an auth user, a profile, a swimmer, a meet, an event.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
  values ('11111111-1111-1111-1111-111111111111', 'trigger-test@example.com');

insert into public.profiles (id, display_name, is_parent)
  values ('11111111-1111-1111-1111-111111111111', 'Trigger Tester', true);

insert into public.swimmers (id, owner_id, name, birthdate, gender)
  values ('22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111',
          'Test Swimmer', '2015-01-01', 'M');

insert into public.meets (id, name, start_date, course, created_by)
  values ('33333333-3333-3333-3333-333333333333',
          'Trigger Test Meet', '2026-01-01', 'SCY',
          '11111111-1111-1111-1111-111111111111'),
         ('33333333-3333-3333-3333-333333333334',
          'Trigger Test Meet B', '2026-02-01', 'SCY',
          '11111111-1111-1111-1111-111111111111'),
         ('33333333-3333-3333-3333-333333333335',
          'Trigger Test Meet C', '2026-03-01', 'SCY',
          '11111111-1111-1111-1111-111111111111');

-- Need at least one event row. Use 50 FR SCY.
insert into public.events (distance_m, stroke, course)
  values (50, 'FR', 'SCY')
  on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Test 1: single insert flips is_pr=true.
-- ---------------------------------------------------------------------------

insert into public.results (swimmer_id, meet_id, event_id, time_ms, age_at_meet)
  select '22222222-2222-2222-2222-222222222222',
         '33333333-3333-3333-3333-333333333333',
         e.id, 50000, 11
    from public.events e
   where e.distance_m = 50 and e.stroke = 'FR' and e.course = 'SCY';

select is(
  (select is_pr from public.results
    where meet_id = '33333333-3333-3333-3333-333333333333'),
  true,
  'single insert sets is_pr=true'
);

-- ---------------------------------------------------------------------------
-- Test 2: inserting a slower time leaves the older fastest as PR.
-- ---------------------------------------------------------------------------

insert into public.results (swimmer_id, meet_id, event_id, time_ms, age_at_meet)
  select '22222222-2222-2222-2222-222222222222',
         '33333333-3333-3333-3333-333333333334',
         e.id, 52000, 11
    from public.events e
   where e.distance_m = 50 and e.stroke = 'FR' and e.course = 'SCY';

select is(
  (select is_pr from public.results
    where meet_id = '33333333-3333-3333-3333-333333333333'),
  true,
  'previous fastest remains PR after slower insert'
);

select is(
  (select is_pr from public.results
    where meet_id = '33333333-3333-3333-3333-333333333334'),
  false,
  'new slower row is not PR'
);

-- ---------------------------------------------------------------------------
-- Test 3: update a slower row to a faster time flips PR.
-- ---------------------------------------------------------------------------

update public.results
   set time_ms = 49000
 where meet_id = '33333333-3333-3333-3333-333333333334';

select is(
  (select is_pr from public.results
    where meet_id = '33333333-3333-3333-3333-333333333334'),
  true,
  'updated faster row becomes PR'
);

select is(
  (select is_pr from public.results
    where meet_id = '33333333-3333-3333-3333-333333333333'),
  false,
  'old PR row loses PR after faster update elsewhere'
);

-- ---------------------------------------------------------------------------
-- Test 4: bulk insert of 30 rows fires the trigger once, identifies fastest.
-- We use a CTE to insert 30 rows for a fresh swimmer+event combo with random
-- (but deterministic) times. The fastest of the 30 should be the only PR.
-- ---------------------------------------------------------------------------

insert into public.swimmers (id, owner_id, name, birthdate, gender)
  values ('44444444-4444-4444-4444-444444444444',
          '11111111-1111-1111-1111-111111111111',
          'Bulk Test Swimmer', '2014-01-01', 'M');

-- 30 distinct meets so unique (swimmer, meet, event) holds.
insert into public.meets (id, name, start_date, course, created_by)
  select uuid_generate_v5('33333333-3333-3333-3333-333333333333'::uuid, 'bulk' || g::text),
         'Bulk Meet ' || g,
         date '2024-01-01' + g,
         'SCY',
         '11111111-1111-1111-1111-111111111111'
    from generate_series(1, 30) g
  on conflict do nothing;

-- Single INSERT...SELECT statement with 30 rows.
insert into public.results (swimmer_id, meet_id, event_id, time_ms, age_at_meet)
  select '44444444-4444-4444-4444-444444444444',
         uuid_generate_v5('33333333-3333-3333-3333-333333333333'::uuid, 'bulk' || g::text),
         (select id from public.events
            where distance_m = 50 and stroke = 'FR' and course = 'SCY'),
         60000 - g * 100,   -- fastest will be at g=30 (57000ms)
         11
    from generate_series(1, 30) g;

select is(
  (select count(*) from public.results
    where swimmer_id = '44444444-4444-4444-4444-444444444444' and is_pr),
  1::bigint,
  'after bulk insert of 30 rows, exactly one is_pr=true'
);

select is(
  (select time_ms from public.results
    where swimmer_id = '44444444-4444-4444-4444-444444444444' and is_pr),
  57000,
  'the PR is the fastest of the bulk batch'
);

-- ---------------------------------------------------------------------------
-- Test 5: DQ rows do not become PR even if their time_ms is the fastest.
-- ---------------------------------------------------------------------------

insert into public.meets (id, name, start_date, course, created_by)
  values ('55555555-5555-5555-5555-555555555555',
          'DQ Test Meet', '2026-05-01', 'SCY',
          '11111111-1111-1111-1111-111111111111');

insert into public.results (swimmer_id, meet_id, event_id, time_ms, age_at_meet, dq)
  select '44444444-4444-4444-4444-444444444444',
         '55555555-5555-5555-5555-555555555555',
         (select id from public.events
            where distance_m = 50 and stroke = 'FR' and course = 'SCY'),
         50000, 11, true;

select is(
  (select is_pr from public.results
    where meet_id = '55555555-5555-5555-5555-555555555555'),
  false,
  'DQ result is never PR even if fastest'
);

select * from finish();

rollback;
