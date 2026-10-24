-- Kejar marshal and safety tools (plan 3). Server-only like the other game tables:
-- RLS on with NO policies, so the anon/publishable key gets nothing.

alter table games
  add column paused_at timestamptz,
  add column pauses jsonb not null default '[]',
  -- The organiser has no player row, so their phone's push subscription for SOS alerts lives here.
  add column host_push jsonb;

alter table players
  add column removed_at timestamptz,
  add column outside boolean not null default false,
  add column left_start boolean not null default false;

-- SOS, reports and removals, kept apart from the game data: no cascade, so these survive
-- the 24 h game wipe (spec §6: kept 12 months, visible only to the owner).
create table safety_records (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games (id) on delete set null,
  type text not null check (type in ('sos', 'report', 'removed')),
  player_id uuid,
  target_id uuid,
  lat float8,
  lng float8,
  data jsonb not null default '{}',
  at timestamptz not null
);
create index safety_records_at on safety_records (at);
alter table safety_records enable row level security;

-- Resumes a paused game atomically: closes the pause and moves every ping that hasn't been
-- revealed yet later by the pause length. Returns the pause length in ms, or null if the
-- game wasn't paused (so two marshals tapping Resume at once shift the clock only once).
create function resume_game(p_game uuid, p_at timestamptz) returns int
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
  update pings set alert_at = alert_at + d, reveal_at = reveal_at + d
    where game_id = p_game and not revealed;
  return (extract(epoch from d) * 1000)::int;
end;
$$;

revoke execute on function resume_game(uuid, timestamptz) from public, anon, authenticated;
grant execute on function resume_game(uuid, timestamptz) to service_role;
