/* ============================================================================
   PullPin Pulse — App
   Less management. More momentum.
   Vanilla JS, no build step. State lives in localStorage (falls back to memory
   on file:// if blocked). Re-render-on-change keeps the code boring & legible.
   ========================================================================== */
(function () {
  'use strict';

  const STORE_KEY = 'creative-tracker-v1';
  const DAY = 86400000;

  /* ----------------------------------------------------------- state ------ */
  let memFallback = null; // used if localStorage is unavailable (file://)

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { /* file:// or private mode */ }
    if (memFallback) return memFallback;
    return seedClone();
  }
  // collision-proof id — timestamp alone repeats when several items are added in
  // the same millisecond (e.g. the transcript loop), which used to mint duplicate ids.
  let _idSeq = 0;
  function genId(prefix) { return prefix + Date.now().toString(36) + (_idSeq++).toString(36) + Math.random().toString(36).slice(2, 6); }
  // repair any array that already has duplicate/blank ids. Deterministic (keeps the
  // first, reindexes the rest) so it's idempotent and agrees across synced clients —
  // no random ids here, or remote/local copies would never reconcile.
  function dedupeIds(arr) {
    if (!Array.isArray(arr)) return false;
    const seen = new Set(); let changed = false;
    arr.forEach((item, i) => {
      if (!item) return;
      if (!item.id || seen.has(item.id)) {
        let nid = (String(item.id || 'x')) + '_' + i;     // stable: derived from position
        while (seen.has(nid)) nid += 'x';
        item.id = nid; changed = true;
      }
      seen.add(item.id);
    });
    return changed;
  }

  // one-time fixups for already-saved state — keeps the user's test data intact
  function migrate(d) {
    const renamed = { 'Existential Dread Coffee': "Chad's Rash Cream Co." };
    let changed = false;
    (d.projects || []).forEach((p) => { if (renamed[p.client]) { p.client = renamed[p.client]; changed = true; } });
    if (!Array.isArray(d.assets)) d.assets = [];       // assets added later — ensure the array exists
    if (!Array.isArray(d.feedback)) d.feedback = [];   // feedback added later — ensure the array exists
    // heal duplicate ids (the transcript loop minted same-ms collisions) so a
    // status/edit/check on one item can never hit a different row
    ['tasks', 'deliverables', 'notes', 'assets', 'feedback'].forEach((k) => { if (dedupeIds(d[k])) changed = true; });
    if (changed) { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } }
    return d;
  }
  function seedClone() { return JSON.parse(JSON.stringify(window.SEED)); }
  function persistLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
    catch (e) { memFallback = data; }
  }
  function save() {
    persistLocal();
    if (window.CTSync && window.CTSync.configured) window.CTSync.push(data); // share with team
  }

  const data = load();
  const view = { name: 'home', projectId: null };
  let modal = null;          // { type:'transcript', text, extracted:[] }
  let refocusId = null;      // element id to refocus after render
  let toastTimer = null;
  let editTaskId = null, editDlvId = null, editNoteId = null; // inline-edit targets
  let lastDeleted = null;    // { kind, item, index } — one-level undo buffer
  let authMode = 'login';    // 'login' | 'signup' | 'forgot'
  let authBusy = false, authErr = '', authMsg = '';
  let fbType = 'idea';       // compose type for the feedback view
  let menuOpen = false;      // mobile hamburger menu open?
  let profErr = '';          // profile-edit error message
  let mineOnly = (function () { try { return localStorage.getItem('pp-mine') === '1'; } catch (e) { return false; } })(); // "Mine" filter on Home/Energy

  /* ----------------------------------------------------------- lookups ---- */
  const projById  = (id) => data.projects.find((p) => p.id === id);
  // team comes from real Supabase profiles when signed in, else the demo roster
  function initialsOf(name) { return (name || '?').trim().split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase() || '?'; }
  function getTeam() {
    const A = window.CTAuth;
    if (A && A.configured && A.user && A.profiles && A.profiles.length) {
      return A.profiles.map((p) => ({ id: p.id, name: p.name || p.email, initials: initialsOf(p.name || p.email), color: p.color || '#6366f1', role: p.role || '', bio: p.bio || '', email: p.email || '', joinedAt: p.created_at || '', you: p.id === A.user.id }));
    }
    return data.team;
  }
  const memById   = (id) => getTeam().find((m) => m.id === id);
  const me         = () => { const t = getTeam(); return t.find((m) => m.you) || t[0]; };
  const tasksOf   = (pid) => data.tasks.filter((t) => t.pid === pid);
  const delivsOf  = (pid) => data.deliverables.filter((d) => d.pid === pid);
  const notesOf   = (pid) => data.notes.filter((n) => n.pid === pid);
  const assetsOf  = (pid) => (data.assets || []).filter((a) => a.pid === pid);

  /* ----------------------------------------- assets (light references) ---- */
  const TYPE_ICON = { image: '🖼️', video: '🎬', audio: '🎵', design: '🎨', doc: '📄', link: '🔗' };
  function assetType(url) {
    const u = (url || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|avif|svg|bmp|heic)(\?|#|$)/.test(u)) return 'image';
    if (/(youtube\.com|youtu\.be|vimeo\.com|loom\.com|wistia)/.test(u) || /\.(mp4|mov|webm|mkv|m4v)(\?|#|$)/.test(u)) return 'video';
    if (/(soundcloud\.com|spotify\.com)/.test(u) || /\.(mp3|wav|aiff?|m4a|ogg|flac)(\?|#|$)/.test(u)) return 'audio';
    if (/(figma\.com|framer\.com|sketch\.com|adobe\.com\/express)/.test(u)) return 'design';
    if (/\.(pdf|docx?|pptx?|xlsx?|key|ai|psd|indd|sketch)(\?|#|$)/.test(u) || /(docs\.google\.com|notion\.so)/.test(u)) return 'doc';
    return 'link';
  }
  function serviceLabel(url) {
    const u = (url || '').toLowerCase();
    if (u.includes('figma.com')) return 'Figma';
    if (u.includes('loom.com')) return 'Loom';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('vimeo.com')) return 'Vimeo';
    if (u.includes('frame.io')) return 'Frame.io';
    if (u.includes('drive.google.com') || u.includes('docs.google.com')) return 'Google';
    if (u.includes('dropbox.com')) return 'Dropbox';
    if (u.includes('soundcloud.com')) return 'SoundCloud';
    if (u.includes('notion.so')) return 'Notion';
    return null;
  }
  function youtubeId(url) { const m = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/); return m ? m[1] : null; }
  function assetThumb(a) {
    if (a.type === 'image') return a.url;
    if (a.type === 'video') { const id = youtubeId(a.url); if (id) return 'https://img.youtube.com/vi/' + id + '/mqdefault.jpg'; }
    return null;
  }
  function cssUrl(u) { return String(u).replace(/['")\\]/g, (c) => '%' + c.charCodeAt(0).toString(16)); }
  function prettyName(url) {
    try {
      const u = new URL(url);
      const seg = decodeURIComponent((u.pathname.split('/').filter(Boolean).pop() || ''));
      if (seg) return (seg.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 60)) || u.hostname.replace(/^www\./, '');
      return u.hostname.replace(/^www\./, '');
    } catch (e) { return String(url).slice(0, 60); }
  }

  /* ----------------------------------------------------------- dates ------ */
  const daysUntil = (iso) => Math.round((new Date(iso).setHours(12,0,0,0) - new Date().setHours(12,0,0,0)) / DAY);
  const daysSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / DAY));

  function fmtDue(iso) {
    const d = daysUntil(iso);
    if (d === 0) return 'Today';
    if (d === 1) return 'Tomorrow';
    if (d === -1) return 'Yesterday';
    if (d < 0) return `${-d}d overdue`;
    if (d <= 6) return `in ${d}d`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function dueClass(iso) { const d = daysUntil(iso); return d < 0 ? 'over' : d === 0 ? 'today' : 'soon'; }
  function toDateInput(iso) { try { return new Date(iso).toISOString().slice(0, 10); } catch (e) { return ''; } }
  function fromDateInput(val) { return val ? new Date(val + 'T12:00:00').toISOString() : null; }
  const elVal = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function firstName(m) { return m ? m.name.split(' ')[0] : 'there'; }
  // <option> list of the team for an assignee picker, with one preselected
  function teamOptions(selId) {
    return getTeam().map((m) => `<option value="${m.id}"${m.id === selId ? ' selected' : ''}>👤 ${esc(firstName(m))}${m.you ? ' (You)' : ''}</option>`).join('');
  }

  /* ---------------------------------------------------- momentum score ---- */
  function scoreMeta(s) {
    if (s >= 80) return { label: 'Flying',        emoji: '🚀', color: '#10b981' };
    if (s >= 65) return { label: 'On track',      emoji: '🟢', color: '#22c55e' };
    if (s >= 50) return { label: 'Steady',        emoji: '🔵', color: '#6366f1' };
    if (s >= 35) return { label: 'Losing steam',  emoji: '🟠', color: '#f59e0b' };
    return         { label: 'Stalling',      emoji: '🛑', color: '#ef4444' };
  }

  function momentum(pid) {
    const proj = projById(pid);
    const ts = tasksOf(pid), ds = delivsOf(pid), ns = notesOf(pid);

    const totalD = ds.length || 1;
    const doneD  = ds.filter((d) => d.status === 'approved' || d.status === 'delivered').length;
    const progress = doneD / totalD;

    const comp7 = ts.filter((t) => t.status === 'done' && t.doneAt && daysSince(t.doneAt) <= 7).length;

    const ups = [
      ...ts.map((t) => (t.status === 'done' && t.doneAt) ? daysSince(t.doneAt) : t.up),
      ...ds.map((d) => d.up),
      ...ns.map((n) => daysSince(n.at)),
    ].filter((v) => v != null);
    const lastActivity = ups.length ? Math.min(...ups) : 99;

    const blockers = ts.filter((t) => t.status === 'blocked').length + ds.filter((d) => d.status === 'blocked').length;
    const staleW = [...ts, ...ds].filter((x) => x.status === 'waiting' && (x.up || 0) > 5);
    const staleMax = staleW.reduce((m, x) => Math.max(m, x.up || 0), 0);

    let s = 45;
    s += progress * 25;
    s += Math.min(comp7 * 7, 25);
    s += lastActivity <= 2 ? 12 : (lastActivity <= 5 ? 4 : -10);
    s -= blockers * 13;
    s -= staleW.length * 9;
    if (proj.status === 'onhold') s -= 8;
    s = Math.max(2, Math.min(100, Math.round(s)));

    const factors = [];
    if (ds.length) factors.push({ up: doneD > 0, txt: `${doneD}/${ds.length} deliverables locked` });
    if (comp7 > 0) factors.push({ up: true, txt: `${comp7} task${comp7>1?'s':''} finished this week` });
    if (lastActivity <= 2) factors.push({ up: true, txt: 'Active in the last 2 days' });
    else if (lastActivity > 5) factors.push({ up: false, txt: `Quiet for ${lastActivity} days` });
    if (blockers > 0) factors.push({ up: false, txt: `${blockers} blocker${blockers>1?'s':''} in the way` });
    if (staleW.length > 0) factors.push({ up: false, txt: `Waiting on client ${staleMax} days` });
    if (proj.status === 'onhold') factors.push({ up: false, txt: 'Project on hold' });

    return Object.assign({ score: s, factors }, scoreMeta(s));
  }

  function ringHTML(m, big) {
    const size = big ? 88 : 46, stroke = big ? 7 : 4.5;
    const r = (size - stroke) / 2 - 1, c = 2 * Math.PI * r, off = c * (1 - m.score / 100);
    return `<div class="ring${big ? ' big-ring' : ''}">
      <svg width="${size}" height="${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--bg-2)" stroke-width="${stroke}"></circle>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${m.color}" stroke-width="${stroke}"
                stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
      </svg><span class="ring-num">${m.score}</span></div>`;
  }

  /* ----------------------------------------------- avatars / small UI ----- */
  function avatar(id, lg) {
    const m = memById(id); if (!m) return '';
    return `<span class="av av-btn${lg ? ' lg' : ''}" data-member="${id}" style="background:${m.color}" title="${esc(m.name)}${m.role ? ' · ' + esc(m.role) : ''}">${m.initials}</span>`;
  }
  function avatarStack(ids) {
    return `<span class="avatars">${ids.map((id) => avatar(id)).join('')}</span>`;
  }
  // keyboard-accessible checkbox (a real <button>, so Tab + Space/Enter work)
  function checkBtn(id, done, label) {
    return `<button type="button" class="check${done ? ' done' : ''}" data-toggle="${id}" aria-pressed="${done ? 'true' : 'false'}" aria-label="${esc(label || (done ? 'Mark not done' : 'Mark done'))}"></button>`;
  }

  /* ----------------------------------------------------- triage buckets --- */
  // "Mine" filter — focus on what's assigned to you (nothing is hidden from anyone; it's just a view)
  function mineId() { const m = me(); return m ? m.id : null; }
  function isMine(t) { return t.who === mineId(); }
  function taskVisible(t) { return !mineOnly || isMine(t); }
  function dlvVisible(d) { return !mineOnly || (projById(d.pid) && (projById(d.pid).team || []).includes(mineId())); } // your projects' deliverables

  function bucketItems() {
    const open = data.tasks.filter((t) => t.status !== 'done' && taskVisible(t));
    const dlv = data.deliverables.filter(dlvVisible);
    const dueToday = [
      ...open.filter((t) => daysUntil(t.due) <= 0),
      ...dlv.filter((d) => !['approved','delivered'].includes(d.status) && daysUntil(d.due) <= 0)
        .map((d) => ({ ...d, _kind: 'deliverable' })),
    ];
    const review  = [...open.filter((t) => t.status === 'review'),
                     ...dlv.filter((d) => d.status === 'review').map((d) => ({ ...d, _kind: 'deliverable' }))];
    const blocked = open.filter((t) => t.status === 'blocked');
    const waiting = [...open.filter((t) => t.status === 'waiting'),
                     ...dlv.filter((d) => d.status === 'waiting').map((d) => ({ ...d, _kind: 'deliverable' }))];
    return { dueToday, review, blocked, waiting };
  }

  /* ------------------------------------------------------ daily brief ----- */
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

  // inline jump-link inside the brief — scrolls to a triage column (#col-…) or
  // switches view ("view:energy"). Lets a glanced number take you to the list.
  function jumpEl(target, inner) { return `<button type="button" class="brief-link" data-jump="${target}">${inner}</button>`; }
  // inline link that opens a project (for the named items mentioned in the brief)
  function projEl(pid, inner) { return `<button type="button" class="brief-link" data-open-project="${pid}">${inner}</button>`; }

  function dailyBrief() {
    const b = bucketItems();
    const quick = data.tasks.filter((t) => t.status !== 'done' && taskVisible(t) && t.energy === 'quick' && daysUntil(t.due) <= 1).length;

    const lines = [];
    const dueN = b.dueToday.length, revN = b.review.length, blkN = b.blocked.length;
    lines.push(`${greeting()}, ${firstName(me())}. You've got ${jumpEl('col-due', `<b>${dueN} item${dueN!==1?'s':''}</b>`)} on the runway today${revN ? ` and ${jumpEl('col-review', `<b>${revN}</b>`)} waiting on your review` : ''}.`);

    if (blkN > 0) {
      const worst = [...b.blocked].sort((a, z) => (z.up||0) - (a.up||0))[0];
      const p = projById(worst.pid);
      lines.push(`Heads up — ${jumpEl('col-blocked', `<b>${blkN} item${blkN>1?'s are':' is'} blocked</b>`)}, including ${projEl(worst.pid, `“${esc(worst.title)}”`)} for ${esc(p.client)}.`);
    }
    const stale = [...data.tasks, ...data.deliverables].filter((x) => x.status === 'waiting' && (x.up||0) > 7)
      .sort((a, z) => (z.up||0) - (a.up||0))[0];
    if (stale) {
      const p = projById(stale.pid);
      lines.push(`${esc(p.client)} has been quiet on ${projEl(stale.pid, `“${esc(stale.title)}”`)} for ${jumpEl('col-waiting', `<b>${stale.up} days</b>`)} — probably worth a nudge.`);
    }
    if (quick > 0) lines.push(`Tip: clear your ${jumpEl('view:energy', `<b>${quick} quick win${quick>1?'s':''}</b>`)} first to build momentum, then protect a block for deep work.`);

    return { paragraphs: lines, focus: focusOrder() };
  }

  // how urgent is a single task? higher = more important. Shared by the Daily
  // Brief focus order AND "the one next action" so they never disagree.
  function taskPriority(t) {
    const du = daysUntil(t.due);
    if (t.status === 'blocked') return 100 + (t.up || 0);
    if (t.status === 'review' && du <= 0) return 92;
    if (du < 0) return 88 + (-du);
    if (du === 0) return 80;
    if (t.status === 'waiting' && (t.up || 0) > 5) return 70;
    if (du === 1) return 55;
    return 30 - du;
  }

  // the single most important open task in a project — drives "the one next action"
  function topTaskFor(pid) {
    const open = tasksOf(pid).filter((t) => t.status !== 'done');
    if (!open.length) return null;
    return open.slice().sort((a, z) => taskPriority(z) - taskPriority(a))[0];
  }

  function statusLabel(st) { const o = STATUS_OPTS.find(([v]) => v === st); return o ? o[1] : st; }

  function focusOrder() {
    return data.tasks.filter((t) => t.status !== 'done' && taskVisible(t))
      .map((t) => ({ t, pr: taskPriority(t) }))
      .sort((a, z) => z.pr - a.pr).slice(0, 3)
      .map(({ t }) => ({ task: t, proj: projById(t.pid) }));
  }

  /* ---------------------------------------------- project AI summary ------ */
  function projectSummary(pid) {
    const p = projById(pid), m = momentum(pid);
    const ts = tasksOf(pid), ds = delivsOf(pid);
    const open = ts.filter((t) => t.status !== 'done').length;
    const doneD = ds.filter((d) => ['approved','delivered'].includes(d.status)).length;
    const blockers = ts.filter((t) => t.status === 'blocked').length;
    const comp7 = ts.filter((t) => t.status === 'done' && t.doneAt && daysSince(t.doneAt) <= 7).length;
    const stale = [...ts, ...ds].filter((x) => x.status === 'waiting' && (x.up||0) > 5)
      .sort((a, z) => (z.up||0)-(a.up||0))[0];

    let s = `${p.client}'s ${p.name} is ${m.label.toLowerCase()} at ${m.score}/100. `;
    s += `${doneD} of ${ds.length} deliverables are locked, with ${open} task${open!==1?'s':''} still open`;
    s += blockers ? `, though ${blockers} ${blockers>1?'are':'is'} blocked. ` : '. ';
    if (stale) s += `The client has been quiet on “${stale.title}” for ${stale.up} days — that's the main drag on momentum. `;
    else if (comp7) s += `The team's been moving — ${comp7} task${comp7>1?'s':''} wrapped this week. `;
    const nextT = topTaskFor(pid);
    s += nextT ? `Next move: ${nextT.title}.` : `Nothing open right now — this one's caught up.`;
    return s;
  }

  /* ------------------------------------------ transcript → tasks (real) --- */
  function extractTasks(text) {
    // action cues — verbs, obligations, and contractions ("I'll", "we'll")
    const cues = /\b(action item|action|todo|to-?do|follow ?up|need(s)? to|have to|has to|should|must|will|i'?ll|we'?ll|they'?ll|you'?ll|he'?ll|she'?ll|gonna|going to|plan(ning)? to|let'?s|send|draft|review|fix|update|schedule|prepare|create|design|build|finali[sz]e|confirm|check|add|write|ping|nudge|circle back|sync|deliver|set up|book|email|call|export|lock|pick)\b/i;
    // framing / chatter lines that look like actions but aren't
    const skip = /^(okay|ok|so|alright|all right|anyway|recap|recapping|great|thanks|thank you|cool|right|well|hey|hi|hello|good morning|morning|nice|perfect|yeah|yep)\b/i;
    const lines = text.split(/\n|(?<=[.!?;])\s+/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (let l of lines) {
      if (l.length < 6 || !cues.test(l)) continue;
      l = l.replace(/^[-*••\d.)\s]+/, '')                       // bullets / numbering
           .replace(/^[A-Z][a-zA-Z]+( [A-Z][a-zA-Z]+)?:\s*/, '') // "Name:" speaker tags
           .replace(/\b(um|uh|like|you know),?\s*/gi, '')         // filler words
           .replace(/\s+/g, ' ')
           .replace(/[.;,\s]+$/, '')
           .trim();
      if (l.length < 5 || l.length > 160 || skip.test(l)) continue;
      out.push(l.charAt(0).toUpperCase() + l.slice(1));
    }
    return [...new Set(out)].slice(0, 8);
  }

  const SAMPLE_TRANSCRIPT =
`Reuben: Okay, recap from the Hold My Beer sync.
Priya: I'll export the print-ready dielines once legal signs off.
Dana: I need to write the back-of-can flavor copy by Thursday.
We should pick the foil color for the 6-pack this week.
Client mentioned they want a louder hop callout — let's add a "double dry-hopped" badge.
Sam to schedule the photoshoot for the lifestyle shots.
Also, just chatting about the weather, nothing important there.
Follow up with the printer about minimum order quantities.`;

  /* ====================================================== RENDER ========== */
  const app = document.getElementById('app');

  /* --------------------------------------------------- auth (login) UI ---- */
  function authCard(inner) {
    return `<div class="auth-wrap"><div class="auth-card">
      <div class="brand-lg"><div class="logo"><img src="PullPin_Icon_Web.png" alt="PullPin" /></div><div class="bl-text">PullPin Pulse<small>Less management. More momentum.</small></div></div>
      ${inner}
    </div></div>`;
  }
  function authScreenHTML() {
    const A = window.CTAuth;
    if (!A.ready) return authCard(`<p class="muted" style="text-align:center;padding:14px 0">Loading…</p>`);

    if (A.recovery) {
      const inv = A.invite;
      return authCard(`
        <h2 class="auth-h">${inv ? 'Welcome to PullPin Pulse 👋' : 'Set a new password'}</h2>
        <p class="auth-sub">${inv ? 'Set a password to finish joining your team.' : 'Choose a new password for your account.'}</p>
        <input id="auth-new-password" type="password" placeholder="${inv ? 'Choose a password' : 'New password'}" autocomplete="new-password" />
        ${authErr ? `<div class="auth-err">${esc(authErr)}</div>` : ''}
        <button class="btn primary auth-btn" data-auth-reset-submit ${authBusy ? 'disabled' : ''}>${authBusy ? 'Saving…' : (inv ? 'Set password & join' : 'Update password')}</button>`);
    }
    if (authMode === 'forgot') {
      return authCard(`
        <h2 class="auth-h">Reset your password</h2>
        <p class="auth-sub">We'll email you a link to set a new one.</p>
        <input id="auth-email" type="email" placeholder="you@company.com" autocomplete="email" />
        ${authMsg ? `<div class="auth-msg">${esc(authMsg)}</div>` : ''}
        ${authErr ? `<div class="auth-err">${esc(authErr)}</div>` : ''}
        <button class="btn primary auth-btn" data-auth-forgot ${authBusy ? 'disabled' : ''}>${authBusy ? 'Sending…' : 'Send reset link'}</button>
        <button class="auth-link" data-auth-switch="login">← Back to sign in</button>`);
    }
    return authCard(`
      <h2 class="auth-h">Welcome back</h2>
      <p class="auth-sub">Sign in to your team's workspace.</p>
      <input id="auth-email" type="email" placeholder="you@company.com" autocomplete="email" />
      <input id="auth-password" type="password" placeholder="Password" autocomplete="current-password" />
      ${authErr ? `<div class="auth-err">${esc(authErr)}</div>` : ''}
      <button class="btn primary auth-btn" data-auth-submit ${authBusy ? 'disabled' : ''}>${authBusy ? '…' : 'Sign in'}</button>
      <button class="auth-link" data-auth-switch="forgot">Forgot password?</button>
      <div class="auth-toggle muted" style="font-size:11.5px">Invite only — ask your admin if you need access.</div>`);
  }
  function authFootHTML() {
    const A = window.CTAuth;
    if (!A || !A.configured || !A.user) return '';
    const prof = getTeam().find((m) => m.you);
    const name = prof ? prof.name : A.user.email;
    return `<div class="auth-foot"><span class="muted" style="font-size:11.5px">Signed in as <b style="color:var(--ink-2)">${esc(name)}</b></span><button class="auth-link" data-do-logout>Log out</button></div>`;
  }

  function render() {
    const A = window.CTAuth;
    if (A && A.configured && (!A.ready || A.recovery || !A.user)) {
      app.innerHTML = authScreenHTML();
      if (A.ready && !authBusy) { const f = app.querySelector('input'); if (f) f.focus(); }
      return;
    }
    app.innerHTML = `<div class="app">${sidebarHTML()}<main class="main"><div class="main-inner">${pageHTML()}</div></main></div>` + modalHTML() + mobileMenuHTML();
    if (refocusId) { const el = document.getElementById(refocusId); if (el) { el.focus(); } refocusId = null; }
  }

  function pageHTML() {
    if (view.name === 'project' && view.projectId) return projectDetailHTML(view.projectId);
    if (view.name === 'projects') return projectsHTML();
    if (view.name === 'energy') return energyHTML();
    if (view.name === 'team') return teamHTML();
    if (view.name === 'feedback') return feedbackHTML();
    return homeHTML();
  }

  /* ----------------------------------------------------------- sidebar ---- */
  function sidebarHTML() {
    const b = bucketItems();
    const openTasks = data.tasks.filter((t) => t.status !== 'done').length;
    const nav = (name, ic, label, badge, extraCls) => `
      <button class="nav-item${extraCls?' '+extraCls:''}${view.name===name||(name==='projects'&&view.name==='project')?' active':''}" data-nav="${name}">
        <span class="ic">${ic}</span><span>${label}</span>${badge!=null?`<span class="badge">${badge}</span>`:''}
      </button>`;
    return `<aside class="sidebar">
      <div class="brand"><div class="logo"><img src="PullPin_Icon_Web.png" alt="PullPin" /></div><div class="name">PullPin Pulse<small>Less management. More momentum.</small></div></div>
      <nav class="nav">
        ${nav('home', '🏠', 'Home', b.dueToday.length)}
        ${nav('projects', '📁', 'Projects', data.projects.length)}
        ${nav('energy', '⚡', 'Energy', openTasks)}
        ${nav('team', '👥', 'Team', getTeam().length, 'nav-team')}
        ${nav('feedback', '💬', 'Feedback', (data.feedback || []).filter((f) => f.status !== 'done').length)}
      </nav>
      <button class="sb-menu-btn" data-menu-toggle aria-label="Menu" aria-expanded="${menuOpen}">☰</button>
      <div class="nav-sep"></div>
      <div class="nav-label">Quick AI</div>
      <button class="nav-item qa-trigger" data-open="transcript"><span class="ic">✨</span><span>Transcript → Tasks</span></button>
      <div class="sidebar-foot">
        <div class="nav-label">The Studio</div>
        <div class="team-row">${avatarStack(getTeam().map((m)=>m.id))}<span class="muted" style="font-size:12px">${getTeam().length} ${getTeam().length===1?'person':'people'}</span></div>
        ${syncStatusHTML()}
        ${authFootHTML()}
        <div class="foot-actions">
          ${themeToggleHTML()}
          <button class="ghost-btn" data-reset>↺ Reset demo</button>
        </div>
      </div>
    </aside>`;
  }

  const THEME_LABEL = { dark: '🌙 Dark', light: '☀️ Light', auto: '🌗 Auto' };
  function themePref() { try { return localStorage.getItem('pp-theme') || 'dark'; } catch (e) { return 'dark'; } }
  function applyTheme(pref) {
    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = pref === 'auto' ? (sysDark ? 'dark' : 'light') : pref;
    document.documentElement.setAttribute('data-theme', resolved);
  }
  function cycleTheme() {
    const order = ['dark', 'light', 'auto'];
    const next = order[(order.indexOf(themePref()) + 1) % order.length];
    try { localStorage.setItem('pp-theme', next); } catch (e) { /* ignore */ }
    applyTheme(next); render();
  }
  function themeToggleHTML() {
    const p = themePref();
    return `<button class="ghost-btn" data-theme-toggle title="Theme: ${p} — tap to change">${THEME_LABEL[p]}</button>`;
  }

  function syncStatusHTML() {
    if (!window.CTSync) return '';
    const s = window.CTSync.status || (window.CTSync.configured ? 'connecting' : 'local');
    const map = { synced: 'Synced · shared', saving: 'Saving…', connecting: 'Connecting…', offline: 'Offline — local', local: 'Local only' };
    return `<div class="sync-status" data-state="${s}" title="${window.CTSync.configured ? 'Changes sync to your team in real time' : 'Single-player — add Supabase keys in config.js to share with your team'}"><span class="ss-dot"></span><span class="ss-text">${map[s] || 'Local only'}</span></div>`;
  }

  // mobile-only dropdown housing the secondary sidebar content (Quick AI, team,
  // sync status, logout, reset). Rendered as a viewport-fixed overlay so it's
  // never clipped by the top bar's overflow/blur. Only appears when menuOpen.
  function mobileMenuHTML() {
    if (!menuOpen) return '';
    return `<div class="mm-scrim" data-menu-close></div>
      <div class="mobile-menu">
        <button class="mm-item" data-nav="team"><span class="ic">👥</span> Team</button>
        <button class="mm-item" data-open="transcript"><span class="ic">✨</span> Transcript → Tasks</button>
        <div class="mm-sep"></div>
        <div class="mm-label">The Studio</div>
        <div class="team-row" style="padding:5px 8px">${avatarStack(getTeam().map((m)=>m.id))}<span class="muted" style="font-size:12px">${getTeam().length} ${getTeam().length===1?'person':'people'}</span></div>
        ${syncStatusHTML()}
        ${authFootHTML()}
        <button class="mm-item" data-theme-toggle><span class="ic">${themePref() === 'auto' ? '🌗' : (themePref() === 'dark' ? '🌙' : '☀️')}</span> Theme: ${themePref()}</button>
        <button class="mm-item" data-reset><span class="ic">↺</span> Reset demo</button>
      </div>`;
  }

  // "Mine / Everyone" filter toggle (nothing hidden — just a focused view)
  function scopeToggleHTML() {
    return `<div class="seg" role="group" aria-label="Show tasks for">
      <button class="seg-btn${!mineOnly ? ' on' : ''}" data-scope="all">Everyone</button>
      <button class="seg-btn${mineOnly ? ' on' : ''}" data-scope="mine">Mine</button>
    </div>`;
  }

  /* ------------------------------------------------------------- home ----- */
  function homeHTML() {
    const b = bucketItems();
    const brief = dailyBrief();
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    const focusHTML = brief.focus.map((f, i) => `
      <button class="focus-item" data-open-project="${f.proj.id}">
        <span class="n">${i+1}</span>
        <span class="txt"><b>${esc(f.task.title)}</b> &nbsp;<span class="cli">${f.proj.emoji} ${esc(f.proj.client)}</span></span>
      </button>`).join('');

    return `
      <div class="page-head">
        <div><h1>${greeting()}, ${esc(firstName(me()))} 👋</h1><div class="sub">${today} · here's what needs you</div></div>
        <div class="head-actions">
          ${scopeToggleHTML()}
          <button class="btn" data-open="transcript"><span class="ic">✨</span> Transcript → Tasks</button>
        </div>
      </div>

      <section class="brief">
        <div class="brief-head"><span class="spark">✨</span><h2>Your Daily Brief</h2><span class="tag">AI · 30-second read</span></div>
        ${brief.paragraphs.map((p) => `<p>${p}</p>`).join('')}
        ${brief.focus.length ? `<div class="focus"><div class="nav-label" style="padding-left:0">Suggested focus order</div>${focusHTML}</div>` : ''}
      </section>

      <div class="triage">
        ${triageCol('col-due', 'Due Today', 'var(--due)', b.dueToday, '🎉', 'Nothing due today. Breathe.')}
        ${triageCol('col-review', 'Needs Review', 'var(--review)', b.review, '👀', 'No reviews waiting on you.')}
        ${triageCol('col-blocked', 'Blocked', 'var(--blocked)', b.blocked, '🛑', 'Nothing blocked. Smooth sailing.')}
        ${triageCol('col-waiting', 'Waiting on Client', 'var(--waiting)', b.waiting, '📨', 'No client balls in their court.')}
      </div>

      <div class="quick-add">
        <div class="qa-wrap">
          <span class="muted qa-plus">＋</span>
          <input id="qa-input" placeholder="Add a task…" autocomplete="off" />
          <select id="qa-proj" class="sel" style="border:none">${data.projects.map((p)=>`<option value="${p.id}">${p.emoji} ${esc(p.client)}</option>`).join('')}</select>
          <select id="qa-energy" class="sel" style="border:none">
            <option value="quick">⚡ Quick</option><option value="deep">🧠 Deep</option><option value="creative">🎨 Creative</option>
          </select>
          <select id="qa-who" class="sel" style="border:none" aria-label="Assign to" title="Assign to">${teamOptions(mineId())}</select>
          <button type="button" class="btn primary qa-add" data-qa-add>＋ Add task</button>
        </div>
      </div>`;
  }

  function triageCol(id, title, color, items, em, emptyMsg) {
    const body = items.length
      ? items.map((it) => homeItem(it)).join('')
      : `<div class="col-empty"><span class="em">${em}</span>${emptyMsg}</div>`;
    return `<div class="col" id="${id}">
      <div class="col-head"><span class="dot" style="background:${color}"></span><h3>${title}</h3><span class="count">${items.length}</span></div>
      <div class="col-body">${body}</div>
    </div>`;
  }

  function homeItem(it) {
    const p = projById(it.pid);
    const isTask = it._kind !== 'deliverable';
    const dc = dueClass(it.due);
    const mineCls = (isTask && isMine(it)) ? ' mine' : '';
    return `<button class="item${mineCls}" data-open-project="${p.id}">
      <div class="it-top">
        ${isTask ? `<span class="check" data-toggle="${it.id}"></span>` : `<span class="muted" style="font-size:13px;margin-top:1px">📦</span>`}
        <span class="it-title">${esc(it.title)}</span>
      </div>
      <div class="it-meta">
        <span class="it-client">${p.emoji} ${esc(p.client)}</span>
        <span class="due-flag ${dc}">${fmtDue(it.due)}</span>
        ${isTask ? avatar(it.who) : ''}
      </div>
    </button>`;
  }

  /* --------------------------------------------------------- projects ----- */
  function projectsHTML() {
    return `
      <div class="page-head">
        <div><h1>Projects</h1><div class="sub">${data.projects.length} active engagements · sorted by momentum</div></div>
      </div>
      <div class="proj-grid">
        ${[...data.projects].map((p)=>({p,m:momentum(p.id)})).sort((a,z)=>z.m.score-a.m.score).map(({p,m})=>projectCard(p,m)).join('')}
      </div>`;
  }

  function projectCard(p, m) {
    const ts = tasksOf(p.id), ds = delivsOf(p.id);
    const open = ts.filter((t)=>t.status!=='done').length;
    const blockers = ts.filter((t)=>t.status==='blocked').length;
    const review = ts.filter((t)=>t.status==='review').length;
    const waiting = ts.filter((t)=>t.status==='waiting').length;
    const doneD = ds.filter((d)=>['approved','delivered'].includes(d.status)).length;
    const pct = ds.length ? Math.round(doneD/ds.length*100) : 0;

    const chips = [];
    if (blockers) chips.push(`<span class="chip blocked">🛑 ${blockers} blocked</span>`);
    if (review)   chips.push(`<span class="chip review">👀 ${review} review</span>`);
    if (waiting)  chips.push(`<span class="chip waiting">📨 ${waiting} waiting</span>`);
    chips.push(`<span class="chip open">${open} open</span>`);

    return `<button class="pcard" data-open-project="${p.id}">
      <span class="accent-bar" style="background:${p.accent}"></span>
      <div class="pc-head">
        <div class="pc-emoji" style="background:${p.accent}22">${p.emoji}</div>
        <div class="pc-titles">
          <div class="pc-client">${esc(p.client)}</div>
          <div class="pc-name">${esc(p.name)} · <span class="status-pill ${p.status}">${p.status==='onhold'?'On hold':'Active'}</span></div>
        </div>
        <div class="ring-wrap">${ringHTML(m)}</div>
      </div>
      <div class="next-action">
        <span class="na-ic">➜</span>
        <div class="na-body"><div class="na-label">Next action</div><div class="na-text">${(() => { const nt = topTaskFor(p.id); return nt ? esc(nt.title) : 'All caught up 🎉'; })()}</div></div>
      </div>
      <div class="pc-foot">
        <div class="progress">
          <div class="p-top"><span>Deliverables</span><span>${doneD}/${ds.length}</span></div>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
        ${avatarStack(p.team)}
      </div>
      <div class="chips">${chips.join('')}</div>
    </button>`;
  }

  // "The one next action" — the live top task, with a checkbox that completes
  // it (via the normal toggle handler) and auto-advances to the next one.
  function nextActionHeroHTML(pid) {
    const nt = topTaskFor(pid);
    if (!nt) {
      return `<div class="next-action" style="margin-bottom:20px">
        <span class="na-ic">✓</span>
        <div class="na-body" style="flex:1"><div class="na-label">The one next action</div><div class="na-text">Nothing open — this project is all caught up 🎉</div></div>
      </div>`;
    }
    return `<div class="next-action na-live" style="margin-bottom:20px">
      <button type="button" class="check na-check" data-toggle="${nt.id}" aria-label="Complete this action and advance to the next" title="Mark done — advances to your next action"></button>
      <div class="na-body" style="flex:1">
        <div class="na-label">The one next action</div>
        <div class="na-text">${esc(nt.title)}</div>
        <div class="na-meta">
          <span class="t-status ${nt.status}">${statusLabel(nt.status)}</span>
          <span class="due-flag ${dueClass(nt.due)}">${fmtDue(nt.due)}</span>
          ${avatar(nt.who)}
        </div>
      </div>
      <span class="na-hint">Check to complete →</span>
    </div>`;
  }

  /* ----------------------------------------------------- project detail --- */
  function projectDetailHTML(pid) {
    const p = projById(pid); if (!p) { view.name='projects'; return projectsHTML(); }
    const m = momentum(pid);
    const ts = tasksOf(pid), ds = delivsOf(pid), ns = notesOf(pid);
    const sumOpen = window.__summaries && window.__summaries[pid];

    const taskRows = ts.length ? ts.map(taskRow).join('') : `<div class="col-empty" style="padding:14px">No tasks yet.</div>`;
    const dlvRows  = ds.length ? ds.map(dlvRow).join('')  : `<div class="col-empty" style="padding:14px">No deliverables yet.</div>`;
    const noteRows = ns.length ? [...ns].sort((a,z)=>new Date(z.at)-new Date(a.at)).map(noteRow).join('') : `<div class="muted" style="font-size:12.5px">No notes yet.</div>`;

    return `
      <button class="back-link" data-nav="projects">← All projects</button>
      <div class="detail-head">
        <div class="d-emoji" style="background:${p.accent}22">${p.emoji}</div>
        <div class="d-titles">
          <div class="d-client">${esc(p.client)}</div>
          <div class="d-name">${esc(p.name)} · <span class="status-pill ${p.status}">${p.status==='onhold'?'On hold':'Active'}</span></div>
          <div class="d-team">${avatarStack(p.team)} <span class="muted" style="font-size:12.5px">${p.team.map((id)=>firstName(memById(id))).join(', ')}</span></div>
        </div>
      </div>

      ${nextActionHeroHTML(pid)}

      <div class="detail-grid">
        <div>
          <div class="panel">
            <div class="panel-head"><h3>Tasks</h3><span class="count">${ts.filter((t)=>t.status!=='done').length} open</span></div>
            <div class="add-row">
              <input id="dt-task" placeholder="Add a task — press Enter…" data-add-task="${pid}" autocomplete="off" />
              <select id="dt-energy" class="sel" aria-label="Energy mode" title="Energy mode"><option value="quick">⚡ Quick</option><option value="deep">🧠 Deep</option><option value="creative">🎨 Creative</option></select>
              <select id="dt-who" class="sel" aria-label="Assign to" title="Assign to">${teamOptions(mineId())}</select>
            </div>
            ${taskRows}
          </div>
          <div class="panel">
            <div class="panel-head"><h3>Deliverables</h3><span class="count">${ds.filter((d)=>['approved','delivered'].includes(d.status)).length}/${ds.length} locked</span></div>
            <div class="add-row">
              <input id="dd-title" placeholder="Add a deliverable — press Enter…" data-add-dlv="${pid}" autocomplete="off" />
            </div>
            ${dlvRows}
          </div>
        </div>

        <div>
          <div class="panel">
            <div class="panel-head"><h3>Momentum</h3><span class="act"><button class="btn" data-summarize="${pid}" style="padding:6px 11px"><span class="ic">✨</span> Summarize</button></span></div>
            <div class="momentum-block">
              ${ringHTML(m, true)}
              <div class="mb-info"><div class="mb-label" style="color:${m.color}">${m.emoji} ${m.label}</div><div class="mb-sub">${m.score}/100 · why this score:</div></div>
            </div>
            <div class="factors">
              ${m.factors.map((f)=>`<div class="factor ${f.up?'up':'down'}"><span class="f-sign">${f.up?'▲':'▼'}</span><span class="f-txt">${esc(f.txt)}</span></div>`).join('')}
            </div>
            ${sumOpen ? `<div class="ai-summary fade-in"><div class="ai-tag">✨ AI summary</div>${esc(sumOpen)}</div>` : ''}
          </div>
          <div class="panel">
            <div class="panel-head"><h3>Notes</h3><span class="count">${ns.length}</span></div>
            ${noteRows}
            <div class="note-add">
              <textarea id="note-${pid}" placeholder="Add a note…" data-note-input="${pid}"></textarea>
              <button class="btn primary" data-add-note="${pid}" style="align-self:flex-end">Add</button>
            </div>
          </div>
        </div>
      </div>
      ${assetsPanelHTML(pid)}`;
  }

  const STATUS_OPTS = [['todo','To do'],['doing','In progress'],['blocked','Blocked'],['review','Needs review'],['waiting','Waiting on client'],['done','Done']];
  function taskRow(t) {
    if (t.id === editTaskId) return taskEditRow(t);
    const done = t.status === 'done';
    const sel = `<select class="t-status ${t.status}" data-set-status="${t.id}" aria-label="Status">${STATUS_OPTS.map(([v,l])=>`<option value="${v}"${v===t.status?' selected':''}>${l}</option>`).join('')}</select>`;
    return `<div class="trow${done?' is-done':''}${isMine(t)?' mine':''}">
      ${checkBtn(t.id, done)}
      <span class="t-title">${esc(t.title)}</span>
      ${avatar(t.who)}
      ${!done ? `<span class="due-flag ${dueClass(t.due)}" style="font-size:10.5px">${fmtDue(t.due)}</span>` : ''}
      ${sel}
      <button type="button" class="icon-btn" data-edit-task="${t.id}" aria-label="Edit task" title="Edit">✎</button>
    </div>`;
  }
  function taskEditRow(t) {
    return `<div class="trow editing">
      <input id="et-title-${t.id}" class="edit-input" value="${esc(t.title)}" data-edit-enter="task:${t.id}" aria-label="Task title" autocomplete="off" />
      <select id="et-who-${t.id}" class="sel" aria-label="Assignee" title="Assignee">${getTeam().map((m)=>`<option value="${m.id}"${m.id===t.who?' selected':''}>${esc(firstName(m))}</option>`).join('')}</select>
      <input id="et-due-${t.id}" class="sel" type="date" value="${toDateInput(t.due)}" aria-label="Due date" title="Due date" />
      <button type="button" class="btn primary mini" data-save-task="${t.id}">Save</button>
      <button type="button" class="icon-btn" data-cancel-edit aria-label="Cancel edit" title="Cancel">✕</button>
      <button type="button" class="icon-btn danger" data-del-task="${t.id}" aria-label="Delete task" title="Delete">🗑</button>
    </div>`;
  }

  const DLV_STAGES = [['draft','Draft'],['review','In review'],['waiting','With client'],['approved','Approved'],['delivered','Delivered']];
  const DLV_INDEX = { draft:0, review:1, waiting:1, approved:2, delivered:3 };
  function dlvRow(d) {
    if (d.id === editDlvId) return dlvEditRow(d);
    const cur = DLV_INDEX[d.status];
    const steps = [0,1,2,3].map((i)=>`<span class="step${i<=cur?' on':''}"></span>`).join('');
    const stageLabel = (DLV_STAGES.find(([v])=>v===d.status)||['',''])[1];
    const color = d.status==='waiting' ? 'var(--waiting)' : (['approved','delivered'].includes(d.status)?'var(--good)':(d.status==='review'?'var(--review)':'var(--ink-3)'));
    return `<div class="dlv">
      <div class="dlv-top">
        <span class="dlv-title">${esc(d.title)}</span>
        <span class="dlv-stage" style="color:${color}">${stageLabel}</span>
        <select class="sel" data-set-dstatus="${d.id}" aria-label="Stage" style="margin-left:8px">${DLV_STAGES.map(([v,l])=>`<option value="${v}"${v===d.status?' selected':''}>${l}</option>`).join('')}</select>
        <button type="button" class="icon-btn" data-edit-dlv="${d.id}" aria-label="Edit deliverable" title="Edit">✎</button>
      </div>
      <div class="pipeline">${steps}</div>
    </div>`;
  }
  function dlvEditRow(d) {
    return `<div class="dlv editing">
      <div class="dlv-top">
        <input id="ed-title-${d.id}" class="edit-input" value="${esc(d.title)}" data-edit-enter="dlv:${d.id}" aria-label="Deliverable title" autocomplete="off" />
        <input id="ed-due-${d.id}" class="sel" type="date" value="${toDateInput(d.due)}" aria-label="Due date" title="Due date" />
        <button type="button" class="btn primary mini" data-save-dlv="${d.id}">Save</button>
        <button type="button" class="icon-btn" data-cancel-edit aria-label="Cancel edit" title="Cancel">✕</button>
        <button type="button" class="icon-btn danger" data-del-dlv="${d.id}" aria-label="Delete deliverable" title="Delete">🗑</button>
      </div>
    </div>`;
  }

  function noteRow(n) {
    if (n.id === editNoteId) return noteEditRow(n);
    const m = memById(n.who);
    return `<div class="note">${avatar(n.who)}<div style="flex:1"><div class="n-body">${esc(n.body)}</div><div class="n-meta">${esc(firstName(m))} · ${n.at?relTime(n.at):'just now'}</div></div>
      <span class="note-actions">
        <button type="button" class="icon-btn" data-edit-note="${n.id}" aria-label="Edit note" title="Edit">✎</button>
        <button type="button" class="icon-btn danger" data-del-note="${n.id}" aria-label="Delete note" title="Delete">🗑</button>
      </span></div>`;
  }
  function noteEditRow(n) {
    return `<div class="note editing"><div style="flex:1">
      <textarea id="en-body-${n.id}" class="edit-input" style="width:100%;min-height:54px;resize:vertical">${esc(n.body)}</textarea>
      <div class="row" style="margin-top:6px;gap:6px">
        <button type="button" class="btn primary mini" data-save-note="${n.id}">Save</button>
        <button type="button" class="icon-btn" data-cancel-edit aria-label="Cancel edit" title="Cancel">✕</button>
        <button type="button" class="icon-btn danger" data-del-note="${n.id}" aria-label="Delete note" title="Delete">🗑</button>
      </div></div></div>`;
  }

  function assetsPanelHTML(pid) {
    const list = assetsOf(pid);
    const cards = list.length
      ? list.map(assetCard).join('')
      : `<div class="muted" style="font-size:12.5px;padding:4px 2px 2px">No assets yet. Paste a link above — originals stay where they live; this just indexes &amp; previews them.</div>`;
    return `<div class="panel assets-panel">
      <div class="panel-head"><h3>Assets</h3><span class="count">${list.length}</span></div>
      <div class="add-row"><input id="asset-url" placeholder="Paste a link — Figma, Drive, Loom, image URL… (press Enter)" data-add-asset="${pid}" autocomplete="off" /></div>
      <div class="asset-grid">${cards}</div>
    </div>`;
  }
  function assetCard(a) {
    const thumb = assetThumb(a);
    const label = serviceLabel(a.url) || (a.type.charAt(0).toUpperCase() + a.type.slice(1));
    const inner = thumb
      ? `<a class="asset-thumb" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" style="background-image:url('${cssUrl(thumb)}')"><span class="asset-badge">${esc(label)}</span></a>`
      : `<a class="asset-thumb icononly" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer"><span class="asset-ic">${TYPE_ICON[a.type] || '🔗'}</span><span class="asset-badge">${esc(label)}</span></a>`;
    return `<div class="asset">${inner}
      <div class="asset-meta"><a class="asset-title" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" title="${esc(a.title)}">${esc(a.title)}</a>
      <button type="button" class="icon-btn danger" data-del-asset="${a.id}" aria-label="Remove asset" title="Remove">🗑</button></div>
    </div>`;
  }
  function relTime(iso) { const d = daysSince(iso); return d===0?'today':d===1?'yesterday':`${d}d ago`; }

  /* ---------------------------------------------------------- energy ------ */
  const ENERGY_COLS = [
    { key:'quick',    em:'⚡', bg:'rgba(245,158,11,.16)',  title:'Quick Wins', desc:'Five-minute knockouts. Clear them to build momentum.' },
    { key:'deep',     em:'🧠', bg:'rgba(99,102,241,.14)',  title:'Deep Work',  desc:'Focus blocks. Protect your calendar for these.' },
    { key:'creative', em:'🎨', bg:'rgba(236,72,153,.14)',  title:'Creative',   desc:'Generative work — do it when the spark hits.' },
    { key:'waiting',  em:'⏳', bg:'rgba(14,165,233,.14)',  title:'Waiting',    desc:'Not on you right now — blocked or with someone else.' },
  ];
  function effEnergy(t) { return (t.status==='blocked'||t.status==='waiting') ? 'waiting' : t.energy; }

  function energyHTML() {
    const open = data.tasks.filter((t)=>t.status!=='done' && taskVisible(t));
    const cols = ENERGY_COLS.map((c) => {
      const items = open.filter((t)=>effEnergy(t)===c.key)
        .sort((a,z)=>daysUntil(a.due)-daysUntil(z.due));
      const body = items.length ? items.map(energyTask).join('')
        : `<div class="col-empty" style="padding:14px"><span class="em">✓</span>All clear</div>`;
      return `<div class="ecol">
        <div class="ecol-head"><div class="et"><span class="em" style="background:${c.bg}">${c.em}</span><h3>${c.title}</h3><span class="count" style="margin-left:auto;color:var(--ink-3);font-weight:650">${items.length}</span></div>
          <div class="desc">${c.desc}</div></div>
        <div class="ecol-body">${body}</div>
      </div>`;
    }).join('');

    return `
      <div class="page-head">
        <div><h1>Energy View</h1><div class="sub">Open work, grouped by the kind of brain it needs — not just the date</div></div>
        <div class="head-actions">${scopeToggleHTML()}</div>
      </div>
      <div class="energy-grid">${cols}</div>`;
  }

  function energyTask(t) {
    const p = projById(t.pid);
    return `<div class="etask${isMine(t) ? ' mine' : ''}">
      ${checkBtn(t.id, false)}
      <button type="button" class="et-open" data-open-project="${t.pid}" style="flex:1;text-align:left;background:none;border:none">
        <div class="et-title">${esc(t.title)}</div>
        <div class="et-cli">${p.emoji} ${esc(p.client)} · ${fmtDue(t.due)}</div>
      </button>
      ${avatar(t.who)}
    </div>`;
  }

  /* -------------------------------------------------------- feedback ------ */
  const FB_TYPES  = [['idea', '💡', 'Idea'], ['bug', '🐛', 'Bug'], ['other', '💬', 'Other']];
  const FB_STATUS = [['open', 'Open'], ['planned', 'Planned'], ['done', 'Done']];

  function feedbackHTML() {
    const items = [...(data.feedback || [])].sort((a, z) => {
      const sd = (a.status === 'done' ? 1 : 0) - (z.status === 'done' ? 1 : 0);
      if (sd) return sd;                                            // done items sink
      return ((z.votes || []).length - (a.votes || []).length) || (new Date(z.at) - new Date(a.at));
    });
    const list = items.length
      ? items.map(fbRow).join('')
      : `<div class="col-empty" style="padding:26px"><span class="em">🙌</span>No feedback yet — be the first to drop a suggestion.</div>`;
    return `
      <div class="page-head"><div><h1>Feedback</h1><div class="sub">Bugs, ideas &amp; suggestions from the team — for the tool itself. Upvote what matters.</div></div></div>
      <div class="panel fb-compose">
        <div class="fb-types">${FB_TYPES.map(([v, emo, label]) => `<button type="button" class="fb-chip${fbType === v ? ' on' : ''}" data-fb-type="${v}">${emo} ${label}</button>`).join('')}</div>
        <textarea id="fb-body" placeholder="What's on your mind? A bug, an idea, a 'wouldn't it be cool if…' (⌘+Enter to send)"></textarea>
        <div class="row" style="justify-content:flex-end"><button class="btn primary" data-fb-submit>Send feedback</button></div>
      </div>
      <div class="fb-list">${list}</div>`;
  }
  function fbRow(f) {
    const meId = me() ? me().id : null;
    const voted = (f.votes || []).includes(meId);
    const emo = (FB_TYPES.find((t) => t[0] === f.type) || ['', '💬'])[1];
    const statusSel = `<select class="sel fb-status ${f.status}" data-set-fbstatus="${f.id}" aria-label="Status">${FB_STATUS.map(([v, l]) => `<option value="${v}"${v === f.status ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    return `<div class="fb-item${f.status === 'done' ? ' done' : ''}">
      <button type="button" class="fb-vote${voted ? ' on' : ''}" data-fb-vote="${f.id}" aria-label="Upvote" aria-pressed="${voted ? 'true' : 'false'}"><span class="fb-caret">▲</span><span class="fb-count">${(f.votes || []).length}</span></button>
      <div class="fb-main">
        <div class="fb-body">${esc(f.body)}</div>
        <div class="fb-meta"><span class="fb-type">${emo} ${esc(f.type)}</span> · ${esc(firstName(memById(f.by)) || 'Someone')} · ${f.at ? relTime(f.at) : 'just now'}</div>
      </div>
      <div class="fb-actions">${statusSel}<button type="button" class="icon-btn danger" data-del-fb="${f.id}" aria-label="Delete feedback" title="Delete">🗑</button></div>
    </div>`;
  }

  /* ------------------------------------------------------------- team ----- */
  function teamHTML() {
    const team = getTeam();
    const cards = team.map((m) => `
      <button class="member-card" data-member="${m.id}">
        <span class="av-xl" style="background:${m.color}">${m.initials}</span>
        <div class="mc-name">${esc(m.name)}${m.you ? ' <span class="mc-you">You</span>' : ''}</div>
        <div class="mc-role">${esc(m.role || '—')}</div>
      </button>`).join('');
    return `
      <div class="page-head"><div><h1>Team</h1><div class="sub">${team.length} ${team.length===1?'member':'members'} · tap anyone to see their profile</div></div></div>
      <div class="member-grid">${cards}</div>`;
  }
  function fmtJoined(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function memberWorkload(id) {
    const open = data.tasks.filter((t) => t.who === id && t.status !== 'done').length;
    const pids = new Set();
    data.tasks.forEach((t) => { if (t.who === id) pids.add(t.pid); });
    data.projects.forEach((p) => { if ((p.team || []).includes(id)) pids.add(p.id); });
    return { open, projects: pids.size };
  }
  function memberModalHTML(m) {
    if (modal.editing) {
      return `<div class="scrim" data-close-modal><div class="modal member-modal" data-stop>
        <div class="modal-head"><span class="spark">👤</span><h3>Edit profile</h3><button class="x" data-close-modal>×</button></div>
        <div class="modal-body">
          <label class="prof-label">Name</label>
          <input id="prof-name" class="prof-input" value="${esc(m.name)}" autocomplete="off" />
          <label class="prof-label">Role</label>
          <input id="prof-role" class="prof-input" value="${esc(m.role || '')}" placeholder="e.g. Designer, Copywriter…" autocomplete="off" />
          <label class="prof-label">Bio</label>
          <textarea id="prof-bio" class="prof-input" rows="3" placeholder="A line or two about you">${esc(m.bio || '')}</textarea>
          ${profErr ? `<div class="auth-err">${esc(profErr)}</div>` : ''}
        </div>
        <div class="modal-foot"><button class="btn" data-cancel-profile>Cancel</button><button class="btn primary" data-save-profile="${m.id}">Save</button></div>
      </div></div>`;
    }
    const wl = memberWorkload(m.id);
    return `<div class="scrim" data-close-modal><div class="modal member-modal" data-stop>
      <div class="modal-head"><span class="spark">👤</span><h3>Profile</h3><button class="x" data-close-modal>×</button></div>
      <div class="modal-body">
        <div class="member-hero">
          <span class="av-xl" style="background:${m.color}">${m.initials}</span>
          <div><div class="mh-name">${esc(m.name)}${m.you ? ' <span class="mc-you">You</span>' : ''}</div>
          <div class="mh-role">${m.role ? esc(m.role) : '<span class="muted">No role set</span>'}</div></div>
        </div>
        <div class="member-fields">
          ${m.email ? `<div class="mf"><span class="mf-k">Email</span><span class="mf-v">${esc(m.email)}</span></div>` : ''}
          ${m.joinedAt ? `<div class="mf"><span class="mf-k">Joined</span><span class="mf-v">${esc(fmtJoined(m.joinedAt))}</span></div>` : ''}
          <div class="mf"><span class="mf-k">Workload</span><span class="mf-v">${wl.open} open task${wl.open!==1?'s':''} · ${wl.projects} project${wl.projects!==1?'s':''}</span></div>
        </div>
        <div class="member-bio">${m.bio ? esc(m.bio) : '<span class="muted">No bio yet.</span>'}</div>
        ${m.you ? `<button class="btn primary" data-edit-profile style="margin-top:16px;width:100%;justify-content:center">Edit my profile</button>` : ''}
      </div>
    </div></div>`;
  }

  /* ----------------------------------------------------------- modal ------ */
  function modalHTML() {
    if (!modal) return '';
    if (modal.type === 'member') { const m = getTeam().find((x) => x.id === modal.id); return m ? memberModalHTML(m) : ''; }
    if (modal.type === 'transcript') {
      const ex = modal.extracted || [];
      const exHTML = ex.length ? `<div class="extracted">
          <div class="nav-label" style="padding-left:0">Found ${ex.length} action${ex.length>1?'s':''} — assign &amp; add</div>
          ${ex.map((t,i)=>`<div class="ex-task"><button type="button" class="check done" data-ex-check="${i}" aria-pressed="true" aria-label="Include this action"></button><span class="ex-title">${esc(t)}</span>
            <select class="sel" data-ex-proj="${i}" aria-label="Assign to project">${data.projects.map((p)=>`<option value="${p.id}">${p.emoji} ${esc(p.client)}</option>`).join('')}</select></div>`).join('')}
        </div>` : '';
      return `<div class="scrim" data-close-modal>
        <div class="modal" data-stop>
          <div class="modal-head"><span class="spark">✨</span><h3>Transcript → Tasks</h3><button class="x" data-close-modal>×</button></div>
          <div class="modal-body">
            <div class="hint">Paste meeting notes or a transcript. I'll pull out the action items — then you assign each to a project.</div>
            <textarea id="transcript-text" placeholder="Paste your transcript here…">${esc(modal.text||'')}</textarea>
            <div style="margin-top:10px"><button class="ghost-btn" style="flex:none;display:inline-block" data-fill-sample>Try a sample</button></div>
            ${exHTML}
          </div>
          <div class="modal-foot">
            <button class="btn" data-extract><span class="ic">✨</span> Extract tasks</button>
            ${ex.length?`<button class="btn primary" data-add-extracted>Add ${ex.length} task${ex.length>1?'s':''}</button>`:''}
          </div>
        </div>
      </div>`;
    }
    return '';
  }

  /* ----------------------------------------------------------- toast ------ */
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t)=>t.remove());
    const el = document.createElement('div'); el.className='toast'; el.textContent=msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.remove(), 2200);
  }
  function toastUndo(msg) {
    document.querySelectorAll('.toast').forEach((t)=>t.remove());
    const el = document.createElement('div'); el.className='toast';
    el.innerHTML = `<span>${esc(msg)}</span><button type="button" class="undo-btn" data-undo>Undo</button>`;
    document.body.appendChild(el);
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.remove(), 5000); // longer, so undo is reachable
  }

  /* ====================================================== ACTIONS ========= */
  // ids mid-completion-animation. Their data change is held until the beat ends,
  // so neither our own save nor a realtime sync echo can re-render and yank the
  // card away while it's still playing. __ctApplyRemote also defers while this is non-empty.
  const pendingComplete = new Set();
  // toast with an Undo that reverts a *completion* (vs deletion). 5s window.
  function completeToast(id) {
    document.querySelectorAll('.toast').forEach((t)=>t.remove());
    const el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = `<span>Nice — task done ✓</span><button type="button" class="undo-btn" data-undo-complete="${id}">Undo</button>`;
    document.body.appendChild(el);
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.remove(), 5000);
  }
  function markDone(t) { t.status = 'done'; t.doneAt = new Date().toISOString(); t.up = 0; }
  function toggleTask(id) {
    const t = data.tasks.find((x)=>x.id===id); if (!t) return;
    if (t.status === 'done') { t.status = 'todo'; delete t.doneAt; t.up = 0; save(); render(); return; }
    markDone(t); save(); render(); completeToast(id);
  }
  // completing from a Home/Energy list: tick the box, HOLD the green "done" state
  // for a clear beat, THEN collapse it out. The task isn't marked done / saved
  // until the beat finishes — that's what stops a sync echo cutting it short.
  function flashComplete(id, btn, card) {
    const t = data.tasks.find((x)=>x.id===id); if (!t) return;
    if (t.status === 'done') { toggleTask(id); return; }   // safety: un-complete via normal path
    btn.classList.add('done');
    card.classList.add('completing');
    pendingComplete.add(id);
    completeToast(id);
    setTimeout(() => {
      if (!pendingComplete.has(id)) return;                 // undone during the beat — leave it open
      pendingComplete.delete(id);
      const tk = data.tasks.find((x)=>x.id===id);
      if (tk) { markDone(tk); save(); }
      render();
    }, 1150);
  }
  function undoComplete(id) {
    document.querySelectorAll('.toast').forEach((x)=>x.remove());
    if (pendingComplete.has(id)) {                          // cancel before it ever commits
      pendingComplete.delete(id);
      render(); toast('Kept it open ↩'); return;
    }
    const t = data.tasks.find((x)=>x.id===id);
    if (t) { t.status = 'todo'; delete t.doneAt; t.up = 0; save(); }
    render(); toast('Brought it back ↩');
  }
  function setStatus(id, val) {
    const t = data.tasks.find((x)=>x.id===id); if (!t) return;
    t.status = val; t.up = 0;
    if (val === 'done') t.doneAt = new Date().toISOString(); else delete t.doneAt;
    save(); render();
  }
  function setDStatus(id, val) {
    const d = data.deliverables.find((x)=>x.id===id); if (!d) return;
    d.status = val; d.up = 0; save(); render();
  }
  function addTask(pid, title, energy, who) {
    title = (title||'').trim(); if (!title) return;
    const id = genId('t');
    data.tasks.push({ id, pid, title, status:'todo', energy: energy||'quick', who: who || me().id, due: new Date(Date.now()+DAY).toISOString(), up: 0 });
    save(); const m = memById(who || me().id); toast(`Task added${m && !m.you ? ' · assigned to ' + firstName(m) : ''}`);
  }
  function addNote(pid, body) {
    body = (body||'').trim(); if (!body) return;
    data.notes.push({ id: genId('n'), pid, who: me().id, body, at: new Date().toISOString() });
    save(); render(); toast('Note added');
  }
  function addFeedback(body) {
    body = (body || '').trim(); if (!body) return;
    if (!data.feedback) data.feedback = [];
    data.feedback.unshift({ id: genId('fb'), type: fbType, body, by: me().id, at: new Date().toISOString(), status: 'open', votes: [] });
    save(); render(); toast('Feedback sent — thanks! 🙌');
  }
  function voteFeedback(id) {
    const f = (data.feedback || []).find((x) => x.id === id); if (!f) return;
    f.votes = f.votes || [];
    const uid = me().id, i = f.votes.indexOf(uid);
    if (i >= 0) f.votes.splice(i, 1); else f.votes.push(uid);
    save(); render();
  }
  function setFbStatus(id, val) {
    const f = (data.feedback || []).find((x) => x.id === id); if (!f) return;
    f.status = val; save(); render();
  }
  function deleteFeedback(id) { const r = removeFrom(data.feedback || [], id); if (!r) return; lastDeleted = { kind: 'feedback', item: r.item, index: r.index }; save(); render(); toastUndo('Feedback deleted'); }

  function addAsset(pid, url) {
    url = (url || '').trim(); if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;       // be forgiving about pasted links
    if (!data.assets) data.assets = [];
    data.assets.push({ id: genId('as'), pid, title: prettyName(url), url, type: assetType(url), by: me().id, at: new Date().toISOString() });
    save(); toast('Asset linked');
  }
  function addDeliverable(pid, title) {
    title = (title||'').trim(); if (!title) return;
    data.deliverables.push({ id: genId('d'), pid, title, status:'draft', due: new Date(Date.now()+7*DAY).toISOString(), up: 0 });
    save(); toast('Deliverable added');
  }

  // --- inline edit saves ----------------------------------------------------
  function saveTaskEdit(id, title, who, dueVal) {
    const t = data.tasks.find((x) => x.id === id); if (!t) return;
    title = (title || '').trim(); if (title) t.title = title;
    if (who) t.who = who;
    const due = fromDateInput(dueVal); if (due) t.due = due;
    t.up = 0; editTaskId = null; save(); render(); toast('Task updated');
  }
  function saveDlvEdit(id, title, dueVal) {
    const d = data.deliverables.find((x) => x.id === id); if (!d) return;
    title = (title || '').trim(); if (title) d.title = title;
    const due = fromDateInput(dueVal); if (due) d.due = due;
    d.up = 0; editDlvId = null; save(); render(); toast('Deliverable updated');
  }
  function saveNoteEdit(id, body) {
    const n = data.notes.find((x) => x.id === id); if (!n) return;
    body = (body || '').trim(); if (body) n.body = body;
    editNoteId = null; save(); render(); toast('Note updated');
  }

  // --- delete with one-level undo ------------------------------------------
  function removeFrom(arr, id) { const i = arr.findIndex((x) => x.id === id); return i < 0 ? null : { item: arr.splice(i, 1)[0], index: i }; }
  function deleteTask(id) { const r = removeFrom(data.tasks, id); if (!r) return; lastDeleted = { kind: 'tasks', item: r.item, index: r.index }; editTaskId = null; save(); render(); toastUndo('Task deleted'); }
  function deleteDeliverable(id) { const r = removeFrom(data.deliverables, id); if (!r) return; lastDeleted = { kind: 'deliverables', item: r.item, index: r.index }; editDlvId = null; save(); render(); toastUndo('Deliverable deleted'); }
  function deleteNote(id) { const r = removeFrom(data.notes, id); if (!r) return; lastDeleted = { kind: 'notes', item: r.item, index: r.index }; editNoteId = null; save(); render(); toastUndo('Note deleted'); }
  function deleteAsset(id) { const r = removeFrom(data.assets || [], id); if (!r) return; lastDeleted = { kind: 'assets', item: r.item, index: r.index }; save(); render(); toastUndo('Asset removed'); }
  function undoDelete() {
    if (!lastDeleted) return;
    data[lastDeleted.kind].splice(lastDeleted.index, 0, lastDeleted.item);
    lastDeleted = null; save(); render(); toast('Restored ↩');
  }

  /* ----------------------------------------------------- auth handlers ---- */
  function authSwitch(mode) { authMode = mode; authBusy = false; authErr = ''; authMsg = ''; render(); }
  function friendlyAuthErr(e) {
    const m = (e && e.message) || String(e);
    if (/invalid login/i.test(m)) return 'Wrong email or password.';
    if (/already registered|already been registered|already exists/i.test(m)) return 'That email already has an account — try signing in.';
    if (/password should be at least|at least 6/i.test(m)) return 'Password is too short (use at least 6 characters).';
    if (/unable to validate email|invalid email/i.test(m)) return 'That doesn’t look like a valid email.';
    return m;
  }
  async function doAuthSubmit() {
    const email = (elVal('auth-email') || '').trim();
    const password = elVal('auth-password');
    const name = (elVal('auth-name') || '').trim();
    if (!email || !password) { authErr = 'Email and password are required.'; render(); return; }
    authBusy = true; authErr = ''; render();
    try {
      if (authMode === 'signup') await window.CTAuth.signUp(email, password, name);
      else await window.CTAuth.signIn(email, password);
      // success → CTAuth notify() re-renders into the app
    } catch (e) { authBusy = false; authErr = friendlyAuthErr(e); render(); }
  }
  async function doForgot() {
    const email = (elVal('auth-email') || '').trim();
    if (!email) { authErr = 'Enter your email first.'; render(); return; }
    authBusy = true; authErr = ''; authMsg = ''; render();
    try { await window.CTAuth.resetPassword(email); authBusy = false; authMsg = 'Check your email for a reset link.'; render(); }
    catch (e) { authBusy = false; authErr = friendlyAuthErr(e); render(); }
  }
  async function doResetSubmit() {
    const pw = elVal('auth-new-password');
    if (!pw || pw.length < 6) { authErr = 'Use at least 6 characters.'; render(); return; }
    authBusy = true; authErr = ''; render();
    try { await window.CTAuth.updatePassword(pw); authBusy = false; }
    catch (e) { authBusy = false; authErr = friendlyAuthErr(e); render(); }
  }
  async function doLogout() { menuOpen = false; authMode = 'login'; authBusy = false; authErr = ''; authMsg = ''; await window.CTAuth.signOut(); }

  async function saveProfile(id) {
    const name = (elVal('prof-name') || '').trim();
    const role = (elVal('prof-role') || '').trim();
    const bio = (elVal('prof-bio') || '').trim();
    if (!name) { profErr = 'Name is required.'; render(); return; }
    const A = window.CTAuth;
    if (A && A.configured && A.user) {                 // cloud profile
      try {
        await A.updateMyProfile({ name, role, bio });
        if (modal) modal.editing = false; profErr = ''; render(); toast('Profile updated');
      } catch (e) {
        const msg = (e && e.message) || String(e);
        profErr = /could not find|does not exist/i.test(msg)
          ? 'Add the role & bio columns first — run the 2-line SQL I gave you, then try again.'
          : msg;
        render();
      }
    } else {                                            // demo / local profile
      const meMember = data.team.find((mm) => mm.you);
      if (meMember) { meMember.name = name; meMember.role = role; meMember.bio = bio; meMember.initials = initialsOf(name); }
      save(); if (modal) modal.editing = false; profErr = ''; render(); toast('Profile updated');
    }
  }

  /* delegated click */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-nav],[data-open-project],[data-toggle],[data-open],[data-close-modal],[data-stop],[data-extract],[data-add-extracted],[data-fill-sample],[data-summarize],[data-add-note],[data-reset],[data-ex-check],[data-edit-task],[data-save-task],[data-del-task],[data-edit-dlv],[data-save-dlv],[data-del-dlv],[data-edit-note],[data-save-note],[data-del-note],[data-del-asset],[data-cancel-edit],[data-undo],[data-fb-type],[data-fb-submit],[data-fb-vote],[data-del-fb],[data-auth-switch],[data-auth-submit],[data-auth-forgot],[data-auth-reset-submit],[data-do-logout],[data-menu-toggle],[data-menu-close],[data-theme-toggle],[data-scope],[data-member],[data-edit-profile],[data-cancel-profile],[data-save-profile],[data-jump],[data-qa-add],[data-undo-complete]');
    if (!t) return;

    if (t.hasAttribute('data-menu-toggle')) { menuOpen = !menuOpen; render(); return; }
    if (t.hasAttribute('data-menu-close'))  { menuOpen = false; render(); return; }
    if (t.hasAttribute('data-theme-toggle')) { cycleTheme(); return; }
    if (t.dataset.scope) { mineOnly = (t.dataset.scope === 'mine'); try { localStorage.setItem('pp-mine', mineOnly ? '1' : '0'); } catch (e) { /* ignore */ } render(); return; }

    // brief jump-links: scroll to a triage column, or switch to another view
    if (t.dataset.jump) {
      const tgt = t.dataset.jump;
      if (tgt.indexOf('view:') === 0) { menuOpen = false; view.name = tgt.slice(5); view.projectId = null; render(); return; }
      const el = document.getElementById(tgt);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('jump-flash'); setTimeout(() => el.classList.remove('jump-flash'), 1100); }
      return;
    }
    if (t.dataset.undoComplete) { undoComplete(t.dataset.undoComplete); return; }
    if (t.hasAttribute('data-qa-add')) {
      const pid = (document.getElementById('qa-proj') || {}).value || data.projects[0].id;
      const energy = (document.getElementById('qa-energy') || {}).value || 'quick';
      const who = (document.getElementById('qa-who') || {}).value;
      const inp = document.getElementById('qa-input');
      addTask(pid, inp ? inp.value : '', energy, who);
      refocusId = 'qa-input'; render();
      return;
    }

    if (t.dataset.member)            { menuOpen = false; modal = { type: 'member', id: t.dataset.member, editing: false }; profErr = ''; render(); return; }
    if (t.hasAttribute('data-edit-profile'))   { if (modal) modal.editing = true; profErr = ''; render(); return; }
    if (t.hasAttribute('data-cancel-profile')) { if (modal) modal.editing = false; profErr = ''; render(); return; }
    if (t.dataset.saveProfile)       { saveProfile(t.dataset.saveProfile); return; }

    if (t.dataset.authSwitch)                    { authSwitch(t.dataset.authSwitch); return; }
    if (t.hasAttribute('data-auth-submit'))      { doAuthSubmit(); return; }
    if (t.hasAttribute('data-auth-forgot'))      { doForgot(); return; }
    if (t.hasAttribute('data-auth-reset-submit')){ doResetSubmit(); return; }
    if (t.hasAttribute('data-do-logout'))        { doLogout(); return; }

    if (t.hasAttribute('data-stop')) { /* clicks inside modal shouldn't close it */ if (e.target===t) {} }
    if (t.hasAttribute('data-close-modal') && (e.target.hasAttribute('data-close-modal'))) { modal=null; render(); return; }

    if (t.dataset.nav)         { menuOpen = false; view.name = t.dataset.nav; view.projectId = null; render(); return; }
    if (t.dataset.openProject) { menuOpen = false; view.name = 'project'; view.projectId = t.dataset.openProject; if (modal) modal=null; render(); return; }
    if (t.dataset.toggle)      { const card = t.closest('.item, .etask'); if (card) flashComplete(t.dataset.toggle, t, card); else toggleTask(t.dataset.toggle); return; }

    if (t.dataset.open === 'transcript') { menuOpen = false; modal = { type:'transcript', text:'', extracted:[] }; render(); const x=document.getElementById('transcript-text'); if(x)x.focus(); return; }
    if (t.hasAttribute('data-fill-sample')) { modal.text = SAMPLE_TRANSCRIPT; modal.extracted = []; render(); return; }
    if (t.hasAttribute('data-extract')) {
      const txt = (document.getElementById('transcript-text')||{}).value || '';
      modal.text = txt; modal.extracted = extractTasks(txt);
      render();
      if (!modal.extracted.length) toast('No clear action items found — try more detail');
      return;
    }
    if (t.hasAttribute('data-ex-check')) { // toggle inclusion — checked = will be added
      t.classList.toggle('done'); t.setAttribute('aria-pressed', t.classList.contains('done') ? 'true' : 'false'); return;
    }
    if (t.hasAttribute('data-add-extracted')) {
      const rows = [...document.querySelectorAll('.ex-task')];
      let n = 0;
      rows.forEach((row, i) => {
        const checkbox = row.querySelector('[data-ex-check]');
        if (checkbox && !checkbox.classList.contains('done')) return; // unchecked = skip
        const pid = row.querySelector('[data-ex-proj]').value;
        addTask(pid, modal.extracted[i], 'quick'); n++;
      });
      modal = null; render(); toast(`Added ${n} task${n!==1?'s':''} from transcript ✨`);
      return;
    }

    // --- inline edit / delete / undo ---------------------------------------
    if (t.dataset.editTask) { editTaskId = t.dataset.editTask; editDlvId = editNoteId = null; render(); const f = document.getElementById('et-title-' + t.dataset.editTask); if (f) { f.focus(); f.select(); } return; }
    if (t.dataset.saveTask) { const id = t.dataset.saveTask; saveTaskEdit(id, elVal('et-title-'+id), elVal('et-who-'+id), elVal('et-due-'+id)); return; }
    if (t.dataset.delTask)  { deleteTask(t.dataset.delTask); return; }
    if (t.dataset.editDlv)  { editDlvId = t.dataset.editDlv; editTaskId = editNoteId = null; render(); const f = document.getElementById('ed-title-' + t.dataset.editDlv); if (f) { f.focus(); f.select(); } return; }
    if (t.dataset.saveDlv)  { const id = t.dataset.saveDlv; saveDlvEdit(id, elVal('ed-title-'+id), elVal('ed-due-'+id)); return; }
    if (t.dataset.delDlv)   { deleteDeliverable(t.dataset.delDlv); return; }
    if (t.dataset.editNote) { editNoteId = t.dataset.editNote; editTaskId = editDlvId = null; render(); const f = document.getElementById('en-body-' + t.dataset.editNote); if (f) f.focus(); return; }
    if (t.dataset.saveNote) { const id = t.dataset.saveNote; saveNoteEdit(id, elVal('en-body-'+id)); return; }
    if (t.dataset.delNote)  { deleteNote(t.dataset.delNote); return; }
    if (t.dataset.delAsset) { deleteAsset(t.dataset.delAsset); return; }
    if (t.dataset.fbType)   { fbType = t.dataset.fbType; document.querySelectorAll('.fb-chip').forEach((c) => c.classList.toggle('on', c.dataset.fbType === fbType)); return; }
    if (t.hasAttribute('data-fb-submit')) { addFeedback(elVal('fb-body')); return; }
    if (t.dataset.fbVote)   { voteFeedback(t.dataset.fbVote); return; }
    if (t.dataset.delFb)    { deleteFeedback(t.dataset.delFb); return; }
    if (t.hasAttribute('data-cancel-edit')) { editTaskId = editDlvId = editNoteId = null; render(); return; }
    if (t.hasAttribute('data-undo')) { undoDelete(); return; }

    if (t.dataset.summarize) {
      window.__summaries = window.__summaries || {};
      window.__summaries[t.dataset.summarize] = projectSummary(t.dataset.summarize);
      render(); return;
    }
    if (t.dataset.addNote) {
      const ta = document.getElementById('note-' + t.dataset.addNote);
      addNote(t.dataset.addNote, ta ? ta.value : '');
      return;
    }
    if (t.hasAttribute('data-reset')) {
      if (confirm('Reset all data back to the demo seed? Your changes will be cleared.')) {
        const fresh = seedClone();
        Object.keys(data).forEach((k)=>delete data[k]);
        Object.assign(data, fresh);
        if (window.__summaries) window.__summaries = {};
        menuOpen = false; save(); view.name='home'; view.projectId=null; render(); toast('Demo data reset ↺');
      }
      return;
    }
  });

  /* delegated change (status selects, add-task energy) */
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.setStatus)   { setStatus(el.dataset.setStatus, el.value); return; }
    if (el.dataset.setDstatus)  { setDStatus(el.dataset.setDstatus, el.value); return; }
    if (el.dataset.setFbstatus) { setFbStatus(el.dataset.setFbstatus, el.value); return; }
  });

  /* delegated keydown (Enter to add) */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal) { modal = null; render(); return; }
    if (e.key !== 'Enter') return;
    const el = e.target;
    if (el.id === 'auth-new-password') { e.preventDefault(); doResetSubmit(); return; }
    if (el.id === 'auth-email' || el.id === 'auth-password' || el.id === 'auth-name') {
      e.preventDefault(); if (authMode === 'forgot') doForgot(); else doAuthSubmit(); return;
    }
    if (el.id === 'qa-input') {
      e.preventDefault();
      const pid = (document.getElementById('qa-proj')||{}).value || data.projects[0].id;
      const energy = (document.getElementById('qa-energy')||{}).value || 'quick';
      const who = (document.getElementById('qa-who')||{}).value;
      addTask(pid, el.value, energy, who);
      refocusId = 'qa-input'; render();
      return;
    }
    if (el.dataset.addTask) {
      e.preventDefault();
      const energy = (document.getElementById('dt-energy') || {}).value || 'quick';
      const who = (document.getElementById('dt-who') || {}).value;
      addTask(el.dataset.addTask, el.value, energy, who);
      refocusId = 'dt-task'; render();
      return;
    }
    if (el.dataset.addDlv) {
      e.preventDefault();
      addDeliverable(el.dataset.addDlv, el.value);
      refocusId = 'dd-title'; render();
      return;
    }
    if (el.dataset.addAsset) {
      e.preventDefault();
      addAsset(el.dataset.addAsset, el.value);
      refocusId = 'asset-url'; render();
      return;
    }
    if (el.dataset.editEnter) {
      e.preventDefault();
      const [kind, id] = el.dataset.editEnter.split(':');
      if (kind === 'task') saveTaskEdit(id, elVal('et-title-'+id), elVal('et-who-'+id), elVal('et-due-'+id));
      else if (kind === 'dlv') saveDlvEdit(id, elVal('ed-title-'+id), elVal('ed-due-'+id));
      return;
    }
    if (el.id === 'fb-body' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addFeedback(el.value); return; }
    if (el.id && el.id.indexOf('en-body-') === 0 && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); saveNoteEdit(el.id.slice(8), el.value); return;
    }
    if (el.id && el.id.indexOf('note-') === 0 && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); addNote(el.id.slice(5), el.value);
    }
  });

  /* --------------------------------------------- cloud-sync integration --- */
  window.__ctGetState = () => data;
  window.__ctApplyRemote = function (remote) {
    if (!remote) return;
    remote = migrate(remote);
    if (JSON.stringify(remote) === JSON.stringify(data)) return;       // no-op / our own echo
    const ae = document.activeElement;
    if (pendingComplete.size || (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) { // don't clobber an in-progress edit or a completion animation
      clearTimeout(window.__ctRemoteRetry);
      window.__ctRemotePending = remote;
      window.__ctRemoteRetry = setTimeout(() => { const p = window.__ctRemotePending; window.__ctRemotePending = null; if (p) window.__ctApplyRemote(p); }, 1500);
      return;
    }
    Object.keys(data).forEach((k) => delete data[k]);
    Object.assign(data, remote);
    persistLocal();
    render();
  };

  /* ------------------------------------------------------------ go -------- */
  // keep "Auto" theme in sync with the OS as it changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themePref() === 'auto') applyTheme('auto'); });
  }

  window.__ctOnAuth = render;            // re-render on any auth change
  render();
  if (window.CTAuth && window.CTAuth.configured) window.CTAuth.start();   // gate → login → sync
  else if (window.CTSync && window.CTSync.configured) window.CTSync.init();
})();
