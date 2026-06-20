/* ============================================================================
   Creative Tracker — Seed Data
   ----------------------------------------------------------------------------
   Everything the prototype needs to feel alive on first open. Dates are
   generated RELATIVE to "now" so the demo always has things Due Today, no
   matter when you open it. Client names are deliberately ridiculous.
   ========================================================================== */

(function () {
  // --- date helpers: produce ISO strings offset from right now ----------------
  const DAY = 24 * 60 * 60 * 1000;
  const now = () => new Date();
  function dayOffset(n) {
    const d = new Date(now().getTime() + n * DAY);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }
  // "updated n days ago" timestamp
  function ago(n) {
    return new Date(now().getTime() - n * DAY).toISOString();
  }

  // --- the studio (humor stays on the CLIENTS; the team feels real) ----------
  const TEAM = [
    { id: 'rb', name: 'Reuben Bell',  role: 'Creative Director', initials: 'RB', color: '#6366f1', you: true },
    { id: 'pv', name: 'Priya Varma',  role: 'Designer',          initials: 'PV', color: '#ec4899' },
    { id: 'mc', name: 'Marco Conti',  role: 'Motion Designer',   initials: 'MC', color: '#f59e0b' },
    { id: 'dl', name: 'Dana Lowe',    role: 'Copywriter',        initials: 'DL', color: '#10b981' },
    { id: 'sk', name: 'Sam Kwon',     role: 'Producer',          initials: 'SK', color: '#0ea5e9' },
    { id: 'jr', name: 'Jules Reyes',  role: 'Developer',         initials: 'JR', color: '#8b5cf6' },
  ];

  // --- projects (client names: humor-based, as requested) --------------------
  const PROJECTS = [
    {
      id: 'p1',
      client: 'Hold My Beer Brewing Co.',
      emoji: '🍺',
      name: 'Hazy IPA Can Redesign',
      status: 'active',
      accent: '#f59e0b',
      team: ['pv', 'rb', 'dl'],
      nextAction: 'Send revised label dielines to legal for sign-off',
    },
    {
      id: 'p2',
      client: "Chad's Rash Cream Co.",
      emoji: '☕',
      name: 'Brand Refresh + Website',
      status: 'active',
      accent: '#8b5cf6',
      team: ['pv', 'jr', 'dl', 'rb'],
      nextAction: 'Review the homepage hero direction the client sent back',
    },
    {
      id: 'p3',
      client: 'Sasquatch & Sons Outfitters',
      emoji: '🥾',
      name: 'Spring Catalog + Hero Film',
      status: 'active',
      accent: '#10b981',
      team: ['mc', 'pv', 'sk'],
      nextAction: 'Lock the 15-second hero film edit for internal review',
    },
    {
      id: 'p4',
      client: 'Definitely Not a Cult Wellness',
      emoji: '🧘',
      name: 'App Onboarding Flow',
      status: 'active',
      accent: '#0ea5e9',
      team: ['pv', 'jr', 'rb'],
      nextAction: 'Finalize copy for the 3-screen onboarding sequence',
    },
    {
      id: 'p5',
      client: 'Unicorn Tears Skincare',
      emoji: '✨',
      name: 'Glow Launch Campaign',
      status: 'active',
      accent: '#ec4899',
      team: ['dl', 'pv', 'sk'],
      nextAction: 'Draft 6 launch-week social captions for review',
    },
    {
      id: 'p6',
      client: 'Mildly Concerned Insurance',
      emoji: '🛟',
      name: 'Explainer Video Series',
      status: 'onhold',
      accent: '#64748b',
      team: ['mc', 'dl'],
      nextAction: 'Nudge client on script approval (stalled 12 days)',
    },
  ];

  /* Task statuses: todo | doing | blocked | review | waiting | done
     - blocked            -> Home "Blocked"
     - review             -> Home "Needs Review"
     - waiting            -> Home "Waiting on Client"
     - due === today      -> Home "Due Today"
     Energy modes: quick | deep | creative | waiting
     `up` = days since last update (for momentum), `done` tasks carry doneAt. */
  const TASKS = [
    // --- p1 Hold My Beer ----------------------------------------------------
    { id: 't1',  pid: 'p1', title: 'Export print-ready can dielines (CMYK)', status: 'blocked', energy: 'deep',     who: 'pv', due: dayOffset(0),  up: 1 },
    { id: 't2',  pid: 'p1', title: 'Write the back-of-can flavor copy',       status: 'doing',   energy: 'creative', who: 'dl', due: dayOffset(2),  up: 0 },
    { id: 't3',  pid: 'p1', title: 'Pick the foil color for the 6-pack',      status: 'todo',    energy: 'quick',    who: 'rb', due: dayOffset(1),  up: 2 },
    { id: 't4',  pid: 'p1', title: 'Mock up the can in 3D for the pitch',     status: 'done',    energy: 'deep',     who: 'pv', doneAt: ago(2),     up: 2 },
    { id: 't5',  pid: 'p1', title: 'Source the texture for the label paper',  status: 'done',    energy: 'quick',    who: 'pv', doneAt: ago(4),     up: 4 },

    // --- p2 Chad's Rash Cream Co. ------------------------------------------
    { id: 't6',  pid: 'p2', title: 'Homepage hero: client feedback round 2',  status: 'waiting', energy: 'waiting',  who: 'pv', due: dayOffset(0),  up: 3 },
    { id: 't7',  pid: 'p2', title: 'Build the responsive nav component',      status: 'doing',   energy: 'deep',     who: 'jr', due: dayOffset(3),  up: 0 },
    { id: 't8',  pid: 'p2', title: 'New tagline options ("wake up, question everything")', status: 'review', energy: 'creative', who: 'dl', due: dayOffset(0), up: 1 },
    { id: 't9',  pid: 'p2', title: 'Pick web font pairing',                   status: 'todo',    energy: 'quick',    who: 'pv', due: dayOffset(4),  up: 1 },
    { id: 't10', pid: 'p2', title: 'Design the 404 page (make it sad-funny)', status: 'todo',    energy: 'creative', who: 'pv', due: dayOffset(6),  up: 2 },
    { id: 't11', pid: 'p2', title: 'Logo refresh — final lockup',            status: 'done',    energy: 'deep',     who: 'pv', doneAt: ago(1),     up: 1 },

    // --- p3 Sasquatch & Sons ------------------------------------------------
    { id: 't12', pid: 'p3', title: 'Lock the 15s hero film edit',             status: 'review',  energy: 'deep',     who: 'mc', due: dayOffset(0),  up: 0 },
    { id: 't13', pid: 'p3', title: 'Color grade the campfire scene',          status: 'doing',   energy: 'deep',     who: 'mc', due: dayOffset(2),  up: 0 },
    { id: 't14', pid: 'p3', title: 'Lay out catalog spreads 4–9',             status: 'todo',    energy: 'creative', who: 'pv', due: dayOffset(3),  up: 1 },
    { id: 't15', pid: 'p3', title: 'Confirm boot-stomping foley with audio',  status: 'waiting', energy: 'waiting',  who: 'sk', due: dayOffset(1),  up: 2 },
    { id: 't16', pid: 'p3', title: 'Caption the BTS reel',                    status: 'todo',    energy: 'quick',    who: 'sk', due: dayOffset(0),  up: 1 },
    { id: 't17', pid: 'p3', title: 'Storyboard the 6s cutdown',               status: 'done',    energy: 'creative', who: 'mc', doneAt: ago(3),     up: 3 },

    // --- p4 Definitely Not a Cult Wellness ---------------------------------
    { id: 't18', pid: 'p4', title: 'Finalize 3-screen onboarding copy',       status: 'doing',   energy: 'creative', who: 'rb', due: dayOffset(0),  up: 0 },
    { id: 't19', pid: 'p4', title: 'Prototype the breathing animation',       status: 'todo',    energy: 'deep',     who: 'jr', due: dayOffset(2),  up: 1 },
    { id: 't20', pid: 'p4', title: 'Review accessibility on sign-up flow',    status: 'review',  energy: 'deep',     who: 'pv', due: dayOffset(1),  up: 1 },
    { id: 't21', pid: 'p4', title: 'Pick the "definitely-not-creepy" palette',status: 'todo',    energy: 'quick',    who: 'pv', due: dayOffset(0),  up: 2 },
    { id: 't22', pid: 'p4', title: 'Export app icon @ all sizes',             status: 'done',    energy: 'quick',    who: 'jr', doneAt: ago(2),     up: 2 },

    // --- p5 Unicorn Tears Skincare -----------------------------------------
    { id: 't23', pid: 'p5', title: 'Draft 6 launch-week social captions',     status: 'doing',   energy: 'creative', who: 'dl', due: dayOffset(1),  up: 0 },
    { id: 't24', pid: 'p5', title: 'Resize hero art for IG / TikTok / story', status: 'todo',    energy: 'quick',    who: 'pv', due: dayOffset(0),  up: 1 },
    { id: 't25', pid: 'p5', title: 'Schedule the teaser posts',               status: 'todo',    energy: 'quick',    who: 'sk', due: dayOffset(2),  up: 1 },
    { id: 't26', pid: 'p5', title: 'Pitch the "cry pretty" hero concept',     status: 'done',    energy: 'creative', who: 'dl', doneAt: ago(1),     up: 1 },
    { id: 't27', pid: 'p5', title: 'Brief the influencer gifting list',       status: 'waiting', energy: 'waiting',  who: 'sk', due: dayOffset(3),  up: 2 },

    // --- p6 Mildly Concerned Insurance (the stalling one) ------------------
    { id: 't28', pid: 'p6', title: 'Script approval from client',             status: 'waiting', energy: 'waiting',  who: 'dl', due: dayOffset(-9), up: 12 },
    { id: 't29', pid: 'p6', title: 'Animatic v1 (on hold pending script)',    status: 'blocked', energy: 'deep',     who: 'mc', due: dayOffset(-2), up: 11 },
    { id: 't30', pid: 'p6', title: 'Voiceover casting shortlist',             status: 'todo',    energy: 'quick',    who: 'dl', due: dayOffset(5),  up: 10 },
  ];

  /* Deliverable statuses: draft | review | waiting | approved | delivered
     progress = (approved + delivered) / total */
  const DELIVERABLES = [
    { id: 'd1',  pid: 'p1', title: 'Can label artwork (12oz)',     status: 'review',    due: dayOffset(2),  up: 1 },
    { id: 'd2',  pid: 'p1', title: '6-pack carrier design',        status: 'draft',     due: dayOffset(5),  up: 2 },
    { id: 'd3',  pid: 'p1', title: 'Brand pitch deck',             status: 'delivered', due: dayOffset(-3), up: 3 },

    { id: 'd4',  pid: 'p2', title: 'Homepage design (desktop)',    status: 'waiting',   due: dayOffset(1),  up: 3 },
    { id: 'd5',  pid: 'p2', title: 'Logo system + lockups',        status: 'approved',  due: dayOffset(-2), up: 1 },
    { id: 'd6',  pid: 'p2', title: 'Brand guidelines PDF',         status: 'draft',     due: dayOffset(8),  up: 2 },

    { id: 'd7',  pid: 'p3', title: '15s hero film',                status: 'review',    due: dayOffset(0),  up: 0 },
    { id: 'd8',  pid: 'p3', title: 'Spring catalog (32pp)',        status: 'draft',     due: dayOffset(6),  up: 1 },
    { id: 'd9',  pid: 'p3', title: 'Social cutdowns (6s/15s)',     status: 'draft',     due: dayOffset(4),  up: 1 },

    { id: 'd10', pid: 'p4', title: 'Onboarding screens (Figma)',   status: 'review',    due: dayOffset(1),  up: 1 },
    { id: 'd11', pid: 'p4', title: 'App icon + splash',            status: 'delivered', due: dayOffset(-2), up: 2 },

    { id: 'd12', pid: 'p5', title: 'Launch key art',              status: 'approved',  due: dayOffset(-1), up: 1 },
    { id: 'd13', pid: 'p5', title: 'Social kit (12 assets)',      status: 'draft',     due: dayOffset(2),  up: 1 },
    { id: 'd14', pid: 'p5', title: 'Launch-week content calendar',status: 'draft',     due: dayOffset(3),  up: 1 },

    { id: 'd15', pid: 'p6', title: 'Explainer script (90s)',       status: 'waiting',   due: dayOffset(-9), up: 12 },
    { id: 'd16', pid: 'p6', title: 'Animatic',                     status: 'draft',     due: dayOffset(7),  up: 11 },
  ];

  const NOTES = [
    { id: 'n1', pid: 'p1', who: 'pv', body: 'Legal flagged the ABV placement — needs to be 2x bigger. Waiting on their exact spec.', at: ago(1) },
    { id: 'n2', pid: 'p1', who: 'dl', body: 'Client loved "Brewed by people who should know better." Keeping it.', at: ago(3) },
    { id: 'n3', pid: 'p2', who: 'rb', body: 'Client wants the homepage to feel "tired but hopeful." We are leaning into the muted palette.', at: ago(2) },
    { id: 'n4', pid: 'p3', who: 'mc', body: 'Campfire scene grade is 🔥 (pun intended). Just needs the hero edit locked.', at: ago(0) },
    { id: 'n5', pid: 'p4', who: 'rb', body: 'Reminder: do NOT use any imagery that looks like a compound. We learned this the hard way.', at: ago(2) },
    { id: 'n6', pid: 'p5', who: 'dl', body: 'Tagline frontrunner: "Cry pretty." Client is obsessed.', at: ago(1) },
    { id: 'n7', pid: 'p6', who: 'dl', body: 'Client has gone quiet for 12 days. Project effectively on hold until script approval.', at: ago(11) },
  ];

  /* Assets = lightweight REFERENCES to creative that lives elsewhere (Figma,
     Drive, Loom, image URLs…). We store only the link + a title — never the
     file — so the app stays feather-light no matter how much creative flows. */
  const ASSETS = [
    { id: 'as1', pid: 'p1', title: 'Can label v3 — hero comp',   url: 'https://picsum.photos/seed/hmb-can/480/360',        type: 'image',  by: 'pv', at: ago(2) },
    { id: 'as2', pid: 'p1', title: 'Brand explorations',          url: 'https://www.figma.com/file/holdmybeer-brand',       type: 'design', by: 'pv', at: ago(4) },
    { id: 'as3', pid: 'p2', title: 'Homepage hero — option A',    url: 'https://picsum.photos/seed/chad-hero/480/360',      type: 'image',  by: 'pv', at: ago(1) },
    { id: 'as4', pid: 'p2', title: 'Brand anthem — rough cut',    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',       type: 'video',  by: 'dl', at: ago(3) },
    { id: 'as5', pid: 'p3', title: 'Hero film v2 (for review)',   url: 'https://www.loom.com/share/sasquatch-hero',         type: 'video',  by: 'mc', at: ago(0) },
    { id: 'as6', pid: 'p3', title: 'Catalog spread 4–5',          url: 'https://picsum.photos/seed/sasq-cat/480/360',       type: 'image',  by: 'pv', at: ago(1) },
    { id: 'as7', pid: 'p5', title: 'Launch key art',             url: 'https://picsum.photos/seed/unicorn-key/480/360',    type: 'image',  by: 'pv', at: ago(1) },
  ];

  // expose (lowercase keys — this is the shape app.js reads)
  window.SEED = {
    team: TEAM, projects: PROJECTS, tasks: TASKS, deliverables: DELIVERABLES, notes: NOTES, assets: ASSETS,
    _meta: { generatedAt: now().toISOString() },
  };
})();
