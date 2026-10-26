# Plan 4a: Organiser Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the anonymous per-game `hostKey` with persistent organiser accounts (invited via expiring WhatsApp-shareable links), add marshal pre-assignment links, and simplify the lobby role picker to shuffle-only for runner/chaser.

**Architecture:** Two new store-backed entities (`organisations`, `organisers`) plus two invite tables (`organiser_invites`, `marshal_invites`), all following the existing `GameStore`/`MemoryStore`/`SupabaseStore` three-layer pattern already used for games/players/pings. Organiser auth moves from a per-game secret stored on the `games` row to a per-organiser session token, checked the same way `requirePlayer` already checks player tokens. No new libraries, no email/SMS — invite redemption reuses the existing `newToken`/`hashToken` primitives.

**Tech Stack:** TypeScript, Vitest, Supabase (Postgres), Vercel serverless functions, React (no router library — the existing hand-rolled `routes.ts`).

**Spec:** `docs/superpowers/specs/2026-10-26-kejar-plan4a-organiser-accounts-design.md`

## Global Constraints

- Organiser invite links expire 48 hours after creation if unredeemed (spec §4.3).
- Marshal invite links expire 6 hours after creation, or when the game leaves the lobby phase, whichever is first (spec §5).
- One session per organiser at a time: redeeming a new invite for an existing organiser overwrites their session token hash, silently invalidating any other device (spec §4.4).
- Only a hash of every secret token is ever stored server-side, via the existing `hashToken` (spec §9).
- `setRoles` stays API-flexible; the runner/chaser restriction is UI-only, not server-enforced (spec §6).
- Tokens are generated with the existing `newToken()` (32 random bytes, base64url, 43 characters) — do not introduce a different token format.

---

## Task 1: Shared invite-expiry helpers

**Files:**
- Create: `app/shared/invites.ts`
- Test: `app/shared/invites.test.ts`

**Interfaces:**
- Produces: `ORGANISER_INVITE_TTL_MS: number`, `MARSHAL_INVITE_TTL_MS: number`, `isExpired(expiresAtIso: string, now: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// app/shared/invites.test.ts
import { describe, expect, it } from 'vitest'
import { isExpired, MARSHAL_INVITE_TTL_MS, ORGANISER_INVITE_TTL_MS } from './invites.js'

describe('isExpired', () => {
  it('is false strictly before the expiry time', () => {
    expect(isExpired('2026-01-01T00:00:10.000Z', Date.parse('2026-01-01T00:00:09.999Z'))).toBe(false)
  })

  it('is true at or after the expiry time', () => {
    expect(isExpired('2026-01-01T00:00:10.000Z', Date.parse('2026-01-01T00:00:10.000Z'))).toBe(true)
    expect(isExpired('2026-01-01T00:00:10.000Z', Date.parse('2026-01-01T00:00:11.000Z'))).toBe(true)
  })
})

describe('TTLs', () => {
  it('organiser invites last 48 hours, marshal invites last 6', () => {
    expect(ORGANISER_INVITE_TTL_MS).toBe(48 * 60 * 60 * 1000)
    expect(MARSHAL_INVITE_TTL_MS).toBe(6 * 60 * 60 * 1000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run shared/invites.test.ts`
Expected: FAIL with "Failed to resolve import" (`invites.js` doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```ts
// app/shared/invites.ts
/** Spec §4.3: a leaked or forgotten organiser invite stops working after 48 hours. */
export const ORGANISER_INVITE_TTL_MS = 48 * 60 * 60 * 1000
/** Spec §5: a marshal invite stops working after 6 hours, or when the game leaves lobby — whichever first. */
export const MARSHAL_INVITE_TTL_MS = 6 * 60 * 60 * 1000

export function isExpired(expiresAtIso: string, now: number): boolean {
  return now >= Date.parse(expiresAtIso)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run shared/invites.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/shared/invites.ts app/shared/invites.test.ts
git commit -m "feat: invite expiry helpers for organiser and marshal invites"
```

---

## Task 2: Migration for organisations, organisers, and invites

**Files:**
- Create: `supabase/migrations/0006_organisers.sql`

**Interfaces:**
- Produces: tables `organisations`, `organisers`, `organiser_invites`, `marshal_invites`; `games.organiser_id` column; `games.host_key_hash` is dropped.

No automated test — this project's migrations (`0001`–`0005`) are applied by hand in the Supabase dashboard per `docs/HANDOFF.md`, not run by the test suite. Task 3/4's store tests are what actually exercise this shape.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0006_organisers.sql
-- Plan 4a: organiser accounts and marshal pre-assignment links.
-- RLS on with NO policies, same as every other table here — the browser never
-- talks to these directly, only /api/game with the service-role key.

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table organisers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  session_token_hash text not null,
  session_created_at timestamptz not null default now()
);
create index organisers_session_token_hash on organisers (session_token_hash);

create table organiser_invites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations (id) on delete cascade,
  -- Set = a re-link invite for this existing organiser (new phone). Null = invite for a brand new organiser.
  organiser_id uuid references organisers (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);

create table marshal_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);

-- The anonymous per-game secret is retired; games now belong to a persistent organiser.
-- This project has no live games on the old scheme worth preserving (pre-launch), so this
-- is a clean cutover, not a backfill.
alter table games drop column host_key_hash;
alter table games add column organiser_id uuid not null references organisers (id);

alter table organisations enable row level security;
alter table organisers enable row level security;
alter table organiser_invites enable row level security;
alter table marshal_invites enable row level security;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0006_organisers.sql
git commit -m "feat: migration for organisations, organisers, and invite links"
```

---

## Task 3: Extend GameStore and MemoryStore

**Files:**
- Modify: `app/api/_lib/store.ts`

**Interfaces:**
- Consumes: `hashToken`, `newToken` from `./secrets.js` (test only — the store itself just stores/compares hashes it's given)
- Produces (new types): `Organisation`, `OrganiserRow`, `OrganiserInviteRow`, `MarshalInviteRow`, `RedeemInviteResult`, `RedeemMarshalInviteResult`
- Produces (new `GameStore` methods, used by Task 5/6/7):
  - `createOrganisation(o: Omit<Organisation, 'id'>): Promise<Organisation>`
  - `createOrganiser(o: Omit<OrganiserRow, 'id'>): Promise<OrganiserRow>`
  - `organiserBySessionTokenHash(hash: string): Promise<OrganiserRow | null>`
  - `organiserById(id: string): Promise<OrganiserRow | null>`
  - `createOrganiserInvite(inv: Omit<OrganiserInviteRow, 'id'>): Promise<OrganiserInviteRow>`
  - `redeemOrganiserInvite(tokenHash: string, now: number, sessionTokenHash: string): Promise<RedeemInviteResult>`
  - `createMarshalInvite(inv: Omit<MarshalInviteRow, 'id'>): Promise<MarshalInviteRow>`
  - `redeemMarshalInvite(tokenHash: string, now: number): Promise<RedeemMarshalInviteResult>`
- Produces (changed): `GameRow` drops `host_key_hash`, gains `organiser_id: string`

- [ ] **Step 1: Write the failing tests**

Create `app/api/_lib/store.test.ts` additions (append to the existing file — check it exists first with `ls app/api/_lib/store.test.ts`; if the file doesn't exist yet, create it with just these imports and the block below):

```ts
// Added to app/api/_lib/store.test.ts
import { describe, expect, it } from 'vitest'
import { MemoryStore } from './store.js'

describe('organiser accounts', () => {
  it('creates an organisation and an organiser in it', async () => {
    const store = new MemoryStore(() => 1_000)
    const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(1_000).toISOString() })
    const organiser = await store.createOrganiser({
      organisation_id: org.id,
      name: 'Owner',
      created_at: new Date(1_000).toISOString(),
      session_token_hash: 'hash1',
      session_created_at: new Date(1_000).toISOString(),
    })
    expect(await store.organiserBySessionTokenHash('hash1')).toMatchObject({ id: organiser.id, name: 'Owner' })
    expect(await store.organiserBySessionTokenHash('nope')).toBeNull()
  })

  it('redeems an organiser invite once, creating a new organiser', async () => {
    const store = new MemoryStore(() => 1_000)
    const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(1_000).toISOString() })
    await store.createOrganiserInvite({
      organisation_id: org.id,
      organiser_id: null,
      name: 'Partner',
      token_hash: 'tok1',
      created_at: new Date(1_000).toISOString(),
      expires_at: new Date(2_000).toISOString(),
      redeemed_at: null,
    })
    const first = await store.redeemOrganiserInvite('tok1', 1_500, 'session1')
    expect(first.ok).toBe(true)
    const second = await store.redeemOrganiserInvite('tok1', 1_500, 'session2')
    expect(second).toEqual({ ok: false, reason: 'redeemed' })
  })

  it('refuses an expired organiser invite', async () => {
    const store = new MemoryStore(() => 1_000)
    const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(1_000).toISOString() })
    await store.createOrganiserInvite({
      organisation_id: org.id,
      organiser_id: null,
      name: 'Partner',
      token_hash: 'tok1',
      created_at: new Date(1_000).toISOString(),
      expires_at: new Date(2_000).toISOString(),
      redeemed_at: null,
    })
    expect(await store.redeemOrganiserInvite('tok1', 2_500, 'session1')).toEqual({ ok: false, reason: 'expired' })
  })

  it('refuses an unknown invite token', async () => {
    const store = new MemoryStore(() => 1_000)
    expect(await store.redeemOrganiserInvite('nope', 1_000, 'session1')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('a re-link invite (organiser_id set) overwrites that organiser\'s session instead of creating a new one', async () => {
    const store = new MemoryStore(() => 1_000)
    const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(1_000).toISOString() })
    const organiser = await store.createOrganiser({
      organisation_id: org.id,
      name: 'Owner',
      created_at: new Date(1_000).toISOString(),
      session_token_hash: 'oldHash',
      session_created_at: new Date(1_000).toISOString(),
    })
    await store.createOrganiserInvite({
      organisation_id: org.id,
      organiser_id: organiser.id,
      name: 'Owner',
      token_hash: 'relink1',
      created_at: new Date(1_000).toISOString(),
      expires_at: new Date(2_000).toISOString(),
      redeemed_at: null,
    })
    const result = await store.redeemOrganiserInvite('relink1', 1_500, 'newHash')
    expect(result).toEqual({ ok: true, organiserId: organiser.id })
    expect(await store.organiserBySessionTokenHash('oldHash')).toBeNull()
    expect(await store.organiserBySessionTokenHash('newHash')).toMatchObject({ id: organiser.id })
  })

  it('redeems a marshal invite once', async () => {
    const store = new MemoryStore(() => 1_000)
    const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(1_000).toISOString() })
    const organiser = await store.createOrganiser({
      organisation_id: org.id,
      name: 'Owner',
      created_at: new Date(1_000).toISOString(),
      session_token_hash: 'h',
      session_created_at: new Date(1_000).toISOString(),
    })
    const game = await store.createGame({
      code: 'ABC234',
      arena: { id: 'a', name: 'A', boundary: [], jail: { lat: 0, lng: 0 }, start: { lat: 0, lng: 0 } },
      settings: { lengthMin: 45, hideMin: 5, pingMin: 5, spectatorDelayMin: 2, checkinMode: 'push' },
      started_at: null,
      ended_at: null,
      winner: null,
      paused_at: null,
      pauses: [],
      organiser_id: organiser.id,
    })
    await store.createMarshalInvite({
      game_id: game.id,
      token_hash: 'mtok1',
      created_at: new Date(1_000).toISOString(),
      expires_at: new Date(2_000).toISOString(),
      redeemed_at: null,
    })
    const first = await store.redeemMarshalInvite('mtok1', 1_500)
    expect(first).toEqual({ ok: true, gameId: game.id })
    expect(await store.redeemMarshalInvite('mtok1', 1_500)).toEqual({ ok: false, reason: 'redeemed' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run api/_lib/store.test.ts`
Expected: FAIL — `createOrganisation is not a function` (or the file/import fails if `store.test.ts` didn't exist before)

- [ ] **Step 3: Add the types and methods to the interface**

In `app/api/_lib/store.ts`, change the `GameRow` type and add the new types above `GameStore`:

```ts
// Replace this line:
// export type GameRow = Game & { host_key_hash: string; host_push?: PushSubscriptionJSON | null }
// with:
export type GameRow = Game & { organiser_id: string; host_push?: PushSubscriptionJSON | null }

export interface Organisation {
  id: string
  name: string
  created_at: string
}

export interface OrganiserRow {
  id: string
  organisation_id: string
  name: string
  created_at: string
  session_token_hash: string
  session_created_at: string
}

export interface OrganiserInviteRow {
  id: string
  organisation_id: string
  /** Set = a re-link invite for this existing organiser. Null = invite for a brand new organiser. */
  organiser_id: string | null
  name: string
  token_hash: string
  created_at: string
  expires_at: string
  redeemed_at: string | null
}

export interface MarshalInviteRow {
  id: string
  game_id: string
  token_hash: string
  created_at: string
  expires_at: string
  redeemed_at: string | null
}

export type RedeemInviteResult = { ok: true; organiserId: string } | { ok: false; reason: 'invalid' | 'expired' | 'redeemed' }
export type RedeemMarshalInviteResult = { ok: true; gameId: string } | { ok: false; reason: 'invalid' | 'expired' | 'redeemed' }
```

Add these method signatures to the `GameStore` interface (after `addSafetyRecord`):

```ts
  createOrganisation(o: Omit<Organisation, 'id'>): Promise<Organisation>
  createOrganiser(o: Omit<OrganiserRow, 'id'>): Promise<OrganiserRow>
  organiserBySessionTokenHash(hash: string): Promise<OrganiserRow | null>
  createOrganiserInvite(inv: Omit<OrganiserInviteRow, 'id'>): Promise<OrganiserInviteRow>
  /** Atomically claims the invite (unredeemed, unexpired at `now`), then creates or re-links the organiser. */
  redeemOrganiserInvite(tokenHash: string, now: number, sessionTokenHash: string): Promise<RedeemInviteResult>
  createMarshalInvite(inv: Omit<MarshalInviteRow, 'id'>): Promise<MarshalInviteRow>
  /** Atomically claims the invite (unredeemed, unexpired at `now`). */
  redeemMarshalInvite(tokenHash: string, now: number): Promise<RedeemMarshalInviteResult>
```

- [ ] **Step 4: Implement in MemoryStore**

Add private fields near the other row arrays (after `safetyRows`):

```ts
  private organisationRows: Organisation[] = []
  private organiserRows: OrganiserRow[] = []
  private organiserInviteRows: OrganiserInviteRow[] = []
  private marshalInviteRows: MarshalInviteRow[] = []
```

Add methods at the end of the `MemoryStore` class, before the closing brace:

```ts
  async createOrganisation(o: Omit<Organisation, 'id'>) {
    const row = { ...o, id: this.id('org') }
    this.organisationRows.push(row)
    return { ...row }
  }
  async createOrganiser(o: Omit<OrganiserRow, 'id'>) {
    const row = { ...o, id: this.id('r') }
    this.organiserRows.push(row)
    return { ...row }
  }
  async organiserBySessionTokenHash(hash: string) {
    const r = this.organiserRows.find((x) => x.session_token_hash === hash)
    return r ? { ...r } : null
  }
  async organiserById(id: string) {
    const r = this.organiserRows.find((x) => x.id === id)
    return r ? { ...r } : null
  }
  async createOrganiserInvite(inv: Omit<OrganiserInviteRow, 'id'>) {
    const row = { ...inv, id: this.id('oi') }
    this.organiserInviteRows.push(row)
    return { ...row }
  }
  async redeemOrganiserInvite(tokenHash: string, now: number, sessionTokenHash: string): Promise<RedeemInviteResult> {
    const inv = this.organiserInviteRows.find((x) => x.token_hash === tokenHash)
    if (!inv) return { ok: false, reason: 'invalid' }
    if (inv.redeemed_at) return { ok: false, reason: 'redeemed' }
    if (now >= Date.parse(inv.expires_at)) return { ok: false, reason: 'expired' }
    inv.redeemed_at = new Date(now).toISOString()
    if (inv.organiser_id) {
      const existing = this.organiserRows.find((x) => x.id === inv.organiser_id)!
      existing.session_token_hash = sessionTokenHash
      existing.session_created_at = new Date(now).toISOString()
      return { ok: true, organiserId: existing.id }
    }
    const created = await this.createOrganiser({
      organisation_id: inv.organisation_id,
      name: inv.name,
      created_at: new Date(now).toISOString(),
      session_token_hash: sessionTokenHash,
      session_created_at: new Date(now).toISOString(),
    })
    return { ok: true, organiserId: created.id }
  }
  async createMarshalInvite(inv: Omit<MarshalInviteRow, 'id'>) {
    const row = { ...inv, id: this.id('mi') }
    this.marshalInviteRows.push(row)
    return { ...row }
  }
  async redeemMarshalInvite(tokenHash: string, now: number): Promise<RedeemMarshalInviteResult> {
    const inv = this.marshalInviteRows.find((x) => x.token_hash === tokenHash)
    if (!inv) return { ok: false, reason: 'invalid' }
    if (inv.redeemed_at) return { ok: false, reason: 'redeemed' }
    if (now >= Date.parse(inv.expires_at)) return { ok: false, reason: 'expired' }
    inv.redeemed_at = new Date(now).toISOString()
    return { ok: true, gameId: inv.game_id }
  }
```

Also fix `createGame`'s `strip` call — it currently strips `'host_key_hash'`; change it to not strip anything (the field it stripped no longer exists on `GameRow`):

```ts
  // Replace:
  // async createGame(g: Omit<GameRow, 'id'>) {
  //   const row = { ...g, id: this.id('g') }
  //   this.games.push(row)
  //   return this.strip(row, 'host_key_hash')
  // }
  // with:
  async createGame(g: Omit<GameRow, 'id'>) {
    const row = { ...g, id: this.id('g') }
    this.games.push(row)
    const { organiser_id, ...rest } = row
    return rest as Game
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npx vitest run api/_lib/store.test.ts`
Expected: PASS (6 new tests). If other store tests broke because they relied on `host_key_hash`, fix their fixtures to use `organiser_id: 'test-organiser'` instead (grep `host_key_hash` in `app/api/_lib/store.test.ts` to find them).

- [ ] **Step 6: Commit**

```bash
git add app/api/_lib/store.ts app/api/_lib/store.test.ts
git commit -m "feat: organisation, organiser, and invite storage in GameStore/MemoryStore"
```

---

## Task 4: Extend SupabaseStore to match

**Files:**
- Modify: `app/api/_lib/supabaseStore.ts`

**Interfaces:**
- Consumes: the same `GameStore` interface additions from Task 3.
- No new tests — this class has no dedicated unit tests in this codebase (it's a thin Supabase wrapper, verified against a live database, same as the rest of `SupabaseStore`). Mirror `MemoryStore`'s behaviour exactly.

- [ ] **Step 1: Update GAME_COLUMNS**

```ts
// Replace:
// const GAME_COLUMNS = 'id, code, arena, settings, started_at, ended_at, winner, paused_at, pauses'
// with:
const GAME_COLUMNS = 'id, code, arena, settings, started_at, ended_at, winner, paused_at, pauses, organiser_id'
```

- [ ] **Step 2: Add the new methods**

Add to the `SupabaseStore` class, after `addSafetyRecord`:

```ts
  async createOrganisation(o: Omit<Organisation, 'id'>): Promise<Organisation> {
    return check(await this.db.from('organisations').insert(o).select('*').single()) as Organisation
  }
  async createOrganiser(o: Omit<OrganiserRow, 'id'>): Promise<OrganiserRow> {
    return check(await this.db.from('organisers').insert(o).select('*').single()) as OrganiserRow
  }
  async organiserBySessionTokenHash(hash: string): Promise<OrganiserRow | null> {
    return check(
      await this.db.from('organisers').select('*').eq('session_token_hash', hash).maybeSingle(),
    ) as OrganiserRow | null
  }
  async organiserById(id: string): Promise<OrganiserRow | null> {
    return check(await this.db.from('organisers').select('*').eq('id', id).maybeSingle()) as OrganiserRow | null
  }
  async createOrganiserInvite(inv: Omit<OrganiserInviteRow, 'id'>): Promise<OrganiserInviteRow> {
    return check(await this.db.from('organiser_invites').insert(inv).select('*').single()) as OrganiserInviteRow
  }
  async redeemOrganiserInvite(tokenHash: string, now: number, sessionTokenHash: string): Promise<RedeemInviteResult> {
    const nowIso = new Date(now).toISOString()
    const claimed = check(
      await this.db
        .from('organiser_invites')
        .update({ redeemed_at: nowIso })
        .eq('token_hash', tokenHash)
        .is('redeemed_at', null)
        .gt('expires_at', nowIso)
        .select('*'),
    ) as OrganiserInviteRow[]
    const inv = claimed[0]
    if (!inv) {
      const exists = check(
        await this.db.from('organiser_invites').select('redeemed_at, expires_at').eq('token_hash', tokenHash).maybeSingle(),
      ) as { redeemed_at: string | null; expires_at: string } | null
      if (!exists) return { ok: false, reason: 'invalid' }
      return { ok: false, reason: exists.redeemed_at ? 'redeemed' : 'expired' }
    }
    if (inv.organiser_id) {
      check(
        await this.db
          .from('organisers')
          .update({ session_token_hash: sessionTokenHash, session_created_at: nowIso })
          .eq('id', inv.organiser_id),
      )
      return { ok: true, organiserId: inv.organiser_id }
    }
    const created = await this.createOrganiser({
      organisation_id: inv.organisation_id,
      name: inv.name,
      created_at: nowIso,
      session_token_hash: sessionTokenHash,
      session_created_at: nowIso,
    })
    return { ok: true, organiserId: created.id }
  }
  async createMarshalInvite(inv: Omit<MarshalInviteRow, 'id'>): Promise<MarshalInviteRow> {
    return check(await this.db.from('marshal_invites').insert(inv).select('*').single()) as MarshalInviteRow
  }
  async redeemMarshalInvite(tokenHash: string, now: number): Promise<RedeemMarshalInviteResult> {
    const nowIso = new Date(now).toISOString()
    const claimed = check(
      await this.db
        .from('marshal_invites')
        .update({ redeemed_at: nowIso })
        .eq('token_hash', tokenHash)
        .is('redeemed_at', null)
        .gt('expires_at', nowIso)
        .select('game_id, redeemed_at'),
    ) as { game_id: string; redeemed_at: string }[]
    if (claimed[0]) return { ok: true, gameId: claimed[0].game_id }
    const exists = check(
      await this.db.from('marshal_invites').select('redeemed_at, expires_at').eq('token_hash', tokenHash).maybeSingle(),
    ) as { redeemed_at: string | null; expires_at: string } | null
    if (!exists) return { ok: false, reason: 'invalid' }
    return { ok: false, reason: exists.redeemed_at ? 'redeemed' : 'expired' }
  }
```

- [ ] **Step 3: Update the import line**

```ts
// Replace:
// import type { GameRow, GameStore, NewPowerUp, PlayerRow, SafetyRecord, StationClaim } from './store.js'
// with:
import type {
  GameRow,
  GameStore,
  MarshalInviteRow,
  NewPowerUp,
  Organisation,
  OrganiserInviteRow,
  OrganiserRow,
  PlayerRow,
  RedeemInviteResult,
  RedeemMarshalInviteResult,
  SafetyRecord,
  StationClaim,
} from './store.js'
```

- [ ] **Step 4: Typecheck**

Run: `cd app && npm run typecheck`
Expected: no errors (this file has no runnable tests, so typecheck is the verification gate)

- [ ] **Step 5: Commit**

```bash
git add app/api/_lib/supabaseStore.ts
git commit -m "feat: SupabaseStore support for organisers and invites"
```

---

## Task 5: Cut over organiser auth from hostKey to sessions

**Files:**
- Modify: `app/api/_lib/actions.ts`
- Modify: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `OrganiserRow`, `organiserBySessionTokenHash` from Task 3.
- Produces: `requireOrganiser(ctx, game, body): Promise<OrganiserRow>` and `requireAnyOrganiser(ctx, body): Promise<OrganiserRow>`, replacing `requireHost`. Used by Task 6/7's new actions too.

- [ ] **Step 1: Replace `requireHost` with two organiser-session checks**

In `app/api/_lib/actions.ts`, replace:

```ts
function requireHost(game: GameRow, body: Body) {
  if (!body.hostKey || hashToken(str(body.hostKey)) !== game.host_key_hash) throw new ActionError(403, 'Organiser only')
}
```

with:

```ts
async function requireAnyOrganiser(ctx: Ctx, body: Body): Promise<OrganiserRow> {
  const o = body.organiserToken ? await ctx.store.organiserBySessionTokenHash(hashToken(str(body.organiserToken))) : null
  if (!o) throw new ActionError(403, 'Sign in as an organiser first')
  return o
}

async function requireOrganiser(ctx: Ctx, game: GameRow, body: Body): Promise<OrganiserRow> {
  const o = await requireAnyOrganiser(ctx, body)
  if (o.id !== game.organiser_id) throw new ActionError(403, 'Organiser only')
  return o
}
```

And add `OrganiserRow` to the `store.js` type import at the top of the file:

```ts
import type { GameRow, GameStore, OrganiserRow } from './store.js'
```

- [ ] **Step 2: Update `create`**

```ts
// Replace the start of the `create` action:
// const create: Action = async (ctx, body) => {
//   let arena: Arena
// with:
const create: Action = async (ctx, body) => {
  const organiser = await requireAnyOrganiser(ctx, body)
  let arena: Arena
```

And its ending — replace:

```ts
  const hostKey = newToken()
  await ctx.store.createGame({ code, arena, settings, started_at: null, ended_at: null, winner: null, paused_at: null, pauses: [], host_key_hash: hashToken(hostKey) })
  return { code, hostKey }
```

with:

```ts
  await ctx.store.createGame({ code, arena, settings, started_at: null, ended_at: null, winner: null, paused_at: null, pauses: [], organiser_id: organiser.id })
  return { code }
```

- [ ] **Step 3: Update `setRoles` and `start`**

In both, replace `requireHost(game, body)` with `await requireOrganiser(ctx, game, body)`.

- [ ] **Step 4: Update `requireMarshal`**

```ts
// Replace:
// async function requireMarshal(ctx: Ctx, game: GameRow, body: Body): Promise<Player | null> {
//   if (body.hostKey) {
//     requireHost(game, body)
//     return null
//   }
//   const p = await requirePlayer(ctx, game, body)
//   if (p.role !== 'marshal') throw new ActionError(403, 'Marshals only')
//   return p
// }
// with:
async function requireMarshal(ctx: Ctx, game: GameRow, body: Body): Promise<Player | null> {
  if (body.organiserToken) {
    await requireOrganiser(ctx, game, body)
    return null
  }
  const p = await requirePlayer(ctx, game, body)
  if (p.role !== 'marshal') throw new ActionError(403, 'Marshals only')
  return p
}
```

- [ ] **Step 5: Update `state`'s host branch**

```ts
// Replace:
//   else {
//     requireHost(game as GameRow, body)
//     me = {
//       id: 'host',
//       game_id: game.id,
//       name: 'Organiser',
// with:
  else {
    const organiser = await requireOrganiser(ctx, game as GameRow, body)
    me = {
      id: 'host',
      game_id: game.id,
      name: organiser.name,
```

(leave the rest of that object literal unchanged)

- [ ] **Step 6: Update `subscribe`'s host branch**

```ts
// Replace:
//   if (!body.token) {
//     // The organiser: their phone gets SOS and report alerts.
//     requireHost(game, body)
// with:
  if (!body.token) {
    // The organiser: their phone gets SOS and report alerts.
    await requireOrganiser(ctx, game, body)
```

- [ ] **Step 7: Fix the test file's `readyGame` fixture and its two direct-`create` tests**

In `app/api/_lib/actions.test.ts`, add this helper right after the `run`/`rejects` declarations (before `beforeEach`):

```ts
async function createOrganiser() {
  const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(now).toISOString() })
  const organiserToken = 'test-organiser-token'
  await store.createOrganiser({
    organisation_id: org.id,
    name: 'Owner',
    created_at: new Date(now).toISOString(),
    session_token_hash: require('./secrets.js').hashToken(organiserToken),
    session_created_at: new Date(now).toISOString(),
  })
  return organiserToken
}
```

Since this file is ESM (`import`, not `require`), instead add a top-of-file import and use that:

```ts
// Add to the import block at the top of the file:
import { hashToken } from './secrets.js'
```

```ts
// Then the helper becomes:
async function createOrganiser() {
  const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(now).toISOString() })
  const organiserToken = 'test-organiser-token'
  await store.createOrganiser({
    organisation_id: org.id,
    name: 'Owner',
    created_at: new Date(now).toISOString(),
    session_token_hash: hashToken(organiserToken),
    session_created_at: new Date(now).toISOString(),
  })
  return organiserToken
}
```

Replace the `readyGame` helper's first two lines and its `setRoles` line:

```ts
// Replace:
// async function readyGame(settings: object = {}, extra: object = {}) {
//   const { code, hostKey } = await run('create', { arenaId: 'around-me', center: CENTER, settings, ...extra })
// with:
async function readyGame(settings: object = {}, extra: object = {}) {
  const organiserToken = await createOrganiser()
  const { code } = await run('create', { arenaId: 'around-me', center: CENTER, settings, organiserToken, ...extra })
```

```ts
// Replace:
//   await run('setRoles', { code, hostKey, roles })
// with:
  await run('setRoles', { code, organiserToken, roles })
```

```ts
// Replace:
//   return { code, hostKey, ben, aina, hafiz }
// with:
  return { code, organiserToken, ben, aina, hafiz }
```

Then fix the two tests in the `'joining'` and `'organiser controls'` describe blocks that call `create` directly instead of through `readyGame`:

```ts
// Test "create then join returns a token and player" — replace:
//     const { code, hostKey } = await run('create', { arenaId: 'around-me', center: CENTER })
//     expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
//     expect(hostKey).toHaveLength(43)
// with:
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken })
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
```

```ts
// Test "start refuses lopsided teams..." — replace:
//     const { code, hostKey } = await run('create', { arenaId: 'around-me', center: CENTER })
//     const a = await run('join', { code, name: 'Aina', accepted: true })
//     const b = await run('join', { code, name: 'Hafiz', accepted: true })
//     await run('setRoles', { code, hostKey, roles: { [a.playerId]: 'runner', [b.playerId]: 'runner' } })
//     await rejects(run('start', { code, hostKey }), 409, 'Need at least 1 chaser')
// with:
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken })
    const a = await run('join', { code, name: 'Aina', accepted: true })
    const b = await run('join', { code, name: 'Hafiz', accepted: true })
    await run('setRoles', { code, organiserToken, roles: { [a.playerId]: 'runner', [b.playerId]: 'runner' } })
    await rejects(run('start', { code, organiserToken }), 409, 'Need at least 1 chaser')
```

The other two tests in `'organiser controls'` need small adjustments too:

```ts
// "start refuses when a runner has no tag" — replace:
//     await rejects(run('start', { code: g.code, hostKey: g.hostKey }), 409, 'Runner Aina has no tag')
// with:
    await rejects(run('start', { code: g.code, organiserToken: g.organiserToken }), 409, 'Runner Aina has no tag')
```

```ts
// "non-host cannot setRoles or start" — replace:
//     await rejects(run('setRoles', { code: g.code, hostKey: 'wrong', shuffle: true }), 403)
//     await rejects(run('start', { code: g.code, hostKey: g.aina.token }), 403)
// with:
    await rejects(run('setRoles', { code: g.code, organiserToken: 'wrong', shuffle: true }), 403)
    await rejects(run('start', { code: g.code, organiserToken: g.aina.token }), 403)
```

- [ ] **Step 8: Mechanically rename every remaining `hostKey` reference in the test file**

Every other occurrence of `hostKey` in `app/api/_lib/actions.test.ts` is one of exactly two shapes, and both rename the same way:
- `hostKey: g.hostKey` (inside a `run(...)` or `rejects(run(...))` call) → `organiserToken: g.organiserToken`
- `g.hostKey` passed positionally (the `kinds(g.code, g.hostKey)` helper, and its own definition `const kinds = async (code: string, hostKey: string) => ...`) → rename the parameter to `organiserToken` and the call sites to `g.organiserToken`

Apply this rename at every remaining line. As of this plan, that's these line numbers in the pre-change file (re-check with `grep -n hostKey app/api/_lib/actions.test.ts` since line numbers shift after Step 7's edits — treat this as the complete list of *patterns*, not exact post-edit line numbers): 106, 116–117, 122, 131, 141, 149, 165, 225, 249, 254, 263, 272, 313, 315, 416, 418, 509, 527–528, 540, 545, 548, 560, 570–571, 576–577, 584–585, 587–588, 620, 639, 664, 667, 674, 688, 695, 704–705, 712–713, 724, 727, 732, 737, 740, 743, 748, 757, 759, 762, 775, 789, 803, 807.

In the `kinds` helper specifically, rename both the parameter and its body:

```ts
// Replace:
// const kinds = async (code: string, hostKey: string) =>
//   (await run<View>('state', { code, hostKey })).alerts.map((a) => a.kind)
// with:
const kinds = async (code: string, organiserToken: string) =>
  (await run<View>('state', { code, organiserToken })).alerts.map((a) => a.kind)
```

and its call sites `kinds(g.code, g.hostKey)` → `kinds(g.code, g.organiserToken)`.

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd app && npx vitest run api/_lib/actions.test.ts`
Expected: PASS, all tests. Then run `grep -n hostKey app/api/_lib/actions.test.ts app/api/_lib/actions.ts` — expect zero output, confirming nothing was missed.

- [ ] **Step 10: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: cut organiser auth over from per-game hostKey to organiser sessions"
```

---

## Task 6: Organiser invite actions

**Files:**
- Modify: `app/api/_lib/actions.ts`
- Modify: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `requireAnyOrganiser` (Task 5), `organiserById` (Task 3/4), `newToken`/`hashToken` (existing `secrets.js`), `ORGANISER_INVITE_TTL_MS`/`isExpired` (Task 1).
- Produces: actions `createOrganiserInvite` and `redeemOrganiserInvite`, registered in the `actions` export.

**Note — reconciling the spec with the "true peer" decision:** the spec (§4.3/§11) says only the owner can issue a re-link invite for another organiser. But the brainstorm explicitly settled on every organiser being a true peer with equal powers, and the schema has no "owner" flag to even enforce that restriction. Re-link invites in this task are available to *any* organiser, for any other organiser in the same organisation — consistent with true-peer, and simpler than adding an unused ownership tier.

- [ ] **Step 1: Write the failing tests**

Add to `app/api/_lib/actions.test.ts`:

```ts
describe('organiser invites', () => {
  it('an organiser invites a peer, who redeems it and can then create a game', async () => {
    const ownerToken = await createOrganiser()
    const { inviteToken } = await run('createOrganiserInvite', { organiserToken: ownerToken, name: 'Partner' })
    const redeemed = await run('redeemOrganiserInvite', { inviteToken })
    expect(redeemed.name).toBe('Partner')
    expect(redeemed.organiserToken).toHaveLength(43)
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken: redeemed.organiserToken })
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
  })

  it('refuses to redeem the same invite twice', async () => {
    const ownerToken = await createOrganiser()
    const { inviteToken } = await run('createOrganiserInvite', { organiserToken: ownerToken, name: 'Partner' })
    await run('redeemOrganiserInvite', { inviteToken })
    await rejects(run('redeemOrganiserInvite', { inviteToken }), 410, 'already been used')
  })

  it('refuses an invite past its 48-hour expiry', async () => {
    const ownerToken = await createOrganiser()
    const { inviteToken } = await run('createOrganiserInvite', { organiserToken: ownerToken, name: 'Partner' })
    now += 48 * 60 * 60 * 1000
    await rejects(run('redeemOrganiserInvite', { inviteToken }), 410, 'expired')
  })

  it('refuses createOrganiserInvite without a valid organiser session', async () => {
    await rejects(run('createOrganiserInvite', { organiserToken: 'wrong', name: 'Partner' }), 403)
  })

  it('re-links an existing organiser to a new device instead of creating a second one', async () => {
    const ownerToken = await createOrganiser()
    const { inviteToken: firstInvite } = await run('createOrganiserInvite', { organiserToken: ownerToken, name: 'Partner' })
    const partner = await run('redeemOrganiserInvite', { inviteToken: firstInvite })
    // Partner's own phone dies; the owner (any organiser could do this — true peers) sends a re-link invite.
    const { inviteToken: relinkInvite } = await run('createOrganiserInvite', {
      organiserToken: ownerToken,
      organiserId: partner.organiserId,
      name: 'Partner',
    })
    const relinked = await run('redeemOrganiserInvite', { inviteToken: relinkInvite })
    expect(relinked.organiserId).toBe(partner.organiserId)
    // The old phone's session no longer works.
    await rejects(run('createOrganiserInvite', { organiserToken: partner.organiserToken, name: 'Someone else' }), 403)
    // The new phone's session does.
    await run('createOrganiserInvite', { organiserToken: relinked.organiserToken, name: 'Someone else' })
  })

  it('refuses to re-link an organiser from a different organisation', async () => {
    const ownerAToken = await createOrganiser()
    const ownerBToken = await createOrganiser()
    const { inviteToken } = await run('createOrganiserInvite', { organiserToken: ownerAToken, name: 'Partner A' })
    const partnerA = await run('redeemOrganiserInvite', { inviteToken })
    await rejects(
      run('createOrganiserInvite', { organiserToken: ownerBToken, organiserId: partnerA.organiserId, name: 'x' }),
      404,
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run api/_lib/actions.test.ts -t "organiser invites"`
Expected: FAIL — `Unknown action` or similar (the actions don't exist yet)

- [ ] **Step 3: Implement the actions**

Add to `app/api/_lib/actions.ts`, after `requireOrganiser`/`requireAnyOrganiser`:

```ts
import { isExpired, ORGANISER_INVITE_TTL_MS } from '../../shared/invites.js'
```

(add this to the top import block, alongside the other `shared/*.js` imports)

Add the two actions after `subscribe` (or any convenient spot before the `actions` export):

```ts
const createOrganiserInvite: Action = async (ctx, body) => {
  const organiser = await requireAnyOrganiser(ctx, body)
  let targetOrganiserId: string | null = null
  let name: string
  if (body.organiserId) {
    // A re-link invite: any organiser can send a peer a fresh sign-in link for their own account
    // (true peers, per the design — not restricted to whoever happens to be "the owner").
    const target = await ctx.store.organiserById(str(body.organiserId))
    if (!target || target.organisation_id !== organiser.organisation_id) throw new ActionError(404, 'Unknown organiser')
    targetOrganiserId = target.id
    name = target.name
  } else {
    name = str(body.name).trim()
    if (name.length < 1 || name.length > 40) throw new ActionError(400, 'Name must be 1–40 characters')
  }
  const inviteToken = newToken()
  await ctx.store.createOrganiserInvite({
    organisation_id: organiser.organisation_id,
    organiser_id: targetOrganiserId,
    name,
    token_hash: hashToken(inviteToken),
    created_at: iso(ctx.now),
    expires_at: iso(ctx.now + ORGANISER_INVITE_TTL_MS),
    redeemed_at: null,
  })
  return { inviteToken }
}

const redeemOrganiserInvite: Action = async (ctx, body) => {
  const inviteToken = str(body.inviteToken)
  if (!inviteToken) throw new ActionError(400, 'Missing invite token')
  const organiserToken = newToken()
  const result = await ctx.store.redeemOrganiserInvite(hashToken(inviteToken), ctx.now, hashToken(organiserToken))
  if (!result.ok) {
    if (result.reason === 'invalid') throw new ActionError(404, 'That invite link is not valid')
    if (result.reason === 'redeemed') throw new ActionError(410, 'That invite link has already been used')
    throw new ActionError(410, 'That invite link has expired')
  }
  const organiser = await ctx.store.organiserBySessionTokenHash(hashToken(organiserToken))
  return { organiserToken, organiserId: organiser!.id, name: organiser!.name }
}
```

Register both in the `actions` export object:

```ts
export const actions = {
  create,
  join,
  setRoles,
  start,
  linkTag,
  state,
  location,
  catch: catchAction,
  jailbreak,
  subscribe,
  claim,
  usePowerup,
  pause,
  resume,
  sos,
  report,
  handleAlert,
  removePlayer,
  createOrganiserInvite,
  redeemOrganiserInvite,
} satisfies Record<string, Action>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run api/_lib/actions.test.ts -t "organiser invites"`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: createOrganiserInvite and redeemOrganiserInvite actions"
```

---

## Task 7: Marshal pre-assignment invite actions

**Files:**
- Modify: `app/api/_lib/actions.ts`
- Modify: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `requireOrganiser` (Task 5), `MARSHAL_INVITE_TTL_MS`/`isExpired` (Task 1), `requireLobby` (existing).
- Produces: actions `createMarshalInvite` and `redeemMarshalInvite`, registered in `actions`.

- [ ] **Step 1: Write the failing tests**

Add to `app/api/_lib/actions.test.ts`:

```ts
describe('marshal invites', () => {
  it('an organiser pre-assigns a marshal, who joins directly with that role', async () => {
    const g = await readyGame()
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const joined = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    expect(joined.token).toHaveLength(43)
    const players = await store.players((await store.gameByCode(g.code))!.id)
    expect(players.find((p) => p.id === joined.playerId)).toMatchObject({ name: 'Siti', role: 'marshal' })
  })

  it('refuses a marshal invite once the game has started', async () => {
    const g = await readyGame()
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' }), 410)
  })

  it('refuses createMarshalInvite from a non-organiser', async () => {
    const g = await readyGame()
    await rejects(run('createMarshalInvite', { code: g.code, organiserToken: 'wrong' }), 403)
  })

  it('refuses to redeem the same marshal invite twice', async () => {
    const g = await readyGame()
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    await rejects(run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Second' }), 410)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run api/_lib/actions.test.ts -t "marshal invites"`
Expected: FAIL — `Unknown action`

- [ ] **Step 3: Implement the actions**

```ts
import { isExpired, MARSHAL_INVITE_TTL_MS, ORGANISER_INVITE_TTL_MS } from '../../shared/invites.js'
```

(extend the Task 6 import line to include `MARSHAL_INVITE_TTL_MS`)

Add after `redeemOrganiserInvite`:

```ts
const createMarshalInvite: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  await requireOrganiser(ctx, game, body)
  requireLobby(game, ctx.now)
  const inviteToken = newToken()
  await ctx.store.createMarshalInvite({
    game_id: game.id,
    token_hash: hashToken(inviteToken),
    created_at: iso(ctx.now),
    expires_at: iso(ctx.now + MARSHAL_INVITE_TTL_MS),
    redeemed_at: null,
  })
  return { inviteToken }
}

const redeemMarshalInvite: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  if (phaseAt(game, ctx.now).phase !== 'lobby') throw new ActionError(410, 'That invite link is no longer usable — the game already started')
  const inviteToken = str(body.inviteToken)
  if (!inviteToken) throw new ActionError(400, 'Missing invite token')
  const name = str(body.name).trim()
  if (name.length < 1 || name.length > 24) throw new ActionError(400, 'Name must be 1–24 characters')
  const result = await ctx.store.redeemMarshalInvite(hashToken(inviteToken), ctx.now)
  if (!result.ok) {
    if (result.reason === 'invalid') throw new ActionError(404, 'That invite link is not valid')
    if (result.reason === 'redeemed') throw new ActionError(410, 'That invite link has already been used')
    throw new ActionError(410, 'That invite link has expired')
  }
  const token = newToken()
  const p = await ctx.store.addPlayer({
    game_id: game.id,
    name,
    role: 'marshal',
    tag_id: null,
    accepted_at: iso(ctx.now),
    caught_at: null,
    caught_by: null,
    jailed: false,
    freed_once: false,
    push: null,
    removed_at: null,
    outside: false,
    left_start: false,
    token_hash: hashToken(token),
  })
  await ctx.store.addEvent({ game_id: game.id, type: 'joined', actor_id: p.id, target_id: null, data: {} })
  return { token, playerId: p.id }
}
```

Register both in the `actions` export, after `redeemOrganiserInvite`:

```ts
  createMarshalInvite,
  redeemMarshalInvite,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run api/_lib/actions.test.ts -t "marshal invites"`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full server-side suite**

Run: `cd app && npx vitest run api`
Expected: all pass — this is the checkpoint that Tasks 5–7 haven't broken anything else in `actions.test.ts` or `store.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: createMarshalInvite and redeemMarshalInvite actions"
```

---

## Task 8: Client organiser session storage

**Files:**
- Create: `app/src/game/organiserSession.ts`
- Create: `app/src/game/organiserSession.test.ts`
- Modify: `app/src/game/session.ts`
- Modify: `app/src/game/session.test.ts`
- Modify: `app/src/game/auth.ts`

**Interfaces:**
- Produces: `loadOrganiserSession(storage): OrganiserSession | null`, `saveOrganiserSession(storage, s): void`, `clearOrganiserSession(storage): void`
- Changed: `GameSession` drops `hostKey`; `credentials(code)` now returns `{ token?: string; organiserToken?: string }`

- [ ] **Step 1: Write the failing test for the new module**

```ts
// app/src/game/organiserSession.test.ts
import { describe, expect, it } from 'vitest'
import { clearOrganiserSession, loadOrganiserSession, saveOrganiserSession } from './organiserSession'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

describe('organiser session', () => {
  it('is empty until saved, then round-trips', () => {
    const storage = memoryStorage()
    expect(loadOrganiserSession(storage)).toBeNull()
    saveOrganiserSession(storage, { organiserToken: 'tok1', name: 'Owner' })
    expect(loadOrganiserSession(storage)).toEqual({ organiserToken: 'tok1', name: 'Owner' })
  })

  it('is not scoped to a game code — one session for every game', () => {
    const storage = memoryStorage()
    saveOrganiserSession(storage, { organiserToken: 'tok1', name: 'Owner' })
    expect(storage.getItem('kejar.organiser')).not.toBeNull()
  })

  it('clears', () => {
    const storage = memoryStorage()
    saveOrganiserSession(storage, { organiserToken: 'tok1', name: 'Owner' })
    clearOrganiserSession(storage)
    expect(loadOrganiserSession(storage)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/game/organiserSession.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the module**

```ts
// app/src/game/organiserSession.ts
export interface OrganiserSession {
  organiserToken: string
  name: string
}

const KEY = 'kejar.organiser'

/** Unlike GameSession, this is global — one organiser session covers every game on this phone. */
export function loadOrganiserSession(storage: Storage): OrganiserSession | null {
  try {
    const raw = storage.getItem(KEY)
    return raw ? (JSON.parse(raw) as OrganiserSession) : null
  } catch {
    return null
  }
}

export function saveOrganiserSession(storage: Storage, s: OrganiserSession): void {
  storage.setItem(KEY, JSON.stringify(s))
}

export function clearOrganiserSession(storage: Storage): void {
  storage.removeItem(KEY)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/game/organiserSession.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Remove `hostKey` from the per-game session, and fix its test**

In `app/src/game/session.ts`:

```ts
// Replace:
// export interface GameSession {
//   token?: string
//   hostKey?: string
// }
// with:
export interface GameSession {
  token?: string
}
```

In `app/src/game/session.test.ts`, replace:

```ts
    const storage = memoryStorage()
    saveSession(storage, 'ABC234', { token: 't1' })
    saveSession(storage, 'ABC234', { hostKey: 'h1' })
    expect(loadSession(storage, 'ABC234')).toEqual({ token: 't1', hostKey: 'h1' })
```

with:

```ts
    const storage = memoryStorage()
    saveSession(storage, 'ABC234', { token: 't1' })
    expect(loadSession(storage, 'ABC234')).toEqual({ token: 't1' })
```

- [ ] **Step 6: Update `credentials()`**

```ts
// app/src/game/auth.ts — replace the whole file with:
import { loadSession } from './session'
import { loadOrganiserSession } from './organiserSession'

/** What identifies this phone to the server for a game: a player token, else this phone's organiser session. */
export function credentials(code: string): { token?: string; organiserToken?: string } {
  const s = loadSession(localStorage, code)
  if (s.token) return { token: s.token }
  const organiser = loadOrganiserSession(localStorage)
  return organiser ? { organiserToken: organiser.organiserToken } : {}
}
```

- [ ] **Step 7: Run the affected tests**

Run: `cd app && npx vitest run src/game/session.test.ts src/game/organiserSession.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/src/game/organiserSession.ts app/src/game/organiserSession.test.ts app/src/game/session.ts app/src/game/session.test.ts app/src/game/auth.ts
git commit -m "feat: global organiser session, replacing per-game hostKey on the client"
```

---

## Task 9: Organiser invite redemption route and screen

**Files:**
- Modify: `app/src/routes.ts`
- Modify: `app/src/routes.test.ts`
- Modify: `app/src/App.tsx`
- Create: `app/src/screens/OrganiserRedeem.tsx`
- Create: `app/src/screens/OrganiserRedeem.test.tsx`

**Interfaces:**
- Consumes: `saveOrganiserSession` (Task 8), `call` (existing `game/api.ts`)
- Produces: route `organiser-redeem` carrying a `token`; `routeFor` return type gains an optional `token` field.

- [ ] **Step 1: Write the failing route test**

Add to `app/src/routes.test.ts`, inside the existing `describe('routeFor', ...)`:

```ts
  it('maps an organiser invite link, keeping the token case-sensitive', () => {
    expect(routeFor('/organiser/AbC-123_xyz')).toEqual({ route: 'organiser-redeem', token: 'AbC-123_xyz' })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/routes.test.ts`
Expected: FAIL — route resolves to `not-found`

- [ ] **Step 3: Add the route**

In `app/src/routes.ts`:

```ts
export type Route =
  | 'home'
  | 'host-new'
  | 'host-lobby'
  | 'game'
  | 'join'
  | 'print-tags'
  | 'organiser-redeem'
  | 'spike-join'
  | 'spike-admin'
  | 'spike-report'
  | 'not-found'
```

```ts
// After the WITH_CODE block, add:
const ORGANISER_REDEEM = /^\/organiser\/([A-Za-z0-9_-]+)$/

export function routeFor(pathname: string): { route: Route; code?: string; token?: string } {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (FIXED[path]) return { route: FIXED[path] }
  for (const [re, route] of WITH_CODE) {
    const m = re.exec(path)
    if (m) return { route, code: m[1].toUpperCase() }
  }
  const o = ORGANISER_REDEEM.exec(path)
  if (o) return { route: 'organiser-redeem', token: o[1] }
  return { route: 'not-found' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/routes.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing screen test**

```ts
// app/src/screens/OrganiserRedeem.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))

import OrganiserRedeem from './OrganiserRedeem'

beforeEach(() => {
  call.mockReset()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
  localStorage.clear()
})
afterEach(cleanup)

describe('OrganiserRedeem', () => {
  it('redeems the invite, saves the session, and goes to create a game', async () => {
    call.mockResolvedValue({ organiserToken: 'ot1', name: 'Partner' })
    render(<OrganiserRedeem token="tok1" />)
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('redeemOrganiserInvite', { inviteToken: 'tok1' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('kejar.organiser')!)).toEqual({ organiserToken: 'ot1', name: 'Partner' }))
    expect(window.location.assign).toHaveBeenCalledWith('/host/new')
  })

  it('shows the server error on a used or expired link', async () => {
    call.mockRejectedValue(new Error('That invite link has already been used'))
    render(<OrganiserRedeem token="tok1" />)
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText('That invite link has already been used')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd app && npx vitest run src/screens/OrganiserRedeem.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 7: Implement the screen**

```tsx
// app/src/screens/OrganiserRedeem.tsx
import { useState } from 'react'
import { call } from '../game/api'
import { saveOrganiserSession } from '../game/organiserSession'
import { ErrorText, Screen } from '../game/ui'

export default function OrganiserRedeem({ token }: { token: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function redeem() {
    setBusy(true)
    setError('')
    try {
      const { organiserToken, name } = await call<{ organiserToken: string; name: string }>('redeemOrganiserInvite', {
        inviteToken: token,
      })
      saveOrganiserSession(localStorage, { organiserToken, name })
      window.location.assign('/host/new')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Screen eyebrow="kejar. · organiser">
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>Sign in as organiser</h1>
      <p className="muted">This link signs this phone in to create and manage games. It only works once.</p>
      <ErrorText>{error}</ErrorText>
      <button className="btn" disabled={busy} onClick={redeem}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </Screen>
  )
}
```

- [ ] **Step 8: Wire the route into App.tsx**

```tsx
// app/src/App.tsx — add the import:
import OrganiserRedeem from './screens/OrganiserRedeem'
```

```tsx
// Change the destructuring and add a case:
// const { route, code } = routeFor(window.location.pathname)
// with:
const { route, code, token } = routeFor(window.location.pathname)
```

```tsx
// Add a case, e.g. after 'print-tags':
    case 'organiser-redeem':
      return <OrganiserRedeem token={token!} />
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd app && npx vitest run src/screens/OrganiserRedeem.test.tsx src/routes.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add app/src/routes.ts app/src/routes.test.ts app/src/App.tsx app/src/screens/OrganiserRedeem.tsx app/src/screens/OrganiserRedeem.test.tsx
git commit -m "feat: organiser invite redemption screen and route"
```

---

## Task 10: Marshal invite redemption route and screen

**Files:**
- Modify: `app/src/routes.ts`
- Modify: `app/src/routes.test.ts`
- Modify: `app/src/App.tsx`
- Create: `app/src/screens/MarshalRedeem.tsx`
- Create: `app/src/screens/MarshalRedeem.test.tsx`

**Interfaces:**
- Consumes: `saveSession` (existing `game/session.ts`), `call`.
- Produces: route `marshal-redeem` carrying both `code` and `token`.

- [ ] **Step 1: Write the failing route test**

Add to `app/src/routes.test.ts`:

```ts
  it('maps a marshal invite link, uppercasing the code but not the token', () => {
    expect(routeFor('/m/abc234/XyZ-9_tok')).toEqual({ route: 'marshal-redeem', code: 'ABC234', token: 'XyZ-9_tok' })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/routes.test.ts`
Expected: FAIL

- [ ] **Step 3: Add the route**

```ts
// app/src/routes.ts — extend the Route union:
  | 'marshal-redeem'
```

```ts
// Add alongside ORGANISER_REDEEM:
const MARSHAL_REDEEM = /^\/m\/([A-Za-z0-9]{6})\/([A-Za-z0-9_-]+)$/
```

```ts
// In routeFor, after the organiser-redeem check:
  const ma = MARSHAL_REDEEM.exec(path)
  if (ma) return { route: 'marshal-redeem', code: ma[1].toUpperCase(), token: ma[2] }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/routes.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing screen test**

```tsx
// app/src/screens/MarshalRedeem.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))

import MarshalRedeem from './MarshalRedeem'

beforeEach(() => {
  call.mockReset()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
  localStorage.clear()
})
afterEach(cleanup)

describe('MarshalRedeem', () => {
  it('redeems the invite with a typed name and goes into the game', async () => {
    call.mockResolvedValue({ token: 'pt1', playerId: 'p1' })
    render(<MarshalRedeem code="ABC234" token="tok1" />)
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Siti' } })
    fireEvent.click(screen.getByRole('button', { name: /join as marshal/i }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('redeemMarshalInvite', { code: 'ABC234', inviteToken: 'tok1', name: 'Siti' }),
    )
    await waitFor(() => expect(JSON.parse(localStorage.getItem('kejar.game.ABC234')!)).toEqual({ token: 'pt1' }))
    expect(window.location.assign).toHaveBeenCalledWith('/g/ABC234')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd app && npx vitest run src/screens/MarshalRedeem.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 7: Implement the screen**

```tsx
// app/src/screens/MarshalRedeem.tsx
import { useState } from 'react'
import { call } from '../game/api'
import { saveSession } from '../game/session'
import { ErrorText, Screen } from '../game/ui'

export default function MarshalRedeem({ code, token }: { code: string; token: string }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function redeem() {
    setBusy(true)
    setError('')
    try {
      const { token: playerToken } = await call<{ token: string }>('redeemMarshalInvite', {
        code,
        inviteToken: token,
        name: name.trim(),
      })
      saveSession(localStorage, code, { token: playerToken })
      window.location.assign(`/g/${code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Screen eyebrow={`kejar. · marshal ${code}`}>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>You&apos;re marshal for this game</h1>
      <label className="eyebrow" htmlFor="name">
        Your name
      </label>
      <input id="name" className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <button className="btn" disabled={!name.trim() || busy} onClick={redeem}>
        {busy ? 'Joining…' : 'Join as marshal'}
      </button>
    </Screen>
  )
}
```

- [ ] **Step 8: Wire the route into App.tsx**

```tsx
import MarshalRedeem from './screens/MarshalRedeem'
```

```tsx
    case 'marshal-redeem':
      return <MarshalRedeem code={code!} token={token!} />
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd app && npx vitest run src/screens/MarshalRedeem.test.tsx src/routes.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add app/src/routes.ts app/src/routes.test.ts app/src/App.tsx app/src/screens/MarshalRedeem.tsx app/src/screens/MarshalRedeem.test.tsx
git commit -m "feat: marshal invite redemption screen and route"
```

---

## Task 11: Cut HostNew over to organiser sessions, add peer-invite UI

**Files:**
- Modify: `app/src/screens/HostNew.tsx`
- Modify: `app/src/screens/HostNew.test.tsx`

**Interfaces:**
- Consumes: `loadOrganiserSession` (Task 8), `call`, `createOrganiserInvite` action (Task 6).

- [ ] **Step 1: Update the existing test's fixtures**

In `app/src/screens/HostNew.test.tsx`, replace the `beforeEach`:

```ts
beforeEach(() => {
  call.mockReset()
  call.mockResolvedValue({ code: 'ABC234' })
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'ot1', name: 'Owner' }))
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})
```

(note: `afterEach` didn't exist before with this body — check the current file; if it already has a bare `afterEach(cleanup)`, replace it with the `localStorage.clear()` version above so sessions don't leak between tests)

Update the three `expect(call).toHaveBeenCalledWith('create', expect.objectContaining({ ... }))` assertions to also expect `organiserToken: 'ot1'` in the objectContaining — e.g.:

```ts
      expect(call).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({ arenaId: 'around-me', center: { lat: 3.5, lng: 101.5 }, radiusM: 300, organiserToken: 'ot1' }),
      ),
```

(apply the same `organiserToken: 'ot1'` addition to the other two `objectContaining` assertions in this file)

- [ ] **Step 2: Add a new failing test for the signed-out case**

Add to the `describe('HostNew', ...)` block:

```ts
  it('asks for an invite link when this phone has no organiser session', () => {
    localStorage.clear()
    render(<HostNew />)
    expect(screen.getByText(/need an invite link/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create game/i })).toBeNull()
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app && npx vitest run src/screens/HostNew.test.tsx`
Expected: FAIL — `create` wasn't called with `organiserToken`, and the signed-out test finds no matching text

- [ ] **Step 4: Update HostNew.tsx**

```tsx
// Add the import:
import { loadOrganiserSession } from '../game/organiserSession'
```

```tsx
// At the top of the component function, after the existing useState calls, add:
  const organiser = loadOrganiserSession(localStorage)
```

```tsx
// In create(), change:
//       const { code, hostKey } = await call<{ code: string; hostKey: string }>('create', {
//         arenaId,
//         settings,
//         ...(picked ? { center, radiusM: Number(size), stations } : {}),
//       })
//       saveSession(localStorage, code, { hostKey })
//       window.location.assign(`/host/${code}`)
// to:
      const { code } = await call<{ code: string }>('create', {
        arenaId,
        settings,
        organiserToken: organiser!.organiserToken,
        ...(picked ? { center, radiusM: Number(size), stations } : {}),
      })
      window.location.assign(`/host/${code}`)
```

Remove the now-unused `saveSession`/`loadSession` import if `HostNew.tsx` no longer uses it elsewhere (check with `grep -n "saveSession\|loadSession" app/src/screens/HostNew.tsx` — if the only use was the one just removed, delete the import line).

Add the signed-out guard right after the `return (` — actually, add it as an early return before the main `return (`:

```tsx
  if (!organiser) {
    return (
      <Screen eyebrow="kejar. · organise">
        <p className="muted">
          You need an invite link from another organiser to create games on this phone.
        </p>
      </Screen>
    )
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npx vitest run src/screens/HostNew.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/HostNew.tsx app/src/screens/HostNew.test.tsx
git commit -m "feat: HostNew requires an organiser session instead of creating anonymously"
```

- [ ] **Step 7: Write the failing test for inviting a peer organiser**

The `createOrganiserInvite` action (Task 6) and its redemption screen (Task 9) exist, but nothing in the app yet lets a signed-in organiser actually generate one — add that here, since this is where a signed-in organiser already lands.

Add to `app/src/screens/HostNew.test.tsx`:

```ts
  it('invites a peer organiser and shows the link to share', async () => {
    call.mockImplementation(async (action: string) => {
      if (action === 'createOrganiserInvite') return { inviteToken: 'tok1' }
      return { code: 'ABC234' }
    })
    render(<HostNew />)
    fireEvent.change(screen.getByLabelText('New organiser\'s name'), { target: { value: 'Partner' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('createOrganiserInvite', { organiserToken: 'ot1', name: 'Partner' }),
    )
    expect(await screen.findByText(`${window.location.origin}/organiser/tok1`)).toBeInTheDocument()
  })
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd app && npx vitest run src/screens/HostNew.test.tsx -t "invites a peer organiser"`
Expected: FAIL — no "New organiser's name" field exists yet

- [ ] **Step 9: Add the invite-a-peer card to HostNew.tsx**

Add state near the top of the component, alongside the other `useState` calls:

```tsx
  const [peerName, setPeerName] = useState('')
  const [peerInviteUrl, setPeerInviteUrl] = useState('')
  const [peerBusy, setPeerBusy] = useState(false)
```

Add the handler, near `create()`:

```tsx
  async function invitePeer() {
    setPeerBusy(true)
    setError('')
    try {
      const { inviteToken } = await call<{ inviteToken: string }>('createOrganiserInvite', {
        organiserToken: organiser!.organiserToken,
        name: peerName.trim(),
      })
      setPeerInviteUrl(`${window.location.origin}/organiser/${inviteToken}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPeerBusy(false)
    }
  }
```

Add the card in the JSX, just above the `<p className="eyebrow">Play area</p>` line:

```tsx
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontWeight: 600 }}>Invite another organiser</p>
        <label className="eyebrow" htmlFor="peerName">
          New organiser&apos;s name
        </label>
        <input id="peerName" className="input" maxLength={40} value={peerName} onChange={(e) => setPeerName(e.target.value)} />
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} disabled={!peerName.trim() || peerBusy} onClick={invitePeer}>
          Send invite
        </button>
        {peerInviteUrl && (
          <p className="muted" style={{ wordBreak: 'break-all' }}>
            {peerInviteUrl}
          </p>
        )}
      </div>
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd app && npx vitest run src/screens/HostNew.test.tsx`
Expected: PASS (all tests in this file, including the new one)

- [ ] **Step 11: Commit**

```bash
git add app/src/screens/HostNew.tsx app/src/screens/HostNew.test.tsx
git commit -m "feat: invite-another-organiser card on the new-game screen"
```

---

## Task 12: HostLobby — drop manual runner/chaser pills, add marshal invite flow

**Files:**
- Modify: `app/src/screens/HostLobby.tsx`
- Modify: `app/src/screens/HostLobby.test.tsx`
- Modify: `app/src/game/MarshalTools.test.tsx`

**Interfaces:**
- Consumes: `loadOrganiserSession` (Task 8), `createMarshalInvite` action (Task 7).

- [ ] **Step 1: Update HostLobby.test.tsx's fixtures and auth expectations**

Replace the `beforeEach`:

```ts
beforeEach(() => {
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'h1', name: 'Owner' }))
  call.mockReset()
  call.mockImplementation(async (action: string) => {
    if (action === 'state') return lobbyView
    if (action === 'start') throw new ApiError(409, 'Need at least 1 chaser')
    if (action === 'setRoles') return { roles: {}, problems: [] }
    return {}
  })
})
```

Replace the two `hostKey: 'h1'` expectations with `organiserToken: 'h1'`:

```ts
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setRoles', { code: 'ABC234', organiserToken: 'h1', shuffle: true }),
    )
```

- [ ] **Step 2: Rewrite the role-picker test for the new, marshal-only picker**

Replace the `'sets a role with the pill buttons...'` test entirely — the runner/chaser pills no longer exist, only a marshal toggle:

```ts
  it('sets a player as marshal with the pill button', async () => {
    render(<HostLobby code="ABC234" />)
    const marshal = await screen.findByRole('radio', { name: 'Aina: Marshal' })
    expect(marshal).not.toBeChecked()
    fireEvent.click(marshal)
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setRoles', { code: 'ABC234', organiserToken: 'h1', roles: { p1: 'marshal' } }),
    )
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app && npx vitest run src/screens/HostLobby.test.tsx`
Expected: FAIL — the "Aina: Marshal" radio doesn't exist yet (Runner/Chaser/Marshal pills still all present), and `organiserToken` doesn't match what the component currently sends

- [ ] **Step 4: Update HostLobby.tsx**

```tsx
// Replace the import:
// import { loadSession } from '../game/session'
// with:
import { loadOrganiserSession } from '../game/organiserSession'
```

```tsx
// Replace:
// const { hostKey } = loadSession(localStorage, code)
// with:
const organiser = loadOrganiserSession(localStorage)
```

```tsx
// In act(), replace:
//       await call(action, { code, hostKey, ...body })
// with:
      await call(action, { code, organiserToken: organiser!.organiserToken, ...body })
```

```tsx
// Replace the not-authorised guard:
//   if (!hostKey) {
// with:
  if (!organiser) {
```

Replace the role-picker options (drop runner/chaser, keep only marshal — toggling it off isn't offered here since un-marshalling back to "no role" isn't a case the organiser needs; shuffle re-assigns runner/chaser for everyone not marked marshal):

```tsx
// Replace:
//                 <Pills<Role>
//                   label={p.name}
//                   value={p.role}
//                   disabled={busy}
//                   options={[
//                     { value: 'runner', text: 'Dikejar' },
//                     { value: 'chaser', text: 'Kejar' },
//                     { value: 'marshal', text: 'Marshal' },
//                   ]}
//                   onChange={(role) => act('setRoles', { roles: { [p.id]: role } })}
//                 />
// with:
                <Pills<Role>
                  label={p.name}
                  value={p.role === 'marshal' ? 'marshal' : null}
                  disabled={busy}
                  options={[{ value: 'marshal', text: 'Marshal' }]}
                  onChange={(role) => act('setRoles', { roles: { [p.id]: role } })}
                />
```

Now add the "invite a marshal" flow. Add state and a function near the top of the component, after the existing `useState` calls:

```tsx
  const [marshalInviteUrl, setMarshalInviteUrl] = useState('')

  async function inviteMarshal() {
    setBusy(true)
    setError('')
    try {
      const { inviteToken } = await call<{ inviteToken: string }>('createMarshalInvite', {
        code,
        organiserToken: organiser!.organiserToken,
      })
      setMarshalInviteUrl(`${window.location.origin}/m/${code}/${inviteToken}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
```

Add the button and link display in the JSX, just above the "Players" heading:

```tsx
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={inviteMarshal}>
          Invite a marshal
        </button>
        {marshalInviteUrl && (
          <p className="muted" style={{ wordBreak: 'break-all' }}>
            {marshalInviteUrl}
          </p>
        )}
      </div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npx vitest run src/screens/HostLobby.test.tsx`
Expected: PASS

- [ ] **Step 6: Fix MarshalTools.test.tsx's fixtures**

In `app/src/game/MarshalTools.test.tsx`, replace:

```ts
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ hostKey: 'h1' }))
```

with:

```ts
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'h1', name: 'Owner' }))
```

Replace every `hostKey: 'h1'` in that file's `expect(call).toHaveBeenCalledWith(...)` assertions with `organiserToken: 'h1'` (there are 5 such assertions, at the lines shown by `grep -n "hostKey: 'h1'" app/src/game/MarshalTools.test.tsx`).

- [ ] **Step 7: Run that test file too**

Run: `cd app && npx vitest run src/game/MarshalTools.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/src/screens/HostLobby.tsx app/src/screens/HostLobby.test.tsx app/src/game/MarshalTools.test.tsx
git commit -m "feat: HostLobby drops manual runner/chaser pills, adds marshal invite links"
```

---

## Task 13: GameScreen — read organiser status from the server, not local hostKey

**Files:**
- Modify: `app/src/screens/GameScreen.tsx`

**Interfaces:**
- No new interfaces — this task removes a dependency rather than adding one. The `state` action already reports `me.id === 'host'` for the calling organiser (unchanged by this plan), so `GameScreen` can read that instead of inspecting local storage directly.

- [ ] **Step 1: Update the signed-in and is-host checks**

```tsx
// Replace:
// const session = loadSession(localStorage, code)
// const signedIn = !!(session.token || session.hostKey)
// with:
  const session = loadSession(localStorage, code)
  const signedIn = !!(session.token || loadOrganiserSession(localStorage))
```

```tsx
// Add the import alongside the existing loadSession import:
import { loadOrganiserSession } from '../game/organiserSession'
```

```tsx
// Replace:
//   if (current.phase === 'ended') return <Results view={current} isHost={!!session.hostKey} />
// with:
  if (current.phase === 'ended') return <Results view={current} isHost={current.me.id === 'host'} />
```

- [ ] **Step 2: Run the existing GameScreen test to confirm nothing broke**

Run: `cd app && npx vitest run src/screens/GameScreen.test.tsx`
Expected: PASS (this file doesn't exercise `signedIn`/`isHost` directly, per a prior check, so no test changes are expected — this run is the safety net)

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/GameScreen.tsx
git commit -m "fix: GameScreen reads organiser status from the server view, not local hostKey"
```

---

## Task 14: Bootstrap script for the owner's first organiser

**Files:**
- Create: `app/scripts/bootstrap-owner.ts`

**Interfaces:**
- Consumes: `SupabaseStore` (Task 4), `serverDb` (existing `api/_lib/server.ts`), `newToken`/`hashToken` (existing `secrets.ts`), `ORGANISER_INVITE_TTL_MS` is deliberately *not* used here — the bootstrap invite never expires (see Step 1's comment).

No automated test — this is a one-off operational script run once against the real database, not application code exercised by the test suite. Its correctness is verified by Step 2 (running it for real) rather than a unit test.

- [ ] **Step 1: Write the script**

```ts
// app/scripts/bootstrap-owner.ts
// Run once, against production, to create the very first organiser (the owner).
// Usage: npx tsx scripts/bootstrap-owner.ts "Owner Name"
import { randomBytes } from 'node:crypto'
import { hashToken, newToken } from '../api/_lib/secrets.js'
import { serverDb } from '../api/_lib/server.js'
import { SupabaseStore } from '../api/_lib/supabaseStore.js'

async function main() {
  const name = process.argv[2]
  if (!name) throw new Error('Usage: npx tsx scripts/bootstrap-owner.ts "Owner Name"')
  const now = Date.now()
  const store = new SupabaseStore(serverDb(), () => now)
  const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(now).toISOString() })
  const inviteToken = newToken()
  // No expiry worth enforcing for a one-time, manually-run bootstrap invite — this script only
  // runs once, by the owner, directly against their own database.
  const farFuture = new Date(now + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
  await store.createOrganiserInvite({
    organisation_id: org.id,
    organiser_id: null,
    name,
    token_hash: hashToken(inviteToken),
    created_at: new Date(now).toISOString(),
    expires_at: farFuture,
    redeemed_at: null,
  })
  console.log(`Open this once on the owner's phone:\nhttps://kejar-eosin.vercel.app/organiser/${inviteToken}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

(the unused `randomBytes` import above is a mistake — remove it; `newToken`/`hashToken` already cover every random/hash need in this script)

- [ ] **Step 2: Run it against the real database once**

Run: `cd app && npx tsx scripts/bootstrap-owner.ts "Your Name"`

Expected: prints a `https://kejar-eosin.vercel.app/organiser/<token>` link. Open it on your phone — per Task 9's `OrganiserRedeem` screen, this signs this phone in and redirects to `/host/new`, which (per Task 11) should now show the create-game form instead of the "need an invite link" message.

- [ ] **Step 3: Commit**

```bash
git add app/scripts/bootstrap-owner.ts
git commit -m "feat: bootstrap script to create the owner's first organiser account"
```

---

## Final checkpoint

- [ ] Run the full suite: `cd app && npm test` — expect all tests passing (the project was at 297 before this plan; expect that number to grow by roughly 25-30 new tests added across Tasks 1, 3, 6, 7, 8, 9, 10, plus the rewritten ones in Tasks 5, 11, 12).
- [ ] Run `cd app && npm run typecheck` — expect no errors.
- [ ] Run `grep -rn "hostKey" app/src app/api` — expect zero output. Every reference should have become `organiserToken` or been deleted.
- [ ] Apply `supabase/migrations/0006_organisers.sql` by hand in the Supabase dashboard, per the existing workflow in `docs/HANDOFF.md`.
- [ ] Run `app/scripts/bootstrap-owner.ts` once against the real database (Task 14, Step 2) so there's an actual first organiser to sign in as.
