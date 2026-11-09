import { createHash, randomBytes } from 'node:crypto'

/** 32 random bytes, base64url (43 characters). Only the hash is ever stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** A fresh secret for a ★ card: 22 base64url characters (about 130 random bits), short enough for a clear QR. */
export const newDatoCode = () => newToken().slice(0, 22)

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Uniform value in [0, 1) from the system's secure random source (48 bits, 6 random bytes). */
export function cryptoRng(): number {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48
}
