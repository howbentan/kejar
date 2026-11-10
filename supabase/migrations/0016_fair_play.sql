-- Fair play (gameplay audit). Each section below belongs to one change; safe to run again.
-- One transaction, every step guarded. Run it before the code that reads these columns goes live.

begin;

-- 1. A late ping doesn't count toward auto-jail: the moment each ping's alert was claimed (store clock).
alter table pings add column if not exists alert_sent_at timestamptz;

-- 2. resume_game (0005_safety.sql) shifted alert_at for every unrevealed ping, including ones whose alert had
-- already gone out, so the stored alert time disagreed with the computed one. Now only an alert still to come
-- moves with the pause; reveal_at moves for every ping not yet revealed, as before.
create or replace function resume_game(p_game uuid, p_at timestamptz) returns int
language plpgsql
as $$
declare
  started timestamptz;
  d interval;
begin
  select paused_at into started from games where id = p_game for update;
  if started is null then
    return null;
  end if;
  d := p_at - started;
  update games
    set pauses = pauses || jsonb_build_array(jsonb_build_object(
          'from', to_char(started at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'to', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
        paused_at = null
    where id = p_game;
  update pings
    set alert_at = case when alerted then alert_at else alert_at + d end,
        reveal_at = case when revealed then reveal_at else reveal_at + d end
    where game_id = p_game and (not alerted or not revealed);
  return (extract(epoch from d) * 1000)::int;
end;
$$;

revoke execute on function resume_game(uuid, timestamptz) from public, anon, authenticated;
grant execute on function resume_game(uuid, timestamptz) to service_role;

commit;
