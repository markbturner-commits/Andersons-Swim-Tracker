-- PR trigger — paste-safe version for Supabase SQL Editor.
--
-- Why this exists separately from 0001_init.sql:
-- the chat-paste path that delivered 0001_init.sql to the SQL Editor mangles
-- any `dotted.col = dotted.col` comparison into `<dotted.col> = dotted.col`.
-- This file uses a PL/pgSQL loop with local-variable comparisons instead of
-- a JOIN against the transition table, so every `=` has at most one dotted
-- operand and survives the paste.
--
-- Semantics are identical to the original trigger in 0001_init.sql:
-- on insert/update/delete of `results`, recompute `is_pr` for every (swimmer,
-- event) pair touched by the statement. Per-statement firing so a bulk insert
-- of 30 rows only runs the recompute once.

create or replace function public.recompute_results_pr()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  pair record;
  best integer;
begin
  for pair in select distinct swimmer_id, event_id from changed_rows loop
    select min(time_ms) into best from public.results
      where swimmer_id = pair.swimmer_id and event_id = pair.event_id and not dq;
    update public.results
       set is_pr = (time_ms = best and not dq)
     where swimmer_id = pair.swimmer_id and event_id = pair.event_id;
  end loop;
  return null;
end;
$func$;

create or replace function public.recompute_results_pr_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  pair record;
  best integer;
begin
  for pair in select distinct swimmer_id, event_id from changed_rows loop
    select min(time_ms) into best from public.results
      where swimmer_id = pair.swimmer_id and event_id = pair.event_id and not dq;
    -- best is null → no rows left for this pair after delete; skip the update.
    if best is not null then
      update public.results
         set is_pr = (time_ms = best and not dq)
       where swimmer_id = pair.swimmer_id and event_id = pair.event_id;
    end if;
  end loop;
  return null;
end;
$func$;

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

drop trigger if exists results_pr_after_delete on public.results;
create trigger results_pr_after_delete
  after delete on public.results
  referencing old table as changed_rows
  for each statement
  execute function public.recompute_results_pr_after_delete();
