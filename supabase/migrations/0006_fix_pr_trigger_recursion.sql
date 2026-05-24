-- Fix infinite recursion on insert/update of public.results.
--
-- Symptom: "Insert failed: stack depth limit exceeded" on any insert into
-- public.results.
--
-- Cause: the `results_pr_after_update` trigger fires on every UPDATE,
-- including the `set is_pr = ...` UPDATE issued by recompute_results_pr()
-- itself, so each invocation re-enters the function and the stack overflows.
--
-- 0003_pr_trigger.sql intended to scope the trigger with
-- `after update OF time_ms, dq, swimmer_id, event_id`, but Postgres does not
-- allow combining a column list with `REFERENCING NEW TABLE AS ...`
-- (ERROR 0A000: "transition tables cannot be specified for triggers with
-- column lists"). When that file was applied, the column list was dropped
-- and the trigger ended up firing on every column, including is_pr.
--
-- Fix:
-- 1. Guard the trigger function with pg_trigger_depth() so recursive
--    invocations (the trigger calling itself via its own UPDATE) exit
--    immediately — the outermost call has already computed correct values.
-- 2. Add `is_pr IS DISTINCT FROM ...` to the UPDATE so rows whose is_pr is
--    already correct aren't rewritten — avoids needless writes and shrinks
--    the transition table for the recursive fire (which is now a no-op
--    anyway because of #1).

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
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  for pair in select distinct swimmer_id, event_id from changed_rows loop
    select min(time_ms) into best from public.results
      where swimmer_id = pair.swimmer_id and event_id = pair.event_id and not dq;
    update public.results
       set is_pr = (time_ms = best and not dq)
     where swimmer_id = pair.swimmer_id
       and event_id = pair.event_id
       and is_pr is distinct from (time_ms = best and not dq);
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
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  for pair in select distinct swimmer_id, event_id from changed_rows loop
    select min(time_ms) into best from public.results
      where swimmer_id = pair.swimmer_id and event_id = pair.event_id and not dq;
    if best is not null then
      update public.results
         set is_pr = (time_ms = best and not dq)
       where swimmer_id = pair.swimmer_id
         and event_id = pair.event_id
         and is_pr is distinct from (time_ms = best and not dq);
    end if;
  end loop;
  return null;
end;
$func$;
