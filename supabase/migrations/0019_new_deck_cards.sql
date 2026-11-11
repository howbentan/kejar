-- Three new Full-mode cards: Cheese Ais ('cheese'), Nasi Lemak KFC ('combo') and Tuch and Ga ('toll').
-- Data model only: the kinds, the columns they need and the atomic steps. Safe to run again.

begin;

-- 1. The new kinds are allowed.
alter table powerups drop constraint if exists powerups_kind_check;
alter table powerups
  add constraint powerups_kind_check
  check (kind in ('decoy', 'shield', 'cloak', 'flare', 'focus', 'toyol', 'along', 'grab', 'dato', 'cheese', 'combo', 'toll'));

-- 2. twin_of: the card a Nasi Lemak KFC twin doubles. spot: where a Tuch and Ga gate stands.
-- frozen_until: a chaser caught in a gate, frozen until then.
alter table powerups add column if not exists twin_of uuid references powerups(id);
alter table powerups add column if not exists spot jsonb;
alter table players add column if not exists frozen_until timestamptz;

-- 3. Freezes a chaser only if they aren't frozen at p_at. True iff this call froze them, so two phones freeze once.
create or replace function freeze_chaser(p_player uuid, p_until timestamptz, p_at timestamptz) returns boolean
language plpgsql
as $$
begin
  update players
     set frozen_until = p_until
   where id = p_player
     and (frozen_until is null or frozen_until <= p_at);
  return found;
end;
$$;

revoke execute on function freeze_chaser(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function freeze_chaser(uuid, timestamptz, timestamptz) to service_role;

-- 4. Nasi Lemak KFC: locks this player's ready combo (used, not consumed, not taken), consumes it and inserts a twin
-- of p_powerup. Returns the twin, or nothing if no combo was ready (or the card isn't there).
create or replace function apply_combo(p_player uuid, p_powerup uuid, p_at timestamptz) returns setof powerups
language plpgsql
as $$
declare
  combo_id uuid;
  src powerups;
  new_row powerups;
begin
  select * into src from powerups where id = p_powerup;
  if not found then
    return;
  end if;
  select id into combo_id from powerups
   where player_id = p_player and kind = 'combo' and used_at is not null and consumed_at is null and taken_at is null
   order by claimed_at
   limit 1
   for update skip locked;
  if combo_id is null then
    return;
  end if;
  update powerups set consumed_at = p_at where id = combo_id;
  insert into powerups (game_id, player_id, kind, station, claimed_at, sealed, twin_of)
    values (src.game_id, p_player, src.kind, null, p_at, src.sealed, src.id)
    returning * into new_row;
  return next new_row;
end;
$$;

revoke execute on function apply_combo(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function apply_combo(uuid, uuid, timestamptz) to service_role;

-- 5. resume_game, from 0017_penjara.sql, unchanged except that a running freeze moves by the pause too.
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
  -- A running Tuch and Ga freeze waits out the pause too (one that ended before the pause is left alone).
  update players
    set frozen_until = frozen_until + d
    where game_id = p_game and frozen_until > started;
  return (extract(epoch from d) * 1000)::int;
end;
$$;

revoke execute on function resume_game(uuid, timestamptz) from public, anon, authenticated;
grant execute on function resume_game(uuid, timestamptz) to service_role;

commit;
