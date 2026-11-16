-- Tupperware legendaries (design 2026-11-17): the single-use slips printed for the side quest, and when each player's
-- one try was spent. A slip's token is stored as-is (like secret_cards.code) so the print page can redraw a sheet.
-- Safe to run again. Run it before the code that reads this goes live.

create table if not exists slips (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations (id) on delete cascade,
  side text not null check (side in ('dikejar', 'kejar')),
  number int not null,
  token text not null unique,
  bound_game_id uuid references games (id) on delete set null,
  bound_at timestamptz,
  used_at timestamptz,
  used_by uuid,
  unique (organisation_id, side, number)
);
alter table slips enable row level security;

alter table players add column if not exists side_quest_at timestamptz;
