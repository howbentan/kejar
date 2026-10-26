-- Plan 4a: organiser accounts and marshal pre-assignment links.
-- RLS on with NO policies, same as every other table here — the browser never
-- talks to these directly, only /api/game with the service-role key.

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table organisers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  session_token_hash text not null,
  session_created_at timestamptz not null default now()
);
create index organisers_session_token_hash on organisers (session_token_hash);

create table organiser_invites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations (id) on delete cascade,
  -- Set = a re-link invite for this existing organiser (new phone). Null = invite for a brand new organiser.
  organiser_id uuid references organisers (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);

create table marshal_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);

-- The anonymous per-game secret is retired; games now belong to a persistent organiser.
-- This project has no live games on the old scheme worth preserving (pre-launch), so this
-- is a clean cutover, not a backfill.
alter table games drop column host_key_hash;
alter table games add column organiser_id uuid not null references organisers (id);

alter table organisations enable row level security;
alter table organisers enable row level security;
alter table organiser_invites enable row level security;
alter table marshal_invites enable row level security;
