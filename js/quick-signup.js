// Heritage Hill — one-tap sign-up for logged-in visitors (small-groups.html,
// events.html, index.html). When someone is logged in, "Join Group" / "RSVP"
// shows a short confirm ("Joining as Scott Spratlen") instead of the full
// form, and anything they've already requested or RSVP'd for shows as
// "Requested ✓" / "You're going ✓". Logged-out visitors see the normal form.
// Design: docs/superpowers/specs/2026-09-28-one-tap-signup-design.md
//
// Pure pieces (buildCtx, groupState, eventState, mark*, confirmHtml) have no
// DOM or network dependency and are unit-tested (tests/quick-signup.test.js).
const QuickSignup = {
  // ctx = { who: {name,email,phone}, groupIds, memberGroupIds, eventIds } or
  // null when there's no logged-in person we can sign up without asking.
  buildCtx(user, profile, status) {
    if (!user) return null;
    const meta = user.user_metadata || {};
    const who = {
      name: ((profile && profile.name) || meta.full_name || meta.name || '').trim(),
      email: ((profile && profile.email) || user.email || '').trim(),
      phone: ((profile && profile.phone) || '').trim(),
    };
    if (!who.name || !who.email) return null;
    const ids = key => new Set(((status && status[key]) || []).map(String));
    return { who, groupIds: ids('group_ids'), memberGroupIds: ids('member_group_ids'), eventIds: ids('event_ids') };
  },

  // 'anon' | 'member' (already in the group) | 'requested' | 'ready'
  groupState(ctx, groupId) {
    if (!ctx) return 'anon';
    if (ctx.memberGroupIds.has(String(groupId))) return 'member';
    return ctx.groupIds.has(String(groupId)) ? 'requested' : 'ready';
  },

  // 'anon' | 'going' | 'ready'
  eventState(ctx, eventId) {
    if (!ctx) return 'anon';
    return ctx.eventIds.has(String(eventId)) ? 'going' : 'ready';
  },

  markGroup(ctx, groupId) { if (ctx) ctx.groupIds.add(String(groupId)); },
  markEvent(ctx, eventId) { if (ctx) ctx.eventIds.add(String(eventId)); },

  _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  confirmHtml({ who, lead, action, withMessage }) {
    const e = s => this._esc(s);
    return `<div class="qs-confirm">`
      + `<div class="qs-who"><span class="qs-lead">${e(lead)}</span> <strong>${e(who.name)}</strong><span class="qs-email">${e(who.email)}</span></div>`
      + (withMessage ? `<label class="qs-label"><span>Message for the leader <em>(optional)</em></span><textarea class="qs-message" rows="3" placeholder="Anything you'd like the group leader to know…"></textarea></label>` : '')
      + `<button type="button" class="btn btn-primary qs-go">${e(action)}</button>`
      + `<p class="qs-error" role="alert" hidden></p>`
      + `<button type="button" class="qs-edit">Not you? Edit details</button>`
      + `</div>`;
  },

  // Loads the logged-in person and their sign-up status once per page.
  // Resolves to a ctx, or null when logged out (or anything fails).
  load() {
    if (!this._loading) {
      this._loading = (async () => {
        try {
          if (typeof SupaDB === 'undefined') return null;
          const user = await SupaDB.getUser();
          if (!user) return null;
          const [profile, status] = await Promise.all([SupaDB.getMyProfile(), SupaDB.getMySignupStatus()]);
          return this.buildCtx(user, profile, status);
        } catch (e) { console.error('[QuickSignup] load:', e.message); return null; }
      })();
    }
    return this._loading;
  },

  // Draws the confirm into el. onConfirm(message) must resolve to
  // { error } on failure; onEdit() switches the caller to its full form.
  render(el, { who, lead, action, withMessage, onConfirm, onEdit }) {
    this._injectStyles();
    el.innerHTML = this.confirmHtml({ who, lead, action, withMessage });
    const go = el.querySelector('.qs-go'), err = el.querySelector('.qs-error');
    go.addEventListener('click', async () => {
      go.disabled = true; err.hidden = true;
      const label = go.textContent; go.textContent = 'Sending…';
      const msg = el.querySelector('.qs-message');
      const result = await onConfirm(msg ? msg.value.trim() : '');
      go.disabled = false; go.textContent = label;
      if (result && result.error) { err.textContent = 'Something went wrong. Please try again.'; err.hidden = false; }
    });
    el.querySelector('.qs-edit').addEventListener('click', onEdit);
  },

  _injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('qsStyles')) return;
    const st = document.createElement('style');
    st.id = 'qsStyles';
    st.textContent = `
      .qs-confirm { display:flex; flex-direction:column; gap:14px; }
      .qs-who { padding:14px 16px; border-radius:12px; background:#F7F7F5; border:1px solid #E4E4E4; font-size:.95rem; line-height:1.4; }
      .qs-lead { color:#6B6B6B; }
      .qs-email { display:block; font-size:.85rem; color:#6B6B6B; }
      .qs-label { display:flex; flex-direction:column; gap:5px; font-size:.82rem; font-weight:600; }
      .qs-label em { font-style:normal; font-weight:400; color:#888; }
      .qs-message { width:100%; box-sizing:border-box; padding:.62rem .9rem; border:1.5px solid #e4e4e4; border-radius:8px; font-family:inherit; font-size:.9rem; resize:vertical; }
      .qs-go { width:100%; justify-content:center; }
      .qs-error { margin:0; color:#dc2626; font-size:.83rem; }
      .qs-edit { align-self:center; background:none; border:0; padding:6px; font:inherit; font-size:.85rem; color:#6B6B6B; text-decoration:underline; cursor:pointer; }
      .qs-edit:hover { color:#1C1C1E; }
      .btn.qs-done { background:rgba(188,122,30,.12); color:#9A6118; border-color:transparent; cursor:default; }
      button.btn.qs-done:not([disabled]) { cursor:pointer; }`;
    document.head.appendChild(st);
  },
};

if (typeof module !== 'undefined') module.exports = QuickSignup;
