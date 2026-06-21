# Share PullPin Pulse with your team (free) — ~10 minutes

This turns the single-player prototype into a shared one: everyone opens one URL
and sees the same live data ("team memory"). Total cost: **$0**.

Two free services:
- **Supabase** — the shared database (your team's memory).
- **Netlify** (or Vercel) — hosts the app at a public URL your team can open.

You only do this once. When you're done, your teammates just open a link.

---

## Step 1 — Create a free Supabase project (~3 min)
1. Go to **https://supabase.com** → sign up (free) → **New project**.
2. Pick any name + a database password (save it somewhere). Region: closest to you.
3. Wait ~1 minute for it to provision.

## Step 2 — Create the shared table (~1 min)
1. In your project, open **SQL Editor** → **New query**.
2. Paste this and click **Run**:

```sql
create table if not exists public.app_state (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

alter table public.app_state enable row level security;

create policy "open access (prototype)" on public.app_state
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update on table public.app_state to anon, authenticated;

alter publication supabase_realtime add table public.app_state;
```

> This makes one tiny table that holds the whole app's state, turns on live
> updates, and (for a trusted prototype) allows open access. See **Security**
> below for locking it down later.

## Step 3 — Paste your keys into `config.js` (~1 min)
1. In Supabase: **Project Settings → API**.
2. Copy two values into **`config.js`** in this folder:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`

```js
window.CT_CONFIG = {
  SUPABASE_URL: 'https://YOURPROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi... (the long anon public key)',
  STUDIO_ID: 'studio',
};
```

That's it for code — the app auto-detects the keys and switches to shared mode.
(The sidebar will show a green **"Synced · shared"** dot.)

## Step 4 — Put it online with Netlify Drop (~2 min)
1. Go to **https://app.netlify.com/drop**.
2. **Drag this whole folder** onto the page.
3. You get a public URL like `https://creative-tracker-xyz.netlify.app`.
4. (Optional) In Netlify → Site settings → rename it to something friendlier.

> Prefer Vercel? `vercel` CLI or the dashboard "Add New → Project" works the same
> for a static folder. GitHub Pages also works if you push the folder to a repo.

## Step 5 — Share the link
Send the Netlify URL to your 3–5 teammates. Everyone who opens it shares the same
live workspace. Edits show up for everyone within a second. 🎉

---

## Good to know
- **Free limits:** miles beyond a 5-person tracker. (The free Supabase project
  *pauses after ~1 week of zero activity* — daily use keeps it awake; if it ever
  sleeps, just open the Supabase dashboard to resume.)
- **One shared space:** everyone on the same deployment shares one workspace. Want
  a separate one (e.g. a sandbox)? Change `STUDIO_ID` in `config.js` and redeploy.
- **First load wins the baseline:** the first person to open it seeds the shared
  data from the demo. After that, everyone reads/writes the same record. Use
  **↺ Reset demo** only if you want to wipe the *shared* data back to the seed.
- **Re-deploying after edits:** just drag the folder onto Netlify Drop again (or
  reconnect via git for auto-deploys).

## Security (honest note)
For a trusted internal prototype, the open-access policy above is fine: anyone
with the URL **and** the anon key can read/write the shared record. When you want
to lock it down (Phase 2):
- Turn on **Google sign-in** (your team already has Google accounts via Workspace).
- Replace the open policy with one that requires an authenticated user, scoped to
  your studio.

That's the natural next step whenever this graduates from "prototype" to "the
system we actually rely on."
