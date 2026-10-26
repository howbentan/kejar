# Kejar Plan 4a: organiser accounts, invites, and marshal pre-assignment

**Status:** Design approved by the owner (2026-10-26). Ready for an implementation plan.
**Part of:** Plan 4 (Arena setup), split into two sequential pieces. This spec is piece 1 only. Piece 2 — OpenStreetMap park import, boundary/no-go/walk-only zone editing, station and jail placement — is a separate future spec that depends on this one (arenas need an organisation to belong to, which this piece creates).
**Related:** `docs/superpowers/specs/2026-10-19-kejar-design.md` (base design), `docs/superpowers/plans/2026-10-20-kejar-roadmap.md`, `docs/HANDOFF.md`

## 1. Why

Today, nobody has an account. Whoever creates a game gets a one-off secret (`hostKey`) scoped to that single game, stored in that browser's `localStorage` (`app/src/game/session.ts`, `app/src/game/auth.ts`). There is no persistent organiser identity, no way to hand game-creation power to anyone else, and no concept of an organisation that owns a reusable library of arenas.

Marshals do **not** need to change. They already join a game anonymously through the shared link, type a name, and get assigned — that flow already works and isn't part of this gap. The actual gap is: only the device that created a game can act as its organiser, and that power can't be delegated to a second trusted person (e.g. a business partner running a parallel event).

## 2. What this builds

1. **Peer organiser accounts** — the owner can invite a second (and later, more) organiser via a WhatsApp-shareable link. Once redeemed, that person has full organiser powers: create games, and (once Plan 4b ships) manage the shared arena library.
2. **Marshal pre-assignment links** — the organiser can designate specific people as marshal *before* they join, by sending them a personal link. Opening it joins them straight into that game as marshal, skipping the "join, then wait to be manually assigned" step.
3. **Lobby role-assignment UI change** — the manual runner/chaser picker is removed from the lobby roster. "Shuffle roles" (which already keeps marshals fixed and randomly splits the rest, `shared/teams.ts:shuffleRoles`) becomes the only way those two roles are decided. The manual "mark as marshal" pill stays as a fallback for on-the-spot promotion.

## 3. Out of scope (deferred to Plan 4b or later)

- Arenas belonging to an organisation, OpenStreetMap import, zone/station/jail editing — Plan 4b.
- Removing or demoting an existing organiser (only creating/re-linking is covered here).
- Any email, SMS, or WhatsApp Business API integration — explicitly rejected in favour of plain shareable links.
- Self-service device recovery for an organiser who loses their phone — only the owner can issue a fresh link for now.
- Multiple simultaneous devices per organiser — explicitly one-device-at-a-time (owner's decision, 2026-10-26).

## 4. Organiser accounts

### 4.1 Model

Two new entities:

- **Organisation** — just an identity to hang organisers off of. One row exists for now (the owner's). Modelled as a real entity rather than a special case, so Plan 4b can attach arenas to it without a schema change.
- **Organiser** — belongs to one organisation; holds the currently-valid session credential for that person.

### 4.2 Bootstrapping the first organiser (the owner)

There's no self-signup, so the very first organiser (the owner) needs to be seeded once. This reuses the normal invite-redemption path rather than special-casing it **(Claude's call)**: a one-time setup script (alongside the existing numbered `.sql` migrations) creates the Organisation row, the owner's Organiser row, and one `OrganiserInvite` row with no expiry. The script prints the resulting link once; the owner opens it on their phone, which runs through the exact same redemption action every future invite uses. No separate "owner bootstrap" code path to maintain.

### 4.3 Inviting a peer organiser

- The owner (or, once they exist, another organiser) generates an invite link for a named person.
- The link is a single-use secret token, scoped to the organisation, expiring 48 hours after creation if unredeemed **(Claude's call on the window — easy to tune)**. This directly answers the concern raised during brainstorming: a leaked or old WhatsApp forward can't mint a new organiser indefinitely.
- Sent as a plain link over WhatsApp. Opening it on a phone redeems the token once (marking it used) and either creates a new Organiser row (first redemption) or re-links an existing one (see 4.4).

### 4.4 Session & device handling

- A redeemed invite establishes a persistent session on that device: a secret token stored client-side (same pattern as today's `hostKey`/player tokens), with only its hash (`hashToken`, already used for player tokens in `api/_lib/actions.ts`) kept server-side against the Organiser row.
- **One-device-at-a-time:** an Organiser row holds exactly one current session-token hash. Redeeming a *new* invite link for an already-existing organiser (a "re-link," e.g. they got a new phone) simply overwrites that hash — the old device's token silently stops matching. No explicit logout action is needed for this piece **(Claude's call — YAGNI)**.
- Only the owner can issue a re-link invite for another organiser in this piece. Self-service "I lost my phone, send me a new link" is deferred.

### 4.5 What changes for game creation

Creating a game and every host-only action (`setRoles`, pause/resume, remove player, etc.) currently authenticate via the per-game `hostKey` (`requireHost` in `api/_lib/actions.ts`). This piece replaces that check with the organiser's session token **(Claude's call)**: a logged-in organiser's games are now tied to their persistent identity instead of a disposable per-game secret. This is a cutover, not an addition — keeping both `hostKey` and organiser-sessions as parallel auth paths would be confusing and unnecessary, and the app is young enough that there's no meaningful population of live games on the old scheme to migrate.

## 5. Marshal pre-assignment links

- From the lobby (before or during the lobby phase), the organiser generates one link per intended marshal.
- Sent directly to that specific person over WhatsApp.
- Opening it still asks for their name (so the roster shows who they are) but creates their Player row with `role: 'marshal'` already set — no waiting for the organiser to assign them afterward.
- Scoped to a single game, not persistent — consistent with marshals not needing cross-game accounts.
- Expires at whichever comes first: the game leaving the lobby phase, or a fixed window after creation (6 hours **(Claude's call)**) — so it can't be reused for a different game later.

## 6. Lobby role-assignment UI change

- `HostLobby.tsx`'s per-player role picker drops the `runner`/`chaser` options for players not already marshal. Only "mark as marshal" remains as a manual override.
- "Shuffle roles" is unchanged server-side — `shuffleRoles` in `shared/teams.ts` already keeps existing marshals fixed and randomly splits everyone else (~1-in-4 chaser). It becomes the *only* way runner/chaser get decided.
- The server-side `setRoles` action itself is **not** locked down to match (it still accepts any manual role assignment) — this is a UI simplification for the organiser's workflow, not a new permission boundary **(Claude's call — the organiser is already a trusted actor for their own game; no need to restrict the API they already have full access to)**.

## 7. Data model

New tables (naming follows the existing lower-snake-case migration style, e.g. `safety_records` from `0005_safety.sql`):

| Table | Key columns |
|---|---|
| `organisations` | `id`, `name`, `created_at` |
| `organisers` | `id`, `organisation_id`, `name`, `created_at`, `session_token_hash`, `session_created_at` |
| `organiser_invites` | `id`, `organisation_id`, `token_hash`, `created_at`, `expires_at`, `redeemed_at`, `redeemed_by_organiser_id` (null until redeemed; set on a fresh organiser or re-link) |
| `marshal_invites` | `id`, `game_id`, `token_hash`, `created_at`, `expires_at`, `redeemed_at`, `redeemed_player_id` |

`games` gains an `organiser_id` column (replacing reliance on the per-game `hostKey` for authorization).

## 8. API actions (new or changed)

| Action | Who can call it | Does |
|---|---|---|
| `createOrganiserInvite` | Any organiser (owner included) | Creates an `organiser_invites` row, returns the shareable link |
| `redeemOrganiserInvite` | Public (holder of the link) | Validates token not expired/already redeemed; creates or re-links an `organisers` row; returns a session token |
| `createGame` (existing, changed) | Organiser session (was: anonymous, issuing a fresh `hostKey`) | Creates the game tied to `organiser_id` |
| `setRoles`, pause/resume, remove-player, etc. (existing, changed) | Organiser session (was: `hostKey`) | Unchanged behaviour, new auth check |
| `createMarshalInvite` | Organiser session, game in lobby phase | Creates a `marshal_invites` row, returns the shareable link |
| `redeemMarshalInvite` | Public (holder of the link) | Validates token not expired/redeemed and game still in lobby phase; creates the Player row with `role: 'marshal'`; returns a normal player token (same shape as the existing join flow) |

## 9. Security notes

- This is capability-by-possession, same trust model the whole app already uses for `hostKey` and player tokens — holding the link *is* the credential, with no independent identity check (no email/phone verification). Acceptable for a small, personally-trusted circle; not a hidden gap, a deliberate and stated trade-off.
- All tokens are random, high-entropy strings; only their hash is ever stored server-side, matching the existing `hashToken` pattern.
- Both invite types are single-redemption and time-boxed, directly addressing the "can't start games on their own after some time" concern raised during brainstorming.

## 10. Testing approach

Follows existing project conventions:
- Unit tests for the new shared logic (token/expiry validation) alongside `shared/teams.test.ts`-style tests.
- API action tests mirroring `api/_lib/actions.test.ts` (invite creation, redemption, expiry, re-link, auth-rejection cases).
- Component tests for the `HostLobby.tsx` picker change, mirroring the existing `HostLobby.test.tsx` pattern.

## 11. Decisions made without an explicit answer (flagged for review)

- Organiser invite link expiry: 48 hours.
- Marshal invite link expiry: 6 hours, or game leaves lobby — whichever first.
- Bootstrapping the owner via a one-time seed script reusing the normal redemption path.
- Only the owner can issue a re-link for another organiser (no self-service recovery yet).
- `setRoles` stays API-flexible; the runner/chaser restriction is UI-only.
