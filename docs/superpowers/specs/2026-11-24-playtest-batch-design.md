# Playtest batch: real card picks, rarities, Sike, Penjara reel, slips, rejoining and fixes

**Date:** 2026-11-24
**Status:** design. Not built yet; waiting for the owner's approval.
**Mockup:** `app/mockups/pick/` (launch config `pick-mockup`, port 5196). The pick screen is at `/` and the legendary
colours at `/#legendary`. The owner approved both screens in conversation.

## 1. Why

These come from the owner's playtests. Players could see the card they'd drawn before choosing one. Picking a card
should be a real choice with some risk. The organiser couldn't tell which Tupperware slip numbers to use. A tester
who lost their tab couldn't get back in. There are also smaller rough edges: buttons going off screen, the home
guide covering only Dikejar, notifications that stay up for good, and confusing wording.

## 2. Goals (owner's calls unless marked *my call*)

### 2.1 A real pick from five face-down cards
- Scanning a station deals **5 face-down cards** from the scanner's side deck. The back of each card shows its
  **rarity colour**. Tapping one **decides** what the player gets: it flips, and only after the flip does it go into the
  player's slot. The other 4 go back into the deck.
- The client never learns which kinds are in the deal before the pick. The server sends only the back colours; the
  card itself comes back only in the answer to the pick.
- **10 s to pick** *(my call)*. When time runs out, the deck picks one at random. There is **no spotlight sweep**: the
  picked card rises out of the deck and flips (owner).
- If the app closes during a pick, the deal stays open. Reopening the game shows the same fan again. A deal nobody
  answers is settled at random by the server after 60 s *(my call)*.
- The station's 60 s lock and the once-per-player-per-station rule start at the **scan**, as they do today.
- Abang Grab ("see the top 3 cards and keep one") stays as it is. It never shows a Sike *(my call)*.

### 2.2 Rarity colours (not the legendaries)
| Rarity | Colour | Dikejar | Kejar |
|---|---|---|---|
| Common | volt `#C6FF3D` | Durian (shield), Ponteng (cloak), Gostan (decoy) | Mat Rempit (flare), Pak Guard (focus) |
| Rare | blue `#3D9BFF` | Cheese Ais, Abang Grab | Tee And Gee, Abang Grab |
| Epic | purple `#B47CFF` | Toyol, Nasi Lemak KFC | Ah Long, Nasi Lemak KFC |

- The card's back uses the rarity colour for its frame, corner marks, seal and a small rarity word. The card's face
  uses it for its frame, eyebrow and art circle, as in the mockup.
- In the core mode both sides' cards are all common, which is expected.

### 2.3 Sike, the empty card
- **2 Sike cards in every deck set** *(my call; owner approved the mockup)*. Sikes scale with the players the same
  way the deck already does: one more set for every 10 Dikejar or 5 Kejar (`setsFor` in `shared/deck.ts`).
- Face down, a Sike shows **one of the three rarity colours, chosen at random** for each deal.
- Face up, it's a grey dashed card reading "sike!" and "you got an empty power up" in Kejar Hand. Nothing goes into
  the slot. The scan is used and the station locks as usual.
- The deck count ("DECK · N LEFT") includes Sikes.
- A waiting Nasi Lemak KFC isn't used up by a Sike; it waits for the next real card *(my call)*.

### 2.4 The Penjara reel (slot machine)
- The reel shows only while the runner is **within 30 m of Penjara**. It hides again if they walk away.
- It stays **locked for 60 s after being tagged** *(my call for the length)*, with a short countdown in its place. The
  server enforces this too: `pullReel` refuses when `now < caught_at + 60 s`.
- The nine black slots get words in Kejar Hand. Starting list *(my call; owner may edit)*: HAILAT, ALMOST, NEARLY,
  ALAMAK, ADUH, NOPE, TRY LAH, HAMPIR, NEXT TIME.
- The lime slot reads **SETTLED** with Dato Seri's settle doodle (`SettleDoodle`).
- After the one escape has been used, every slot is a black word slot.

### 2.5 Legendary slips: name the numbers in setup
- Today, any unused slip of the right side works, and a slip is bound to a game when it's first scanned. The organiser
  can't tell which number to use.
- New: the setup step with the Tupperware boxes (the walk step) names the slips for this game: **"Dikejar slip 3 ·
  Kejar slip 2"**. These are the lowest-numbered unused, unbound slips of each side *(my call; no migration needed)*.
  The pack list and the walk card ("Put Dikejar slip 3 inside") repeat the same numbers.
- If a side has no unused slip, the step says so and links to printing more.
- Scanning a different unused slip still works, as today. The named number is guidance, not a lock.

### 2.6 Rejoining and removing mid-game
- The marshal live screen already has a per-player **New phone** button that makes a one-time link
  (`createPhoneMove`). Rename it **Rejoin link**, and add a line explaining it: "Lost their tab? Send them this."
- A removed player is listed under **Removed** with an **Add back** button. It clears `removed_at` (new action
  `restorePlayer`, with feed line "X is back in") and makes a rejoin link in the same tap.
- Removing a player mid-game shows them the existing Removed screen on their next poll. They drop out of the deck
  count and pings, as today.
- Join's "Game already started" message becomes "The game has started. Ask the organiser for a rejoin link."

### 2.7 Tupperware notification
- The card title "Side quest" becomes **Tupperware**, including "SIDE QUEST COMPLETE" → "TUPPERWARE OPENED" *(my
  wording)*.
- The coloured boxes around it are **yellow on both sides**. The Tupperware doodle stays red.
- Informational notifications **fade after about 8 s** *(my call)*. This covers the Tupperware card and other info
  banners. Anything that needs the player to act stays until it's handled (check-in, SOS, a catch).

### 2.8 Legendary colours
- **The middle path** (owner chose it from the mockup, `/#legendary` → "middle"):
  - Every legendary uses **Dato Seri yellow** (`--legendary-1/2/3/ink`) for its frame, crown and star scribbles,
    eyebrow and name. This applies to cards, the hand slot, the setup list, map marks and Tupperware markers on both
    sides.
  - Each card keeps **its own colour only in the art circle** behind the doodle: Dato Seri yellow, Super Ring orange
    `#FFA94D`, Mak Kau Hijau green `#3FA86B`, Bomoh **off-white** `#F5F0E6`.
  - In the setup list, the rows are yellow with a small dot in each card's own colour.
  - Each **doodle keeps its own colours**.
- **Exception:** Mak Kau Hijau's takeover stays **full-screen green** (owner).
- Purple now only ever means epic.

### 2.9 Arena setup map (3D)
- The Penjara and start markers use their doodle icons (`penjara.png`, `start.png`). In 3D they float like the gems,
  with a stem and a shadow.
- Station gems in setup show their number in a **small round badge** above the gem: a black circle with a volt edge
  and the number in Kejar Hand digits *(my call for the look)*. Setup only: the game map stays without numbers.

### 2.10 Smaller fixes
- **Buttons always on screen:** every button stays inside a 320–430 px wide phone screen, centred, in the same place
  on every screen. Check each screen at 320 and 375 px wide.
- **Home guide for both sides:** the home How to Play gets a Dikejar / Kejar toggle (`side="chaser"` exists already).
- **FAQ for the normal power-ups:** two or three plain questions and answers per power-up (not the legendaries).
  Reached from the card pop-up ("?") and from How to Play.
- **iPhone alerts:** for `needs-install`, the alerts card shows the steps: Share → Add to Home Screen → open kejar.
  from the icon → Turn on. Alerts can only reach an iPhone from the Home Screen app.

## 3. Non-goals and anti-goals
- No change to claim distance, the station lock length, ping timing or legendary rules.
- Don't change the deck's size rule (one set per 10 Dikejar or 5 Kejar). Only the Sikes are added to it.
- **Anti-goal:** any way for the client to know a card before the pick, including in network responses, the hand, the
  deck count or the feed.
- **Anti-goal:** the reel showing away from Penjara, or able to free someone in the first minute after a tag.

## 4. Constraints
- **New Supabase migration** (0027) for pending deals and Sike claims. The owner runs it once.
- MemoryStore and SupabaseStore must both support it.
- MapLibre stays on v5, and the strict CSP stays as it is.
- Kejar Hand is the font for all new text. Geist stays only where the font split already puts it.

## 5. Approaches considered
- **Pick:** (a) a real pick decided by the server, *chosen*; (b) cosmetic only, where the server draws at scan and the
  colours show the result. The owner chose (a) so picking is a gamble.
- **Slip numbers:** (a) work out the lowest unused slip each time, *chosen*: no migration, and a slip bound to a game
  is crossed off by itself; (b) reserve a slip for the game in a new column, which needs a migration and is only
  better when two games are set up at once.
- **Legendary colours:** (a) all yellow; (b) the middle path, a yellow frame with each card's own colour in the art circle, *chosen by the owner*. Built by keeping the colour tokens for the inner circle and the Hijau takeover, and using the yellow ones for frames.

## 6. Left to the builder
- The exact deal mechanics in `shared/deck.ts`, provided that deck counts stay right, the 4 unpicked cards stay in the
  deck, and the next card can't be predicted.
- The list of info notifications that fade.
- The FAQ text (owner reviews it).
- The build order. Suggested: buttons, then legendary colours and Tupperware wording, then the reel, then slips and
  rejoin, then the pick, rarities and Sike, then the setup map, then the guide, FAQ and alerts.
