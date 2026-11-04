-- Request limits (API hardening, Task 2): one counter per key per time window, kept in Postgres
-- so every Vercel instance shares it. Safe to run again: one transaction, every step guarded.

begin;

create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
alter table rate_limits enable row level security;

-- Counts this request and says whether it is still within p_limit for the current window.
-- About 1 call in 100 also sweeps counters older than an hour.
create or replace function hit_rate_limit(p_key text, p_window_ms int, p_limit int) returns boolean
language plpgsql
as $$
declare
  win timestamptz;
  hits int;
begin
  win := to_timestamp(floor(extract(epoch from now()) * 1000 / p_window_ms) * p_window_ms / 1000.0);
  insert into rate_limits (key, window_start, count)
    values (p_key, win, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count into hits;
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 hour';
  end if;
  return hits <= p_limit;
end;
$$;

revoke execute on function hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, int, int) to service_role;

-- Stores one location fix unless that player already has one newer than p_min_gap_ms (Task 3).
-- Says whether it stored. The check and the insert are one statement, so two requests can't both pass.
create or replace function add_position(
  p_game uuid, p_player uuid, p_lat float8, p_lng float8, p_accuracy float8, p_at timestamptz, p_min_gap_ms int
) returns boolean
language plpgsql
as $$
declare
  stored int;
begin
  insert into locations (game_id, player_id, lat, lng, accuracy_m, at)
  select p_game, p_player, p_lat, p_lng, p_accuracy, p_at
  where not exists (
    select 1 from locations l
    where l.game_id = p_game and l.player_id = p_player
      and l.at > p_at - make_interval(secs => p_min_gap_ms / 1000.0)
  );
  get diagnostics stored = row_count;
  return stored > 0;
end;
$$;

revoke execute on function add_position(uuid, uuid, float8, float8, float8, timestamptz, int) from public, anon, authenticated;
grant execute on function add_position(uuid, uuid, float8, float8, float8, timestamptz, int) to service_role;

commit;
