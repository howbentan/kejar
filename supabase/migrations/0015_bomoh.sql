-- Bomoh's hidden stash (jail design §2e): same shape as Dato Seri's, { code, lat, lng, claimedBy, claimedAt }.
alter table games add column if not exists bomoh_stash jsonb;

-- Mirrors claim_dato() exactly (same locking and re-check), except it never inserts into powerups: Bomoh
-- activates the instant it's claimed (spec §2e), it doesn't sit in a hand. Returns true iff this call won the claim.
create or replace function claim_bomoh(p_game uuid, p_player uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
declare
  g games;
begin
  select * into g from games where id = p_game for update;
  if not found or g.bomoh_stash is null or jsonb_typeof(g.bomoh_stash) <> 'object'
     or coalesce(jsonb_typeof(g.bomoh_stash -> 'lat'), 'missing') <> 'number'
     or (g.bomoh_stash ->> 'claimedBy') is not null then
    return false;
  end if;
  update games
     set bomoh_stash = g.bomoh_stash || jsonb_build_object(
           'claimedBy', p_player::text,
           'claimedAt', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where id = p_game;
  return true;
end;
$$;

revoke execute on function claim_bomoh(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function claim_bomoh(uuid, uuid, timestamptz) to service_role;
