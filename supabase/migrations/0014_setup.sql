-- Organiser setup: the packing list. `kit` holds the ticks and the placed cards: { "ticks": { id: label }, "placed": { id: true } }.
-- Safe to run again: one transaction, every step guarded. Run it before the code that reads this column goes live.

begin;

alter table games add column if not exists kit jsonb not null default '{}'::jsonb;

commit;
