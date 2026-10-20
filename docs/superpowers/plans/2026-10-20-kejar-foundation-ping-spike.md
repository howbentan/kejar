# Kejar Plan 1: Foundation + Ping Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Kejar web app foundation and prove, in a real park, whether a locked phone reliably gets a check-in alert and sends its location. The result is a pass/fail against the bar in the spec.

**Architecture:**
- A Vite + React + TypeScript installable web app (PWA) lives in `app/`. A plain service worker (`app/public/sw.js`) receives push alerts.
- Supabase stores test devices, pings, delivery acknowledgements and check-ins.
- Two Vercel serverless functions (`app/api/`) send pushes with `web-push` and record delivery times using **server clocks only**.
- A report page computes the pass/fail.

**Tech Stack:** Vite, React, TypeScript, Vitest + @testing-library/react + jsdom, @supabase/supabase-js v2, web-push (Node), Vercel (free tier), Supabase (free tier).

**Spec:** `docs/superpowers/specs/2026-10-19-kejar-design.md` (see §7 for the pass bar and fallback, and §9 for the look). Roadmap: `docs/superpowers/plans/2026-10-20-kejar-roadmap.md`.

## Global Constraints

- Everything must run on free tiers: Supabase free, Vercel free, no paid services (spec §7).
- It's a web app only: no native apps and no app-store distribution (spec §2).
- Colours are only Volt Lime `#C6FF3D`, black `#0A0A0B` and white `#F5F5F3`. Lime is never used as text on white (spec §9).
- Fonts: Geist for text, Geist Mono for timers and numbers (spec §9).
- UI copy is English only (spec §2).
- The check-in alert text is exactly: `Ping in 30s — check in!` (spec §4.5).
- **Pass bar:** at least 90% of check-in alerts arrive within 15 seconds on locked phones, across at least 2 iPhones and 2 Androids, in a real park (spec §7).
- All latency is measured with **server** timestamps only. Phone clocks are never trusted.
- The VAPID subject must be a real `mailto:` address. Apple rejects `localhost` subjects with `403 BadJwtToken`.
- Spike tables are throwaway. They're dropped once the spike result is recorded (Task 7).

## Review Focus

1. **The iPhone isn't added to the home screen, or notifications are blocked.** The join page must say exactly what to do, not fail silently. → test in Task 3 (`pushSupport` returns `needs-install` or `denied`).
2. **A subscription has expired (push service returns 404 or 410).** Sending must mark that device inactive and still reach every other device. → test in Task 4.
3. **Location is denied or times out at check-in.** A check-in row is still recorded, with a null position and an error code, so "alert arrived but no location" shows up in the report. → test in Task 5.
4. **The same notification is tapped twice, or the page reloads.** Only one check-in per device per ping. → database unique constraint (Task 2) plus a test in Task 5 that a duplicate insert is treated as success.
5. **A ping is sent while no devices are registered, or every device is inactive.** The admin sees "0 sent", with no crash and no empty ping row skewing the stats. → test in Task 4.

## Prerequisites the owner does by hand (Claude must not create accounts)

- Create a free **Supabase** project and copy its URL and anon key, plus the service role key (server only).
- Create a free **Vercel** account, connected to GitHub or using the Vercel CLI.
- Have 2+ iPhones (iOS 16.4 or later) and 2+ Android phones available for the field test.

## File Structure

```
.gitignore                      # node_modules, .env*, .superpowers/, dist
app/
  package.json  vite.config.ts  tsconfig*.json  index.html  vercel.json
  public/
    manifest.webmanifest        # name "kejar.", display "standalone", theme #0A0A0B
    icon-192.png icon-512.png   # lime full stop on black
    sw.js                       # push + notificationclick handlers
  src/
    main.tsx  App.tsx           # App picks a screen by path
    routes.ts                   # routeFor(pathname)
    styles/tokens.css           # colours, fonts, base styles
    lib/supabase.ts             # browser client
    spike/
      types.ts                  # Device, Ping, Ack, Checkin, Platform
      push.ts                   # pushSupport, urlBase64ToUint8Array, subscribe
      device.ts                 # getDeviceId, platformOf
      checkin.ts                # readPosition, submitCheckin
      stats.ts                  # summarise, passesBar
      SpikeJoin.tsx  SpikeAdmin.tsx  SpikeReport.tsx
      *.test.ts(x)
  api/
    _lib/ping.ts                # sendPingToDevices (pure, testable)
    _lib/ping.test.ts
    send-ping.ts                # POST: create ping, push to active devices
    ack.ts                      # POST: record server receipt time
supabase/migrations/0001_spike.sql
docs/superpowers/spike-results.md   # written in Task 7
```

---

### Task 1: Repo and app shell in Kejar style

**Files:**
- Create: `.gitignore`
- Create: `app/` (Vite react-ts template)
- Create: `app/src/routes.ts`, `app/src/styles/tokens.css`, `app/public/manifest.webmanifest`, the two icons
- Modify: `app/src/App.tsx`, `app/src/main.tsx`, `app/index.html`
- Test: `app/src/routes.test.ts`, `app/src/App.test.tsx`

**Interfaces:**
- Produces: `type Route = 'home' | 'spike-join' | 'spike-admin' | 'spike-report' | 'not-found'` and `routeFor(pathname: string): Route` in `app/src/routes.ts`.
- Produces: CSS custom properties `--volt:#C6FF3D; --black:#0A0A0B; --white:#F5F5F3; --font:'Geist'; --mono:'Geist Mono'` in `tokens.css`.

- [ ] **Step 1: Start the repo.** At the repo root run `git init`, add `.gitignore` (`node_modules/`, `dist/`, `.env*`, `.superpowers/`, `.vercel/`), and commit the existing `docs/` as `chore: initial docs`. Then run `git checkout -b plan-1-foundation-spike`.
- [ ] **Step 2: Scaffold the app.** Run `npm create vite@latest app -- --template react-ts`, then in `app/`: `npm i @supabase/supabase-js` and `npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom`. Add `"test": "vitest run"` to the scripts, and set Vitest `environment: 'jsdom'` in `vite.config.ts`.
- [ ] **Step 3: Write the failing tests.**

```ts
// routes.test.ts
expect(routeFor('/')).toBe('home');
expect(routeFor('/spike')).toBe('spike-join');
expect(routeFor('/spike/')).toBe('spike-join');
expect(routeFor('/spike/admin')).toBe('spike-admin');
expect(routeFor('/spike/report')).toBe('spike-report');
expect(routeFor('/nope')).toBe('not-found');
```

```tsx
// App.test.tsx — home shows the wordmark
render(<App />);  // with window.history.pushState({}, '', '/')
expect(screen.getByText('kejar')).toBeInTheDocument();
expect(screen.getByText('.')).toHaveStyle({ color: 'var(--volt)' });
```

- [ ] **Step 4: Run `npm test`.** Expected: FAIL (`routeFor` not defined).
- [ ] **Step 5: Implement the shell.**
  - `routeFor` uses an exact match after trimming one trailing slash.
  - `App` renders a screen per route, with placeholder components until Tasks 5–6. The home screen shows the wordmark `kejar` plus a `.` in `var(--volt)` on black.
  - `tokens.css` loads Geist and Geist Mono from Google Fonts and sets the body to `--black` background and `--white` text.
  - `index.html` links the manifest and sets `<meta name="theme-color" content="#0A0A0B">`.
  - The manifest has `name` and `short_name` `kejar.`, `start_url` `/spike`, `display` `standalone`, colours `#0A0A0B`, and both icons.
  - Add `app/vercel.json` with a rewrite of every non-`/api/` path to `/index.html`.
- [ ] **Step 6: Run `npm test` and `npm run build`.** Expected: tests PASS and the build succeeds.
- [ ] **Step 7: Commit.** `feat: app shell with routes and Kejar tokens`

### Task 2: Spike database and client

**Files:**
- Create: `supabase/migrations/0001_spike.sql`, `app/src/lib/supabase.ts`, `app/src/spike/types.ts`, `app/.env.example`

**Interfaces:**
- Produces, in `app/src/spike/types.ts`:

```ts
export type Platform = 'ios' | 'android' | 'other';
export interface Device { id: string; label: string; platform: Platform; subscription: PushSubscriptionJSON; active: boolean; created_at: string }
export interface Ping { id: string; sent_at: string; sent_count: number }
export interface Ack { ping_id: string; device_id: string; received_at: string }
export interface Checkin { ping_id: string; device_id: string; created_at: string; lat: number | null; lng: number | null; accuracy_m: number | null; error: string | null }
```

- Produces: `supabase` (browser client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) in `app/src/lib/supabase.ts`.

- [ ] **Step 1: Write the migration.** It creates four tables:
  - `spike_devices` (`id uuid pk`, `label text not null`, `platform text not null`, `subscription jsonb not null`, `active bool default true`, `created_at timestamptz default now()`)
  - `spike_pings` (`id uuid pk default gen_random_uuid()`, `sent_at timestamptz default now()`, `sent_count int not null default 0`)
  - `spike_acks` (`ping_id`, `device_id`, `received_at timestamptz default now()`, primary key on `(ping_id, device_id)`)
  - `spike_checkins` (`ping_id`, `device_id`, `created_at timestamptz default now()`, `lat`, `lng`, `accuracy_m float8 null`, `error text null`, **unique on `(ping_id, device_id)`**)

  Turn on row-level security with anon `select` on all four tables, plus anon `insert`/`upsert` on `spike_devices` and `spike_checkins` only. Acks and pings are written by the server using the service role. Add a comment that these tables are throwaway.
- [ ] **Step 2: Owner applies it.** Run the SQL in the Supabase SQL editor, then fill `app/.env.local` from `.env.example` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `VITE_VAPID_PUBLIC_KEY`). Generate the VAPID keys with `npx web-push generate-vapid-keys`.
- [ ] **Step 3: Verify.** Run `npm run dev`. In the browser console, `await supabase.from('spike_pings').select('*')` returns `{ data: [], error: null }`.
- [ ] **Step 4: Commit.** `feat: spike schema and supabase client`

### Task 3: Push subscription on the phone

**Files:**
- Create: `app/src/spike/push.ts`, `app/src/spike/device.ts`, `app/public/sw.js`
- Test: `app/src/spike/push.test.ts`, `app/src/spike/device.test.ts`

**Interfaces:**
- Produces, in `push.ts`:
  - `type PushSupport = 'ok' | 'needs-install' | 'unsupported' | 'denied'`
  - `pushSupport(env: { ua: string; standalone: boolean; hasPushManager: boolean; permission: NotificationPermission }): PushSupport`
  - `urlBase64ToUint8Array(b64: string): Uint8Array`
  - `subscribe(vapidPublicKey: string): Promise<PushSubscriptionJSON>`, which registers `/sw.js`, requests permission and subscribes with `userVisibleOnly: true`
- Produces, in `device.ts`:
  - `getDeviceId(storage: Storage): string`, a UUID kept in `localStorage` under `kejar.deviceId`
  - `platformOf(ua: string): Platform`
- Produces the service worker contract:
  - The push payload is JSON `{ pingId: string, deviceId: string }`.
  - On `push`, it shows a notification titled `kejar.` with body `Ping in 30s — check in!`, and calls `fetch('/api/ack', { method:'POST', body: JSON.stringify({ pingId, deviceId }) })` inside `event.waitUntil` together with showing the notification.
  - On `notificationclick`, it focuses an existing client or opens `/spike?ping=<pingId>`.

- [ ] **Step 1: Write the failing tests.**

```ts
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36';
expect(pushSupport({ ua: IOS, standalone: false, hasPushManager: false, permission: 'default' })).toBe('needs-install');
expect(pushSupport({ ua: IOS, standalone: true, hasPushManager: true, permission: 'default' })).toBe('ok');
expect(pushSupport({ ua: ANDROID, standalone: false, hasPushManager: true, permission: 'denied' })).toBe('denied');
expect(pushSupport({ ua: ANDROID, standalone: false, hasPushManager: false, permission: 'default' })).toBe('unsupported');
expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
expect(platformOf(IOS)).toBe('ios'); expect(platformOf(ANDROID)).toBe('android'); expect(platformOf('curl/8')).toBe('other');
const s = new Map(); const storage = { getItem: (k:string)=>s.get(k) ?? null, setItem: (k:string,v:string)=>{ s.set(k,v); } } as Storage;
expect(getDeviceId(storage)).toBe(getDeviceId(storage)); // stable across calls
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `push.ts`, `device.ts` and `sw.js`.**
  - `pushSupport` checks in this order: `denied` → iOS and not standalone → `needs-install` → no PushManager → `unsupported` → `ok`.
  - `platformOf` treats `iPhone|iPad|iPod` as `ios` and `Android` as `android`.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: push subscription and service worker`

### Task 4: Server functions to send pings and record acks

**Files:**
- Create: `app/api/_lib/ping.ts`, `app/api/send-ping.ts`, `app/api/ack.ts`
- Test: `app/api/_lib/ping.test.ts`
- Modify: `app/package.json` (add `web-push` and `@vercel/node`), `vite.config.ts` (include `api/**/*.test.ts` in Vitest with environment `node` for that folder)

**Interfaces:**
- Produces, in `ping.ts`:

```ts
export type Sender = (subscription: PushSubscriptionJSON, payload: string) => Promise<void>; // rejects with { statusCode?: number }
export interface SendResult { sent: number; expired: string[]; failed: string[] }
export async function sendPingToDevices(pingId: string, devices: Device[], send: Sender): Promise<SendResult>
```

- Produces the HTTP endpoints:
  - `POST /api/send-ping` → `200 { pingId: string | null, sent, expired, failed }`
    - Loads devices where `active = true`.
    - If there are none, returns `pingId: null` without inserting a ping row.
    - Otherwise inserts the `spike_pings` row first (so `sent_at` is the server time before sending), sends to all devices in parallel, writes `sent_count`, and sets `active = false` for expired devices.
    - Uses `webpush.sendNotification(sub, payload, { TTL: 60, urgency: 'high' })`.
  - `POST /api/ack` with body `{ pingId, deviceId }` → upserts into `spike_acks` with the database default `received_at = now()` and returns `204`. It ignores duplicates.
  - Both use the service role key on the server only, with `webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)`.

- [ ] **Step 1: Write the failing tests.**

```ts
const dev = (id: string): Device => ({ id, label: id, platform: 'android', subscription: { endpoint: 'https://x/'+id } as any, active: true, created_at: '' });
it('sends to every device with its own payload', async () => {
  const calls: string[] = [];
  const r = await sendPingToDevices('p1', [dev('a'), dev('b')], async (_s, p) => { calls.push(p); });
  expect(r).toEqual({ sent: 2, expired: [], failed: [] });
  expect(calls.map(c => JSON.parse(c))).toEqual([{ pingId: 'p1', deviceId: 'a' }, { pingId: 'p1', deviceId: 'b' }]);
});
it('marks 404/410 as expired and keeps going', async () => {
  const r = await sendPingToDevices('p1', [dev('a'), dev('b'), dev('c')], async (s) => {
    if (s.endpoint!.endsWith('a')) throw { statusCode: 410 };
    if (s.endpoint!.endsWith('b')) throw { statusCode: 500 };
  });
  expect(r).toEqual({ sent: 1, expired: ['a'], failed: ['b'] });
});
it('handles no devices', async () => {
  expect(await sendPingToDevices('p1', [], async () => {})).toEqual({ sent: 0, expired: [], failed: [] });
});
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `sendPingToDevices`** (`Promise.allSettled`, where a `statusCode` of 404 or 410 counts as expired), then the two handlers as described above.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: send-ping and ack functions`

### Task 5: Spike screens (join, check-in, admin)

**Files:**
- Create: `app/src/spike/checkin.ts`, `app/src/spike/SpikeJoin.tsx`, `app/src/spike/SpikeAdmin.tsx`
- Test: `app/src/spike/checkin.test.ts`, `app/src/spike/SpikeJoin.test.tsx`
- Modify: `app/src/App.tsx` (connect the routes)

**Interfaces:**
- Produces, in `checkin.ts`:
  - `type PositionResult = { lat: number; lng: number; accuracy_m: number } | { error: 'denied' | 'unavailable' | 'timeout' | 'unsupported' }`
  - `readPosition(geo: Geolocation | undefined, timeoutMs = 10000): Promise<PositionResult>`, using `enableHighAccuracy: true, maximumAge: 0`
  - `submitCheckin(db, pingId: string, deviceId: string, pos: PositionResult): Promise<'ok' | 'duplicate'>`, which inserts one row and treats a unique violation (Postgres `23505`) as `'duplicate'`, not an error
- Consumes: `pushSupport`, `subscribe`, `getDeviceId`, `platformOf` (Task 3); `supabase` (Task 2).

- [ ] **Step 1: Write the failing tests.**

```ts
const geo = (impl: any) => ({ getCurrentPosition: impl }) as Geolocation;
expect(await readPosition(geo((ok: any) => ok({ coords: { latitude: 3.1, longitude: 101.6, accuracy: 12 } }))))
  .toEqual({ lat: 3.1, lng: 101.6, accuracy_m: 12 });
expect(await readPosition(geo((_: any, err: any) => err({ code: 1 })))).toEqual({ error: 'denied' });
expect(await readPosition(geo((_: any, err: any) => err({ code: 3 })))).toEqual({ error: 'timeout' });
expect(await readPosition(undefined)).toEqual({ error: 'unsupported' });
// submitCheckin with a fake db whose insert resolves { error: { code: '23505' } } → 'duplicate'
// submitCheckin with { error: 'denied' } inserts lat/lng/accuracy_m null and error 'denied'
```

```tsx
// SpikeJoin.test.tsx — the needs-install case explains what to do
// render with pushSupport mocked to 'needs-install'
expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
expect(screen.queryByRole('button', { name: /turn on alerts/i })).toBeNull();
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement the screens.**
  - **`SpikeJoin`** (`/spike`):
    - Shows a device label input (e.g. "Aina iPhone 13") and the support state.
    - `needs-install`: step-by-step text for Share → **Add to Home Screen**, then open from the icon.
    - `denied`: how to re-enable notifications in Settings.
    - `ok`: a **Turn on alerts** button that calls `subscribe` and upserts `spike_devices` with `getDeviceId`, `platformOf(navigator.userAgent)` and the label.
    - When the URL has `?ping=<id>`, it immediately runs `readPosition` then `submitCheckin`, and shows "Checked in ✓", "Already checked in" or the location error.
    - Kejar style: black background, Geist, lime pill buttons with black text.
  - **`SpikeAdmin`** (`/spike/admin`):
    - Lists devices (label, platform, active).
    - A **Send ping** button posts to `/api/send-ping` and shows `sent / expired / failed`, or "No active devices" when `pingId` is null.
    - Shows the last 10 pings.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: spike join, check-in and admin screens`

### Task 6: Stats and pass/fail report

**Files:**
- Create: `app/src/spike/stats.ts`, `app/src/spike/SpikeReport.tsx`
- Test: `app/src/spike/stats.test.ts`

**Interfaces:**
- Produces:

```ts
export interface DeviceStats { deviceId: string; label: string; platform: Platform; pings: number; arrivedWithin15s: number; arrived: number; checkins: number; checkinsWithLocation: number; medianArrivalMs: number | null }
export function summarise(devices: Device[], pings: Ping[], acks: Ack[], checkins: Checkin[]): DeviceStats[]
export function passesBar(stats: DeviceStats[]): { pass: boolean; arrivalRate: number; iosDevices: number; androidDevices: number; reasons: string[] }
```

- Rules:
  - A device counts a ping only if the ping was sent at or after that device's `created_at`.
  - Arrival time = `ack.received_at − ping.sent_at`.
  - `arrivalRate` = sum of `arrivedWithin15s` ÷ sum of `pings`, across all devices.
  - To pass, `arrivalRate >= 0.9` **and** at least 2 `ios` and at least 2 `android` devices, each with `pings >= 1`.
  - `reasons` lists each failed condition in plain English.

- [ ] **Step 1: Write the failing tests.**

```ts
// 2 iOS + 2 Android devices, 10 pings each; one Android late (20 s) on 1 ping → arrivalRate 39/40 = 0.975 → pass
// same but each device misses 2 pings → 32/40 = 0.8 → pass false, reasons includes 'Only 80% of alerts arrived within 15 s (need 90%)'
// only 1 iOS device → pass false, reasons includes 'Need at least 2 iPhones (have 1)'
// a ping sent before a device registered is not counted for that device
// medianArrivalMs is null for a device with no acks
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `summarise` and `passesBar`.** Then build `SpikeReport` (`/spike/report`), which fetches all four tables, shows a row per device, and shows a large **PASS** (lime) or **FAIL** (white) with the reasons.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: spike report with pass bar`

### Task 7: Deploy and field test (owner plus builder)

**Files:**
- Create: `docs/superpowers/spike-results.md`
- Create: `supabase/migrations/0002_drop_spike.sql` (applied only after results are recorded)

- [ ] **Step 1: Deploy.** Deploy `app/` to Vercel (root directory `app`), set all env vars from Task 2 in the Vercel project, and open `https://<deployment>/spike` on a laptop. Expected: the join page loads, and `/spike/admin` lists no devices.
- [ ] **Step 2: Smoke test.** On one Android phone, open `/spike`, turn on alerts, lock the phone, and press **Send ping** in admin. Expected: the notification appears; tapping it shows "Checked in ✓"; the report shows one ack and one check-in.
- [ ] **Step 3: Field test in a park.**
  - Use at least 2 iPhones (added to the home screen) and 2 Androids.
  - Send **10 pings at 5-minute intervals**, with phones locked in pockets and players walking around.
  - Tap each alert when it arrives.
- [ ] **Step 4: Record the results** in `docs/superpowers/spike-results.md`:
  - a screenshot or table of the report
  - PASS/FAIL
  - each device's model and OS version
  - anything odd, such as late alerts on one brand or location errors
- [ ] **Step 5: Decide.**
  - **PASS:** plan 2 uses push check-ins.
  - **FAIL:** plan 2 uses the fallback from spec §7: a fixed, announced check-in schedule with an on-screen countdown and buzzing while the page is open.
  - Write the decision at the top of `spike-results.md`.
- [ ] **Step 6: Clean up.** Apply `0002_drop_spike.sql` (drop the four `spike_*` tables) once the results are saved. Keep the spike code; plan 2 reuses `push.ts`, `device.ts`, `checkin.ts` and `sw.js`.
- [ ] **Step 7: Commit.** `docs: ping spike results and decision`
