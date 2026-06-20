# Real logins & profiles (email + password) — ~5 minutes

This adds real accounts: each teammate signs up with their email + password, gets
their own profile, and can reset their own password. It also locks the workspace
so only logged-in people can see it.

Do these **two Supabase steps once**, then deploy the updated app.

---

## Step 1 — Run the auth SQL (~1 min)
Supabase → **SQL Editor** → **New query** → paste and **Run**:

```sql
-- Real profiles, one per auth user --------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  name text,
  color text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles readable by the team" on public.profiles
  for select to authenticated using (true);

create policy "members manage their own profile" on public.profiles
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

-- Auto-create a profile whenever someone signs up -----------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, color)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
    (array['#6366f1','#ec4899','#f59e0b','#10b981','#0ea5e9','#8b5cf6','#ef4444','#14b8a6'])
      [1 + (abs(hashtext(new.id::text)) % 8)]
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lock the workspace: logged-in users only (replaces the open prototype rule) --
drop policy if exists "open access (prototype)" on public.app_state;
create policy "team only" on public.app_state
  for all to authenticated using (true) with check (true);

revoke select, insert, update on public.app_state from anon;
grant  select, insert, update on public.app_state to authenticated;

-- Live team roster updates (optional but nice) --------------------------------
alter publication supabase_realtime add table public.profiles;
```

## Step 2 — Make signup instant (~1 min)
So people can sign up and use it immediately (and so you don't hit the free
email rate limit on confirmation mails):

- Supabase → **Authentication** → **Sign In / Providers** (or **Providers → Email**)
- Turn **OFF** "**Confirm email**".  → Save.

Password *reset* emails still work — that's a separate flow.

## Step 3 — Allow your app URLs for reset links (~1 min)
- Supabase → **Authentication** → **URL Configuration**
- **Site URL:** your Netlify URL (e.g. `https://pullpin-tracker.netlify.app`)
- **Redirect URLs:** add both:
  - `http://localhost:4321` (for local testing)
  - your Netlify URL
- Save. (This is so the "reset password" link can return into the app.)

---

## Then
Redeploy the app (drag the folder onto Netlify again). The site now opens to a
**sign-in screen**. You create your account first, then your teammates create
theirs. Everyone shows up as a real profile, and assignees become real people.

### Managing the team
- **Anyone can self-serve a password reset** from the login screen ("Forgot password?").
- **Remove someone:** Supabase → Authentication → Users → delete them (their
  profile auto-removes).
- **See who's joined:** Supabase → Table Editor → `profiles`.

### Heads-up on existing demo data
The shared workspace still has the demo projects (with their placeholder
assignees). Once you're in as real people, you can reassign or delete those and
start adding real work. (Creating brand-new *projects* from the UI is the next
build — say the word.)
