-- Luar Garisan: a first report outside the play area warns, the next one in a row disqualifies for the round.
-- Safe to run again: one transaction, every step guarded. Run it before the code that reads these columns goes live.

begin;

alter table players add column if not exists out_warned_at timestamptz;
alter table players add column if not exists disqualified_at timestamptz;

-- Records one report clearly outside the play area, deciding from the stored row so two racing requests
-- cannot both warn. Returns 'unchanged' (already disqualified, or a second report inside the grace after the
-- warning, so one re-sent fix cannot warn and disqualify together), 'warned' (first) or 'disqualified'.
drop function if exists mark_outside(uuid, timestamptz);
create or replace function mark_outside(p_player uuid, p_at timestamptz, p_grace_ms int) returns text
language plpgsql
as $$
declare
  pl players%rowtype;
begin
  select * into pl from players where id = p_player for update;
  if not found or pl.disqualified_at is not null then
    return 'unchanged';
  end if;
  if pl.out_warned_at is null then
    update players set out_warned_at = p_at where id = p_player;
    return 'warned';
  end if;
  if p_at - pl.out_warned_at < make_interval(secs => p_grace_ms / 1000.0) then
    return 'unchanged';
  end if;
  update players set disqualified_at = p_at where id = p_player;
  return 'disqualified';
end;
$$;

revoke execute on function mark_outside(uuid, timestamptz, int) from public, anon, authenticated;
grant execute on function mark_outside(uuid, timestamptz, int) to service_role;

-- Luar Garisan: a disqualified player's cards are dead, so Toyol and Ah Long can't land on them.
-- Same as 0011's steal_card with one extra victim filter (pl.disqualified_at is null).
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
       and pl.disqualified_at is null
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

revoke execute on function steal_card(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function steal_card(uuid, text, timestamptz) to service_role;

commit;
