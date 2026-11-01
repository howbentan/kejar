-- Kejar check-ins and auto-jail (checkins design §4.4). Tracks when a runner was last released
-- (jailbreak today; later the dare reel's free card and Dato Seri's Settle), so the
-- missed-check-in streak starts fresh after a release instead of at the chase start.
alter table players add column freed_at timestamptz;
