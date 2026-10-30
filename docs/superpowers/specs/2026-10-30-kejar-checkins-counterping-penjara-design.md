# Kejar: on-time check-ins, auto-jail, seeing the chasers, and Penjara

**Status:** Agreed with the owner in chat, 2026-10-28 to 2026-10-30, and checked by a reviewer (build order and results resolved in §8a). Revised the same day: a tight check-in window (§4.2), and the chaser view merged into the check-in behind an organiser switch (§5). Not built. **Build this before the Malaysian power-ups and jail dare-wheel specs** (§8a).
**Builds on:**
- `docs/superpowers/specs/2026-10-19-kejar-design.md` §4.5 (pings and check-ins) and §4.7 (jail and jailbreak).
- `docs/superpowers/specs/2026-10-28-kejar-jail-dato-seri-design.md`: the jail dare wheel and Dato Seri.
- `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`: the power-ups, and its "no refereed power-ups" rule.

## 1. Why

A review of the game's strategy found three holes.

1. **Skipping check-ins costs nothing.** A runner who ignores the check-in alert is shown to chasers at their old position, marked "missed check-in". Marshals get an alert after 2 misses, but there's no in-game penalty.
   - So a smart runner can stop checking in and move around freely: an unlimited, free Ponteng.
   - Once one player works that out, the game falls apart for everyone, and the real Ponteng power-up becomes pointless.
2. **A check-in counts any time since the last ping.** Found while checking the code. A runner can open Kejar just *after* a ping, pocket the phone, and run anywhere for the next five minutes. At the next ping they're shown at that old spot with no "missed check-in" mark. It's the same exploit as hole 1, just better hidden.
3. **Rescuers walk in blind.** Runners never learn where chasers are (apart from a "chaser nearby" warning within ~100 m while their page is open). A chaser waiting at the jail therefore turns every rescue attempt into a trap, and jailbreaks die out.

The owner's direction for both:
- The fixes must be decided by the app, never by a referee.
- They must keep strategy rather than ban it. Camping at the jail stays a legitimate choice; the owner explicitly preferred that to a no-catch safe zone.

## 2. Goals

1. **Make check-ins on time and on purpose** (§4):
   - only a check-in in the window just before a ping counts;
   - two missed in a row sends the runner to Penjara automatically.
2. **Let runners see chasers at check-in, if the organiser switches it on** (§5): the same moment they check in, runners see where the chasers were when their alert went off.
3. **Rename the jail to Penjara** wherever players see it (§6).

## 3. Non-goals

- **A no-catch safe zone around Penjara.** It was proposed and dropped by the owner.
  - Camping at Penjara is a real trade-off: a chaser on guard is a chaser not hunting.
  - When the chaser view is on (§5), runners can see whether Penjara is guarded and plan around it.
- **Automatic background location (no check-ins at all).** A web page can't read location while the screen is off or the page is closed. That needs a native app, which stays off the table for now (owner's decision, 2026-10-30): events first, app maybe later.
- **Banning or removing runners for missed check-ins.** The owner's first instinct was "banned, out of the game". It was softened because push alerts can fail and GPS can drop under trees, so an unlucky runner would be knocked out through no fault of their own.
- **Anything a marshal has to judge.** Everything here is decided by the app.
- **A separate "counter-ping" a minute after each ping.** That was an earlier version. It was replaced by showing chasers at the check-in itself (§5), so runners don't need a second phone moment.
- **Orang Bunian** (a chaser power-up to hide from runners' view). Discussed as a counter for chasers; left out for now. Revisit if the chaser view proves popular and chasers want a way to hide from it.

## 4. Auto-jail: two missed check-ins in a row

### 4.1 The rule
At each **scheduled** ping's reveal, a free runner who missed **both this check-in and the one before it** is sent to Penjara automatically, exactly as if a chaser had caught them.

### 4.2 What counts as a check-in (tightened)
- **The check-in window** for a scheduled ping runs from its **alert** to its **reveal**.
- **The alert moves to 45 s before the reveal** (it was 30 s), so a late push alert still leaves time to open Kejar (**Claude's call**).
- **A check-in for ping *k* is a location the runner's phone sent inside ping *k*'s window.** That window is the 45 s up to the reveal.
- **A location sent before the window doesn't count,** even if it came after the previous ping. Chasers see that runner marked "missed check-in" at that older spot, and it counts towards auto-jail.
- **Keeping Kejar open the whole time is fine.** The page keeps sending locations, some of which land inside every window, so such a runner never misses.
- **Mat Rempit's surprise pings keep their own 30 s alert.** Only scheduled pings move to 45 s.
- Locations from the hide phase don't count.
- **Ponteng and Gostan users did check in.** Those power-ups only hide or move what chasers see; the phone still sent its location. So they're never penalised.
- **Mat Rempit's surprise pings don't count towards auto-jail.** With only 30 s notice, missing one is not a fault. This matches how the marshal "missed 2 check-ins" alert already counts (`missedTwoInARow` in `app/shared/alerts.ts`). That function must be updated to use the new window, not "anything since the last ping".
- **Fixed-schedule mode** (no push alerts) uses the same window. Runners watch the on-screen countdown and open Kejar during the last 45 s.

### 4.3 One free miss
A single missed check-in costs nothing beyond what it does today (shown at your old spot, marked "missed check-in"). Only the **second miss in a row** triggers auto-jail, so one dropped alert never costs anyone the game.

### 4.4 Freed runners start fresh (important)
Jailed runners don't send locations, so a runner freed from Penjara will always have "missed" every ping while they were jailed.

The streak must therefore only count pings **after the runner was last released**, whether by jailbreak, the dare wheel's free slice, or Dato Seri's Settle. Otherwise they'd be sent straight back at the next ping.

The app needs to know when each runner was last released. Today there's only a `freed_once` flag; adding a `freed_at` timestamp is one way (**left to the builder**).

### 4.5 What happens on auto-jail
- The runner is jailed exactly like a normal catch:
  - `jailed` is set;
  - the catch time is the ping's reveal time;
  - "caught by" is empty, because no chaser made the catch.
- **The feed shows:** `#07 missed 2 check-ins — sent to Penjara`.
- **The runner's phone** switches to the Penjara screen with the reason `You missed 2 check-ins`.
- **Marshals** get an alert, `#07 missed 2 check-ins — sent to Penjara`. This replaces today's "missed 2 check-ins" alert for that runner; it isn't sent as well (**Claude's call**). It's mainly so a marshal can check on them: a dead phone, an injury, or someone who's wandered off.
- **Everything about being jailed applies as normal:**
  - the dare-wheel spin;
  - being broken out by a teammate;
  - Dato Seri's Settle;
  - the one-lifetime "freed" rule. A runner who has already been freed once and is then auto-jailed stays in Penjara for good.
- **Ending the game:** if this jails the last free runner, the chasers win, the same as a normal catch.
- **Results (Claude's call):**
  - An auto-jail **ends the runner's survival time** for "Longest survivor", exactly like a catch. A runner who was auto-jailed early (for example, a dead phone) must not win that award from Penjara.
  - It **doesn't count as a catch** for any chaser in "Most catches".
  - It's recorded as its **own event type** (e.g. `auto-jailed`), not as a `caught` event with no chaser. That keeps the feed, the flagged-catch alert and the "caught by" line on the jail screen simple. `results.ts` then treats either event as the end of survival.

### 4.6 Pauses
While a marshal has the game paused, no pings reveal, so nobody can miss a check-in. After resuming, the schedule continues as normal (it already shifts by the pause length).

## 5. Seeing the chasers at check-in (organiser switch)

### 5.1 The switch
- New game setting: **"Dikejar can see Kejar at check-in"**, on or off, chosen when creating the game.
- **Default: off** (**Claude's call**). Off is how the game works today, the closest to proven hide-and-seek formats.
- The owner plans to play one game with it off and one with it on at early events, then compare which players enjoyed more. Watch catches per game, jailbreaks and how many check-ins were on time.

### 5.2 When it's on
At the moment a scheduled ping's **alert** goes out (45 s before the reveal), the app records where every chaser is: a **snapshot**. When a free runner opens Kejar inside that check-in window, their map shows the chasers **as they were in the snapshot**:
- **fuzzy circles of about 30 m**, twice the runners' 15 m, because runners see chasers up to 45 s before chasers see them (**Claude's call**, and the first dial to turn after a playtest);
- labelled with the chaser's name;
- **frozen.** The circles don't move as chasers move; they stay until the runner's next check-in replaces them.

### 5.3 Why it's frozen at the alert (the strategy)
- **Chasers know the snapshot is taken at the alert.** From that moment until the next alert, they can move unseen: reposition, flank, or bluff. For example, a chaser stands by Penjara at the alert so it looks guarded, then walks off to hunt; or appears far away, then sneaks back.
- **Runners**, after checking in, can move before the reveal, as they always could.
- **So each side sees the other at a fixed moment, about 45 s apart, and each gets a window to act unseen.** Showing chasers live instead would give chasers nowhere to hide and no way to bluff, which is too strong for runners.

**Briefing lines:**
- to runners: *"When your phone buzzes, open it. You check in, and you see where the chasers were at that moment."*
- to chasers: *"Runners see where you were when their phone buzzed, so move after that."*

### 5.4 Details
- **Only scheduled pings take a snapshot,** not Mat Rempit's surprise pings (**Claude's call**). Mat Rempit is a chaser advantage; it shouldn't also hand runners a free look.
- **No new notifications.** The view arrives with the check-in the runner is already doing. There's no extra buzz and no second phone moment.
- **A chaser whose last location is over 60 s old at the snapshot** is shown at that last known spot, marked as old: a dashed circle, like a runner's missed check-in (**Claude's call**).
- **Chasers know when they've been snapshotted.** Their screen marks the moment of each alert, e.g. `Snapshot taken — Dikejar can see where you were`, so they know their unseen window has started. The feed shows the same line. Plain English, plus the existing role name.
- **A runner who doesn't check in sees nothing new.** They keep the previous snapshot (or none). Skipping check-ins means flying blind as well as risking auto-jail.
- **Unchanged views:**
  - Jailed runners keep their spectator map (everyone, 2 minutes delayed).
  - Marshals still see chasers live.
  - The live chaser-nearby warning (≤100 m, while the page is open) stays.
- **Pauses** shift the alert, and so the snapshot, exactly as they shift pings.

### 5.5 Balance levers (not built now)
If playtests with the switch on show chasers struggling to catch anyone, the levers, in order:
1. widen the chaser circles beyond 30 m;
2. add more chasers per runner, or use shorter ping intervals;
3. hide the chaser view in the last 10 minutes (endgame work);
4. add Orang Bunian (§3) as a chaser counter.

## 6. Penjara

- Everywhere players see the word "jail", it becomes **Penjara**:
  - screen titles and buttons ("Break them out" stays as words; only the noun changes);
  - feed lines;
  - the map label;
  - the text printed on the jail QR card.
- **Unchanged:** the rules, the 30 m rescue range, and the QR code's contents. The printed card's code stays `KEJAR:JAIL` (**Claude's call**), so already-printed cards keep working; only the label printed on them changes.
- **Scope:** this is a deliberate widening of the power-ups doc's rule that "Malaysian characters and slang apply to the power-ups only". It's the second such widening, after the jail spec's "Pak Pulis".
- **Safety screens stay plain** wherever they mention the jail. SOS, reports and marshal alerts may say "Penjara" as a place name; the word is clear enough. Nothing else about their wording changes.

## 7. Anti-goals

- **Punishing bad luck.** One free miss (§4.3) and the "freed runners start fresh" rule (§4.4) exist so nobody is jailed for something outside their control.
- **Making phones louder.** No new push notifications (§5.4).
- **Hiding the reason.** A runner sent to Penjara automatically must always be told why (§4.5).

## 8. Constraints

- **Brand colours:** Volt `#C6FF3D`, black and white only.
- **Fonts:** Geist and Geist Mono.
- **Free tiers only,** with the single `api/game.ts` function.
- **Database:** any new field (e.g. `freed_at`) is a numbered migration that the owner runs in Supabase by hand. The switch is one more field in the game's existing `settings`.
- **The alert lead time** (`ALERT_LEAD_MS`, now 30 s) splits in two: 45 s for scheduled pings and 30 s for Mat Rempit's (Flare) bonus pings.
- **Shared code:** reuse the existing pieces rather than duplicating them:
  - the missed-check-in counting (`missedTwoInARow`);
  - the fuzz (`fuzz`; chasers use a 30 m radius alongside `FUZZ_RADIUS_M`);
  - the pause-aware clock (`toWall`).

## 8a. Build order (Claude's call, resolved after the reviewer's check)

**This spec is built first, on today's code,** before the Malaysian power-ups and the jail dare-wheel / Dato Seri specs. Fixing the check-in hole before the first playtest was the point of designing it.

Until those specs land, this spec's names map onto today's code:

| This spec says | Today's code |
|---|---|
| Ponteng | Cloak |
| Gostan | Decoy |
| Mat Rempit | Flare (bonus pings, seq ≥ 1000) |
| "Last released" (§4.4) | reset by ordinary **jailbreak** only, the one way out of jail that exists today |

The later specs must then:
- **reset the same "last released" marker** from their new release paths (the dare wheel's free slice, Dato Seri's Settle);
- **give auto-jailed runners their dare-wheel spin**, the same as any other jailing;
- **use "Penjara"** in any new jail screens and copy they add.

Whichever of those specs is planned next should list these as tasks.

## 9. Left to the builder

- How "last released" is stored (a `freed_at` field, or derived from release events), as long as all three release paths reset the streak.
- How the snapshot is stored (e.g. chaser positions read "as of the alert time", which the existing position history already supports).
- How chasers' circles are visually distinguished from teammates' dots on a runner's map, using brand colours only.
- Where the "snapshot taken" marker sits on the chaser screen.
