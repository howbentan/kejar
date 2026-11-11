# Home screen: catch the j

Date: 2026-11-12
Mockup: `docs/superpowers/mockups/2026-11-12-splash-and-home/index.html` (run `home-mockups` in `.claude/launch.json`, port 5179). The first phone is the game; the second is the reconnect variant; the third is the join step.

## Intent

The home screen at `/` is the first thing anyone sees. Today it is a wordmark, a tagline, a code box and a small "Organise a game" link. It does its job, but nothing about it says "this is a game", and it doesn't give the logo a moment of its own.

The new home screen turns the logo into a toy: a nod to the old bouncing DVD logo. The j from the logo floats loose, spinning and bouncing around the top of the screen. Tap it when it lines up with its gap between "ke" and "ar" and it snaps home, spelling kejar. For a split second it turns into one of the game's power-up stickers, then it turns back into the j and flies off again.

It is something to fiddle with while friends gather, and it teaches the logo without saying a word.

**Why the j, and not something else:** the hooked j with its round head is what makes the logo recognisable. Each catch completes the real logo, so the payoff of the toy is the brand itself. An earlier draft bounced a random power-up instead. It was dropped because "ke [shield] ar" isn't the name, and it meant pushing ke and ar apart.

## Goals

- The logo is centred and big, with the j loose and playable.
- The copy is short and lowercase. There are three ways out: `join game`, `organise game`, and, when there is a game to go back to, `reconnect`.
- A link, `if dk how to play click here :)`, opens the how-to-play story.
- The toy feels snappy: fast pops, a spin, a lime flash and a short buzz.

## Non-goals

- **No score, no misses, no game over, no high score.** These were built in the mockup and removed on purpose. It is a toy, not a game.
- No loading screen or splash before home. Home *is* the splash.
- No change to the in-game screens, the join flow after a code is entered, or the organiser flow.

## Anti-goals (a failure even if it works)

- **The buttons must always work.** A tap on a button must never count as a tap on the toy, and the toy must never cover a button.
- **Never an off-model logo.** When the j is home, the logo must match `logo-volt.png` exactly, with no letters shifted.
- **No battery or heat cost.** No animation runs while the tab is hidden.
- **Reduced motion is respected.** No spinning or bouncing for people who ask the system for less motion.
- No em-dashes in any player-facing copy (standing rule).

## The screen

From top to bottom, on a phone:

1. **The play area:** everything above the buttons. Inside it sits the logo, centred, about 240 px wide at a 290 px screen width, so it scales with the screen width. The logo is drawn as four letters, k, e, a and r, at their exact logo positions. The j is a separate piece.
2. **The buttons**, stacked at the bottom, in this order:
   - `reconnect`: only when there is a game to go back to. It is the first button, white (paper) with dark text.
   - `join game`: lime, the primary button when there is no reconnect.
   - `organise game`: the dark ghost button.
3. **The link:** `if dk how to play click here :)`, small, underlined and centred.

No tagline. The old "Real-life chase, refereed by your phone." line goes.

## The toy

**Motion:**
- The j starts near the top-left. It moves in a straight line and bounces off the four edges of the play area, like the DVD logo.
- The play area's bottom edge is the top of the buttons.
- While it flies, the j spins. It reverses its spin on every wall bounce, and spins a little faster as it speeds up.

**Catching it:**
- A tap anywhere in the play area counts when the j is within a small distance of its home spot. The mockup uses 14 px at a 290 px screen width, measured between the j's current top-left and its home top-left. Scale it with the screen.
- Any other tap does nothing. There is no penalty.
- While the j is catchable, a faint lime dashed outline shows its home spot. This is the only hint.

**On a catch:**
1. The j jumps to its home spot, turned upright, and the logo wobbles once.
2. A lime flash fades over the play area, and the phone buzzes once briefly (25 ms) where vibration is supported.
3. The j disappears and a random power-up sticker spins into the same spot. It grows from small with a slight overshoot, holds for a beat, then spins away.
   - The whole beat lasts 0.5 s.
   - The sticker is the same art and white sticker edge as the in-game stickers (`Sticker` / `stickerArt.ts`).
   - It is about 84 px at a 290 px screen width. It may overlap the e and the a for that moment; that is accepted.
   - The sticker is picked at random from all the drawings, Bomoh included. It is never the same one twice in a row.
4. The j pops back, with a quick springy scale, and launches in a new random direction, a little faster than before.

**Speed:** it starts at 1.6 px per frame at 60 fps and grows 7% per catch, up to 4.2 px per frame. Make it frame-rate independent. A fresh visit starts slow again; nothing is remembered.

**The DVD moment:** if the j glides through its home spot on its own (within 3 px), it catches itself. This is the same catch, with a longer buzz (30, 40, 60 ms). This is the "it hit the corner!" joke.

**Reduced motion:** the j sits home and the toy is still. A tap does nothing and the logo looks normal.

**Hidden tab:** the animation pauses while the page is hidden, and carries on from where it was when shown again.

## Reconnect

There is no record today of "the game this phone was last in". The app only stores a token per game (`kejar.game.<CODE>`) and one organiser session (`kejar.organiser`). So:

- **Recording it.** Add one small "last game" record on the phone: the code, the role (`player` or `organiser`) and the time. Each new record replaces the old one, so the newest wins. A phone that is both a player in one game and an organiser in another shows one `reconnect`, for whichever it touched last. *(My call: one button keeps home simple.)*
  - **Player:** write it wherever a player token is saved for a game. Today that is `Join.tsx`, `MarshalRedeem.tsx` (marshals land on `/g/<CODE>` too) and `PhoneMove.tsx`. A small helper next to `saveSession` keeps this in one place.
  - **Organiser:** write it when `HostLobby` mounts, and only if an organiser session exists on the phone.
- **Showing it.** `reconnect` shows when the record is less than 24 hours old (the builder can tune the window), and the phone still holds:
  - for a player: a token for that code (`kejar.game.<CODE>`);
  - for an organiser: an organiser session (`kejar.organiser`). That session is global and isn't tied to one game. The server checks it when they land, which is enough.
- **Where it goes.** A player goes to `/g/<CODE>`; an organiser goes to `/host/<CODE>`.
- If the game is over or gone when they land, that screen already handles it. Home doesn't ask the server first.

## Join

`join game` opens a join step instead of putting the code box on the home screen. That step is the third phone in the mockup:
- a small `JOIN GAME` eyebrow;
- `code?` as the heading;
- the 6-character code box;
- `join`;
- `scan qr`;
- `back`.

- The code box keeps today's behaviour: uppercase, 6 letters or digits, Enter or Go joins, and the button stays disabled until the code is valid. It goes to `/join/<CODE>` as now.
- `scan qr` opens the existing `Scanner` and accepts a join link or a bare code.
- `back` returns to the toy.
- This can be a state on the home route, not a new URL (builder's call).

## How to play

The link opens the existing `HowToPlay` story. It needs a side (runner or chaser), and on home there isn't one, so show the runner story in Core mode first, with `snapshot: false`. Its last card already leads on. The builder may add a small runner / chaser choice before the story if that reads better.

There is no `onReady` or `onOpened` on home: there is no game to tell. Closing the story returns to home.

## Constraints

- **Stack:** React/TS + Vite, motion/react (already used), Vitest. No new dependencies.
- **Art:** use the existing art:
  - `public/logo-volt.png` for the logo;
  - the sticker drawings in `app/src/game/stickerArt.ts`.

  The separate letter images (k, e, a, r and the j, cut from the logo with the j's crop box 190,12 to 516,531 in the 900 × 543 frame) are in the mockup folder. Copy them into `app/public/` or `app/src/assets/`.
- **Visual language:** existing tokens only: volt `#C6FF3D`, ink `#0A0A0B`, paper `#F5F5F3`, Geist. Flat colours, no shiny textures (standing preference).
- **The game loop:**
  - It runs on one `requestAnimationFrame`, stopped on unmount, and does not re-render React every frame (move the j with a style transform).
  - Port the mockup's toy logic (`index.html`, the script from "const phone" down). It is the reference for:
    - the home-spot geometry;
    - the spin rule;
    - the catch, wobble, flash and sticker beat;
    - the DVD self-catch.

    Add frame-rate independence and the changes in this document. Treat its numbers as the starting tune.
- **The letters.**
  - `letter-{k,e,a,r}-volt.png` are each a full 900 × 543 frame with the letter already in place, so stack all four at 0,0, the same size as the logo, and the logo comes out exact.
  - `j-volt.png` is the j cut to its box: 190,12 to 516,531 in that frame.
  - Only the `-volt` versions are needed; the `-ink`, `miss-*` and `digit-*` files in the mockup folder are leftovers.
  - `Home` may drop `Wordmark` for this. No other code depends on Home's text (checked).
- **Measuring the play area.** Measure it from the layout, with a ResizeObserver on the button block, so the j never goes under a button whether or not `reconnect` shows.
- **When the toy pauses.** It pauses while the join step or the how-to-play story is open, and while the tab is hidden.
- **Reduced motion.** `useReducedMotion` from motion/react is enough; it already follows live changes. With reduced motion the dashed home-spot outline never shows.

## Tests (what "done" means)

- Home renders the logo, `join game`, `organise game` and the how-to-play link. `reconnect` is absent with no last game.
- `reconnect` appears for a recent last game with a token, and links to the right place for a player and for an organiser. It is absent once the game is older than the window.
- `join game` shows the join step. The join step keeps today's three code-box tests (Enter joins, short codes don't, the button joins). `back` returns.
- `organise game` goes to `/host/new`.
- The toy, with a fake clock or injected positions:
  - a tap within the catch distance catches;
  - a tap outside does nothing;
  - a tap on a button is never a catch;
  - a catch shows a sticker and then the j again;
  - two catches in a row never show the same sticker;
  - reduced motion leaves the j home and still.
- The existing `Home.test.tsx` cases move to the join step.

## Left to the builder

- Component split, file names and the exact join-step and reconnect markup.
- The reconnect window and storage key name.
- Tuning: catch distance, speeds and the sticker size, within the feel described above.
- Whether to add the runner / chaser choice before how to play.
