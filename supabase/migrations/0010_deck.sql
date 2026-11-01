-- Kejar shared deck (power-ups design §5b, Plan B). Each side draws from a deck derived from the
-- game mode and its set count; the server only stores how many sets each side got (fixed at start)
-- and how many cards each side has drawn. draw_card bumps a side's counter in one statement, so two
-- simultaneous station claims can never draw the same card number.
alter table games
  add column runner_draws int not null default 0,
  add column chaser_draws int not null default 0,
  add column runner_sets int,
  add column chaser_sets int,
  -- Secret per-game shuffle seed, set at start and never sent to players, so the next card can't be predicted.
  add column deck_seed text;

-- Returns the draw number taken (0 for a side's first card).
create function draw_card(p_game uuid, p_side text) returns int
language sql
as $$
  update games
     set runner_draws = runner_draws + (p_side = 'runner')::int,
         chaser_draws = chaser_draws + (p_side = 'chaser')::int
   where id = p_game
  returning (case when p_side = 'runner' then runner_draws else chaser_draws end) - 1;
$$;

-- Server-only, like the other game functions.
revoke execute on function draw_card(uuid, text) from public, anon, authenticated;
grant execute on function draw_card(uuid, text) to service_role;
