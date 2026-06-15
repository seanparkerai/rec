// supabase/functions/_shared/cors.ts — shared CORS headers with an origin
// allow-list. Only the production site and the local dev server may call the
// Ask function from a browser (Ask plan §7 "CORS allow-list").
const ALLOWED = new Set([
  "https://georgianrectory.com",
  "https://www.georgianrectory.com",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

export function CORS(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.has(origin) ? origin : "https://georgianrectory.com",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
