-- Kejar power-ups (plan 5). Server-only like the other game tables:
-- RLS on with NO policies, so the anon/publishable key gets nothing.

create table powerups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  kind text not null check (kind in ('decoy', 'shield', 'cloak', 'flare', 'focus')),
  station int not null check (station between 1 and 8),
  claimed_at timestamptz not null,
  used_at timestamptz,
  consumed_at timestamptz
);
create index powerups_game on powerups (game_id);
-- One claim per player per station per game, even under double-taps.
create unique index powerups_once_per_station on powerups (game_id, player_id, station);

-- Claims a station atomically: lock the station, re-check, insert. Two players scanning at the
-- same moment are serialised, so only one gets the power-up and the other sees the 60 s lock.
create function claim_station(
  p_game uuid, p_player uuid, p_station int, p_kind text, p_at timestamptz, p_lock_ms int
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
  insert into powerups (game_id, player_id, kind, station, claimed_at)
    values (p_game, p_player, p_kind, p_station, p_at) returning * into new_row;
  return query select 'ok'::text, null::int, to_jsonb(new_row);
end;
$$;

revoke execute on function claim_station(uuid, uuid, int, text, timestamptz, int) from public, anon, authenticated;
grant execute on function claim_station(uuid, uuid, int, text, timestamptz, int) to service_role;

alter table powerups enable row level security;
