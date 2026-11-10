# Organiser Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisers print their kit once and reuse it. Creating a game becomes five short steps:
1. Park
2. Core or Full
3. Settings
4. Crew
5. Pack

Event day gets a "walk the park" guide, and the lobby gets a "Before you start" panel. Reusable armbands get a free backstop against catching someone with a photo of their armband (Task 8).

**Architecture:**
- **The printed kit is reusable.** Armbands, station cards and the Penjara card already carry game-independent codes (`KEJAR:TAG:NN`, `KEJAR:STATION:n`, `KEJAR:JAIL`).
- **Secret cards come in sets.** Each organisation owns a set of three per legendary: Yellow A–C for Dato Seri and Purple A–C for Bomoh.
  - Each game is assigned one free card from the set, and only that card's code works in that game.
  - A card is reused until someone finds it. A found card is retired automatically, and the organiser can also retire one by hand. Reprinting gives it a new code.
  - **What keeps a copied card useless (owner's decision, 2026-11-09):**
    - Each player gets only 3 stash scans per game that aren't at the hidden spot. After that, their stash scans are ignored. Every refusal already reads the same `Nothing here.`, so a wrong scan gives no clue.
    - The app picks which of the three cards is in play.
- **Game creation:** steps 1–3 run on `HostNew` and end in **Create game**. Steps 4–5 (Crew, Pack) continue on the new game.
- **The packing list** is a pure function of the game (`app/shared/kit.ts`). Its ticks are saved on the game.
- **Walk the park** reads the arena's existing spots and records "placed" flags. The only position it saves is the existing `dropDatoSeri`.

**Tech Stack:** TypeScript, React, Vitest, MapLibre (via the existing `GameMap`), and Supabase/Postgres. There is one new migration, `0014_setup.sql`, which the owner runs by hand.

**Spec:**
- The design: `docs/superpowers/specs/2026-10-30-kejar-organiser-setup-design.md`.
- The owner's changes from 2026-11-09:
  - print once and reuse;
  - a "Legendary cards" setting instead of a Dato-only one;
  - plain `Next` buttons;
  - less text.
- The approved mockup: `docs/superpowers/mockups/2026-11-09-organiser-setup/index.html`. It's served by the `setup-mockups` launch config at `localhost:5175`. Match its copy and layout.
- Bomoh's design: `docs/superpowers/specs/2026-10-30-kejar-chaser-legendary-design.md`. The rules doc `docs/superpowers/specs/2026-10-30-kejar-rules.md` wins any conflict.

## Global Constraints

- **Colours:** Volt `#C6FF3D`, black and white. The only exceptions are the two legendaries:
  - **Dato Seri** is yellow (`#FFF27A` → `#FFD60A` → `#F5B800`).
  - **Bomoh** is purple (`#F0E0FF` → `#C9A4FF` → `#9B5DE5`, text `#2B0B45`).
- **Copy:**
  - English with a light Malaysian twist where it fits.
  - No em-dashes in any line players or organisers read.
  - Keep text short: step buttons say `Next` (step 3's says `Create game`), and the crew button says `Send invite links`.
  - Use the mockup's exact wording.
- **Platform:**
  - Free tiers only, and keep the single `api/game.ts` function.
  - New columns and tables go in one migration, `0014_setup.sql`. It must be idempotent and wrapped in `begin; … commit;`.
  - **Run `0014` before merging.** The game select will read the new column.
- **Secrecy (rules doc §9b):**
  - Never put a secret card's code, its letter or the stash position in any player or helper view, on the helper's walk, or on the public print sheet.
  - Only the organiser's own views and the organiser-only print link carry them.
- **Bomoh isn't built yet.**
  - The Legendary cards setting shows Bomoh with `NOT BUILT YET`, with `Hidden stash` disabled, so its value stays `off`.
  - The purple card set still exists and can be printed. That way it's ready when Bomoh's own plan lands, and this plan doesn't change again.
  - Nothing else about Bomoh is built here.
- **Mode:** it can change in the lobby, never after start (rules doc §1).
- **Start is never blocked:** unticked checks warn but don't block (spec §5).
- **Crew suggestion (rules doc §5):** you plus 1 helper up to 20 players, then about 1 more marshal per 10.
- **Player cap is 40 per game (owner's decision, 2026-11-09).** It counts everyone in the lobby, down from 80. The printed kit is armbands #01–#40, always packed in full. "Expected players" only drives the crew suggestion and the vest count.
- **No recurring cost per event.** Nothing in this plan needs printing at the venue. The only thing ever reprinted is a found or retired secret card, printed at home.

## Review Focus

1. **No free yellow card:** all three are retired, waiting to be printed, or already in another unfinished game. Creating a Full game with Dato Seri on still works. The game is created with Dato Seri off, and the organiser is told `Reprint a yellow card to use Dato Seri.` (Task 2 test.)
2. **A copied card walked around the zone:** a player scans the in-play card's code from a photo at three wrong spots. A fourth scan, even at the right spot, is ignored. A different player scanning at the right spot still claims it. (Task 2 test.)
3. **Back and forth in the wizard:** going Back and changing the park keeps the mode and settings. Going Back never creates a second game. (Task 4 test.)
4. **The helper's walk never reveals a secret card:** no stash pin, no stash step, no card letter, and an `OF N` count that leaves it out. (Task 6 test.)
5. **No share sheet:** on a desktop browser without `navigator.share`, `Send invite links` copies the links and says so instead of failing. (Task 5 test.)

---

### Task 1: Settings, the packing list, ticks, and the mode switch

**Files:**
- Create: `supabase/migrations/0014_setup.sql` (the `games.kit` column; Task 2 appends to this file)
- Create: `app/shared/kit.ts`, `app/shared/kit.test.ts`
- Modify:
  - `app/shared/types.ts` (`Settings`, `Game`)
  - `app/api/_lib/actions.ts` (`settingsFrom`, and new `setKit` and `setMode` actions)
  - `app/api/_lib/store.ts` and `app/api/_lib/supabaseStore.ts` (the `kit` column)
  - `app/shared/views.ts` (the kit on organiser and marshal views)
- Test: `app/api/_lib/actions.test.ts`, `app/shared/views.test.ts`

**Interfaces:**
- **`Settings` gains:**
  - `playersBand: 20 | 30 | 40`, default `20`;
  - `legendaries: { dato: 'off' | 'stash'; bomoh: 'off' | 'stash' }`, default `{ dato: 'stash', bomoh: 'off' }`. Only Full mode uses it.
  - Older rows lack these; read them with the defaults.
  - `settingsFrom` forces `bomoh: 'off'` while Bomoh isn't built.
- **`Game` gains** `kit?: { ticks: Record<string, string>; placed: Record<string, boolean> }`.
  - A tick stores the item's label at the moment it was ticked. If the label changes later (a new band, a different secret card), the item un-ticks itself.
  - A missing kit means `{ ticks: {}, placed: {} }`.
- **`app/shared/kit.ts`:**
  - `KitItem = { id: string; group: 'pack' | 'day'; label: string; tone?: 'yellow' | 'purple'; note?: string }`.
  - `packItems(game: Game, secretLetters: { dato?: string; bomoh?: string }): KitItem[]`. The letters come from Task 2's assigned cards, and each is only passed in the organiser's view.
  - `isTicked(game: Game, item: KitItem): boolean`, true when `ticks[item.id] === item.label`.
  - `crewFor(band: 20 | 30 | 40): number` returns 2, 3 or 4.
  - `placeItems(game: Game, forOrganiser: boolean)` returns `{ id, label, lat, lng, tone? }[]`. Ids are `station-1` … `station-8`, then `penjara`, then `dato` (yellow, organiser only, Full with an unclaimed assigned card).
- **Pack items**, in order. Exact labels, from the mockup:

  | id | Label | When |
  |---|---|---|
  | `armbands` | `Armbands #01–#40` | always |
  | `vests-kejar` | `4 lime vests` (`ceil(band / 5)`) | always |
  | `vests-marshal` | `2 marshal vests` (`crewFor`) | always |
  | `stations` | `Station cards 1–8` (to the arena's count) | stations exist |
  | `penjara` | `Penjara card` | always |
  | `dato-card` | `Yellow card B`, tone yellow, note `(secret)` | organiser view, Full, card assigned |
  | `tape` | `Tape, zip bags, power bank` | always |
  | `walk` | `Walk the park`, group `day` | always; auto-ticked when every non-secret place item is placed |
  | `brief-helper` | `Brief your helper`, note `Penjara, dares, SOS`, group `day` | always |

- **`setKit({ code, organiserToken | token, tick?: { id: string; on: boolean }, placed?: { id: string; on: boolean } })`:**
  - Organiser or marshal only (`requireMarshal`), and lobby only.
  - A tick stores the item's current label.
  - A marshal can't tick `dato-card` or set `placed.dato` (403).
- **`setMode({ code, organiserToken, mode })`:** organiser only, lobby only. Task 2 adds the card assignment to it.
- **Views:** organiser and marshal views carry `kit: { items: (KitItem & { ticked: boolean })[]; placed: Record<string, boolean> }`. The secret items appear only in the organiser's view.

- [ ] **Step 1: Write the failing tests.**
  - **`kit.test.ts`:**
    - The armbands label is always `Armbands #01–#40`. The band changes only the lime vests count.
    - Core lists no secret card.
    - Full with a yellow letter lists `Yellow card B`.
    - `crewFor` gives 2, 3 and 4.
    - `isTicked` goes false when the band changes the vests label.
    - `placeItems` puts `dato` last, and only for the organiser.
  - **`actions.test.ts`:**
    - `settingsFrom` gives the defaults, rejects bad values with a 400, and forces `bomoh: 'off'`.
    - `setKit` tick and untick round-trip, a marshal can't touch the secret items, and it answers 409 after start.
    - `setMode` switches in the lobby, refuses after start, and gives a player 403.
    - `MAX_PLAYERS_PER_GAME` is now 40. The 41st `join` gets `This game is full`. Update the existing 80-player test.
  - **`views.test.ts`:**
    - The organiser's view has the secret item.
    - A marshal's view doesn't.
    - A runner has no `kit`.
- [ ] **Step 2: Run them to see them fail.** `cd app && npx vitest run shared/kit.test.ts api/_lib/actions.test.ts shared/views.test.ts -t "kit|setKit|setMode|legendaries|playersBand"`. Expected: FAIL.
- [ ] **Step 3: Write the migration.** Start `0014_setup.sql` with `alter table games add column if not exists kit jsonb not null default '{}'::jsonb;`. Add `kit` to the game select. Writes read the current kit fresh, so two phones ticking at once don't drop each other's ticks.
- [ ] **Step 4: Implement it.** Build `kit.ts`, the settings and both actions to the Interfaces above, and set `MAX_PLAYERS_PER_GAME = 40`. For now, Task 1 passes `{}` as the secret letters; Task 2 wires in the real ones.
- [ ] **Step 5: Run the tests, typecheck and the full suite.** Run the Step 2 command, `npm run typecheck` and `npx vitest run`. Expected: all pass.
- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/0014_setup.sql app/shared/kit.ts app/shared/kit.test.ts app/shared/types.ts app/shared/views.ts app/shared/views.test.ts app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/api/_lib/store.ts app/api/_lib/supabaseStore.ts
git commit -m "feat: setup settings, the packing list, saved ticks and a lobby mode switch"
```

---

### Task 2: Secret card sets

**Files:**
- Modify: `supabase/migrations/0014_setup.sql` (append the `secret_cards` table)
- Modify:
  - `app/shared/types.ts` (`SecretCard`)
  - `app/api/_lib/store.ts` and `app/api/_lib/supabaseStore.ts` (card methods)
  - `app/api/_lib/actions.ts` (`create`, `setMode`, the Dato claim, and new `listSecretCards` and `reprintSecretCard` actions)
  - `app/shared/views.ts` (the organiser's assigned letter and code)
- Test: `app/api/_lib/actions.test.ts`, `app/api/_lib/store.test.ts`

**Interfaces:**
- **Table** `secret_cards`, with columns:
  - `id uuid pk`;
  - `organisation_id uuid` (references organisations);
  - `legendary text check in ('dato','bomoh')`;
  - `letter text check in ('A','B','C')`;
  - `code text not null`;
  - `state text not null default 'ready' check in ('ready','retired','printing')`;
  - `found_at timestamptz` (set when someone claims it);
  - `unique (organisation_id, legendary, letter)`.

  Enable row-level security, with no policies.
- **`SecretCard = { id; organisation_id; legendary: 'dato' | 'bomoh'; letter: 'A' | 'B' | 'C'; code: string; state: 'ready' | 'retired' | 'printing'; found_at: string | null }`.**
  - **`ready`:** the card is printed and can be put in play.
  - **`retired`:** someone found the card, or the organiser retired it by hand.
  - **`printing`:** it has a new code that isn't confirmed printed yet.
- **Store methods:**
  - `secretCards(orgId): Promise<SecretCard[]>` creates the six cards on first read if they're missing, each `ready`. Their codes come from the same generator the Dato code uses today (`newDatoCode`).
  - `setSecretCard(id, patch: Partial<Pick<SecretCard, 'code' | 'state' | 'found_at'>>): Promise<void>`.
- **`dato_stash` gains `card: { id: string; letter: string }`.** Its `code` is that card's code, so the existing claim check is unchanged.
- **Card assignment.** A game is assigned a yellow card on `create` (Full with `legendaries.dato === 'stash'`) and on `setMode` to Full.
  - It is a random **free** card: `ready`, and not the card of any unfinished game in the same organisation.
  - A game keeps its card for life. Switching Full to Core to Full never assigns a second one.
  - If no card is free, the game gets Dato Seri off, and `create` returns `{ code, notice: 'Reprint a yellow card to use Dato Seri.' }` (Review Focus 1).
  - A card stops being "in an unfinished game" once that game ends. An unfound card is free again for later games.
- **A claimed stash** sets its card to `retired`, with `found_at`.
- **Wrong-scan limit:**
  - A stash scan by a player that doesn't claim is recorded as a `stash-miss` event (actor is the player, no data). This covers a wrong code, too far, or no stash.
  - Once a player has 3 `stash-miss` events in this game, every later stash scan from them answers `no-stash`, even at the right spot, and is not recorded.
  - It needs no migration.
  - The answer stays the neutral `Nothing here.`, so nothing tells them they're locked out (Review Focus 2).
  - `stash-miss` events never appear in the feed or the marshal alerts.
- **Organiser card actions** (organiser only, 403 otherwise):
  - `listSecretCards({ organiserToken })` returns `{ legendary, letter, state, foundAt, inGame: boolean }[]`, never codes.
  - `retireSecretCard({ organiserToken, legendary, letter })` sets the state to `retired`.
  - `reprintSecretCard({ organiserToken, legendary, letter })` sets a fresh code and the state to `printing`.
  - `confirmSecretCardPrinted({ organiserToken, legendary, letter })` moves `printing` to `ready`.
  - `secretCardCode({ organiserToken, legendary, letter })` returns `{ code }` for printing.
- **The organiser's game view** carries `datoCard: { letter, code } | null`, which feeds the packing list's letter and the organiser-only print link. The existing `datoCode` field becomes `datoCard.code`. Marshals get neither.

- [ ] **Step 1: Write the failing tests** in `actions.test.ts` and `store.test.ts`:
  - **The card set:**
    - The first read creates six `ready` cards: A–C yellow and A–C purple.
    - A Full game is assigned a free yellow card, and its stash code equals that card's code.
  - **Assignment:**
    - Two unfinished games never get the same card.
    - Once the first game ends unfound, its card can be assigned again.
    - Full to Core to Full keeps the same card.
  - **After a claim:** claiming the stash retires the card with `found_at`. A retired card is never assigned again.
  - **No free card:** with none free, create gives Dato Seri off plus the notice (Review Focus 1).
  - **The wrong-scan limit:**
    - A player's 3 wrong stash scans are recorded.
    - Their 4th scan, made at the right spot with the right code, answers `no-stash` and changes nothing.
    - A different player at the right spot then claims it (Review Focus 2).
    - No `stash-miss` shows in any feed or alert.
  - **Old or wrong codes:** scanning a retired card's code, or another card's code, answers `no-stash`.
  - **Reprinting:**
    - `reprintSecretCard` gives a new code and sets the card to `printing`, which isn't free.
    - `confirmSecretCardPrinted` makes it `ready`.
    - The old code then answers `no-stash`.
  - **Retiring by hand:** `retireSecretCard` makes a card not free.
  - **Access:** `listSecretCards` has no `code` field. A player calling any card action gets 403.
  - **Views:** the organiser view has `datoCard`. A marshal's and a runner's don't.
- [ ] **Step 2: Run them to see them fail.** `npx vitest run api/_lib/actions.test.ts api/_lib/store.test.ts -t "secret card|retire|reprint|assigned"`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - Append the table to `0014_setup.sql`, inside its transaction.
  - Wire assignment into `create` and `setMode`.
  - Wire retirement and the wrong-scan limit into the existing Dato claim path.
  - Feed the letter into Task 1's `packItems` and `placeItems`.
  - Also update `ids.ts`'s `datoQr` comment: the code now belongs to a reusable card, not a game.
- [ ] **Step 4: Run the tests, typecheck and the full suite.** Expected: all pass.
- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/0014_setup.sql app/shared/types.ts app/shared/views.ts app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/api/_lib/store.ts app/api/_lib/store.test.ts app/api/_lib/supabaseStore.ts
git commit -m "feat: reusable secret card sets, retired when found, with a wrong-scan limit"
```

---

### Task 3: The print-once kit page

**Files:**
- Create: `app/src/screens/YourKit.tsx`, `app/src/screens/YourKit.test.tsx`
- Modify: `app/src/routes.ts`, `app/src/routes.test.ts`, `app/src/App.tsx` (route `/host/kit`)
- Modify: `app/src/screens/HostNew.tsx` (a `Your kit` link)

**Interfaces:**
- **Consumes:**
  - Task 2's organiser card actions (`listSecretCards`, `retireSecretCard`, `reprintSecretCard`, `confirmSecretCardPrinted`, `secretCardCode`).
  - The existing `/print/tags` sheet (armbands #01–#40, stations, Penjara).
  - The organiser-only `/print/card#<code>`.

- [ ] **Step 1: Write the failing tests** in `YourKit.test.tsx`. These follow the mockup's first screen:
  - Heading `Print once.` with `Laminate it and reuse it every game.`
  - Group `EVERY GAME`, with `Armbands #01–#40`, `Station cards 1–8` and `Penjara card`. Each has `PRINT`, which opens `/print/tags`.
  - Group `SECRET CARDS · FULL MODE`, with six rows: `Yellow A`–`C` and `Purple A`–`C`. Each row's status line and action:
    - **Ready:** `Ready`, or `In today's game` while assigned. Its action is `PRINT`, which fetches the code and opens `/print/card#<code>`. A small `Retire` link calls `retireSecretCard`.
    - **Retired:** `Found on <d MMM> · retired`, or `Retired` if retired by hand. Its action is `REPRINT`, which calls `reprintSecretCard`, then prints.
    - **Printing:** `New code · print it, then confirm`. Its action is `I'VE PRINTED IT`, which calls `confirmSecretCardPrinted`.
  - With no organiser session it asks for an invite link, the same as `HostNew` does.
  - In `routes.test.ts`, `/host/kit` maps to the new route.
- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/screens/YourKit.test.tsx src/routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the page.** Add a small `Your kit` link to `HostNew`'s step 1, next to `Invite another organiser`.
- [ ] **Step 4: Run the tests, typecheck and the full suite.** Expected: all pass.
- [ ] **Step 5: Commit.**

```bash
git add app/src/screens/YourKit.tsx app/src/screens/YourKit.test.tsx app/src/routes.ts app/src/routes.test.ts app/src/App.tsx app/src/screens/HostNew.tsx app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: a print-once kit page with the secret card sets"
```

---

### Task 4: The setup wizard, steps 1–3

**Files:**
- Modify: `app/src/screens/HostNew.tsx`
- Create: `app/src/game/SetupSteps.tsx` (the five-segment progress bar)
- Test: `app/src/screens/HostNew.test.tsx`, `app/src/game/SetupSteps.test.tsx`

**Interfaces:**
- **Consumes:** Task 1's settings, and Task 2's `notice` from `create`.
- **Produces:** `SetupSteps({ step: 1 | 2 | 3 | 4 | 5 })`.
- **After Create game,** it navigates to `/host/<CODE>?setup=crew`. If `create` returned a notice, it carries it as `&notice=dato`.

- [ ] **Step 1: Write the failing tests.** Everything follows the mockup.
  - **Step 1, Park:**
    - Eyebrow `NEW GAME · STEP 1 OF 5` and heading `Where are you?`.
    - Today's saved-parks UI, unchanged.
    - `Next` is disabled until a park is chosen.
    - Small links at the bottom: `Invite another organiser` and `Your kit`.
  - **Step 2, Which game?:**
    - Core is preselected and shows `BEST FOR FIRST-TIMERS` and `The chase, check-ins and Penjara, plus 4 simple power-ups. Learnable in 5 minutes.`, with 4 stickers.
    - Full shows `FOR REGULARS` and `Everything in Core, plus 4 more power-ups and two secret legendaries.`, with its stickers, including Dato Seri.
    - Leave out the Bomoh sticker until it's built.
  - **Step 3, How long?:**
    - **Length:** Quick, Standard and Long (30, 45 and 60 min), with Standard preselected.
    - **Summary line:** `Hide 5 min · ping every 5 min · Penjara view 2 min behind.` built from the real settings. `Change` opens today's number fields.
    - **Expected players:** `EXPECTED PLAYERS`, with `Up to 20`, `21–30` and `31–40`.
    - **Full only, `LEGENDARY CARDS · SECRET FROM PLAYERS`:**
      - A yellow Dato Seri block (`FOR DIKEJAR · YELLOW`), `Off` or `Hidden stash`, with the line `You hide a QR card. The first runner to find it can free themselves and 2 friends from Penjara.`
      - A purple Bomoh block (`FOR KEJAR · PURPLE`), marked `NOT BUILT YET`, with `Hidden stash` disabled.
      - The existing "Dikejar can see Kejar at check-in" switch.
    - **Core only:** `No extra settings in Core.`
  - **Buttons:** `Next` on steps 1 and 2, `Create game` on step 3, and `Back` on steps 2 and 3.
  - **Create:** `Create game` creates exactly one game. Going Back and forward again never creates a second one (Review Focus 3).
  - **`SetupSteps`:** five segments, with the current step and the ones before it filled.
- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/screens/HostNew.test.tsx src/game/SetupSteps.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement the wizard.** Keep all wizard state in one component, so Back loses nothing. Reuse `HostNew`'s existing park and settings pieces, and use `Sticker` for the mode cards.
- [ ] **Step 4: Run the tests, typecheck and the full suite.** Expected: all pass.
- [ ] **Step 5: Commit.**

```bash
git add app/src/screens/HostNew.tsx app/src/screens/HostNew.test.tsx app/src/game/SetupSteps.tsx app/src/game/SetupSteps.test.tsx
git commit -m "feat: New game becomes a step-by-step setup: park, Core or Full, settings"
```

---

### Task 5: Crew and Pack, steps 4–5

**Files:**
- Create: `app/src/game/CrewStep.tsx`, `app/src/game/PackList.tsx`
- Modify: `app/src/screens/HostLobby.tsx` (renders steps 4–5 for `?setup=crew` or `?setup=pack`)
- Test: `app/src/game/CrewStep.test.tsx`, `app/src/game/PackList.test.tsx`, `app/src/screens/HostLobby.test.tsx`

**Interfaces:**
- **Consumes:**
  - from Task 1: `view.kit`, `crewFor` and `setKit`;
  - the existing `createMarshalInvite`;
  - `SetupSteps`, from Task 4.
- **Produces:** `PackList({ code, view, refresh })`. Task 7 reuses it in the lobby.

- [ ] **Step 1: Write the failing tests.**
  - **`CrewStep.test.tsx`**, with `playersBand` 20:
    - Heading `Your crew.` and the line `You plus 1 helper for up to 20 players.`
    - Rows:
      - `You` / `Roaming marshal · gets every SOS` / `READY`;
      - `Helper at Penjara` / `Marshal · plays Pak Pulis` / `INVITE`.
    - `+ Add a marshal` adds a row.
    - `Send invite links`:
      - calls `createMarshalInvite` for each invite row;
      - then calls `navigator.share` with that row's link and the text `Join my Kejar crew as a marshal: <link>`;
      - without `navigator.share`, copies the links instead and shows `Links copied.` (Review Focus 5).
    - `Next` goes to `?setup=pack`.
  - **`PackList.test.tsx`:**
    - Heading `Pack.` and the line `From your printed kit. Nothing to print today.`
    - Groups `PACK` and `ON THE DAY`, with the Task 1 labels. A secret card row is yellow and shows `(secret)`.
    - Tapping an item calls `setKit`, and it draws the marker tick and strikes the text through. Reuse `Marker`; it's allowed here, because this isn't a safety screen.
    - Ticking every item circles `Ready for event day`.
    - `Walk the park` shows `OPEN`, which goes to `/host/<CODE>/walk`.
    - `Go to the lobby` drops `?setup`.
    - With `?notice=dato` it shows `Reprint a yellow card to use Dato Seri.` with a link to `/host/kit`.
  - **`HostLobby.test.tsx`:** `?setup=crew` shows step 4, and `?setup=pack` shows step 5. Each has the progress bar, and neither shows the join QR.
- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/game/CrewStep.test.tsx src/game/PackList.test.tsx src/screens/HostLobby.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Crew rows are local UI state; only the invites are saved.
- [ ] **Step 4: Run the tests, typecheck and the full suite.** Expected: all pass.
- [ ] **Step 5: Commit.**

```bash
git add app/src/game/CrewStep.tsx app/src/game/CrewStep.test.tsx app/src/game/PackList.tsx app/src/game/PackList.test.tsx app/src/screens/HostLobby.tsx app/src/screens/HostLobby.test.tsx
git commit -m "feat: setup steps for the crew and the packing list"
```

---

### Task 6: Walk the park

**Files:**
- Create: `app/src/screens/WalkPark.tsx`, `app/src/screens/WalkPark.test.tsx`
- Modify: `app/src/routes.ts`, `app/src/routes.test.ts`, `app/src/App.tsx` (route `/host/<CODE>/walk`)
- Modify: `app/src/screens/Lobby.tsx` (a marshal's `Walk the park` button, which opens the same screen in place)

**Interfaces:**
- **Consumes:**
  - `placeItems`, `view.kit.placed` and `setKit` (Task 1);
  - the card letter (Task 2);
  - the existing `dropDatoSeri`;
  - `GameMap` (pins, plus `route` and `fit`, used as in `SosTakeover` and `WalkGuide`);
  - the phone's own position, following `WalkGuide.tsx`.
- **Produces:** `WALK_HERE_M = 15`.

- [ ] **Step 1: Write the failing tests.** Everything matches the mockup.
  - **Map:** a numbered pin for each item. The next one pulses, placed ones are filled, and Penjara's pin reads `PENJARA`.
  - **Card on the way:** `NEXT · 2 OF 9`, the name, and `210 M · EAST`, using the 8 compass points.
  - **Within 15 m:**
    - The card turns lime and shows `YOU'RE HERE · 8 M`, `Tape Station 2 here.` and `At eye level, facing the path.`
    - Its button, `Station 2 is up`, sets `placed`.
    - Penjara's line is `Tape the Penjara card here.`
  - **Secret card (organiser only):**
    - It comes last, with a yellow `?` pin.
    - The card shows `SECRET · 8 OF 9` and `Hide yellow card B.`
    - Within 15 m it adds `Hide it somewhere sneaky. Under a bench, behind a sign.`
    - `Drop Dato Seri here` calls `dropDatoSeri` with the phone's position, then sets `placed.dato`.
  - **Helper's walk:** no secret pin, step or letter, and the `OF N` count leaves it out (Review Focus 4).
  - **Finished:** `Kit's out.`, with `Back to the lobby`.
  - **No location fix:** `Turn on location to see where to go.`, and the list still works.
  - **Route:** `/host/ABC234/walk` maps to the walk route.
- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/screens/WalkPark.test.tsx src/routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Use `distanceM` from `shared/geo.ts`, with a bearing rounded to 8 points. The organiser uses `organiserToken`, and marshals use their player token.
- [ ] **Step 4: Run the tests, typecheck and the full suite.** Expected: all pass.
- [ ] **Step 5: Commit.**

```bash
git add app/src/screens/WalkPark.tsx app/src/screens/WalkPark.test.tsx app/src/routes.ts app/src/routes.test.ts app/src/App.tsx app/src/screens/Lobby.tsx
git commit -m "feat: walk the park, a guide to placing every card on event day"
```

---

### Task 7: The lobby's "Before you start", and HANDOFF

**Files:**
- Create: `app/src/game/BeforeYouStart.tsx`, `app/src/game/BeforeYouStart.test.tsx`
- Modify: `app/src/screens/HostLobby.tsx`, `app/shared/views.ts` (a `pushOn` on `RosterEntry` if it isn't there already), `app/shared/kit.ts` (the `brief-players` item), `docs/HANDOFF.md`
- Test: `app/src/screens/HostLobby.test.tsx`, `app/shared/views.test.ts`

**Interfaces:**
- **Consumes:** `view.kit` and `setMode` (Task 1), `PackList` (Task 5), the roster and `AlertsOnPhone`.

- [ ] **Step 1: Write the failing tests.** Everything matches the mockup's lobby.
  - **Header:** the code, a `CORE`/`FULL` badge, and `Change`, which calls `setMode`. Switching Full to Core removes the secret card from the packing list.
  - **`BEFORE YOU START` checks:**
    - `Kit placed`, shown as `9 of 9 by you and Aina` once every non-secret item is placed.
    - `Helper joined` (`Aina · Penjara`) once a marshal is in the roster.
    - `SOS alerts on` once the organiser and every marshal have push on. Otherwise it shows `<name> hasn't turned them on`.
    - `Brief the players` (`Tap when you've told them the rules`), a manual tick saved as kit tick `brief-players`.
  - **Under the checks:** `Unticked items warn you, but never block Start.`, then the links `Kit list · Walk the park`.
  - **Start game** stays enabled with unticked checks.
- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/game/BeforeYouStart.test.tsx src/screens/HostLobby.test.tsx shared/views.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Add the HANDOFF entry** in the existing style. It covers:
  - the print-once kit and the secret card sets;
  - the five steps, the packing list and the walk;
  - the Legendary cards setting, with Bomoh shown but not built;
  - that quest-giver mode and the how-to-play card aren't built;
  - **"run `supabase/migrations/0014_setup.sql` in Supabase before merging"**, and why: the game select reads `kit`. It's additive, so it's safe to run early.
- [ ] **Step 5: Run the full suite, typecheck and build.** `npx vitest run`, `npm run typecheck` and `npm run build`. Expected: all pass.
- [ ] **Step 6: Commit.**

```bash
git add app/src/game/BeforeYouStart.tsx app/src/game/BeforeYouStart.test.tsx app/src/screens/HostLobby.tsx app/src/screens/HostLobby.test.tsx app/shared/views.ts app/shared/views.test.ts app/shared/kit.ts app/shared/kit.test.ts docs/HANDOFF.md
git commit -m "feat: Before you start checks in the lobby"
```

---

### Task 8: The wrong-catch backstop

A free, no-print guard against "catching" someone by scanning a photo of their armband (owner's decision, 2026-11-09).

**Why it's needed:** armband codes are the same every game. A catch only checks the runner's distance when their phone reported in the last 20 s, and a runner's phone is usually in their pocket. That means a photo of an armband can catch a runner from anywhere.

**How this task handles it:** it doesn't change how catches are judged. Instead, it makes a doubtful catch loud and easy to dispute. The physical rip is the proof: someone who scanned a photo isn't holding an armband.

**Files:**
- Modify: `app/api/_lib/actions.ts` (`catchAction`)
- Modify: `app/public/sw.js` (only if the existing `notice` push can't carry a URL with a query)
- Modify: `app/src/screens/GameScreen.tsx` or the Penjara screen (open SOS with `dispute` preset from `?dispute=1`)
- Test: `app/api/_lib/actions.test.ts`, `app/src/game/sw.test.ts`, `app/src/screens/Jail.test.tsx`

**Interfaces:**
- **Consumes:**
  - `judgeCatch`'s `flagged` result, which is true when the runner's location is over 2 minutes old.
  - The `notice` push type from Luar Garisan.
  - The SOS sheet's existing `dispute` reason, and its preset mechanism (the custom event `SosIcon` listens for).
- **When a catch is accepted with an old runner location:** this means older than `RUNNER_TRUSTED_MS`, 20 s, not only the 2-minute `flagged` case.
  - **Push to the caught runner:** `{ type: 'notice', code, title: 'Kena tangkap!', body: '<chaser name> caught you. Not you? Tap to tell a marshal.', url: '/g/<CODE>?dispute=1' }`.
  - **Feed:** the catch's event data gains `oldRunnerFix: true`. The marshal alert line becomes `Check catch: <who> by <chaser> (runner location old)`. The existing `flagged-catch` alert covers the over-2-minutes case; widen it to cover any old-fix catch.
- **Opening `/g/<CODE>?dispute=1`** opens the SOS sheet with `Dispute` already picked. The player still holds to send, as usual.

- [ ] **Step 1: Write the failing tests.**
  - **Catch with an old runner location** (a runner fix 60 s old):
    - The catch succeeds.
    - Exactly one push goes to that runner, with the copy above.
    - The marshal alert reads `(runner location old)`.
  - **Catch with a fresh runner location** (10 s old): no push and no alert.
  - **`sw.test.ts`:** a `notice` push with a `url` opens that URL when tapped.
  - **Dispute link:** opening the game with `?dispute=1` shows the SOS sheet with `Dispute` picked.
- [ ] **Step 2: Run them to see them fail.** `cd app && npx vitest run api/_lib/actions.test.ts src/game/sw.test.ts src/screens/Jail.test.tsx -t "old runner|dispute|notice"`. Expected: FAIL.
- [ ] **Step 3: Implement it.** The push goes after the catch is recorded, and a push failure never undoes the catch (the same pattern as Luar Garisan's). Use the chaser's name, never their id.
- [ ] **Step 4: Run the tests, typecheck and the full suite.** Expected: all pass.
- [ ] **Step 5: Commit.**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/public/sw.js app/src/game/sw.test.ts app/src/screens/GameScreen.tsx app/src/screens/Jail.tsx app/src/screens/Jail.test.tsx
git commit -m "feat: a catch on an old runner location tells the runner and flags it for marshals"
```
