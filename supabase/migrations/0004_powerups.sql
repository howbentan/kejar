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

alter table powerups enable row level security;
