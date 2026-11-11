-- Penjara (gameplay audit Plan 2). Each section below belongs to one change; safe to run again.
-- One transaction, every step guarded. Run it before the code that reads these columns goes live.

begin;

-- 1. The 10-second rescue (rules §9a). A free runner's Penjara scan starts a hold instead of freeing at once;
-- the live hold is one jsonb value: { "by": player id, "startedAt": ISO time (ms, Z), "joiners": [player ids] }.
alter table games add column if not exists rescue jsonb;

-- Starts the rescue only if none is live and the game hasn't ended. True iff this call started it. startedAt is
-- written in the same ISO form as JavaScript's toISOString, so end_rescue can compare it as text.
create or replace function start_rescue(p_game uuid, p_by uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
begin
  update games
     set rescue = jsonb_build_object(
           'by', p_by::text,
           'startedAt', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'joiners', '[]'::jsonb)
   where id = p_game and rescue is null and ended_at is null;
  return found;
end;
$$;

revoke execute on function start_rescue(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function start_rescue(uuid, uuid, timestamptz) to service_role;

-- Clears the rescue only if it is still the one that started at p_started, so a success frees once and a failure
-- posts once however many phones settle it at the same moment. True iff this call cleared it.
create or replace function end_rescue(p_game uuid, p_started text) returns boolean
language plpgsql
as $$
begin
  update games
     set rescue = null
   where id = p_game and rescue is not null and rescue->>'startedAt' = p_started;
  return found;
end;
$$;

revoke execute on function end_rescue(uuid, text) from public, anon, authenticated;
grant execute on function end_rescue(uuid, text) to service_role;

-- A second runner's scan during a hold joins it, once, and never adds the rescuer. Does nothing with no rescue.
-- Joining never moves startedAt: the hold keeps its own time.
create or replace function join_rescue(p_game uuid, p_player uuid) returns void
language plpgsql
as $$
begin
  update games
     set rescue = jsonb_set(rescue, '{joiners}', coalesce(rescue->'joiners', '[]'::jsonb) || to_jsonb(p_player::text))
   where id = p_game
     and rescue is not null
     and rescue->>'by' <> p_player::text
     and not (coalesce(rescue->'joiners', '[]'::jsonb) ? p_player::text);
end;
$$;

revoke execute on function join_rescue(uuid, uuid) from public, anon, authenticated;
grant execute on function join_rescue(uuid, uuid) to service_role;

-- resume_game, from 0016_fair_play.sql, unchanged except that a live rescue's startedAt moves by the pause too, so
-- the 10 s hold freezes with the game like the final whistle (Review Focus 2).
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
  update pings
    set alert_at = case when alerted then alert_at else alert_at + d end,
        reveal_at = case when revealed then reveal_at else reveal_at + d end
    where game_id = p_game and (not alerted or not revealed);
  return (extract(epoch from d) * 1000)::int;
end;
$$;

revoke execute on function resume_game(uuid, timestamptz) from public, anon, authenticated;
grant execute on function resume_game(uuid, timestamptz) to service_role;

-- 2. The Penjara reel (§2.2). A jailed runner at Penjara gets one pull per jail stay: reel_pulled_at records it, and a
-- pull older than the latest catch (caught_at) is spent, so a fresh catch allows a new one.
alter table players add column if not exists reel_pulled_at timestamptz;

-- Spends the pull only if the player is jailed and hasn't pulled since they were caught. True iff this call spent
-- it, so two phones (or two taps) pull once.
create or replace function pull_reel(p_player uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
begin
  update players
     set reel_pulled_at = p_at
   where id = p_player
     and jailed
     and (reel_pulled_at is null or reel_pulled_at < caught_at);
  return found;
end;
$$;

revoke execute on function pull_reel(uuid, timestamptz) from public, anon, authenticated;
grant execute on function pull_reel(uuid, timestamptz) to service_role;

-- 3. '5 minutes left' (§2.3). One warning per game: five_warned_at records it, and claim_five_warning sets it only
-- while null (and the game is still on), so two polls at the same moment warn once.
alter table games add column if not exists five_warned_at timestamptz;

create or replace function claim_five_warning(p_game uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
begin
  update games
     set five_warned_at = p_at
   where id = p_game and five_warned_at is null and ended_at is null;
  return found;
end;
$$;

revoke execute on function claim_five_warning(uuid, timestamptz) from public, anon, authenticated;
grant execute on function claim_five_warning(uuid, timestamptz) to service_role;

commit;
