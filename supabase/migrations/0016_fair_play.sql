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
  -- A pending final whistle's 60 s hold freezes with the pause too, so an undo still has its full time.
  update games
    set pauses = pauses || jsonb_build_array(jsonb_build_object(
          'from', to_char(started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'to', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
        paused_at = null,
        final_whistle_at = final_whistle_at + d
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

-- Undo kejar frees a runner only while that chaser's catch still holds them, and never once the game has ended.
-- freed_at restarts their check-in count (as the auto-jail undo does); freed_once (their one escape) is left alone.
-- True iff this call freed them.
create or replace function release_caught(p_player uuid, p_by uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
begin
  update players
     set jailed = false, caught_by = null, caught_at = null, freed_at = p_at
   where id = p_player and jailed and caught_by = p_by
     and not exists (select 1 from games g where g.id = players.game_id and g.ended_at is not null);
  return found;
end;
$$;

revoke execute on function release_caught(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function release_caught(uuid, uuid, timestamptz) to service_role;

-- The auto-jail undo (it was a plain update before), with the same refusal once the game has ended.
create or replace function release_auto_jailed(p_player uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
begin
  update players
     set jailed = false, caught_at = null, freed_at = p_at, out_warned_at = null
   where id = p_player and jailed and caught_by is null
     and not exists (select 1 from games g where g.id = players.game_id and g.ended_at is not null);
  return found;
end;
$$;

revoke execute on function release_auto_jailed(uuid, timestamptz) from public, anon, authenticated;
grant execute on function release_auto_jailed(uuid, timestamptz) to service_role;

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

-- 4. New phone (fair-play §1.7). A marshal or the organiser makes a one-time link that moves a player onto another
-- phone: redeeming it swaps that player's session token, so the old phone stops working.
create table if not exists phone_moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);
alter table phone_moves enable row level security;

-- Claims the move and swaps the player's token in one statement block, so two phones racing for one link can't
-- both win. A player moved this way has no push subscription until they turn alerts on again on the new phone.
-- Returns the player id, or a reason: invalid, redeemed or expired.
create or replace function redeem_phone_move(p_token_hash text, p_now timestamptz, p_game uuid, p_new_token_hash text)
returns table (out_player uuid, out_reason text)
language plpgsql
as $$
declare
  mv phone_moves%rowtype;
begin
  select * into mv from phone_moves where token_hash = p_token_hash and game_id = p_game for update;
  if not found then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;
  if mv.redeemed_at is not null then
    return query select null::uuid, 'redeemed'::text;
    return;
  end if;
  if p_now >= mv.expires_at then
    return query select null::uuid, 'expired'::text;
    return;
  end if;
  update phone_moves set redeemed_at = p_now where id = mv.id;
  update players set token_hash = p_new_token_hash, push = null where id = mv.player_id;
  return query select mv.player_id, null::text;
end;
$$;

revoke execute on function redeem_phone_move(text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function redeem_phone_move(text, timestamptz, uuid, text) to service_role;

-- Each Undo kejar and each move is kept in safety_records with who did it, so the type check gains two values.
-- Dropped and re-added once, with every value, so running this file again is safe.
alter table safety_records drop constraint if exists safety_records_type_check;
alter table safety_records add constraint safety_records_type_check
  check (type in ('sos', 'report', 'removed', 'auto-jail-undone', 'kejar-undone', 'phone-move'));

-- 5. Wipe a game's personal data 30 days after it ends (fair-play §1.8). Results, counts and the game row stay.
alter table games add column if not exists wiped_at timestamptz;

-- Runs in one transaction, and returns false (doing nothing) once the game is wiped. Players keep their rows, renamed
-- to role placeholders numbered by join order, so results still render. Safety records keep their type and time only. Event keys that hold a name, free text or a
-- position are removed; the list matches WIPE_EVENT_KEYS in app/api/_lib/store.ts.
create or replace function wipe_game(p_game uuid) returns boolean
language plpgsql
as $$
declare
  claimed int;
begin
  update games set wiped_at = now(), host_push = null where id = p_game and wiped_at is null;
  get diagnostics claimed = row_count;
  if claimed = 0 then
    return false;
  end if;
  delete from locations where game_id = p_game;
  -- Safety records stay as anonymous counts: free text, names and positions go.
  update safety_records set data = '{}'::jsonb, lat = null, lng = null where game_id = p_game;
  delete from phone_moves where game_id = p_game;
  delete from marshal_invites where game_id = p_game;
  update players p
    set name = case n.role when 'runner' then 'Dikejar ' when 'chaser' then 'Kejar ' when 'marshal' then 'Marshal ' else 'Player ' end || n.num,
        push = null,
        token_hash = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    from (
      select id, role, row_number() over (partition by coalesce(role, '') order by accepted_at, id) as num
      from players where game_id = p_game
    ) n
    where p.id = n.id;
  update events
    set data = data - array['who', 'chaser', 'name', 'by', 'target_name', 'targetName', 'withName', 'with_name', 'text', 'note', 'lat', 'lng']
    where game_id = p_game;
  return true;
end;
$$;

revoke execute on function wipe_game(uuid) from public, anon, authenticated;
grant execute on function wipe_game(uuid) to service_role;

-- Finding the games to sweep: ended, not yet wiped, oldest first.
create index if not exists games_to_wipe on games (ended_at) where wiped_at is null and ended_at is not null;
-- ...and games that never recorded an end (it is written lazily), swept by age since they were made.
create index if not exists games_unended_to_wipe on games (created_at) where wiped_at is null and ended_at is null;

commit;
