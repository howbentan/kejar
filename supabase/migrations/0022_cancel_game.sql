-- Cancelling a game (cancel design, 2026-11-16): the organiser calls a game off, with no results. Data model only: one
-- column. Cancelling also sets ended_at, so everything that stops on an ended game stops on a cancelled one. Safe to
-- run again. Run it before the code that reads this goes live.

alter table games add column if not exists cancelled_at timestamptz;
