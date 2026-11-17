-- Wiping a game 30 days after it ends (fair-play §1.8) also clears players.side_quest_at (Tupperware polish,
-- 2026-11-17): when someone got the side quest says they were within 50 m of a box at that ping. wipe_game is
-- 0020_legendaries.sql's, with that one column added to the arrest line. Safe to run again. Run it after 0024.

create or replace function wipe_game(p_game uuid) returns boolean
language plpgsql
as $$
declare
  claimed int;
begin
  update games set wiped_at = now(), host_push = null where id = p_game and wiped_at is null;
  get diagnostics claimed = row_count;
  if claimed = 0 then
    return false;
  end if;
  delete from locations where game_id = p_game;
  -- Safety records stay as anonymous counts: free text, names and positions go.
  update safety_records set data = '{}'::jsonb, lat = null, lng = null where game_id = p_game;
  delete from phone_moves where game_id = p_game;
  delete from marshal_invites where game_id = p_game;
  update powerups set spot = null where game_id = p_game;
  update players set arrest = null, side_quest_at = null where game_id = p_game;
  update games set hijau = hijau - 'fixes' where id = p_game and jsonb_typeof(hijau) = 'object';
  update players p
    set name = case n.role when 'runner' then 'Dikejar ' when 'chaser' then 'Kejar ' when 'marshal' then 'Marshal ' else 'Player ' end || n.num,
        push = null,
        token_hash = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    from (
      select id, role, row_number() over (partition by coalesce(role, '') order by accepted_at, id) as num
      from players where game_id = p_game
    ) n
    where p.id = n.id;
  update events
    set data = data - array['who', 'chaser', 'name', 'by', 'target_name', 'targetName', 'withName', 'with_name', 'text', 'note', 'lat', 'lng']
    where game_id = p_game;
  return true;
end;
$$;

revoke execute on function wipe_game(uuid) from public, anon, authenticated;
grant execute on function wipe_game(uuid) to service_role;
