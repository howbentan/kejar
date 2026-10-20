# Kejar: design

*Real-life chase, refereed by your phone.*
Date: 2026-10-19 · Status: draft for approval

Items marked **(Claude's call)** were decided by Claude, not by the owner. Check those first.

---

## 1. What this is, and why

Kejar ("chase" in Malay) is a web app that runs an organised, real-world game of chase for groups of 10–20 adults in a public park. Players split into **runners** and **chasers**. Runners get a head start to hide. Chasers then hunt them using periodic location pings on their phones, and catch them by ripping a velcro name tag off the runner's arm, Running Man style. **Marshals** keep everyone safe.

The owner is based in Malaysia. They want this as a **business**: organised events, partnering with venues (parks first, malls later), with players paying an entry fee. The app is the referee and the backbone of the experience. It is not a standalone consumer app that friends download and run by themselves.

### Why it can win
Several apps already do GPS hide-and-seek (SCRAM, CatchCity, Manhunt IRL, Hunting Game, City Wide Manhunt). None of them combines the things Kejar is built around:
- **organised, hosted events**
- **marshals**
- **physical power-up stations**
- **venue-specific arenas**
- **a safe, no-grab catch**

CatchCity charges from €299 for hosted company events, which shows people will pay for a hosted version. In Japan, adults pay to play organised hide-and-seek (the Japan Hide-and-Seek Association, and a paid *Run for Money* event at DiverCity Tokyo Plaza).

### What success looks like (MVP)
- A handful of free test games with friends prove three things:
  1. The ripped tags scan reliably.
  2. Location pings arrive reliably on ordinary phones.
  3. The game is fun at the default settings.
- Then the first paid event runs at a partner park with 10–20 players and no injuries or conduct incidents.

## 2. Goals, non-goals, anti-goals

**Goals**
- Run a complete game (join → hide → chase → catch → jail → results) from any phone's browser, with nothing to install from an app store.
- Keep players safe: marshals, SOS, a report button, boundaries, no-go and walk-only zones.
- Make it easy to set up a new park ("arena") once and reuse it.
- Look premium and distinctive (see §9).
- Keep the MVP essentially free to build and run.

**Non-goals (for the MVP)**
- Native iOS or Android apps, and app-store distribution.
- Taking payments in the app. The entry fee is collected outside the app (at check-in or by payment link) **(Claude's call)**.
- Mall and indoor play. GPS doesn't work well indoors, so this is a later version using QR checkpoints.
- NFC. Browsers on iPhone can't read NFC tags.
- Public matchmaking or strangers finding games. Every game is private and run by an organiser.
- Multiple languages. English only for the MVP; Malay later **(Claude's call)**.

**Anti-goals (failure even if it works)**
- A catch that rewards grabbing, tackling or body contact beyond a one-hand rip from the arm. The owner is explicitly worried about injury and sexual harassment.
- Looking like, or being confused with, SCRAM. Avoid red and red-orange; the owner's other brand also uses red and starts with K.
- Location data that outlives the game, or that is visible to people outside it.
- Anything that annoys other park users enough to cost the venue partnership.

## 3. Roles

| Role | Who | What they see | Gear |
|---|---|---|---|
| **Runner** | Most players (about 3 runners per chaser) | Own position, teammates (at their latest check-in), stations, no-go zones, event feed, and a warning when a chaser is within 100 m (only while the page is open). Phone stays in pocket between check-ins | Own clothes plus an armband with a velcro name tag (navy/dark, so they can hide) |
| **Chaser** | About 1 in 4 players | Runners only as fuzzy circles at the last ping; fellow chasers live. Keeps the page open all game | Volt lime vest |
| **Marshal** | About 1 per 8–10 players; at least 1 | Chasers live, runners at their latest check-in, all alerts. Keeps the page open all game | Black or white vest marked "MARSHAL" |
| **Organiser** | Owner, venue staff or a marshal | Creates and controls the game; sets up arenas | Same as marshal |

The organiser can also act as a marshal. Roles are assigned by the organiser or shuffled randomly; the app refuses to start with lopsided teams **(Claude's call)**.

## 4. Game flow

### 4.1 Before the event: arena setup (once per park)
- The organiser adds a park. The app pulls the base map and the park's outline from OpenStreetMap automatically.
- The organiser then spends about 10 minutes, with no time limit, editing:
  - the **boundary** (adjust the imported outline)
  - **no-go zones** (pond, playground, road edge)
  - **walk-only zones** (crowded paths, stairs)
  - **power-up station** positions
  - the **jail** location
  - optional **named zones**
- Saved as that venue's arena and reused at every event there.

### 4.2 Joining
- Players open the link or scan the check-in QR code, type the game code, and enter a name. There are **no player accounts**.
- Before joining, they must accept the **code of conduct** and **waiver**, which includes consent to share location during this game only.
- On iPhone, the app asks them to **add it to the home screen**, which web push alerts need. It explains why.
- **Lobby:** each player sees their role and, for runners, their **tag number** (e.g. #07).
- **Linking tags to players:**
  - Every physical tag carries a **fixed tag ID** in its QR code; the IDs are printed once and reused at every event.
  - At check-in, the runner is handed a tag and **scans it with their own phone**, which links that tag to them for this game.
  - The app refuses a tag already linked to someone else in the same game **(Claude's call)**.

### 4.3 Game settings (organiser, per game)

| Setting | Default | Range |
|---|---|---|
| Game length | 45 min **(Claude's call)** | 15–90 min |
| Hide time | 5 min (owner) | 1–15 min |
| Ping interval | 5 min (owner) | 2, 3 or 5 min |
| Spectator delay for jailed players | 2 min **(Claude's call)** | 0–5 min |

### 4.4 Hide phase
- Runners see a large countdown and the arena map, and are told to set their phone to silent.
- Chasers see a locked "Stay put" countdown. The app checks they stay at the start point and alerts a marshal if one leaves early.

### 4.5 Chase phase: pings and check-ins

**Who keeps the page open (owner's decision):**
- **Runners keep their phone in their pocket.** They only open Kejar at check-ins, or to use SOS, report, power-ups or the feed. That keeps hands free and eyes up while running (safety), avoids a glowing screen giving away a hiding spot, and saves battery.
- **Chasers and marshals keep Kejar open all game.** The page asks the phone to keep the screen awake, and their location streams continuously.
- **Any time a runner's page is open, it sends their location.** Check-ins are the guaranteed minimum.

A web page can't track a locked phone, so the ping is a **game mechanic**:
1. About 30 seconds before each ping, every free runner gets a push alert: "Ping in 30s — check in!"
2. The runner opens the page, which sends their location.
3. Chasers then see each runner as a **fuzzy circle** (about 15 m radius) at that position, labelled with their tag number, until the next ping.
4. A runner who **misses a check-in** is shown to chasers at their **last known position, marked "missed check-in"**. Marshals are alerted after 2 missed check-ins in a row **(Claude's call)**.

Other runner features (they work only while the runner's page is open):
- A **"chaser nearby" warning** when a chaser is within about 100 m, based on the chasers' live positions **(Claude's call)**.
- **Boundary and no-go checks run on every location a runner sends**, including check-ins. Marshals are alerted when a runner is outside the boundary or inside a no-go zone, so an alert can be up to one ping interval late. Marshal patrols and instant SOS cover the gap **(Claude's call)**.
- **Chasers' boundary and no-go checks run continuously**, since their location streams all game.

### 4.6 Catching: armband tag rip
The rule set:
1. The chaser rips the velcro tag off the runner's **upper arm** with **one hand**. No grabbing clothes or the person, and no tackling.
2. Once the tag is off, the runner **stops**.
3. The chaser scans the **QR code printed on the tag** with their phone camera. The app records "Ben caught #07", and the runner's phone switches to jail.
   - **Distance check:** a catch only counts if the chaser is within about 50 m of the runner's latest known position. This stops "catching" someone from a photo of their tag.
   - **Unknown position:** if the runner's position is older than 2 minutes, the catch still counts but is flagged to marshals **(Claude's call)**.
4. Disputes go to a marshal through the app, never settled physically.

A no-contact **Snapshot** mode is a later option: the chaser scans a bib on the runner's back from 1–3 m. It suits cautious venues and corporate clients. Not in the MVP.

### 4.7 Jail and jailbreak
- Caught runners walk, never run, to the jail. A marshal gives their tag back there.
- While jailed, they watch a **spectator map of everyone, delayed by 2 minutes**.
- A free runner who reaches the jail and scans the **jail QR code** frees everyone currently jailed.
- Each runner can only be freed **once**, so games still end **(Claude's call)**.

### 4.8 Power-ups
Stations are printed QR codes placed by marshals before each game and collected afterwards. A claim only counts if the player's GPS puts them within about 30 m of that station, which stops people sharing photos of the codes **(Claude's call)**.

The MVP set (borrowed from CatchCity, trimmed to what works with a physical tag):

| Who | Power-up | Effect |
|---|---|---|
| Runner | **Decoy** | Next ping shows a fake position about 150 m away |
| Runner | **Shield** | The next scan of your ripped tag is rejected. You get the tag back and a 10 s head start |
| Runner | **Cloak** | You're skipped in the next ping |
| Chaser | **Flare** | Instant ping of every free runner |
| Chaser | **Focus** | Forces an immediate check-in from every runner within 150 m of their last known position, then one more 2 minutes later |

Each station gives one power-up per player per game, randomly chosen for that player's role, with a cooldown before anyone else can claim from the same station **(Claude's call on all numbers)**.

### 4.9 Ending and results
- The game ends when **time runs out** (runners win if any are still free) or when **every runner is caught** (chasers win).
- The results screen shows:
  - **awards**: longest survivor, most catches, jailbreak hero
  - a **route replay** of the whole game (chasers' full paths; runners as their check-in points joined up)
  - a **shareable result card**, which doubles as free marketing for Kejar and the venue

## 5. Safety and conduct

- **Code of conduct** accepted at join: no grabbing or tackling, one-hand arm rip only, "stop" means stop, no following anyone into toilets, walk in walk-only zones.
- **SOS button** on every player screen. It sends a marshal the player's location immediately.
- **Report button**, separate from SOS. A player can flag a specific player, and the marshal gets the report with the reporter's location. Marshals can **remove a player** from the game.
- **Marshal alerts:**
  - left the boundary
  - entered a no-go zone
  - missed 2 check-ins
  - chaser left the start point early
  - SOS
  - reports
- **Pause game for everyone:** marshal only.
- **Walk-only zones:** the app warns chasers moving fast inside them, since they're tracked continuously. Runners see walk-only zones on the map and the rule is part of the code of conduct. Marshals watch these zones.
- **Event-level:** signed waiver; event insurance and park permit before any paid event (owner's responsibility, not the app's). Adults only for now.

## 6. Location, privacy and data

- Location is shared **only while a game is running**. Sharing starts when the game starts and stops when it ends or the player is caught (jailed players don't need to be tracked).
- Visibility rules:
  - Chasers see runners only at pings.
  - Runners see teammates.
  - Marshals see chasers live and runners at their latest location.
  - Jailed players see everyone with a 2-minute delay.
- **Game location data is deleted 24 hours after the game ends**, which keeps the replay available for a day **(Claude's call)**.
- **Safety and legal records are kept for 12 months, then deleted.** These are:
  - waiver and code-of-conduct acceptances (name, game, time)
  - SOS events, reports and player removals, including the location at that moment
  They can be needed for insurance, the venue or police. They're stored apart from the location trails and visible only to the owner **(Claude's call; confirm the period against Malaysia's PDPA and your insurer)**.
- Expect GPS to be off by about 5–20 m under trees. That's why pings are drawn as fuzzy circles and station claims allow about 30 m of slack.

## 7. Platform and technology (the MVP must be close to free)

| Piece | Choice | Why |
|---|---|---|
| App | **Installable web app** (PWA), mobile-first | Works on any phone with no app store. The owner explicitly preferred a web page |
| Backend, real-time, database | **Supabase** free tier | Real-time pings, games, venues; easily covers 20 players |
| Maps | **MapLibre** with free OpenStreetMap-based tiles; park outlines from OpenStreetMap | Free, and can be restyled to the dark Kejar look **(Claude's call; replaces the earlier Mapbox suggestion because of the free constraint)** |
| Push alerts | Standard web push | Free. Needs home-screen install on iPhone (iOS 16.4+) |
| QR scanning | Phone camera in the browser | Works on iPhone and Android |
| Hosting | A free static host (e.g. Vercel or Netlify) | Free |
| Organiser sign-in | Email magic link via Supabase | Only organisers and marshals need accounts **(Claude's call)** |

**Accounts and access (MVP) (Claude's call):**
- There is one organisation: the owner's. Nobody can sign up as an organiser.
- The owner invites organisers and marshals by email.
- All arenas belong to the owner's organisation and are shared among its organisers. Separate spaces for each venue come later, but the data includes an organisation ID from day one so that's easy to add.
- A marshal is attached to a game by the organiser, or by joining with the game code plus their marshal sign-in.

**Ping spike pass bar and fallback (Claude's call):**
- **Pass:** at least 90% of check-in alerts arrive within 15 seconds on locked phones, across at least 2 iPhones and 2 Androids, in a real park.
- **If it fails:** drop push alerts and run check-ins on a fixed, announced schedule shown as an on-screen countdown, with the phone buzzing while the page is open. SMS, WhatsApp and native apps stay out of scope.

**Biggest technical risk:** whether the check-in alert arrives reliably and quickly on locked phones, especially iPhones. **Build a bare-bones test of this first** and try it in a real park before building anything else.

## 8. Physical kit

**Free test games with friends:** paper tags, velcro or safety pins, and the players' own clothes. Cost: about RM0.

**First paid event, 20 players** (Shopee/Lazada prices found on 2026-10-19; check before buying):

| Item | Price | Qty | Cost |
|---|---|---|---|
| Velcro, soft side, 1 inch, per metre (runner armbands) | RM0.99/m | 8 m | ~RM8 |
| Self-adhesive hook velcro (closures and tag backs) | ~RM2.90 | 2 | ~RM6 |
| Print and laminate tags with number and QR code | — | 16 | ~RM5 |
| Chaser vests: **change to lime/yellow-green hi-vis** to match the Volt brand (originally priced in orange at RM4.58) | ~RM4–7 | 6 | ~RM25–40 |
| Marshal vests, black or white, printed "MARSHAL" (my estimate) | ~RM5–10 | 4 | ~RM20–40 |
| Shipping across 3–4 sellers | | | ~RM15–25 |
| **Total** | | | **≈ RM80–125, mostly reusable** |

Later: branded printed vests, sponsor logos, and possibly pre-made Running Man-style tags (about RM3 each from local sellers).

## 9. Brand and visual design

- **Name:** **kejar.**, lowercase with a full stop.
  - Alternatives considered: Cabut, Ligan, Sorok-Sorok, Pinged.
  - **Before committing:** check .my/.com domains, the Instagram handle, and MyIPO trademark.
- **Colours:** **Volt Lime `#C6FF3D`**, plus **black `#0A0A0B`** and **white `#F5F5F3`**. No other colours.
- **Roles by colour and shape:**

  | Role | Look |
  |---|---|
  | Chasers | Solid lime dot |
  | Runners | Solid white dot |
  | Marshals | White ring |
  | SOS, power-ups, key actions | Lime |

- **Lime never appears as text on white.** It's used only as a fill or on dark screens.
- **Look:**
  - Dark, minimal and premium; in-game screens are dark.
  - **Geist** for text, **Geist Mono** for timers and numbers.
  - Thin line icons, pill-shaped buttons, soft layered cards.
  - A subtle glow behind each screen.
- **Map style:** dark, muted park, thin white boundary line, runners as fuzzy circles at the last ping.
- **Reference mockups** (throwaway, for look and feel only):
  - `.superpowers/brainstorm/97-1792411883/content/kejar-ui-v5.html`: seven screens (join, hide phase as runner, chase as chaser, runner check-in, jail, marshal, results). The lobby and chaser hide-phase screens follow the same style.
  - `kejar-volt-vs-orange.html`: shows a light-background screen (join) in Volt.

## 10. MVP sequence (for the planner)

1. **Ping spike:** a phone gets a push alert while locked, opens the page and sends its location. Test it in a park on a few iPhones and Androids.
2. **Core game:** join, roles, hide phase, pings and check-ins, tag scan, jail and jailbreak, end and results, on one hardcoded test park.
3. **Marshal tools and safety:** SOS, report, alerts, pause, remove player.
4. **Arena setup:** OpenStreetMap import, boundary editing, no-go and walk-only zones, stations, jail.
5. **Power-ups.**
6. **Polish:** route replay, share card, final visual pass.
7. **2–3 free test games** with friends, then adjust defaults before the first paid event.

## 11. Left to the builder

- Data model, API shape, real-time channel design, project structure.
- Exact map tile provider, as long as it's free at this scale and can be styled dark.
- How fuzzy circles are randomised, and how the GPS slack is tuned.
- Testing approach.
- Screens not mocked up (lobby, organiser game setup, arena editor, settings), following §9.

## 12. Later versions (not MVP)

- Malls (floor plans plus QR checkpoints instead of GPS)
- Snapshot no-contact catch mode
- Last Man Standing and team modes
- Spectator link and projector view for venues
- Taking payments in the app
- Malay language
- Corporate event packages
- Sponsor branding
