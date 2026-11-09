-- Organiser setup: the packing list. `kit` holds the ticks and the placed cards: { "ticks": { id: label }, "placed": { id: true } }.
-- Then each organisation's reusable secret cards (A-C yellow for Dato Seri, A-C purple for Bomoh).
-- Safe to run again: one transaction, every step guarded. Run it before the code that reads this column goes live.
-- Order: columns, then tables, then functions.

begin;

-- Columns

alter table games add column if not exists kit jsonb not null default '{}'::jsonb;

-- Tables

-- `state`: ready (printed, can be put in play), retired (found, or retired by hand), printing (a new code not yet
-- confirmed printed). The app makes the six on an organisation's first read. Only the service role reads them.
create table if not exists secret_cards (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations (id) on delete cascade,
  legendary text not null check (legendary in ('dato', 'bomoh')),
  letter text not null check (letter in ('A', 'B', 'C')),
  code text not null,
  state text not null default 'ready' check (state in ('ready', 'retired', 'printing')),
  found_at timestamptz,
  unique (organisation_id, legendary, letter)
);

alter table secret_cards enable row level security;

-- Functions

-- Sets one packing-list key (p_value a JSON label or true) or removes it (p_value null), in one UPDATE, so two
-- phones ticking at once never drop each other's ticks. jsonb_set won't create a missing parent, so the
-- { ticks, placed } object is rebuilt first.
create or replace function set_kit_key(p_game uuid, p_group text, p_key text, p_value jsonb) returns void
language plpgsql
set search_path = public
as $$
begin
  if p_group not in ('ticks', 'placed') then
    raise exception 'unknown kit group %', p_group;
  end if;
  if p_value is null or p_value = 'null'::jsonb then
    update games set kit = kit #- array[p_group, p_key] where id = p_game;
  else
    update games
       set kit = jsonb_set(
             jsonb_build_object(
               'ticks', case when jsonb_typeof(kit -> 'ticks') = 'object' then kit -> 'ticks' else '{}'::jsonb end,
               'placed', case when jsonb_typeof(kit -> 'placed') = 'object' then kit -> 'placed' else '{}'::jsonb end),
             array[p_group, p_key], p_value)
     where id = p_game;
  end if;
end;
$$;

revoke execute on function set_kit_key(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function set_kit_key(uuid, text, text, jsonb) to service_role;

commit;
