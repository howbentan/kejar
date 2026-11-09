-- Luar Garisan: a first report outside the play area warns, the next one in a row disqualifies for the round.
-- Safe to run again: one transaction, every step guarded. Run it before the code that reads these columns goes live.

begin;

alter table players add column if not exists out_warned_at timestamptz;
alter table players add column if not exists disqualified_at timestamptz;

-- Records one report clearly outside the play area, deciding from the stored row so two racing requests
-- cannot both warn. Returns 'unchanged' (already disqualified), 'warned' (first) or 'disqualified' (second).
create or replace function mark_outside(p_player uuid, p_at timestamptz) returns text
language plpgsql
as $$
declare
  row players%rowtype;
begin
  select * into row from players where id = p_player for update;
  if not found or row.disqualified_at is not null then
    return 'unchanged';
  end if;
  if row.out_warned_at is null then
    update players set out_warned_at = p_at where id = p_player;
    return 'warned';
  end if;
  update players set disqualified_at = p_at where id = p_player;
  return 'disqualified';
end;
$$;

revoke execute on function mark_outside(uuid, timestamptz) from public, anon, authenticated;
grant execute on function mark_outside(uuid, timestamptz) to service_role;

commit;
