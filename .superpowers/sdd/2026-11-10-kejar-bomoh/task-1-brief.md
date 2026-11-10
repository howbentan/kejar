### Task 1: `bomoh_stash` column, `claim_bomoh()`, and the store layer

**Files:**
- Create: `supabase/migrations/0015_bomoh.sql`
- Modify: `app/shared/types.ts` (add `BomohStash` interface mirroring `DatoStash` at lines 102-119; add `bomoh_stash?: BomohStash | null` to `Game` alongside `dato_stash` at line 94)
- Modify: `app/shared/store.ts` (find the in-memory `claimDato` implementation around lines 500-519; add a sibling `claimBomoh`)
- Modify: `app/shared/supabaseStore.ts` (find the `claim_dato` RPC wrapper around lines 253-258; add a sibling `claimBomoh` calling a `claim_bomoh` RPC)
- Test: `app/shared/store.test.ts` (or wherever the existing `claimDato` store test lives — grep for it first)

**Interfaces:**
- Produces: `BomohStash` (same shape as `DatoStash`: `code?: string`, `card?: { id, letter }`, `lat`, `lng`, `claimedBy`, `claimedAt`), `Game.bomoh_stash`, `store.claimBomoh(gameId: string, playerId: string, at: Date): Promise<boolean>` (returns whether the claim succeeded — unlike `claimDato`, it returns a boolean, not a `PowerUp[]`, since no `powerups` row is ever inserted).

- [ ] **Step 1: Write the failing store-level test**

Grep `app/shared` for the existing `claimDato`/`claim_dato` test(s) (likely in `store.test.ts` or `actions.test.ts`) to find the exact test pattern for a race (two concurrent claims resolve to exactly one winner) and a few rejections (`already claimed`, `not dropped yet`/`lat` is null, `game not found`). Write the same three cases for `claimBomoh`, asserting it returns `true` exactly once across two concurrent calls and `false` for the rejection cases, and that `game.bomoh_stash.claimedBy`/`claimedAt` end up set to the winner's id/time.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- store.test` (adjust to the actual test file found in Step 1)
Expected: FAIL — `claimBomoh` does not exist yet.

- [ ] **Step 3: Write `supabase/migrations/0015_bomoh.sql`**

```sql
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
```

- [ ] **Step 4: Add `BomohStash` and `Game.bomoh_stash` to `app/shared/types.ts`**

Copy the `DatoStash` interface (lines 102-119) verbatim as `BomohStash`. Add `bomoh_stash?: BomohStash | null` next to `dato_stash?: DatoStash | null` (line 94).

- [ ] **Step 5: Implement `claimBomoh` in `app/shared/store.ts` and `app/shared/supabaseStore.ts`**

Mirror the existing `claimDato` implementation in each file exactly, minus the `powerups` insert, returning a boolean instead of the inserted row(s).

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- store.test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0015_bomoh.sql app/shared/types.ts app/shared/store.ts app/shared/supabaseStore.ts app/shared/store.test.ts
git commit -m "feat: add bomoh_stash column and claim_bomoh for Bomoh's grant"
```

---

