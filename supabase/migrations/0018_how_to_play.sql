-- How to play (briefing). Safe to run again. One transaction; run it before the code that reads these columns goes live.

begin;

-- When the organiser tapped Brief the players: the story opens on every player's phone from then on. Set once.
alter table games add column if not exists briefed_at timestamptz;

-- When each player opened the story, and when they tapped I'm ready. Each is set once.
alter table players add column if not exists brief_opened_at timestamptz;
alter table players add column if not exists brief_ready_at timestamptz;

commit;
