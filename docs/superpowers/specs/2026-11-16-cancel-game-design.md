# Cancel a game

Short design, agreed in chat on 2026-11-16.

## Why

An organiser who has created or started a game has no way to call it off. The only endings are the clock running out or every runner being caught, and both give results.

## Decided (by the user)

- **The button:** the organiser gets a red **Cancel game** button in the lobby and on their screen during the game. A first tap asks "Cancel game ABC234 for everyone?", and a red **Yes, cancel game** confirms it.
- **What a cancel does:** it throws the game away. There are no results and no rating. Everyone (runners, chasers, marshals and the organiser) sees "Game cancelled" with a way home.
- **Who can cancel:** only the organiser who created the game.

## Approaches

1. **Recommended, and chosen:** a `cancelled_at` column. Cancelling also sets `ended_at`, so everything that already stops on an ended game stops here too:
   - the clock;
   - the game's hold on its legendary cards;
   - the "open games" lists;
   - the 30-day data wipe, which counts from `ended_at`.

   The game loader refuses every action on a cancelled game except `state`, which returns a stripped view with `cancelled: true`.
2. A new `'cancelled'` phase. Every `phase` switch across the app would have to learn it, which is far more to change for the same result.
3. Deleting the game. Players would lose the page mid-game with no explanation, and safety records (SOS, reports) would go with it.

## Design

- **Data:**
  - `Game.cancelled_at?: string | null`.
  - Migration `0022_cancel_game.sql` adds the column (guarded, so it's safe to run again).
  - `GameStore.cancelGame(gameId, atIso): Promise<boolean>` sets `cancelled_at` and `ended_at`, but only while `ended_at` is null.
- **The `cancelGame` action:**
  - It takes the organiser's token. It is refused with 403 for anyone else, and with 409 once the game has ended.
  - Cancelling an already-cancelled game returns `{ ok: true }` again, so a double tap is harmless.
  - It pushes "The organiser cancelled game ABC234." to every player still in the game.
- **Other actions** on a cancelled game get 410 "The organiser cancelled this game." `state` still answers, and its view carries `cancelled: true` and none of the game's data.
- **Client:**
  - A new `Cancelled` screen, shown by GameScreen (players, marshals, the organiser mid-game) and HostLobby. The reconnect card on home disappears for a cancelled game.
  - A `CancelGame` component (the red button, then the confirm step) in HostLobby under Start game, and in MarshalLive for the organiser while the game runs.
  - A new `--danger` colour and `.btn-danger` style.

## Left to the builder

- The confirm step's exact layout. It should use the existing button styles and the new red.
