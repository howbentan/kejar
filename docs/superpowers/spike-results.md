# Ping spike results

**Decision (owner, 2026-10-20): proceed with push check-ins.** Plan 2 builds check-ins so a per-game setting switches between `push` (default) and `schedule` (spec §7 fallback). That way, an iPhone result arriving later only changes a setting.

## What was tested
- Deployed at https://kejar-eosin.vercel.app (Vercel), with Supabase connected.
- **1 Android phone** (owner's): joined, turned on alerts, locked; ping sent from `/spike/admin`. The alert arrived, tapping it checked in with a location, and the report showed 1/1 on time.

## Not tested
- **iPhones** (none available). This is the main open risk, since iOS web push requires a home-screen install and Apple is stricter.
- The walking/pocket test over 10 pings in a park.

## Formal bar (spec §7)
**Not met.** It needs at least 2 iPhones and 2 Androids, and only 1 Android was tested. The owner accepted the risk.

## Follow-ups
- Test at least 2 iPhones before the first paid event. The first free friends game also serves as this test.
- The spike tables stay in place for now. Apply `supabase/migrations/0002_drop_spike.sql` once they're no longer useful.
