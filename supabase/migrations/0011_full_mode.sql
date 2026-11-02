-- Kejar Full mode (Plan D). One migration for the whole plan; each task appends what it needs.
-- Safe to run again: it is one transaction (a failure part-way leaves nothing behind), and every step is guarded
-- (if exists / if not exists / create or replace), so re-running after a success changes nothing.

begin;

-- Task 1: Toyol and Ah Long (power-ups design §6.2).
-- Every new card kind is allowed now (Toyol, Ah Long, Abang Grab, Dato Seri), so later tasks leave the constraint alone.
alter table powerups drop constraint if exists powerups_kind_check;
alter table powerups
  add constraint powerups_kind_check
  check (kind in ('decoy', 'shield', 'cloak', 'flare', 'focus', 'toyol', 'along', 'grab', 'dato'));

-- A card Toyol or Ah Long took: gone from every hand. Sealed = delivered by Abang Grab, can't be stolen.
alter table powerups
  add column if not exists taken_at timestamptz,
  add column if not exists sealed boolean not null default false;

-- Takes one random card from a random eligible player on p_side: player first, then card (§6.2).
-- Runners must be free (not jailed); cards must be unused, unconsumed, untaken, unsealed and not Dato Seri.
-- Thefts in one game are serialised by an advisory lock (like claim_station), and the card row is locked
-- and re-checked when it is taken, so two thieves never take the same card. Returns the card, or nothing.
create or replace function steal_card(p_game uuid, p_side text, p_at timestamptz) returns setof powerups
language plpgsql
as $$
declare
  victim uuid;
  card powerups;
begin
  perform pg_advisory_xact_lock(hashtext('steal:' || p_game::text));
  for attempt in 1..3 loop
    select pl.id into victim
      from players pl
     where pl.game_id = p_game
       and pl.role = p_side
       and pl.removed_at is null
       and (p_side <> 'runner' or not pl.jailed)
       and exists (
         select 1 from powerups u
          where u.player_id = pl.id
            and u.used_at is null and u.consumed_at is null and u.taken_at is null
            and not u.sealed and u.kind <> 'dato')
     order by random()
     limit 1;
    if victim is null then
      return;
    end if;
    update powerups
       set taken_at = p_at
     where id = (
       select u.id from powerups u
        where u.player_id = victim
          and u.used_at is null and u.consumed_at is null and u.taken_at is null
          and not u.sealed and u.kind <> 'dato'
        order by random()
        limit 1
        for update)
       and used_at is null and consumed_at is null and taken_at is null and not sealed
    returning * into card;
    if found then
      return next card;
      return;
    end if;
    -- The owner used the card at the same moment: pick again.
  end loop;
  -- Gave up after 3 lost races: returns nothing, so the stealer is not charged (the app gives the card back).
end;
$$;

-- Server-only, like the other game functions.
revoke execute on function steal_card(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function steal_card(uuid, text, timestamptz) to service_role;

-- Task 2: Abang Grab, "order off the menu" (power-ups §6.3).
-- A delivered card has no station. The station check (between 1 and 8) already passes for null, and the
-- unique index on (game_id, player_id, station) treats nulls as distinct, so a player can hold several
-- delivered cards over a game; claim_station's "already claimed here" test never matches a null station.
alter table powerups alter column station drop not null;
-- offer_from: the first of the 3 draw numbers the Grab reserved; offer: the 3 kinds the app worked out from them.
alter table powerups
  add column if not exists offer_from int,
  add column if not exists offer jsonb;

-- On use: locks the Grab, and if it's still held and hasn't reserved yet, bumps the side's draw counter by p_n
-- in the same transaction and remembers the first number. A Grab that already reserved returns the same first
-- number and its offer (re-opened screen, double-tap) without drawing again. Nothing if the Grab is gone.
create or replace function open_grab(p_powerup uuid, p_side text, p_n int) returns table (first_draw int, offer jsonb)
language plpgsql
as $$
declare
  g powerups;
  f int;
begin
  select * into g from powerups where id = p_powerup and kind = 'grab' for update;
  if not found or g.used_at is not null or g.taken_at is not null then
    return;
  end if;
  if g.offer_from is not null then
    return query select g.offer_from, g.offer;
    return;
  end if;
  update games
     set runner_draws = runner_draws + (p_side = 'runner')::int * p_n,
         chaser_draws = chaser_draws + (p_side = 'chaser')::int * p_n
   where id = g.game_id
  returning (case when p_side = 'runner' then runner_draws else chaser_draws end) - p_n into f;
  update powerups set offer_from = f where id = p_powerup;
  return query select f, null::jsonb;
end;
$$;

-- On pick: locks the Grab, re-checks it (this player's, still held, has an offer, choice in range), marks it
-- used and inserts the chosen card sealed with no station, all in one transaction. The other two offered
-- cards aren't reinserted: their draw numbers are spent, so they come back at the next reshuffle.
create or replace function pick_grab(p_powerup uuid, p_player uuid, p_choice int, p_at timestamptz)
returns table (result text, powerup jsonb)
language plpgsql
as $$
declare
  g powerups;
  new_row powerups;
begin
  select * into g from powerups where id = p_powerup for update;
  if not found or g.player_id <> p_player then
    return query select 'not-yours'::text, null::jsonb;
    return;
  end if;
  -- Toyol or Ah Long took it while its offer was open: say so, rather than "already used".
  if g.taken_at is not null then
    return query select 'taken'::text, null::jsonb;
    return;
  end if;
  if g.used_at is not null then
    return query select 'already-used'::text, null::jsonb;
    return;
  end if;
  if g.kind <> 'grab' or g.offer is null then
    return query select 'no-offer'::text, null::jsonb;
    return;
  end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(g.offer) then
    return query select 'bad-choice'::text, null::jsonb;
    return;
  end if;
  update powerups set used_at = p_at where id = p_powerup;
  insert into powerups (game_id, player_id, kind, station, claimed_at, sealed)
    values (g.game_id, p_player, g.offer ->> p_choice, null, p_at, true)
    returning * into new_row;
  return query select 'ok'::text, to_jsonb(new_row);
end;
$$;

-- Server-only, like the other game functions.
revoke execute on function open_grab(uuid, text, int) from public, anon, authenticated;
grant execute on function open_grab(uuid, text, int) to service_role;
revoke execute on function pick_grab(uuid, uuid, int, timestamptz) from public, anon, authenticated;
grant execute on function pick_grab(uuid, uuid, int, timestamptz) to service_role;

-- Task 7: Dato Seri's hidden stash (jail design §4b). Where the organiser or a marshal dropped the card,
-- and who scanned it first: { code, lat, lng, claimedBy, claimedAt }. A Full game gets it when it's made, with
-- its own secret card code (ruling R15) and lat/lng null until the card is dropped. Null = no stash this game.
alter table games add column if not exists dato_stash jsonb;

-- The first free runner to scan the stash: locks the game row, re-checks it was dropped and nobody has claimed
-- it, marks it claimed and inserts the 'dato' card (no station) in one transaction, so two scans at once give one
-- card. The app has already checked the card's code and the scanner (a free runner, close enough, empty slot).
-- Returns the card, or nothing.
create or replace function claim_dato(p_game uuid, p_player uuid, p_at timestamptz) returns setof powerups
language plpgsql
as $$
declare
  g games;
  new_row powerups;
begin
  select * into g from games where id = p_game for update;
  if not found or g.dato_stash is null or jsonb_typeof(g.dato_stash) <> 'object'
     or coalesce(jsonb_typeof(g.dato_stash -> 'lat'), 'missing') <> 'number'
     or (g.dato_stash ->> 'claimedBy') is not null then
    return;
  end if;
  update games
     set dato_stash = g.dato_stash || jsonb_build_object(
           'claimedBy', p_player::text,
           'claimedAt', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where id = p_game;
  insert into powerups (game_id, player_id, kind, station, claimed_at)
    values (p_game, p_player, 'dato', null, p_at)
    returning * into new_row;
  return next new_row;
end;
$$;

revoke execute on function claim_dato(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function claim_dato(uuid, uuid, timestamptz) to service_role;

commit;
