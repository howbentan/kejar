# Tupperware legendaries: design

Date: 2026-11-17
Status: draft, waiting for approval
Mockups: `app/mockups/tupperware/tupperware.html` (published as a private artifact)

## 1. Why

Today each legendary in Full mode sits on a printed **secret card**: 4 legendaries × letters A–C, so 12 cards an
organisation keeps, assigns, retires on find and reprints. Players see a "?" zone on their map and hunt for it.

What's wrong with it, in the organiser's words over the brainstorm:

- **Too much printing and admin.** Twelve cards, letters, assignment, retire and reprint, "no free card" notices.
- **Cheatable.** A card photographed in one game still claims in a later one if it's reused.
- **Not eventful.** A "?" on the map is a chore, not a moment.

What the organiser wants instead:

- **Out of the blue.** Nobody is briefed. Players stumble on it.
- **Physical.** Something real hidden in the park, found with your hands.
- **Rewarding for both sides**, live from the first minute.
- **Uncheatable**, with **little printing** and **no extra manpower** on the day.
- A **Malaysian twist**: the red Tupperware everyone's mak has, and "bawa balik Tupperware Mak!".

## 2. Goals, non-goals, anti-goals

**Goals**

- Every Full-mode game has one red Tupperware per side (Dikejar, Kejar), hidden by the organiser.
- Inside each box: one single-use QR slip. Scanning it unlocks that side's legendary.
- Players discover the box by being near it at a ping, through a "side quest" pop-up. No map hint, no photo, no clue.
- One A4 sheet of 20 slips lasts about 10 games.
- The unlock is a full-screen moment: the box opens, a card back rises and flips to the legendary.

**Non-goals**

- No puzzles, riddles or multi-step quests (kept for later, section 11).
- No collection, history or "artifacts" shelf of past legendaries. Dropped.
- No in-game announcement that a legendary was found, beyond what each legendary already does today.
- No change to what the four legendaries *do* once held.

**Anti-goals (failure even if it technically works)**

- A player can claim with a photo of a slip from an earlier game.
- Players are told where the box is, or get a pointer that turns it into a walk to a pin.
- The organiser needs a helper, a reprint every game, or more than a minute of extra setup.
- A phone in a running pocket is pinged repeatedly or for long (the safer check-ins work stays intact).

## 3. Constraints

- **No server tick.** State moves forward lazily in `advance()` on polls and actions. Waking a box is computed, not
  scheduled.
- **Pauses** freeze game time, as they do today.
- **Two stores.** `MemoryStore` and `SupabaseStore` both change; Supabase needs a migration (next is **0024**) and
  every new player column goes into `PLAYER_COLUMNS`.
- **Secrecy at the API.** A box's location and slip binding never reach a client view, the organiser's excepted.
  Players learn only "something's nearby" at the moment it fires.
- **Web platform limits.** No background location. `navigator.vibrate` doesn't exist on iOS and works only in the
  foreground on Android. A push notification buzzes once.
- **The 60 s check-in window** from the safer check-ins work stays as it is; discovery rides on the same pings.

## 4. Approaches considered

| Approach | What it is | Why not / why |
|---|---|---|
| **Today's secret cards** | 12 reusable printed cards, a "?" zone on the map | Heavy admin, reusable so photographable, not eventful |
| **Reusable QR per box** | One fixed QR in each box, reused every game | Ruled out: a photo from a past game claims forever |
| **Tupperware + single-use slips** (chosen) | A red box per side, a fresh slip inside, slip burnt on first scan | Physical, uncheatable, 1 sheet ≈ 10 games, no helper |
| **Air drop** | A virtual drop zone appears mid-game, no physical object | Not physical; just another pin on a map |

The organiser chose the Tupperware.

## 5. The design

### 5.1 The slip sheet

- One A4 PDF from Your Kit: **20 slips**, **Dikejar #01–#10** and **Kejar #01–#10**, cut lines, each slip a QR and
  its label. Footer: *"Any unused slip of the right side works."*
- Each slip is a one-time token tied to the organisation and a side. The token is stored so the same sheet can be
  downloaded again (a jammed printer or a lost file doesn't waste slips). *(My call.)*
- **A slip is not assigned to a game in advance.** Any unused slip of the right side works. *(My call, on binding:)*
  - **Any scan of a slip in a game binds it to that game**, whoever scans it and whatever the answer ("Not your
    Tupperware", too far). A bound slip still claims in that game, and is **dead in every other game**.
  - **Only a claim uses it up.** So an early scan or the other side's scan never destroys a side's legendary, and a
    slip taken home unclaimed can't be used next time.
- When a sheet runs low (a side has ≤ 2 unused), Your Kit nudges: "Print a new slip sheet". Printing a new sheet
  makes new tokens; the old sheet's unused slips keep working.
- **The slip sheet replaces the 12 secret colour cards** in Your Kit.

### 5.2 Setup, during Walk the Park

- Full mode only, as legendaries are today. The legendary pick per side stays: Dikejar gets Dato Seri **or** Super
  Ring, Kejar gets Bomoh **or** Mak Kau Hijau, set at game creation.
- In Walk the Park the app suggests **two mirrored spots**, D and K, the same walking distance from the start, inside
  the play area. The organiser hides each box near its spot and taps **Drop**, which records their location as the
  box's spot (the existing drop flow).
- The hide panel says: *"Any unused Dikejar slip inside"* (and Kejar), with good spots (wakaf, angsana roots, map
  board, outdoor gym) and spots to avoid (surau or places of worship, drains, private property, bins).
- The pack list gains: 2 red Tupperwares, 1 slip of each side, and *"Bawa balik Tupperware Mak!"*.
- The organiser doesn't type or scan the slip at setup. Which slip is in which box is learned at the first scan.

### 5.3 Live from the start

No wake-up rule. Both boxes are live from the moment the chase starts until they're claimed or the game ends: they
can be discovered and claimed at any time. *(Decided by the organiser.)*

### 5.4 Discovery: the side quest

- At a **ping**, a player of the box's side whose location is within **about 50 m** of their side's box (not yet claimed)
  gets the side quest. Nothing is shown to anyone else.
- Runners are judged on the location they send in the check-in window. Chasers aren't asked to check in, so a
  chaser is judged on their latest location from the last 60 s; no fresh one, no side quest that ping. *(My call:
  it keeps the safer check-ins work untouched.)*
- **Lock screen:** one strong notification, *"Side quest · Something's nearby…"*.
- **In the app:** a full-screen card, red badge **SIDE QUEST**, title **"Find the Tupperware"**, both revealed with a
  scrambled-glyphs decode. A buzzing dot. One button: **Found**. No caption, no hint, no direction.
- **Android with Kejar open:** the phone keeps buzzing (a vibrate loop) while the side quest is on screen. iOS gets
  the one notification only.
- The side quest stays in the player's app until they close it or the box is claimed; they can reopen it from the
  game screen while it lasts.

### 5.5 Claiming

- **Found** opens the camera: *"Scan the slip inside"*.
- The scan must be within **30 m** of the box's spot (the existing claim radius, plus up to 20 m GPS slack).
- **One try per player per game.** What happens on a scan:

| Scanned | Result | Try used? |
|---|---|---|
| An unused slip of your side | **Unlocked** (5.6). Slip burnt. | n/a |
| A wrong or burnt slip, or a slip of another organisation | *"Bukan ini. That was your try."* | Yes |
| A slip of the other side | *"Not your Tupperware."* | No |
| Your side's box is already claimed | *"Dah kena ambil."* | No |
| Too far from the spot | The existing "get closer" message | No |

- The first valid scan wins. A second player scanning the same box afterwards sees *"Dah kena ambil."*

### 5.6 The unlock

A full-screen takeover, about 7 seconds, **tap to skip**:

1. The Tupperware shakes; the lid flies off.
2. A **card back** rises out of it: the standard power-card back, recoloured to the legendary's colour, with doodly
   scribbles around it.
3. It **flips** to the front: the legendary's card, in the same design as the other power-ups, with scribbles in its
   colour.
4. It ends by legendary:
   - **Dato Seri** and **Super Ring** (held in hand): **"Keep it"**. The card goes into the player's hand as today.
   - **Mak Kau Hijau** and **Bomoh** (instant): **"It's working!"**, and their effect starts as it does on claim
     today.

Colours: Dato Seri `#FFD60A`, Super Ring `#FFA94D`, Mak Kau Hijau `#3FA86B`, Bomoh `#C9A4FF`.

### 5.7 New art

- **Bomoh card.** Bomoh has no card today. It gets one in the power-card style: purple, a coconut sticker, the line
  *"Every Dikejar shows at the next 2 pings"*.
- **Dato Seri's Settle doodle.** At Penjara, the Settle screen is topped by a doodle of an identity card with a
  **wrinkly RM100 note** tucked under it, the note's "100" doodled in black. Generic on purpose: no real emblem or
  layout. When settled, the card slides in, the note slips away, and **"Duit kopi sampai."** fades in as plain text.

### 5.8 Organiser safeguards

- **Lobby checklist:** before Start, a warning if a box isn't dropped: *"Kejar Tupperware not dropped yet"* with a
  **Drop it** link. Starting anyway is allowed; that side has no legendary this game.
- **After the game:** if a box was never opened, the organiser's results show *"Kejar's Tupperware wasn't opened.
  Bawa balik!"* with a pin on its spot.
- **A lost or stolen slip** means that side's legendary is gone for the game. No recovery flow; accept the loss.

## 6. What it replaces and removes

- The 12 secret colour cards: letters, assignment to games, retire on find, reprint, "no free card" notices.
- Players' "?" legendary zones on the map (`LEGENDARY_ZONE_M` stops being shown to players).
- In Your Kit, the colour-card sheet gives way to the slip sheet.
- **At release** *(my call)*: games already started finish on their cards; lobby games switch to the Tupperware;
  existing card rows are hidden, not deleted, so nothing is lost if this is rolled back.

## 7. What it reuses

- The drop flow and a box's spot (today's stash `lat`/`lng`, `claimedBy`, `claimedAt`).
- `CLAIM_RADIUS_M` = 30 with up to 20 m slack, and the fresh-fix check.
- `STASH_MISS_LIMIT` becomes the one-try rule: a limit of **1** per player per game for a wrong slip.
- Each legendary's existing effect and hand-card behaviour.
- The ping schedule and push from the safer check-ins work.

## 8. Phasing

1. **Core:** the slip sheet and slip tokens; the box per side with drop; the side quest at pings; the
   Found → scan → claim rules; the unlock takeover; removing the secret cards.
2. **Polish:** the Bomoh card, the Settle doodle and "Duit kopi sampai.", the lobby warning, the bring-home notice.

Each phase ships on its own.

## 9. Decided in the conversation

- Tupperware with single-use QR slips, every game, one box per side, both red.
- No briefing, no caption, no hint. "Find the Tupperware", decoded like a cipher.
- "Found" (not "Found it"), "Keep it" (not "Simpan").
- A card back in the legendary's colour that flips to the front, with doodly scribbles, no colour wheel.
- "Duit kopi" kept; the decode effect is on the side quest, not on Duit kopi.
- A wrinkly note, not rolled, with a black doodled 100.
- Any unused slip of the right side works. A missing slip is a lost legendary.
- No Artifacts.
- No wake-up rule: both boxes are live from the start of the chase.

## 10. Left to the builder

- The data shape for slip tokens and their binding, and the migration.
- How mirrored spots are picked from the play area and start point.
- Exact copy for messages not quoted above.
- How the side quest is stored per player so it survives a reload.

## 11. Later

- Puzzle and quest variants inside the box (a riddle, a second hiding place).
