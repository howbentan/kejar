import { createHash, randomBytes } from 'node:crypto'

/** 32 random bytes, base64url (43 characters). Only the hash is ever stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
