/* ============================================================================
   PullPin Pulse — Cloud Sync config
   ----------------------------------------------------------------------------
   LEAVE BLANK  -> single-player (saves to this browser only). Great for solo
                   testing and the double-click `index.html` experience.
   FILL THESE   -> the whole team shares one live workspace ("team memory").

   Get these two values FREE from Supabase:
     1. Create a project at https://supabase.com  (free tier)
     2. Project Settings → API
        • "Project URL"        → SUPABASE_URL
        • "anon public" key    → SUPABASE_ANON_KEY
   (The anon key is meant to live in frontend code — that's by design.)

   See TEAM_SETUP.md for the full 5-minute walkthrough.
   ========================================================================== */

window.CT_CONFIG = {
  SUPABASE_URL: 'https://sxihientctctlyxiqmeu.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_tl-PBjXadoqwmQj3cWA5Gg_1JaYbwGT',  // publishable (browser-safe) key

  // Optional: change this to run a second, separate shared workspace from the
  // same deployment (e.g. 'studio', 'client-acme'). Everyone on the same id
  // shares the same data.
  STUDIO_ID: 'studio',
};
