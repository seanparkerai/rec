// types/cdn-modules.d.ts — ambient declarations for CDN-served ESM dependencies
// (tier-0 checkJs). The zero-build site imports libraries from URL specifiers, which
// tsc cannot resolve; each CDN module used by a tier-0-scoped file gets a minimal
// hand-written shape here (kept deliberately loose — the CDN package's real types
// are not installed). Listed explicitly in tsconfig.json's include array.
declare module 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm' {
  // Minimal surface of @supabase/supabase-js v2 as used by supabase-client.js.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createClient(url: string, key: string, options?: unknown): any;
}
