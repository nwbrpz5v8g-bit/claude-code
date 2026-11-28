/**
 * Short, human-friendly check-in code derived from the booking id, e.g. "SUDS-7K3Q-M2".
 * Crockford base32 (no I, L, O, U) so it reads clearly when said out loud at the bay.
 * Derived rather than stored: no migration, and it is stable forever for a booking.
 * It identifies a booking; it is not a secret and grants nothing on its own.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function checkInCode(bookingId: string): string {
  const hex = bookingId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error("checkInCode expects a UUID");
  // FNV-1a over the id → 30 bits → 6 base32 characters.
  let h = 0x811c9dc5;
  for (const ch of hex) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[h & 31];
    h >>>= 5;
  }
  return `SUDS-${out.slice(0, 4)}-${out.slice(4)}`;
}
