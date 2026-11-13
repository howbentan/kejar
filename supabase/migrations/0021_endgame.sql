-- The endgame: one rolled twist per game (Bomba, Hang Hebat, PKP), kept secret until it is revealed. Data model only:
-- the column and the atomic steps. Safe to run again: one transaction, every step guarded. Run it before the code that
-- reads this goes live.

begin;

-- 1. games.endgame is { kind, revealedAt, wanted, bountyAt }, or null (no endgame, and every older game). It is rolled
-- at start like deck_seed and never sent to a client before revealedAt is set. wanted is a player id (Hang Hebat only).
alter table games add column if not exists endgame jsonb;

-- 2. The reveal: sets revealedAt (and wanted) once, only while the endgame exists, hasn't been revealed and the game is
-- still on. True iff this call set it, so two polls at the same moment reveal once.
create or replace function claim_endgame_reveal(p_game uuid, p_at timestamptz, p_wanted uuid default null) returns boolean
language plpgsql
as $$
begin
  update games
     set endgame = endgame || jsonb_build_object(
           'revealedAt', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'wanted', p_wanted::text)
   where id = p_game
     and endgame is not null and jsonb_typeof(endgame) = 'object'
     and (endgame ->> 'revealedAt') is null
     and ended_at is null;
  return found;
end;
$$;

revoke execute on function claim_endgame_reveal(uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function claim_endgame_reveal(uuid, timestamptz, uuid) to service_role;

-- 3. Hang Hebat's bounty hold starts: sets bountyAt once while it is null and the game is still on. True iff this call set it.
create or replace function claim_bounty(p_game uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
begin
  update games
     set endgame = endgame || jsonb_build_object(
           'bountyAt', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where id = p_game
     and endgame is not null and jsonb_typeof(endgame) = 'object'
     and (endgame ->> 'bountyAt') is null
     and ended_at is null;
  return found;
end;
$$;

revoke execute on function claim_bounty(uuid, timestamptz) from public, anon, authenticated;
grant execute on function claim_bounty(uuid, timestamptz) to service_role;

-- 4. Takes the hold back (the wanted runner was undone): bountyAt goes back to null.
create or replace function clear_bounty(p_game uuid) returns void
language plpgsql
as $$
begin
  update games
     set endgame = endgame || jsonb_build_object('bountyAt', null)
   where id = p_game
     and endgame is not null and jsonb_typeof(endgame) = 'object';
end;
$$;

revoke execute on function clear_bounty(uuid) from public, anon, authenticated;
grant execute on function clear_bounty(uuid) to service_role;

-- 5. Names (or clears, with null) the wanted runner.
create or replace function set_wanted(p_game uuid, p_player uuid) returns void
language plpgsql
as $$
begin
  update games
     set endgame = endgame || jsonb_build_object('wanted', p_player::text)
   where id = p_game
     and endgame is not null and jsonb_typeof(endgame) = 'object';
end;
$$;

revoke execute on function set_wanted(uuid, uuid) from public, anon, authenticated;
grant execute on function set_wanted(uuid, uuid) to service_role;

-- 6. A twin of a card without a combo (PKP's station claims): the same row apply_combo inserts, but nothing is
-- consumed. Returns the twin, or nothing if the card isn't there or already has a twin. The source row is locked so
-- two calls never both make one.
create or replace function add_twin(p_powerup uuid, p_at timestamptz) returns setof powerups
language plpgsql
as $$
declare
  src powerups;
  new_row powerups;
begin
  select * into src from powerups where id = p_powerup for update;
  if not found or exists (select 1 from powerups where twin_of = p_powerup) then
    return;
  end if;
  insert into powerups (game_id, player_id, kind, station, claimed_at, sealed, twin_of)
    values (src.game_id, src.player_id, src.kind, null, p_at, src.sealed, src.id)
    returning * into new_row;
  return next new_row;
end;
$$;

revoke execute on function add_twin(uuid, timestamptz) from public, anon, authenticated;
grant execute on function add_twin(uuid, timestamptz) to service_role;

commit;
