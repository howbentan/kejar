# Kejar: auto-jail for missed check-ins, counter-pings, and Penjara

**Status:** Agreed with the owner in chat, 2026-10-28 to 2026-10-30, and checked by a reviewer (build order and results resolved in §8a). Not built. **Build this before the Malaysian power-ups and jail dare-wheel specs** (§8a).
**Builds on:**
- `docs/superpowers/specs/2026-10-19-kejar-design.md` §4.5 (pings and check-ins) and §4.7 (jail and jailbreak).
- `docs/superpowers/specs/2026-10-28-kejar-jail-dato-seri-design.md`: the jail dare wheel and Dato Seri.
- `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`: the power-ups, and its "no refereed power-ups" rule.

## 1. Why

A review of the game's strategy found two holes.

1. **Skipping check-ins costs nothing.** A runner who ignores the check-in alert is shown to chasers at their old position, marked "missed check-in". Marshals get an alert after 2 misses, but there's no in-game penalty.
   - So a smart runner can stop checking in and move around freely: an unlimited, free Ponteng.
   - Once one player works that out, the game falls apart for everyone, and the real Ponteng power-up becomes pointless.
2. **Rescuers walk in blind.** Runners never learn where chasers are (apart from a "chaser nearby" warning within ~100 m while their page is open). A chaser waiting at the jail therefore turns every rescue attempt into a trap, and jailbreaks die out.

The owner's direction for both:
- The fixes must be decided by the app, never by a referee.
- They must keep strategy rather than ban it. Camping at the jail stays a legitimate choice; the owner explicitly preferred that to a no-catch safe zone.

## 2. Goals

1. **Make missed check-ins cost something real** (§4): two missed in a row sends the runner to Penjara automatically.
2. **Let runners see chasers too, on a delay** (§5): one minute after each ping, runners get a fuzzy "counter-ping" of where the chasers are.
3. **Rename the jail to Penjara** wherever players see it (§6).

## 3. Non-goals

- **A no-catch safe zone around Penjara.** It was proposed and dropped by the owner.
  - Camping at Penjara is a real trade-off: a chaser on guard is a chaser not hunting.
  - Counter-pings (§5) make it visible, so runners can plan around it.
- **Automatic background location (no check-ins at all).** A web page can't read location while the screen is off or the page is closed. That needs a native app, which stays off the table for now (owner's decision, 2026-10-30): events first, app maybe later.
- **Banning or removing runners for missed check-ins.** The owner's first instinct was "banned, out of the game". It was softened because push alerts can fail and GPS can drop under trees, so an unlucky runner would be knocked out through no fault of their own.
- **Anything a marshal has to judge.** Both mechanics are decided by the app.

## 4. Auto-jail: two missed check-ins in a row

### 4.1 The rule
At each **scheduled** ping's reveal, a free runner who missed **both this check-in and the one before it** is sent to Penjara automatically, exactly as if a chaser had caught them.

### 4.2 What counts as a check-in
Unchanged from today:
- A check-in for ping *k* is any location the runner's phone sent after the previous scheduled reveal (or after the chase started, for the first ping), up to ping *k*'s reveal.
- Locations from the hide phase don't count.
- **Ponteng and Gostan users did check in.** Those power-ups only hide or move what chasers see; the phone still sent its location. So they're never penalised.
- **Mat Rempit's surprise pings don't count.** With only 30 s notice, missing one is not a fault. This matches how the marshal "missed 2 check-ins" alert already counts (`missedTwoInARow` in `app/shared/alerts.ts`).

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

## 5. Counter-pings: runners see the chasers, a minute later

### 5.1 The rule
**60 seconds after each scheduled ping's reveal**, every free runner can see where every chaser is at that moment, drawn the same way runners are shown to chasers:
- **fuzzy circles of about 15 m**, using the same fuzz as runner pings;
- labelled with the chaser's name.

That counter-ping stays on the runner's map until the next one replaces it.

### 5.2 Quiet, not buzzing (owner's decision)
- **No push notification for counter-pings.** Runners' phones already buzz for every check-in. A second buzz a minute later would double the phone time, screen glow and battery drain, and break the "phone in pocket" design.
- **The check-in screen shows a countdown** after the ping, `Kejar revealed in 0:45`, so every runner knows when to look if they want to.
- Looking is a **choice and a risk**: pulling the phone out to check gives away a hiding spot with the glow.

### 5.3 Details
- **Only after scheduled pings,** not after Mat Rempit's surprise pings (**Claude's call**). Mat Rempit is a chaser advantage; it shouldn't also hand runners a free counter-ping.
- **A chaser whose phone hasn't sent a location for over 60 s** is shown at their last known spot, marked as old: a dashed circle, the same way a runner's missed check-in is drawn (**Claude's call**).
- **Chasers know it happened:** the feed shows `Counter-ping: Dikejar can see you`. This is plain English, plus the existing role name; the Malaysian wording scope is power-ups only, apart from Penjara (§6).
- **Unchanged views:**
  - Jailed runners keep their existing spectator map (everyone, 2 minutes delayed).
  - Marshals still see chasers live.
- **Pauses** shift counter-pings exactly as they shift pings, since a counter-ping is just "reveal time + 60 s".
- **The chaser-nearby warning** (≤100 m, live, while the runner's page is open) stays as it is.

### 5.4 Balance lever (not built now)
If playtests show runners are now too strong, the first thing to try is **switching counter-pings off for the last 10 minutes**, so the finish gets tense again. This belongs with the endgame work, not this spec.

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
- **Making phones louder.** No new push notifications (§5.2).
- **Hiding the reason.** A runner sent to Penjara automatically must always be told why (§4.5).

## 8. Constraints

- **Brand colours:** Volt `#C6FF3D`, black and white only.
- **Fonts:** Geist and Geist Mono.
- **Free tiers only,** with the single `api/game.ts` function.
- **Database:** any new field (e.g. `freed_at`) is a numbered migration that the owner runs in Supabase by hand.
- **Shared code:** reuse the existing pieces rather than duplicating them:
  - the missed-check-in counting (`missedTwoInARow`);
  - the fuzz (`fuzz` / `FUZZ_RADIUS_M`);
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
- Where the counter-ping countdown sits on the runner screens, as long as it shows after every scheduled ping.
- How chasers' counter-ping circles are visually distinguished from runner circles on a runner's own map (runners already see their teammates' dots), using brand colours only.
