// Run once, against production, to create the very first organiser (the owner).
// Usage: npx tsx scripts/bootstrap-owner.ts "Owner Name"
import { hashToken, newToken } from '../api/_lib/secrets.js'
import { serverDb } from '../api/_lib/server.js'
import { SupabaseStore } from '../api/_lib/supabaseStore.js'

async function main() {
  const name = process.argv[2]
  if (!name) throw new Error('Usage: npx tsx scripts/bootstrap-owner.ts "Owner Name"')
  const now = Date.now()
  const store = new SupabaseStore(serverDb(), () => now)
  const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(now).toISOString() })
  const inviteToken = newToken()
  // No expiry worth enforcing for a one-time, manually-run bootstrap invite — this script only
  // runs once, by the owner, directly against their own database.
  const farFuture = new Date(now + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
  await store.createOrganiserInvite({
    organisation_id: org.id,
    organiser_id: null,
    name,
    token_hash: hashToken(inviteToken),
    created_at: new Date(now).toISOString(),
    expires_at: farFuture,
    redeemed_at: null,
  })
  console.log(`Open this once on the owner's phone:\nhttps://kejar-eosin.vercel.app/organiser/${inviteToken}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
