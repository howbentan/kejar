-- Plan 4b: saved arenas (real park outlines) and a cache for OpenStreetMap lookups.
-- RLS on with NO policies, same as every other table here: only /api/game (service role) reads them.

-- A park set up once and reused. `draft` is what the organiser chose (outline, lakes, circle, points)
-- so the lakes can be re-checked later; `arena` is the play area built from it. Games copy `arena`
-- when they're created, so editing or deleting a saved arena never changes an existing game.
create table arenas (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations (id) on delete cascade,
  name text not null,
  draft jsonb not null,
  arena jsonb not null,
  water_checked boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index arenas_organisation on arenas (organisation_id, updated_at desc);

-- OpenStreetMap answers, kept so repeated searches don't hit the public services again
-- (their usage policy asks for caching).
create table osm_cache (
  key text primary key,
  body jsonb not null,
  fetched_at timestamptz not null
);

alter table arenas enable row level security;
alter table osm_cache enable row level security;
