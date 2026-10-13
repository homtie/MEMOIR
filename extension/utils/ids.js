/**
 * Generate a unique, collision-resistant ID for a memory.
 *
 * Uses crypto.randomUUID() which produces RFC 4122 version 4 UUIDs.
 * These are 122 bits of cryptographic randomness, making collisions
 * virtually impossible without requiring external dependencies.
 *
 * Available in modern browsers, service workers, and Node.js 19+.
 *
 * @returns {string} A v4 UUID string (e.g. "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateId() {
  return crypto.randomUUID();
}
