-- Kejar Full mode (Plan D). One migration for the whole plan; each task appends what it needs.

-- Task 1: Toyol and Ah Long (power-ups design §6.2).
-- Every new card kind is allowed now (Toyol, Ah Long, Abang Grab, Dato Seri), so later tasks leave the constraint alone.
alter table powerups drop constraint powerups_kind_check;
alter table powerups
  add constraint powerups_kind_check
  check (kind in ('decoy', 'shield', 'cloak', 'flare', 'focus', 'toyol', 'along', 'grab', 'dato'));

-- A card Toyol or Ah Long took: gone from every hand. Sealed = delivered by Abang Grab, can't be stolen.
alter table powerups
  add column taken_at timestamptz,
  add column sealed boolean not null default false;

-- Takes one random card from a random eligible player on p_side: player first, then card (§6.2).
-- Runners must be free (not jailed); cards must be unused, unconsumed, untaken, unsealed and not Dato Seri.
-- Thefts in one game are serialised by an advisory lock (like claim_station), and the card row is locked
-- and re-checked when it is taken, so two thieves never take the same card. Returns the card, or nothing.
create function steal_card(p_game uuid, p_side text, p_at timestamptz) returns setof powerups
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
