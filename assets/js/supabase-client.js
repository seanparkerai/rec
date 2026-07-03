// supabase-client.js — the committed Supabase client bootstrap (the setup page
// that once generated this file was retired in the 2026-07 overhaul; edit by
// hand if the project credentials ever change).
// The publishable key is safe to commit — Row Level Security protects the data
// (verified mechanically: tools/check-rls.mjs in CI + the §18.2 ceremony sweep;
// key model: docs/adr/0005).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://qxmyrahqsopmaeokxdub.supabase.co/';
const SUPABASE_ANON_KEY = 'sb_publishable_3Bv1m_CG1DkIoqBhKjXp-A_vWS_kNFV';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
