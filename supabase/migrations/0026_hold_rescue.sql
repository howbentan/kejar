-- Penjara hold-rescue (2026-11-17). The rescuer now holds a key for 20 s of held time; the live rescue is
-- { by, startedAt, heldMs, holdSince, lastBeat, releasedAt } (the times are ISO strings or null). A freed runner
-- also gets a 10 s head start, players.head_start_until. Safe to run again. Run it after 0025, before the code that
-- reads these goes live.

alter table players add column if not exists head_start_until timestamptz;

-- start_rescue, from 0017_penjara.sql, writing the held-key shape: nobody's thumb is down yet, so holdSince and
-- lastBeat are null and the 5 s reset window runs from the scan (releasedAt = startedAt).
create or replace function start_rescue(p_game uuid, p_by uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
declare
  t text := to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  update games
     set rescue = jsonb_build_object(
           'by', p_by::text,
           'startedAt', t,
           'heldMs', 0,
           'holdSince', null,
           'lastBeat', null,
           'releasedAt', t)
   where id = p_game and rescue is null and ended_at is null;
  return found;
end;
$$;

revoke execute on function start_rescue(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function start_rescue(uuid, uuid, timestamptz) to service_role;

-- Merges p_patch into the live rescue only while it is still the one that started at p_started, so a stale phone
-- can't write into a newer rescue. True iff it applied.
create or replace function patch_rescue(p_game uuid, p_started text, p_patch jsonb) returns boolean
language plpgsql
as $$
begin
  update games
     set rescue = rescue || p_patch
   where id = p_game and rescue is not null and rescue->>'startedAt' = p_started;
  return found;
end;
$$;

revoke execute on function patch_rescue(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function patch_rescue(uuid, text, jsonb) to service_role;

-- resume_game, from 0020_legendaries.sql, plus the held-key rescue's holdSince, lastBeat and releasedAt and every
-- running head start moving by the pause.
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
  -- A pending final whistle's 60 s hold freezes with the pause too, so an undo still has its full time. A whistle that
  -- blew during the pause (a removal) counts from the resume. A live rescue's hold freezes the same way.
  update games
    set pauses = pauses || jsonb_build_array(jsonb_build_object(
          'from', to_char(started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'to', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
        paused_at = null,
        final_whistle_at = final_whistle_at + (p_at - greatest(started, final_whistle_at)),
        rescue = case
          when rescue is null then null
          else jsonb_set(rescue, '{startedAt}', to_jsonb(to_char(
            ((rescue->>'startedAt')::timestamptz + (p_at - greatest(started, (rescue->>'startedAt')::timestamptz)))
              at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
        end
    where id = p_game;
  -- The held-key rescue's other times (the thumb going down, the last heartbeat, the let-go) move by the pause too, each
  -- only when it is set, so paused time never counts as held or as let go. startedAt moved above.
  update games
    set rescue = (
      select jsonb_object_agg(e.key,
        case
          when e.key in ('holdSince', 'lastBeat', 'releasedAt') and jsonb_typeof(e.value) = 'string'
            then to_jsonb(to_char(((e.value #>> '{}')::timestamptz + (p_at - greatest(started, (e.value #>> '{}')::timestamptz)))
              at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          else e.value
        end)
      from jsonb_each(rescue) as e)
    where id = p_game and rescue is not null and jsonb_typeof(rescue) = 'object';
  -- A freed runner's head start that is still running waits out the pause too; one that ended is left alone.
  update players
    set head_start_until = head_start_until + d
    where game_id = p_game and head_start_until > started;
  update pings
    set alert_at = case when alerted then alert_at else alert_at + d end,
        reveal_at = case when revealed then reveal_at else reveal_at + d end
    where game_id = p_game and (not alerted or not revealed);
  -- A running Cheese Ais freeze waits out the pause too (one that ended before the pause is left alone).
  update players
    set frozen_until = frozen_until + d
    where game_id = p_game and frozen_until > started;
  -- A house arrest counts from when it started (or, while it waits for the runner to open Kejar, from when it fired),
  -- so the time it had already run is kept. A time during the pause counts from the resume, like the final whistle.
  update players
    set arrest = case
      when (arrest->>'startedAt') is not null then jsonb_set(arrest, '{startedAt}', to_jsonb(to_char(
        ((arrest->>'startedAt')::timestamptz + (p_at - greatest(started, (arrest->>'startedAt')::timestamptz)))
          at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
      else jsonb_set(arrest, '{firedAt}', to_jsonb(to_char(
        ((arrest->>'firedAt')::timestamptz + (p_at - greatest(started, (arrest->>'firedAt')::timestamptz)))
          at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    end
    where game_id = p_game and arrest is not null and arrest <> 'null'::jsonb;
  -- A Mak Kau Hijau window that hasn't closed yet waits out the pause whole; one that already closed is left alone.
  update games
    set hijau = jsonb_set(
      jsonb_set(hijau, '{startsAt}', to_jsonb(to_char(((hijau->>'startsAt')::timestamptz + d) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
      '{deadline}', to_jsonb(to_char(((hijau->>'deadline')::timestamptz + d) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    where id = p_game and hijau is not null and jsonb_typeof(hijau) = 'object' and (hijau->>'deadline')::timestamptz > started;
  -- Penjara's lock after a Mak Kau Hijau is held still too while it runs; one that ran out before the pause is left alone.
  update games
    set hijau = jsonb_set(hijau, '{lockedUntil}',
      to_jsonb(to_char(((hijau->>'lockedUntil')::timestamptz + d) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    where id = p_game and hijau is not null and jsonb_typeof(hijau) = 'object'
      and jsonb_typeof(hijau->'lockedUntil') = 'string' and (hijau->>'lockedUntil')::timestamptz > started;
  return (extract(epoch from d) * 1000)::int;
end;
$$;

revoke execute on function resume_game(uuid, timestamptz) from public, anon, authenticated;
grant execute on function resume_game(uuid, timestamptz) to service_role;
