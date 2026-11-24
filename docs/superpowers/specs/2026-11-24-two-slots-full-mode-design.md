# Two power-up slots in Full mode

**Date:** 2026-11-24
**Status:** approved by the owner in conversation. Short design with its plan.

## Why
- Give players room for combos (two power-ups at once).
- Make Full mode clearly different from Core, which keeps one slot.

## Rules (owner's calls)
- **Slots:** Full mode has **2** slots and Core has **1**. A slot is filled by a card you hold, or by a used card whose
  effect is still running. A station scan is refused (`hand-full`) only when the slots are full.
- **Stacking:** two different cards may run at the same time (approach A).
  - **Guard:** the same card can't run twice at once. You can hold a second one, but using it while the first runs is
    refused (`effect-running`).
- **Legendaries:**
  - **Dato Seri** takes **both** slots while held, until it's used through Settle.
  - **Super Ring** takes **one** slot. It runs in the background while it waits and during house arrest, and the other
    slot stays free.
- **Unchanged:**
  - A doubled card (Nasi Lemak KFC, PKP twin) is still one slot, shown "×2".
  - Toyol and Ah Long still steal one random card.
  - A card waiting for its pick fills one slot until it's picked.
- **Balance:** no extra rules. After a playtest, check how long Dikejar survive. If they run away with it, the fallback
  is "Durian and Ponteng can't be on together".

## Approaches considered
- **A. Two equal slots, both can run (chosen).** Real combos, plus one guard against the same card running twice.
- **B. Two slots, one effect at a time.** Safer, but gives sequences rather than combos.
- **C. A separate legendary slot.** Barely creates combos.

## Plan
1. **`shared/powerups.ts`**
   - `slotCapacity(mode): 1 | 2`.
   - `slotsUsed(powerUps, playerId, pings, now, me)`: counts filled slots, with Dato as 2, a twin pair as one, and
     taken cards as none.
   - `slotBusy(..., capacity = 1, need = 1)`: answers the first filling card when `slotsUsed + need > capacity`.
   - `runningEffects(...)`: every running kind (a twin pair counted once).
   - Tests: Full holds a second card; Dato fills both; Ring fills one; a twin pair is one slot; Core is unchanged.
2. **Claims** (`judgeClaim`, `judgeDatoClaim`, `judgeRingClaim`)
   - They take `slots`: Dato needs 2 free (capped at the capacity), and Ring and deck cards need 1.
   - The claim actions pass `slotCapacity(game.settings.mode)`.
   - Tests: a Full runner holding one card can claim a station, a Dato holder can't, and a Ring holder can.
3. **`usePowerup`:** refuse `effect-running` only when a card **of the same kind** is running.
   - Tests: Full runs Durian then Ponteng, and a second Durian is refused while the first runs.
4. **View and hand**
   - The view adds `activePowerUps: PowerUpKind[]`.
   - `PowerUpHand` draws `slotCapacity` slots side by side. Dato spans both, a running card shows "ACTIVE", and free
     slots show empty.
   - Tests: Full shows two slots; Dato is one wide slot; Core shows one.
5. Full suite, a check on screen, commit.
