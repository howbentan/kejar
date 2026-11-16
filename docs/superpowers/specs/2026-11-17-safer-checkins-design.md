# Safer check-ins

Short design, 2026-11-17.

## Why

A check-in is the one moment the game makes a runner take their phone out on its own schedule, and that could be mid-sprint. The owner worried about dropped and broken phones.

Thinking it through together, we found the risk isn't the check-in itself. Runners already handle their phones for power-ups and scans, at moments they choose. The risk is pulling the phone out at speed, in a panic, without knowing that a runner can slow down first or skip one check-in (one miss is free).

## Approaches

- **Small fixes (chosen):** give runners more time, tell them to slow down, and teach that one miss is free. It's cheap, and it keeps Kejar a website you join from a link.
- **Android app that tracks from the pocket, with armband mode for iPhones:** designed in chat and set aside. It costs a lot (store listing or APK warnings, background permissions, phone makers killing the app), while runners would handle their phones for power-ups anyway. Revisit it only if playtests still show dropped phones or many missed check-ins.
- **Armband mode alone:** left for later, if playtests ask for it.

## Changes

1. **The check-in window grows from 45 s to 60 s,** so slowing down first never costs the check-in.
   - Exception: when the ping before is less than 75 s earlier, the window keeps 15 s clear after that ping. In practice this means Bomba's 1-minute pings (5, 4, 3, 2 and 1 minute left) keep their 45 s, so their windows never run into each other. Every other ping gets 60 s, including the 2-minute schedule and Bomba's ping at 6 minutes left.
   - Mat Rempit's bonus pings keep their 30 s.
2. **The ping notification** reads "Ping in 60s. Slow down, then check in." with the body "One miss is free. Tap to check in. Kejar see you at 3:25." Late pushes still say the true time left, as now.
3. **The how-to-play card** says: "When it buzzes, slow down and open Kejar within 60 s. One miss is free, so never check in at a sprint."
4. **The rules doc and the 45 s mentions** in code comments get updated to match.

## Left alone

- The late-push rule: a miss still only counts if the alert went out at least 25 s before the reveal.
- Auto-jail after 2 misses, and the marshal's undo.
- The missed-check-in banner, which already says "Miss the next one too and you're sent to Penjara."

## Left to the builder

- Where the per-ping window length is worked out. It should be in `pingTimes`, so everything that reads a ping's alert time follows automatically.
- Checking that Mak Kau Hijau's "never overlap a check-in window" rule still finds room with the longer windows.
