# Loader exits: the j clears the screen when loading finishes

Short design. Mockup: `app/mockups/eat` (artifact "Loader Exit").

## Why

Today a loader just vanishes when its data arrives. The user wants the running j to finish the wait with a little show: it clears the text, the way Pac-Man clears a row, and then the screen appears.

## What was decided (by the user)

- **Full-screen loaders** pick one of three exits at random each time:
  - **A · Wipe:** the j runs off the right edge, and everything ahead of it (the a, the r, the caption) disappears in a sharp line right behind it.
  - **C · Bulldoze:** the j runs off the right edge and shoves the letters ahead of it into a tilted pile that goes off with it.
  - **F · Kung fu:** the j stops, kicks the letters on its left off the left edge, kicks the letters on its right off the right edge (a hit flash and a jolt on each), then leaves in a flying side kick.
- **What's behind the j** (the k, the e and the start of the caption):
  - **In A it chases the j:** the letters hop after it in a line and follow it off the right edge.
  - **In C it gets a back kick:** before sprinting, the j throws a quick kick backwards and those letters fly off the left edge with a hit flash. Then it bulldozes off to the right.
- **Busy buttons** always use the wipe: when the call answers, the small j runs right across its own label, clearing it.

## Approaches considered

1. **One shared gate (recommended).** A `LoaderGate` wraps each full-screen loader: `<LoaderGate ready={!!data} caption="…">{screen}</LoaderGate>`. While not ready it shows `FullLoader`. When ready it plays the exit and only then shows the screen. One place holds the timing, the random pick and the skips below. Each screen changes one line.
2. **Each screen holds its own "entering" state,** the way `GameScreen` does today with `leaving`/`onLeft`. This works, but it copies the same state into seven screens.
3. **The exit plays as an overlay over the arrived screen.** This is quicker to see content, but the letters would fly over real buttons and text, and the mockups all assumed a clear black stage.

## Design

- **The gate.** `LoaderGate` lives in `app/src/game/Runner.tsx`. It is used where `FullLoader` is today: GameScreen (replacing its `entering` logic), HostLobby, HostNew (parks), ArenaSetup (mapping), PhoneMove, WalkPark and YourKit.
- **The exits.** `HomeLogo` gets the exits as a new `exit` prop, applied to its `leaving` mode:
  - `wipe`/`bulldoze` run the existing sprint, plus the per-frame clearing and the chase behind it.
  - `kungfu` swaps in a kicking j drawn from the same strokes, following the mockup's timeline.
  - Caption letters are split into spans only while leaving.
- **When to skip the show** (my calls):
  - If the loader was on screen for under about 0.4 s, the screen just appears. A flash load shouldn't cost a second of animation.
  - With reduced motion on, there is no exit (as with the j today).
  - With an error, there is no exit: the error shows as it does now.
- **Timing.** The wipe and bulldoze exits take about 1.3 s including the chase tail; kung fu takes about 1.25 s. Tapping during the exit does nothing.
- **Buttons.** `BusyLabel` gets a wipe-out:
  - When `busy` goes false and the button is still on screen, the small j runs across the label (about 0.65 s), and then the button shows its normal label again.
  - Buttons whose success moves you to another screen (for example Join, Create game, Sign in) move on at once, so their exit simply isn't seen. Navigation is not held back.
  - On a failed call there is no exit; the label just comes back.
  - My call: no new "Joined" / "Saved" words after the wipe (the mockup showed some). The button goes back to its own label, which avoids new copy for every button.

## Left to the builder

- Hold the random pick for the life of one loader, not re-roll it per frame.
- Test that the gate shows the screen after the exit, skips for fast loads, reduced motion and errors, and that `BusyLabel` never delays a click handler.
