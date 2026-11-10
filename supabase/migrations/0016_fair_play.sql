-- Fair play (gameplay audit). Each section below belongs to one change; safe to run again.
-- One transaction, every step guarded. Run it before the code that reads these columns goes live.

begin;

-- 1. A late ping doesn't count toward auto-jail: the moment each ping's alert was claimed (store clock).
alter table pings add column if not exists alert_sent_at timestamptz;

-- 2. resume_game (0005_safety.sql) shifted alert_at for every unrevealed ping, including ones whose alert had
-- already gone out, so the stored alert time disagreed with the computed one. Now only an alert still to come
-- moves with the pause; reveal_at moves for every ping not yet revealed, as before.
create or replace function resume_game(p_game uuid, p_at timestamptz) returns int
language plpgsql
as $$
declare
  started timestamptz;
  d interval;
begin
  select paused_at into started from games where id = p_game for update;
  if started is null then
    return null;
  end if;
  d := p_at - started;
  update games
    set pauses = pauses || jsonb_build_array(jsonb_build_object(
          'from', to_char(started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'to', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
        paused_at = null
    where id = p_game;
  update pings
    set alert_at = case when alerted then alert_at else alert_at + d end,
        reveal_at = case when revealed then reveal_at else reveal_at + d end
    where game_id = p_game and (not alerted or not revealed);
  return (extract(epoch from d) * 1000)::int;
end;
$$;

revoke execute on function resume_game(uuid, timestamptz) from public, anon, authenticated;
grant execute on function resume_game(uuid, timestamptz) to service_role;

-- 3. Undo kejar and the final whistle (fair-play §1.4).
-- When the last free Dikejar goes out, the end is held 60 s so a marshal can undo a wrong last catch.
alter table games add column if not exists final_whistle_at timestamptz;

-- Undo kejar frees a runner only while that chaser's catch still holds them. freed_at restarts their check-in
-- count (as the auto-jail undo does); freed_once (their one escape) is left alone. True iff this call freed them.
create or replace function release_caught(p_player uuid, p_by uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
begin
  update players
     set jailed = false, caught_by = null, caught_at = null, freed_at = p_at
   where id = p_player and jailed and caught_by = p_by;
  return found;
end;
$$;

revoke execute on function release_caught(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function release_caught(uuid, uuid, timestamptz) to service_role;

-- Starts the final whistle only if none is pending and the game hasn't ended. True iff this call started it.
create or replace function claim_final_whistle(p_game uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
begin
  update games
     set final_whistle_at = p_at
   where id = p_game and final_whistle_at is null and ended_at is null;
  return found;
end;
$$;

revoke execute on function claim_final_whistle(uuid, timestamptz) from public, anon, authenticated;
grant execute on function claim_final_whistle(uuid, timestamptz) to service_role;

-- Each Undo kejar is kept in safety_records with who did it, so the type check gains a value.
alter table safety_records drop constraint if exists safety_records_type_check;
alter table safety_records add constraint safety_records_type_check
  check (type in ('sos', 'report', 'removed', 'auto-jail-undone', 'kejar-undone'));

commit;
