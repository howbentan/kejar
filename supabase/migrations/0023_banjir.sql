-- Banjir Kilat, the flood (design 2026-11-16): a free runner in the water has 30 s to get out. Data model only: when
-- each runner's 30 s started. The flood itself (its spot and waterlines) is worked out from the game, not stored.
-- Safe to run again. Run it before the code that reads this goes live.

alter table players add column if not exists flooded_at timestamptz;
