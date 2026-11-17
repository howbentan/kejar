# Penjara rescue: hold the key — design

Date: 2026-11-17
Status: draft, waiting for approval
Mockups: `app/mockups/penjara-key/penjara-key.html` (published as a private artifact; section 1 is a working hold button)

## 1. Why

A rescue frees every runner in Penjara who hasn't been freed before. Today it's a 10-second stand: a free Dikejar scans the
Penjara code and stays within 30 m; other free runners can scan to "join". On screen it's a lime ring and one line of text.

What the organiser wants:

- **Harder than Dato Seri's Settle.** Settle frees at most three and needs a legendary; a rescue frees everyone, so it
  should cost more.
- **A real commitment.** The rescuer has to stand at the gate with their thumb down, not scan and wait.
- **One rescuer.** A crowd scanning must not stack or look like it helps.
- **No gate camping.** Today a Kejar can wait by the gate and re-catch everyone the moment they walk out; each runner has
  only one free, so that ends their game.
- **A moment worth watching:** a key turning in Penjara's padlock, in the power-up sticker style, with a sound per click.

## 2. Goals, non-goals, anti-goals

**Goals**

- The rescuer holds a button for **20 seconds in total**, within 30 m of Penjara.
- Letting go **pauses** the hold; no thumb for **5 seconds** and it **resets**, ending the rescue.
- **One rescuer at a time**; a second scan is turned away with a clear line.
- Everyone freed from Penjara (rescue, Settle or the reel) gets a **10-second head start**: a Kejar's tag scan can't catch
  them.
- The lock-and-key animation, the notch sounds and the freed / failed screens from the mockup (lock A).

**Non-goals**

- No change to who a rescue frees (every jailed runner without a used free), to Settle's rules, the reel, PKP or Mak Kau
  Hijau's Penjara lock rules.
- No stacking: extra people at the gate add nothing.

**Anti-goals**

- The phone can fake progress (only the server's clock counts held time).
- A rescue that survives the rescuer leaving 30 m, or being caught, at any point including a pause.
- A silent refusal that looks like a broken scanner (every refusal says why).

## 3. Constraints

- **No server tick.** The rescue settles lazily in `advance()` / `settleRescue` on polls and actions, as today.
- **Web limits.** No background location, so the rescue screen must stay open: it already sends a fix every
  `RESCUE_PING_MS` (1.5 s). `navigator.vibrate` works on Android only, foreground only. iPhone silences web audio when the
  ringer switch is off.
- **Pauses** freeze everything: held time, the 5-second window, the head start.
- Both stores (`MemoryStore`, `SupabaseStore`) change together; any new column or JSON shape gets a migration (next
  free number at build time) and `PLAYER_COLUMNS` / `GAME_COLUMNS` updates.

## 4. Approaches considered

| Approach | What it is | Verdict |
|---|---|---|
| Today's 10 s stand | Scan once, stay within 30 m for 10 s | Too easy for freeing everyone; nothing to do but wait |
| Hold, full reset on release | Any let-go ends the rescue | Harsh: one flinch at a passing Kejar wastes it all; no standoff |
| **Hold with pause, reset after 5 s off** (chosen) | 20 s of held time; let go and you have 5 s to hold again | A real standoff: hold and risk the catch, or let go, dodge, and get the thumb back in time |
| Many rescuers stack | More holders = faster | Rejected: crowds unbalance it |

The organiser chose the hold with pause, 20 s, 5 s reset.

## 5. The design

### 5.1 Starting

- A free Dikejar at Penjara scans the Penjara code (the same checks as `judgeJailbreak` today: chasing, a free runner not
  under house arrest, within reach, someone to free, Penjara not locked or closed).
- That **claims the rescue** for them and opens the rescue screen with the **HOLD** button. Held time starts at 0 and
  nothing counts until they press.
- The 5-second rule applies from the scan: if they don't press within 5 s, the rescue ends.
- **One at a time:** while a rescue is claimed (holding or in its 5 s window), another runner's scan answers
  **"{Name} is already breaking them out."** and changes nothing. *(Joining is removed.)*
- **The rescuer's own re-scan resumes** their rescue (same held time, same 5 s window) instead of being refused, so a
  reload or a reopened app gets the screen back. *(My call.)*

### 5.2 The hold

- Held time adds up only while the button is down. **20 s of held time** frees everyone (the existing success path in
  `settleRescue`: every runner with `jailed && !freed_once` is freed and marked `freed_once`).
- **Letting go pauses** it. If the button isn't pressed again within **5 s**, the rescue **resets**: it ends with
  nothing freed, and anyone free can scan to start a new one.
- **30 m applies the whole time**, held or paused: any usable fix outside `RESCUE_RADIUS_M` (+ accuracy, as
  `rescueVerdict` does today) ends it as **failed**.
- **Caught, removed, disqualified, or Penjara locked/closed** at any point ends it as failed (as today).
- **Game pause** freezes held time and the 5 s window; the button does nothing while paused.

### 5.3 How the server counts (server's clock only)

- The phone tells the server when the thumb goes down and up, and every rescue fix (each 1.5 s) carries whether the thumb
  is still down.
- If a rescue that is being held gets no "still holding" message for about **2 s**, the server counts the thumb as
  lifted at the last message (covers a call, a notification, a locked screen or a dropped connection). The 5 s reset
  window runs **from that last message**, so a lapse resets about 5 s after the phone went quiet, not 7. *(My call.)*
- Paused game time is left out of held time and of the 5 s window, the same way `sentDuringPause` leaves pause-time
  fixes out today. *(My call.)*
- Held time = the sum of down-intervals, judged on server receive times. The rescue succeeds the moment held time reaches
  20 s; the server settles it on the next request (the rescuer's phone keeps sending fixes, so that's within 1.5 s).

### 5.4 The rescuer's screen

- **Lock A** from the mockup: the padlock face-on in front of the Penjara gate doodle, the key in it head-on.
- **Four clicks:** every 5 s of held time turns the key one notch (22.5°), fills the next of four marks on a dashed arc
  beside the keyhole, with a small burst. Between clicks the key strains a little toward the next one while held.
- **Shake builds:** while held, the lock trembles, and the tremble grows toward the end (bigger tilt, bigger jolt, faster),
  stopping on let-go and on open.
- Under the lock: the **seconds left** (20 − held), a line, and the big **HOLD / HOLDING** button.
  - Idle: *"Press and hold for 20 s. Let go and it waits 5 s, then resets."*
  - Holding: *"Keep holding. Stay within 30 m of Penjara."*
  - Paused: eyebrow **LET GO**, the count dims, the marks blink, *"Resets in 3. Hold again to keep it."*
- **Sounds** (Web Audio in `src/game/sounds.ts`, honouring its existing mute switch): clicks 1–3 rising in pitch, the
  unlock on the 4th, a soft tick on let-go, the spin-back on reset. **Android buzz** on each click and a longer one on
  unlock.

### 5.5 What runners in Penjara see

- The same lock, driven by the server's held time and state, with **"{Name} is breaking you out"** /
  **"{Name} let go"** and *"Resets in 3. {Name} has to hold again."*
- No button and no sounds for them. *(My call: one phone making noise at the gate is enough.)*

### 5.6 The endings

- **Freed:** the gate doodle swings open, the shackle pops, **LEPAS!** stamps down. Rescuer: *"2 freed. They have a 10 s
  head start. Now you run too."* Freed runner: *"You're free. Run. 10 s head start: nobody can catch you yet."*
- **Failed** (caught, left 30 m, removed, Penjara locked): the ring turns red, the lock rattles, the key snaps;
  *"{Name} was caught."* / *"{Name} walked away."*, *"Nobody gets out this time. Another Dikejar can try."*
- **Reset** (5 s without a thumb): the key spins back, the marks empty; *"Rescue reset."*
- The feed keeps today's `rescue-started` / `rescue-failed` / `jailbreak` events. `rescue-failed` gains
  `data.reason`: `caught`, `left` (outside 30 m), `removed`, `locked` or `reset`, and its feed and screen copy follow the
  reason; existing readers of that event may change. *(My call.)*

### 5.7 The 10-second head start

- Any runner freed from Penjara (rescue, Settle, the reel) can't be **caught by a tag scan** for **10 s**, paused time
  not counting.
- It's stored as its own per-player time (e.g. `head_start_until`), set only by those three frees. *(My call:
  `freed_at` is also stamped by an undone catch and a Super Ring release, which must not get a head start.)*
- "Caught by a tag scan" covers everything that starts from a Kejar's catch: a plain catch, a catch that would trigger
  Super Ring's house arrest, and a Hang Hebat bounty claim. All of them are refused during the head start. *(My call.)*
- A Kejar who scans them gets **"Just freed: 6 s head start."** (seconds left), nothing changes, and it isn't a
  failed-catch strike of any kind.
- Other ways to be jailed (auto-jail for missed check-ins, Mak Kau Hijau, Banjir Kilat) are **not** blocked. *(My call:
  they aren't Kejar camping the gate, and blocking them adds edge cases.)*
- Same pattern as the existing Durian head start (`DURIAN_HEAD_START_MS`).

### 5.8 Penjara locked (polish)

- After a Mak Kau Hijau that counted, the jailed screen's green "Penjara locked · m:ss" pill becomes the mockup's chained
  gate doodle with the green countdown. Rules unchanged.

### 5.9 Games running when this ships

- A live rescue in the old shape (no hold state) is read as claimed with 0 held and not held, so it resets 5 s later
  unless its rescuer presses HOLD; old joiners are dropped. *(My call.)*

## 6. Decided in the conversation

- Hold a button; 20 s of held time; letting go pauses; 5 s without a thumb resets.
- 30 m still applies.
- One rescuer; a second scan doesn't join.
- 10 s head start after any free from Penjara; a Kejar's scan doesn't count during it.
- Lock A (key turning, four clicks every 5 s), the Penjara gate behind the lock, the shake builds toward the end, a sound
  per click and a big unlock sound.

## 7. Left to the builder

- The exact shape of the rescue record (held ms, hold-since, released-at) and the hold/release action names.
- Porting lock A, the gate doodle, the shake and the sounds from `app/mockups/penjara-key/` into `src/game/`.
- Exact copy not quoted above.
