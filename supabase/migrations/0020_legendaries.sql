-- Two new legendaries: Super Ring ('ring', a runner card that turns Penjara into house arrest) and Mak Kau Hijau
-- (a chaser card that opens a 45 s "tap green" window). Data model only: the kinds, the columns they need and the
-- atomic steps. Safe to run again: one transaction, every step guarded. Run it before the code that reads these goes live.

begin;

-- 1. Super Ring is a card kind players can hold.
alter table powerups drop constraint if exists powerups_kind_check;
alter table powerups
  add constraint powerups_kind_check
  check (kind in ('decoy', 'shield', 'cloak', 'flare', 'focus', 'toyol', 'along', 'grab', 'dato', 'cheese', 'combo', 'toll', 'ring'));

-- 2. Each organisation's reusable secret cards now come in four kinds.
alter table secret_cards drop constraint if exists secret_cards_legendary_check;
alter table secret_cards
  add constraint secret_cards_legendary_check
  check (legendary in ('dato', 'bomoh', 'ring', 'hijau'));

-- 3. Columns. ring_stash and hijau_stash have the shape of bomoh_stash: { code, card, lat, lng, claimedBy, claimedAt }.
-- hijau is the run: { claimedBy, claimedAt, startsAt, deadline, sentAt, settledAt, tapped[], targets[], fixes, lockedUntil }.
-- fixes maps a tapper's player id to where they tapped ({ lat, lng, at }); lockedUntil is the end of Penjara's 3-minute
-- lock, set when the run settles (null when it was void).
-- players.arrest is a runner's house arrest: { firedAt, route, by, center, startedAt, ringId, catchEventId }, or null.
alter table games add column if not exists ring_stash jsonb;
alter table games add column if not exists hijau_stash jsonb;
alter table games add column if not exists hijau jsonb;
alter table players add column if not exists arrest jsonb;

-- 4. Super Ring's stash: mirrors claim_dato() exactly, but the card it inserts is a 'ring'.
create or replace function claim_ring(p_game uuid, p_player uuid, p_at timestamptz) returns setof powerups
language plpgsql
as $$
declare
  g games;
  new_row powerups;
begin
  select * into g from games where id = p_game for update;
  if not found or g.ring_stash is null or jsonb_typeof(g.ring_stash) <> 'object'
     or coalesce(jsonb_typeof(g.ring_stash -> 'lat'), 'missing') <> 'number'
     or (g.ring_stash ->> 'claimedBy') is not null then
    return;
  end if;
  update games
     set ring_stash = g.ring_stash || jsonb_build_object(
           'claimedBy', p_player::text,
           'claimedAt', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where id = p_game;
  insert into powerups (game_id, player_id, kind, station, claimed_at)
    values (p_game, p_player, 'ring', null, p_at)
    returning * into new_row;
  return next new_row;
end;
$$;

revoke execute on function claim_ring(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function claim_ring(uuid, uuid, timestamptz) to service_role;

-- 5. Mak Kau Hijau: marks the stash claimed and writes the run in one step. True iff this call won the claim.
create or replace function claim_hijau(p_game uuid, p_player uuid, p_at timestamptz, p_starts timestamptz, p_deadline timestamptz) returns boolean
language plpgsql
as $$
declare
  g games;
  stamp text := to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into g from games where id = p_game for update;
  if not found or g.hijau_stash is null or jsonb_typeof(g.hijau_stash) <> 'object'
     or coalesce(jsonb_typeof(g.hijau_stash -> 'lat'), 'missing') <> 'number'
     or (g.hijau_stash ->> 'claimedBy') is not null then
    return false;
  end if;
  update games
     set hijau_stash = g.hijau_stash || jsonb_build_object('claimedBy', p_player::text, 'claimedAt', stamp),
         hijau = jsonb_build_object(
           'claimedBy', p_player::text,
           'claimedAt', stamp,
           'startsAt', to_char(p_starts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'deadline', to_char(p_deadline at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'sentAt', null,
           'settledAt', null,
           'tapped', '[]'::jsonb,
           'targets', '[]'::jsonb,
           'fixes', '{}'::jsonb,
           'lockedUntil', null)
   where id = p_game;
  return true;
end;
$$;

revoke execute on function claim_hijau(uuid, uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function claim_hijau(uuid, uuid, timestamptz, timestamptz, timestamptz) to service_role;

-- 6. Sets hijau.sentAt and hijau.targets (the player ids the push goes to, a jsonb array) together, once. True iff
-- this call set them. One UPDATE, so two callers never both win.
create or replace function claim_hijau_push(p_game uuid, p_at timestamptz, p_targets jsonb) returns boolean
language plpgsql
as $$
begin
  if p_targets is null or jsonb_typeof(p_targets) <> 'array' then
    raise exception 'claim_hijau_push: p_targets must be a jsonb array';
  end if;
  update games
     set hijau = jsonb_set(
           jsonb_set(hijau, '{sentAt}', to_jsonb(to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
           '{targets}', p_targets)
   where id = p_game
     and hijau is not null and jsonb_typeof(hijau) = 'object'
     and (hijau ->> 'sentAt') is null;
  return found;
end;
$$;

revoke execute on function claim_hijau_push(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function claim_hijau_push(uuid, timestamptz, jsonb) to service_role;

-- 7. Adds a runner to hijau.tapped only while the run is unsettled, before the deadline, and only once, and keeps
-- where they tapped (p_fix, { lat, lng, at }) in hijau.fixes in the same update when there is one. True iff this
-- call added them.
drop function if exists tap_hijau(uuid, uuid, timestamptz);
create or replace function tap_hijau(p_game uuid, p_player uuid, p_at timestamptz, p_fix jsonb default null) returns boolean
language plpgsql
as $$
begin
  update games
     set hijau = jsonb_set(hijau, '{tapped}', (hijau -> 'tapped') || to_jsonb(p_player::text))
       || case
            when p_fix is null or jsonb_typeof(p_fix) <> 'object' then '{}'::jsonb
            else jsonb_build_object('fixes',
              (case when jsonb_typeof(hijau -> 'fixes') = 'object' then hijau -> 'fixes' else '{}'::jsonb end)
                || jsonb_build_object(p_player::text, p_fix))
          end
   where id = p_game
     and hijau is not null and jsonb_typeof(hijau) = 'object'
     and (hijau ->> 'settledAt') is null
     and p_at < (hijau ->> 'deadline')::timestamptz
     and not ((hijau -> 'tapped') @> to_jsonb(p_player::text));
  return found;
end;
$$;

revoke execute on function tap_hijau(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function tap_hijau(uuid, uuid, timestamptz, jsonb) to service_role;

-- 8. Sets hijau.settledAt and hijau.lockedUntil (the end of Penjara's lock; null for a void run) once and returns the
-- run (null if there's no run or it already settled).
drop function if exists claim_hijau_settle(uuid, timestamptz);
create or replace function claim_hijau_settle(p_game uuid, p_at timestamptz, p_locked_until timestamptz default null) returns jsonb
language plpgsql
as $$
declare
  run jsonb;
begin
  update games
     set hijau = jsonb_set(hijau, '{settledAt}', to_jsonb(to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
       || jsonb_build_object('lockedUntil', case
            when p_locked_until is null then null
            else to_jsonb(to_char(p_locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          end)
   where id = p_game
     and hijau is not null and jsonb_typeof(hijau) = 'object'
     and (hijau ->> 'settledAt') is null
  returning hijau into run;
  return run;
end;
$$;

revoke execute on function claim_hijau_settle(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function claim_hijau_settle(uuid, timestamptz, timestamptz) to service_role;

-- 9. House arrest. start_arrest: only a runner with no arrest who isn't jailed. True iff this call started it.
create or replace function start_arrest(p_player uuid, p_arrest jsonb) returns boolean
language plpgsql
as $$
begin
  update players
     set arrest = p_arrest
   where id = p_player
     and (arrest is null or arrest = 'null'::jsonb)
     and not jailed;
  return found;
end;
$$;

revoke execute on function start_arrest(uuid, jsonb) from public, anon, authenticated;
grant execute on function start_arrest(uuid, jsonb) to service_role;

-- update_arrest: merges a patch into an existing arrest; does nothing without one.
create or replace function update_arrest(p_player uuid, p_patch jsonb) returns void
language plpgsql
as $$
begin
  update players
     set arrest = arrest || p_patch
   where id = p_player
     and arrest is not null and arrest <> 'null'::jsonb;
end;
$$;

revoke execute on function update_arrest(uuid, jsonb) from public, anon, authenticated;
grant execute on function update_arrest(uuid, jsonb) to service_role;

-- end_arrest: clears the arrest only if its firedAt is still p_fired_at and, when p_waiting, only while it hasn't
-- started (startedAt null), so a no-show never beats an opening fix. True iff this call cleared it.
create or replace function end_arrest(p_player uuid, p_fired_at text, p_waiting boolean default false) returns boolean
language plpgsql
as $$
begin
  update players
     set arrest = null
   where id = p_player
     and (arrest ->> 'firedAt') = p_fired_at
     and (not p_waiting or (arrest ->> 'startedAt') is null);
  return found;
end;
$$;

revoke execute on function end_arrest(uuid, text, boolean) from public, anon, authenticated;
grant execute on function end_arrest(uuid, text, boolean) to service_role;

-- 10. steal_card, from 0013_luar_garisan.sql, unchanged except that Super Ring is immune like Dato Seri.
create or replace function steal_card(p_game uuid, p_side text, p_at timestamptz) returns setof powerups
language plpgsql
as $$
declare
  victim uuid;
  card powerups;
begin
  perform pg_advisory_xact_lock(hashtext('steal:' || p_game::text));
  for attempt in 1..3 loop
    select pl.id into victim
      from players pl
     where pl.game_id = p_game
       and pl.role = p_side
       and pl.removed_at is null
       and pl.disqualified_at is null
       and (p_side <> 'runner' or not pl.jailed)
       and exists (
         select 1 from powerups u
          where u.player_id = pl.id
            and u.used_at is null and u.consumed_at is null and u.taken_at is null
            and not u.sealed and u.kind not in ('dato', 'ring'))
     order by random()
     limit 1;
    if victim is null then
      return;
    end if;
    update powerups
       set taken_at = p_at
     where id = (
       select u.id from powerups u
        where u.player_id = victim
          and u.used_at is null and u.consumed_at is null and u.taken_at is null
          and not u.sealed and u.kind not in ('dato', 'ring')
        order by random()
        limit 1
        for update)
       and used_at is null and consumed_at is null and taken_at is null and not sealed
    returning * into card;
    if found then
      return next card;
      return;
    end if;
    -- The owner used the card at the same moment: pick again.
  end loop;
  -- Gave up after 3 lost races: returns nothing, so the stealer is not charged (the app gives the card back).
end;
$$;

revoke execute on function steal_card(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function steal_card(uuid, text, timestamptz) to service_role;

-- 11. resume_game, from 0019_new_deck_cards.sql, unchanged except that a house arrest's clock, a Mak Kau Hijau
-- window that hasn't closed and Penjara's lock while it runs move by the pause too.
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

-- 12. wipe_game, from 0019_new_deck_cards.sql, plus clearing every arrest (its centre is a runner's position) and
-- Mak Kau Hijau's tap spots (hijau.fixes, runners' exact positions; fair-play §1.8). The rest of the run stays.
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
  update powerups set spot = null where game_id = p_game;
  update players set arrest = null where game_id = p_game;
  update games set hijau = hijau - 'fixes' where id = p_game and jsonb_typeof(hijau) = 'object';
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

commit;
