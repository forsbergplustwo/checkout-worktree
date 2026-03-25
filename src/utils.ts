/**
 * utils.ts — Shared helpers.
 */

/**
 * Resolve ~ to the user's home directory.
 */
export function resolveHome(p: string): string {
  return p.replace(/^~/, process.env.HOME ?? "~");
}
