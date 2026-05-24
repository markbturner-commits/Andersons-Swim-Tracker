-- Add 25-yard SCY events to the catalog.
-- 25-yard events are standard for 8 & Under age-group swimming in short-course
-- yards pools. They were missing from the original events seed, which caused
-- the confirm route to reject results like "25 Yards Butterfly" with
-- EVENT_NOT_IN_CATALOG. IM is intentionally excluded — IM covers 4 strokes,
-- so its minimum sensible distance is 100yd (4 x 25yd).

insert into public.events (distance_m, stroke, course) values
  (25, 'FR', 'SCY'),
  (25, 'BK', 'SCY'),
  (25, 'BR', 'SCY'),
  (25, 'FL', 'SCY')
on conflict (distance_m, stroke, course) do nothing;
