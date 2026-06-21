/* ============================================================================
   Creative Tracker — Cloud Sync (lean "shared state" mode)
   ----------------------------------------------------------------------------
   Turns the single-player prototype into a shared one for a small team, FREE,
   via Supabase. The entire app-state object lives in ONE row and is kept live
   across browsers with Supabase Realtime.

   • config.js empty   -> this file no-ops; app uses localStorage (single-player)
   • config.js filled  -> shared "team memory" + live updates

   Trade-off (by design, fine for ~3–5 people): last-write-wins on the shared
   record. The full per-object multiplayer model is the eventual Phase 2.

   Contract with app.js:
     window.__ctGetState()       -> current state object
     window.__ctApplyRemote(obj) -> adopt an incoming shared state
     window.CTSync = { configured, status, init(), push(state) }
   ========================================================================== */
(function () {
  'use strict';

  const cfg = window.CT_CONFIG || {};
  const URL = (cfg.SUPABASE_URL || '').trim();
  const KEY = (cfg.SUPABASE_ANON_KEY || '').trim();
  const ROW_ID = (cfg.STUDIO_ID || 'studio').trim();
  const TABLE = 'app_state';

  const hasLib = typeof window.supabase !== 'undefined' && window.supabase.createClient;
  const configured = !!(URL && KEY && hasLib);

  const CTSync = (window.CTSync = {
    configured,
    status: configured ? 'connecting' : 'local',
    init,
    push,
  });

  function label(s) {
    return s === 'synced' ? 'Synced'
      : s === 'saving' ? 'Saving…'
      : s === 'connecting' ? 'Connecting…'
      : s === 'offline' ? 'Offline'
      : 'Local only';
  }
  function setStatus(s) {
    CTSync.status = s;
    document.querySelectorAll('.sync-status').forEach((el) => {
      el.dataset.state = s;
      const txt = el.querySelector('.ss-text');
      if (txt) txt.textContent = label(s);
    });
  }

  if (!configured) {
    if ((URL || KEY) && !hasLib) console.warn('[sync] Supabase library not loaded — staying local-only.');
    setStatus('local');
    return; // single-player: app.js falls back to localStorage
  }

  // single shared client — auth.js reuses this so the signed-in session authorizes sync under RLS
  const client = (window.CTClient = window.supabase.createClient(URL, KEY, {
    realtime: { params: { eventsPerSecond: 5 } },
    auth: { persistSession: true, autoRefreshToken: true },
  }));
  let pushTimer = null;
  let lastSent = '';        // JSON of the last state we sent/received — kills echoes

  async function init() {
    try {
      const { data: row, error } = await client.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
      if (error) throw error;
      if (row && row.data) {
        lastSent = JSON.stringify(row.data);
        window.__ctApplyRemote(row.data);                       // adopt the team's shared state
      } else {
        const state = window.__ctGetState();                    // first run: seed cloud from local
        lastSent = JSON.stringify(state);
        const { error: upErr } = await client.from(TABLE).upsert({ id: ROW_ID, data: state, updated_at: new Date().toISOString() });
        if (upErr) throw upErr;
      }
      subscribe();
      setStatus('synced');
    } catch (e) {
      console.warn('[sync] init failed — working locally:', (e && e.message) || e);
      setStatus('offline');
    }
  }

  function subscribe() {
    client
      .channel('ct_' + ROW_ID)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: 'id=eq.' + ROW_ID }, (payload) => {
        const remote = payload.new && payload.new.data;
        if (!remote) return;
        const j = JSON.stringify(remote);
        if (j === lastSent) return;                             // ignore our own write echoing back
        lastSent = j;
        window.__ctApplyRemote(remote);
        setStatus('synced');
      })
      .subscribe((s) => { if (s === 'SUBSCRIBED') setStatus('synced'); });
  }

  // debounced: rapid edits collapse into one network write
  function push(state) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try {
        const j = JSON.stringify(state);
        if (j === lastSent) return;
        lastSent = j;
        setStatus('saving');
        const { error } = await client.from(TABLE).upsert({ id: ROW_ID, data: state, updated_at: new Date().toISOString() });
        if (error) throw error;
        setStatus('synced');
      } catch (e) {
        console.warn('[sync] push failed:', (e && e.message) || e);
        setStatus('offline');
      }
    }, 400);
  }
})();
