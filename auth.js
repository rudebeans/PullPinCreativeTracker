/* ============================================================================
   Creative Tracker — Auth (email + password, real profiles)
   ----------------------------------------------------------------------------
   Reuses the single shared Supabase client (window.CTClient, from sync.js) so
   the logged-in session authorizes data sync under RLS.

   Exposes window.CTAuth:
     configured  — keys present?
     ready       — finished checking the session?
     user        — { id, email } or null
     profiles    — [{ id, email, name, color }]  (the real team roster)
     recovery    — true when arriving via a password-reset link
     start(), signIn(), signUp(), signOut(), resetPassword(), updatePassword()

   app.js calls window.__ctOnAuth() to re-render on any auth change.
   ========================================================================== */
(function () {
  'use strict';

  const C = window.CTClient; // shared client created in sync.js (undefined if not configured)
  const configured = !!C;

  const CTAuth = (window.CTAuth = {
    configured,
    ready: !configured,        // local mode is "ready" immediately (no gate)
    user: null,
    profiles: [],
    recovery: false,
    start, signIn, signUp, signOut, resetPassword, updatePassword, updateMyProfile,
  });

  if (!configured) return; // single-player / local: no auth gate

  function notify() { if (window.__ctOnAuth) window.__ctOnAuth(); }

  async function loadProfiles() {
    try {
      // select('*') is forward-compatible: picks up role/bio columns once they exist
      const { data, error } = await C.from('profiles').select('*').order('created_at', { ascending: true });
      if (!error && data) CTAuth.profiles = data;
    } catch (e) { /* roster is best-effort */ }
  }
  // update the signed-in user's own profile row (RLS allows only your own)
  async function updateMyProfile(fields) {
    const { error } = await C.from('profiles').update(fields).eq('id', CTAuth.user.id);
    if (error) throw error;
    await loadProfiles();
    notify();
  }

  async function applySession(session) {
    CTAuth.user = session ? { id: session.user.id, email: session.user.email } : null;
    if (CTAuth.user) {
      await loadProfiles();
      if (window.CTSync && window.CTSync.configured) window.CTSync.init(); // start data sync (now authenticated)
    } else {
      CTAuth.profiles = [];
    }
    CTAuth.ready = true;
    notify();
  }

  async function start() {
    // password-recovery deep links arrive as an auth event
    C.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { CTAuth.recovery = true; CTAuth.ready = true; notify(); return; }
      if (event === 'SIGNED_OUT') { CTAuth.user = null; CTAuth.profiles = []; CTAuth.ready = true; notify(); return; }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') { applySession(session); }
    });
    try {
      const { data } = await C.auth.getSession();
      if (!CTAuth.recovery) await applySession(data.session);
    } catch (e) {
      CTAuth.ready = true; notify();
    }
  }

  async function signUp(email, password, name) {
    const { data, error } = await C.auth.signUp({ email, password, options: { data: { name: name || '' } } });
    if (error) throw error;
    if (data.session) await applySession(data.session); // email-confirmation OFF → instant session
    else throw new Error('Account created — check your email to confirm, then sign in. (Tip: turn off "Confirm email" in Supabase for instant access.)');
    return data;
  }

  async function signIn(email, password) {
    const { data, error } = await C.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await applySession(data.session);
    return data;
  }

  async function signOut() {
    try { await C.auth.signOut(); } catch (e) { /* ignore */ }
    CTAuth.user = null; CTAuth.profiles = []; notify();
  }

  async function resetPassword(email) {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await C.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function updatePassword(newPassword) {
    const { error } = await C.auth.updateUser({ password: newPassword });
    if (error) throw error;
    CTAuth.recovery = false;
    const { data } = await C.auth.getSession();
    await applySession(data.session);
  }
})();
