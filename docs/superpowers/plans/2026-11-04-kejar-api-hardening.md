# API Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the audit's H2, M1, M2, M5, L1 and L2 findings. Every API caller gets a request limit, lobbies get a player cap, location writes get a minimum gap, unexpected errors stop leaking internals, malformed requests get a clean 400, game codes come from a crypto source, and the site sends basic security headers.

**Architecture:**
- The request handling in `api/game.ts` moves into a testable `api/_lib/handle.ts`. That makes the 400/500 behaviour and the rate-limit check unit-testable against `MemoryStore`.
- Limits are a fixed one-minute window per key, counted atomically in Postgres by one new function (`hit_rate_limit`), with a `MemoryStore` twin for tests.
- The player cap and the location gap live in the `join` and `location` actions.

**Tech Stack:** TypeScript, Vitest, Vercel Node functions, Supabase/Postgres (one new migration, `0012_rate_limits.sql`, which the owner runs by hand).

**Spec:** `docs/superpowers/audits/2026-11-04-kejar-audit.md` (H2, M1, M2, M5, L1, L2).

## Global Constraints

- Free tiers only. Keep the single `api/game.ts` function, with no new services (no Upstash, no paid Vercel WAF).
- Any new table or function is a numbered migration the owner runs by hand in Supabase. Revoke every new function from `public, anon, authenticated` and grant it to `service_role`, matching `0011`. Enable row-level security on every new table.
- Player-facing copy is plain English.
- The limits are Claude's call, set so a normal phone stays far below them. Today a phone polls `state` every 3 s (20/min) and sends `location` every 5 s (12/min): `POLL_MS` and `ALWAYS_EVERY_MS` in `src/game/useGameState.ts`.
  - **With a `token` or `organiserToken`:** 120 requests per minute per token.
  - **Without either** (join, invite redeems): 60 per minute per IP. Malaysian mobile carriers put many phones behind one IP, so this must allow a whole group joining at once.
- **The rate limiter fails open.** If the limit check throws (for example, Supabase is unreachable), log it and run the action. A broken limiter must never stop a game.

## Review Focus

1. **One shared IP.** A whole group joins at once behind one mobile-carrier IP. Thirty joins in a minute from one IP must all succeed. That's 60/min per IP, and after joining they're limited by token instead (test in Task 2).
2. **Missing IP headers.** With no IP headers (local dev, tests), every tokenless request shares the key `ip:unknown`. That's acceptable, but it must not crash (test in Task 2).
3. **A body that isn't an object.** `null`, an array, a number or a non-JSON string must give 400 `Bad request`, never a 500 (test in Task 1).
4. **Polling at a normal rate is never limited.** 20 `state` plus 12 `location` calls in a minute on one token must all pass (test in Task 2).
5. **The location gap doesn't affect scans.** A catch or claim scan right after a `location` call must still record its own fix. The gap applies only to the `location` action, not to `recordScanLocation` (test in Task 3).

---

### Task 1: The handler: clean 400s, generic 500s, crypto randomness

**Files:**
- Create: `app/api/_lib/handle.ts`
- Create: `app/api/_lib/handle.test.ts`
- Modify: `app/api/game.ts` (becomes a thin Vercel wrapper around `handle`)

**Interfaces:**
- Produces: `handle(raw: unknown, deps: { ctx: Omit<Ctx, 'now'> & { now: number }; ip: string | null }): Promise<{ status: number; json: unknown }>`.
  - `raw` is `req.body` as Vercel gives it: a string or an already-parsed value.
  - `Ctx` is the existing action context type from `actions.ts`; export it if it isn't exported already.
  - Task 2 adds the rate-limit check inside `handle`.
- Produces: `cryptoRng(): number` in `app/api/_lib/secrets.ts`, giving a uniform value in [0, 1) from `crypto.randomInt` / `getRandomValues`.

- [ ] **Step 1: Write the failing tests** in `handle.test.ts`, using `MemoryStore` the way `actions.test.ts` builds its context:
  - `it('answers 400 Bad request for a body that is not JSON')`: `handle('{nope', …)` resolves to `{ status: 400, json: { error: 'Bad request' } }`.
  - `it.each([null, [], 7, '"text"'])('answers 400 Bad request for a body that is not an object: %j')`.
  - `it('answers 400 Unknown action for a missing or unknown action')`, keeping today's message.
  - `it('passes an ActionError through with its status and message')`: `{ action: 'state', code: 'ZZZZZZ' }` gives `{ status: 404, json: { error: 'Game not found' } }`.
  - `it('hides an unexpected error behind a generic 500 and logs it')`: stub a store method to throw `new Error('duplicate key value violates unique constraint "x"')`. Expect `{ status: 500, json: { error: 'Something went wrong — try again' } }`, and expect `console.error` to have been called with that error (spy on it, and keep the test output quiet).
- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run api/_lib/handle.test.ts`. Expected: FAIL, because `handle` doesn't exist.
- [ ] **Step 3: Implement `handle`.**
  - Parse inside the `try`.
  - A non-object body or one that fails to parse gives 400 `Bad request`.
  - Keep today's `Unknown action` check and `ActionError` passthrough.
  - Anything else goes to `console.error('[api/game]', name, e)` and returns 500 `Something went wrong — try again`.
- [ ] **Step 4: Make `api/game.ts` a thin wrapper.**
  - It keeps the POST-only 405 check.
  - It builds the existing context (store, push, fetchJson) with `rng: cryptoRng` in place of `Math.random`. That fixes M5, because `newGameCode` and the steal and Abang Grab randomness all read `ctx.rng`.
  - It reads the IP as `x-real-ip`, else the first comma-separated entry of `x-forwarded-for`, trimmed, else `null`.
  - It calls `handle`, then `res.status(status).json(json)`.
- [ ] **Step 5: Add a `cryptoRng` test** in `api/_lib/secrets.test.ts` (create it if missing). It checks that 1,000 draws all fall in [0, 1) and that not all are equal.
- [ ] **Step 6: Run the tests and typecheck.** Run `npx vitest run api/_lib/handle.test.ts api/_lib/secrets.test.ts` and `npm run typecheck`. Expected: PASS, with no errors.
- [ ] **Step 7: Commit.**

```bash
git add app/api/game.ts app/api/_lib/handle.ts app/api/_lib/handle.test.ts app/api/_lib/secrets.ts app/api/_lib/secrets.test.ts app/api/_lib/actions.ts
git commit -m "security: clean 400s and generic 500s from the API, crypto randomness for codes and draws"
```

---

### Task 2: Request limits per token and per IP

**Files:**
- Create: `app/api/_lib/limits.ts`
- Create: `app/api/_lib/limits.test.ts`
- Create: `supabase/migrations/0012_rate_limits.sql`
- Modify: `app/api/_lib/store.ts` (the `GameStore` interface and `MemoryStore`)
- Modify: `app/api/_lib/supabaseStore.ts`
- Modify: `app/api/_lib/handle.ts`, `app/api/_lib/handle.test.ts`

**Interfaces:**
- Consumes: `handle` from Task 1.
- Produces:
  - In `limits.ts`: `TOKEN_LIMIT_PER_MIN = 120`, `IP_LIMIT_PER_MIN = 60`, `LIMIT_WINDOW_MS = 60_000`, and `limitKey(body: Record<string, unknown>, ip: string | null): { key: string; limit: number }`.
  - The key is `tok:` plus `hashToken(token)` when `body.token` or `body.organiserToken` is a non-empty string (`token` wins). Otherwise it's `ip:` plus the IP, or `ip:unknown`.
- Produces: `GameStore.hitRateLimit(key: string, windowMs: number, limit: number): Promise<boolean>`. It returns true while the request is within the limit, counting this request.

- [ ] **Step 1: Write the failing tests.**
  - `limits.test.ts`:
    - `limitKey` gives a `tok:` key with 120 for a player token.
    - An organiserToken alone gives a `tok:` key.
    - With both, `token` wins.
    - No token gives `ip:1.2.3.4` with 60.
    - A null IP gives `ip:unknown`.
    - The raw token never appears in the key.
  - `store.test.ts`, for `MemoryStore.hitRateLimit`:
    - The 120th call in a window is allowed and the 121st refused.
    - A new window (move the store clock on by 60 s) starts at 1 again.
    - Different keys count separately.
  - `handle.test.ts`:
    - `it('lets a phone poll normally all minute')`: 20 `state` plus 12 `location` calls on one token all get a non-429 status.
    - `it('answers 429 past the limit')`: the 121st call on one token in a minute gives `{ status: 429, json: { error: 'Too many requests — wait a moment and try again' } }`.
    - `it('lets a group join from one IP')`: 30 `join` calls in a minute from one IP all succeed.
    - `it('runs the action when the limiter itself fails')`: `hitRateLimit` rejects, the action still runs, and `console.error` was called.
- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run api/_lib/limits.test.ts api/_lib/store.test.ts api/_lib/handle.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write `0012_rate_limits.sql`,** wrapped in `begin; … commit;` like 0011, with `if not exists` / `create or replace`:
  - **Table** `rate_limits (key text not null, window_start timestamptz not null, count int not null default 0, primary key (key, window_start))`, with row-level security enabled.
  - **Function** `hit_rate_limit(p_key text, p_window_ms int, p_limit int) returns boolean`:
    - The window start is `now()` floored to `p_window_ms`.
    - `insert … on conflict (key, window_start) do update set count = rate_limits.count + 1 returning count`, then return `count <= p_limit`.
    - About 1 call in 100 (`random() < 0.01`) also deletes rows with `window_start < now() - interval '1 hour'`.
  - **Grants:** revoke from `public, anon, authenticated`; grant to `service_role`.
- [ ] **Step 4: Implement both stores.**
  - `MemoryStore` uses a `Map` keyed by `key|windowStart`, on the store's own clock.
  - `SupabaseStore` calls `rpc('hit_rate_limit', { p_key, p_window_ms, p_limit })`.
- [ ] **Step 5: Wire it into `handle`.**
  - Run it after the body parses and the action name checks out, before the action.
  - Call `limitKey`, then `store.hitRateLimit(key, LIMIT_WINDOW_MS, limit)`.
  - Refused gives 429 with the copy above.
  - A thrown error is logged and the request continues, per the fail-open constraint.
- [ ] **Step 6: Run the tests and typecheck.** Run the Step 2 command and `npm run typecheck`. Expected: PASS.
- [ ] **Step 7: Commit.**

```bash
git add app/api/_lib/limits.ts app/api/_lib/limits.test.ts app/api/_lib/store.ts app/api/_lib/store.test.ts app/api/_lib/supabaseStore.ts app/api/_lib/handle.ts app/api/_lib/handle.test.ts supabase/migrations/0012_rate_limits.sql
git commit -m "security: limit API requests per token and per IP"
```

---

### Task 3: Lobby cap, location gap, accuracy check

**Files:**
- Modify: `app/api/_lib/actions.ts` (`join`, `location`)
- Modify: `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts`, `supabase/migrations/0012_rate_limits.sql`
- Test: `app/api/_lib/actions.test.ts`, `app/api/_lib/store.test.ts`

**Interfaces:**
- Produces:
  - `MAX_PLAYERS_PER_GAME = 80` and `LOCATION_MIN_GAP_MS = 2_000`, both exported from `actions.ts`.
  - `GameStore.addPosition` gains an optional `minGapMs?: number`, and now returns `Promise<boolean>`: false when that player already has a location newer than `minGapMs`, so nothing is written. Every existing caller ignores the result.

- [ ] **Step 1: Write the failing tests** in `actions.test.ts`:
  - `it('refuses to join a full lobby')`: with 80 players already in, a new `join` throws `ActionError(409, 'This game is full')`. A player rejoining with their existing token still gets back in.
  - `it('removed players do not count towards the cap')`, matching how `store.players` already leaves them out.
  - `it('drops a location sent within 2 s of the last one')`: two `location` calls 1 s apart store one row (check via `latestPositions`, or a `MemoryStore` count). Calls 2 s apart store two.
  - `it('a scan right after a location still records its own fix')`: a `location` call, then 500 ms later a `claim` with coordinates. The claim's coordinates are the latest position (Review Focus 5).
  - `it('refuses a location with a nonsense accuracy')`: `accuracy_m` of `-5`, `NaN` or `Infinity` gives `ActionError(400, 'Invalid location')`. A value above 5,000 is stored as 5,000.
- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run api/_lib/actions.test.ts -t "full lobby|cap|2 s|scan right after|accuracy"`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - `join` counts `store.players(game.id)` after the existing-token early return and before `addPlayer`.
  - `location` passes `LOCATION_MIN_GAP_MS` and validates accuracy: finite and ≥ 0, else 400; clamped to ≤ 5,000.
  - `recordScanLocation` keeps calling `addPosition` with no gap.
- [ ] **Step 4: Make the gap atomic in Supabase.**
  - Add `add_position(p_game uuid, p_player uuid, p_lat float8, p_lng float8, p_accuracy float8, p_at timestamptz, p_min_gap_ms int) returns boolean` to `0012`, with the same grants.
  - It inserts only when no `locations` row exists for that player with `at > p_at - p_min_gap_ms`.
  - `SupabaseStore.addPosition` calls it when `minGapMs` is given, and keeps today's plain insert otherwise.
  - `MemoryStore` checks the gap with no `await` between the check and the push.
- [ ] **Step 5: Run the tests, typecheck and the full suite.** Run the Step 2 command, then `npm run typecheck` and `npx vitest run`. Expected: all PASS.
- [ ] **Step 6: Commit.**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/api/_lib/store.ts app/api/_lib/store.test.ts app/api/_lib/supabaseStore.ts supabase/migrations/0012_rate_limits.sql
git commit -m "security: cap lobbies at 80, space location writes 2 s apart, check accuracy"
```

---

### Task 4: Security headers and the client's 429 copy

**Files:**
- Modify: `app/vercel.json`
- Modify: `app/src/game/useGameState.ts` (only if Step 3 below finds the poll surfaces errors to the screen)
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Consumes: Task 2's 429 copy.

- [ ] **Step 1: Add the headers to `vercel.json`** with a `headers` entry for `"source": "/(.*)"`:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
  - `Content-Security-Policy: frame-ancestors 'none'`. That's the framing rule only: a full script CSP needs a browser check of the map tiles, OpenStreetMap, the QR worker and the fonts, and is left for later.
  - `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`
- [ ] **Step 2: Check the build still produces the site.** Run `npm run build`. Expected: built. After deploying, check the headers on the live site (`curl -I https://kejar-eosin.vercel.app/`) and that the camera scanner and location still work in the browser.
- [ ] **Step 3: Check how a refused poll looks.** Read `useGameState.ts`. If a failed `state` poll shows its error text on the chase screen, make a 429 retry quietly on the next poll instead of showing it, and add a test in `useGameState.test.tsx`. If polls already fail quietly, change nothing and say so in the report.
- [ ] **Step 4: Add a HANDOFF entry.** It says what this plan did, the limits, and **"run `supabase/migrations/0012_rate_limits.sql` in Supabase before merging"**. Without it, every request fails open with a logged error and the location gap breaks the `location` action, because the function is missing.
- [ ] **Step 5: Run the full suite, typecheck and build.** Run `npx vitest run`, `npm run typecheck` and `npm run build`. Expected: all pass.
- [ ] **Step 6: Commit.**

```bash
git add app/vercel.json app/src/game/useGameState.ts app/src/game/useGameState.test.tsx docs/HANDOFF.md
git commit -m "security: basic security headers; quiet retries when a poll is limited"
```
