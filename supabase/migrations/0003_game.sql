-- Kejar core game (plan 2). The browser never reads these tables directly:
-- every access goes through /api/game with the secret key, so RLS is on with
-- NO policies (the anon/publishable key gets nothing).

create table games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  arena jsonb not null,
  settings jsonb not null,
  host_key_hash text not null,
  started_at timestamptz,
  ended_at timestamptz,
  winner text check (winner in ('runners', 'chasers')),
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  name text not null,
  role text check (role in ('runner', 'chaser', 'marshal')),
  tag_id int check (tag_id between 1 and 99),
  token_hash text not null,
  accepted_at timestamptz not null,
  caught_at timestamptz,
  caught_by uuid,
  jailed boolean not null default false,
  freed_once boolean not null default false,
  push jsonb,
  unique (game_id, token_hash),
  unique (game_id, tag_id)
);

create table locations (
  id bigint generated always as identity primary key,
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  lat float8 not null,
  lng float8 not null,
  accuracy_m float8 not null default 0,
  at timestamptz not null default now()
);
create index locations_game_at on locations (game_id, at);

create table pings (
  game_id uuid not null references games (id) on delete cascade,
  seq int not null,
  alert_at timestamptz not null,
  reveal_at timestamptz not null,
  alerted boolean not null default false,
  revealed boolean not null default false,
  primary key (game_id, seq)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  at timestamptz not null default now(),
  type text not null,
  actor_id uuid,
  target_id uuid,
  data jsonb not null default '{}'
);
create index events_game_at on events (game_id, at);

alter table games enable row level security;
alter table players enable row level security;
alter table locations enable row level security;
alter table pings enable row level security;
alter table events enable row level security;

-- Latest position per player at or before a moment. The game only ever needs
-- these few rows, never the whole history (which would hit the 1,000-row API cap).
create index locations_player_at on locations (game_id, player_id, at desc);

create function latest_positions(p_game uuid, p_at timestamptz)
returns table (player_id uuid, lat float8, lng float8, accuracy_m float8, at timestamptz)
language sql stable
as $$
  select distinct on (l.player_id) l.player_id, l.lat, l.lng, l.accuracy_m, l.at
  from locations l
  where l.game_id = p_game and l.at <= p_at
  order by l.player_id, l.at desc
$$;

revoke execute on function latest_positions(uuid, timestamptz) from public, anon, authenticated;
