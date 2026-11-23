-- Playtest batch (2026-11-24): a station scan deals five face-down cards and the pick decides; Sike is the empty card.
-- Run once in the Supabase SQL editor.
begin;

-- 1. Sike is a card kind (it never sits in a hand: a picked Sike is used and spent at once).
alter table powerups drop constraint if exists powerups_kind_check;
alter table powerups
  add constraint powerups_kind_check
  check (kind in ('sike', 'decoy', 'shield', 'cloak', 'flare', 'focus', 'toyol', 'along', 'grab', 'dato', 'cheese', 'combo', 'toll', 'ring'));

-- 2. The open deal on a reserved station card: { cards: text[5], backs: text[5], auto: int }. Null once picked.
alter table powerups add column if not exists deal jsonb;

-- 3. claim_station with a deal: the same lock and checks as claim_station, inserting the reserved card sealed (so
--    Toyol and Ah Long can't take a card nobody has seen) and carrying its deal, in one transaction.
create or replace function claim_station_deal(
  p_game uuid, p_player uuid, p_station int, p_kind text, p_at timestamptz, p_lock_ms int, p_deal jsonb
) returns table (result text, locked_for_ms int, powerup jsonb)
language plpgsql
as $$
declare
  last_claim timestamptz;
  new_row powerups;
begin
  perform pg_advisory_xact_lock(hashtext(p_game::text || ':' || p_station::text));
  if exists (select 1 from powerups where game_id = p_game and player_id = p_player and station = p_station) then
    return query select 'already-claimed'::text, null::int, null::jsonb;
    return;
  end if;
  select max(claimed_at) into last_claim from powerups where game_id = p_game and station = p_station;
  if last_claim is not null and last_claim + make_interval(secs => p_lock_ms / 1000.0) > p_at then
    return query select 'locked'::text,
      ceil(extract(epoch from (last_claim + make_interval(secs => p_lock_ms / 1000.0) - p_at)) * 1000)::int,
      null::jsonb;
    return;
  end if;
  insert into powerups (game_id, player_id, kind, station, claimed_at, sealed, deal)
    values (p_game, p_player, p_kind, p_station, p_at, true, p_deal) returning * into new_row;
  return query select 'ok'::text, null::int, to_jsonb(new_row);
end;
$$;

revoke execute on function claim_station_deal(uuid, uuid, int, text, timestamptz, int, jsonb) from public, anon, authenticated;
grant execute on function claim_station_deal(uuid, uuid, int, text, timestamptz, int, jsonb) to service_role;

commit;
