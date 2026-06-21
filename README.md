# PullPin Pulse

**Less management. More momentum.**
A lightweight project tracker for creative teams — built to reduce cognitive
load, surface the *one next action* per project, and keep momentum visible.

This is the **interactive prototype** (Phase 1): full UI, real interactions,
seeded with a roster of gloriously ridiculous fake clients. No accounts, no
keys, no build step.

---

## Run it (zero setup)

**Just double-click `index.html`.** That's it — it opens in your browser and
runs entirely offline. Your changes save to the browser's local storage.

Prefer a local server? Any of these work:

```bash
python3 -m http.server 4321      # then open http://localhost:4321
# or
npx serve .
```

---

## What's in here

| File | What it does |
|------|--------------|
| `index.html` | Mounts the app, loads the scripts (plain tags → works on `file://`). |
| `styles.css` | The whole look — "Liquid Glass": a gradient mesh background with frosted, translucent panels that float on light. |
| `data.js` | Seed data: the studio, the (absurd) clients, tasks, deliverables, notes. |
| `app.js` | The engine: state, persistence, momentum, daily brief, energy view, transcript→tasks. |

Everything is vanilla JS. Re-render-on-change keeps the code boring and legible.

---

## What works (and it's *interactive*, not a mockup)

- **Home / Triage** — Due Today · Needs Review · Blocked · Waiting on Client.
- **Daily Brief** — dynamic, generated from your live data (mock AI for now).
  Includes a suggested *focus order* for the day.
- **Projects** — momentum-sorted cards, each with its **one next action**,
  deliverable progress, team, and status chips.
- **Project detail** — tasks (with status), deliverable pipelines, notes, and a
  **transparent momentum breakdown** (hover-the-reasons, not a mystery number).
- **Energy View** — open work grouped by *work mode*: Quick Wins · Deep Work ·
  Creative · Waiting.
- **Transcript → Tasks** — paste meeting notes, it extracts action items
  (checked by default — uncheck any you don't want), assign each to a project.
- **The One Next Action** — a live pointer to your single most important task.
  Check it off and it completes that task and advances to the next.
- **Assets** — a lightweight visual index per project. Paste a link (Figma,
  Drive, Loom, image URL…) and it auto-detects the type, previews images/videos
  as thumbnails, and opens the original in a tab. **It stores only the link, never
  the file** — so the app stays feather-light no matter how much creative flows.
- **Feedback** — an in-app issue tracker for the tool itself. Anyone on the team
  can post an Idea / Bug / Other, upvote what matters, and move items through
  Open → Planned → Done. All tiny text, synced to the whole team.
- **Full editing** — add / rename / **delete** tasks, notes, and deliverables;
  change a task's **assignee** and **due date**; advance deliverable stages.
  Every delete shows an **Undo**. All live, all persisted.
- **Keyboard-accessible** — checkboxes are real buttons (Tab + Space/Enter), and
  the gradient background respects `prefers-reduced-motion`.

> Tip: **`↺ Reset demo`** (bottom-left) restores the original seed data anytime.

---

## How the Momentum Score works (0–100, on purpose legible)

Starts at a neutral 45, then:

| Factor | Effect |
|--------|--------|
| Deliverables locked (approved/delivered) | up to **+25** |
| Tasks finished in the last 7 days | up to **+25** |
| Active in the last 2 days | **+12** (or **−10** if quiet 5+ days) |
| Each open blocker | **−13** |
| Each item waiting on client 5+ days | **−9** |
| Project on hold | **−8** |

The project detail panel shows the exact ▲/▼ factors behind each score — health
you can explain beats a number people don't trust.

---

## The clients (placeholder, deliberately dumb)

🍺 Hold My Beer Brewing Co. · ☕ Chad's Rash Cream Co. · 🥾 Sasquatch & Sons
Outfitters · 🧘 Definitely Not a Cult Wellness · ✨ Unicorn Tears Skincare ·
🛟 Mildly Concerned Insurance

Swap these for real clients in `data.js` whenever you're ready.

---

## Path to production (Phase 2, when the feel is right)

The PRD's destination stack stays the goal — we graduate the prototype onto it
once the UX is locked:

1. **Next.js + React** — port the views to components (the structure already maps cleanly).
2. **Supabase (Postgres)** — the 4 objects (projects, tasks, deliverables, notes) become tables; the seed becomes a migration.
3. **Google Auth** — Supabase Auth, gate the app, scope data to the studio.
4. **Real AI** — swap the mock Daily Brief / summaries / extraction for the Claude API (Claude Opus 4.8). The mock functions in `app.js` already define the exact shapes to fill.
5. **Vercel** — deploy.

Nothing here is throwaway — it's the spec made clickable.
